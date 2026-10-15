"""Authorization tests for the MCP tool layer (issue #2, AC-3).

Two stacked defects made cross-tenant task access possible:

1. `docker-compose.yml` published the MCP service on `8001:8001` and
   `mcp_server.py` bound `0.0.0.0:8001` with no credential check, so the tool
   surface was reachable from the deployment host.
2. Every tool took `user_id` as its first *caller-supplied* argument, so any
   caller picked its own identity. `main.py`'s client-side re-injection was a
   convention on one path, not an enforcement.

These tests lock both closed. They are deliberately NOT mock-only: the data-path
tests build a real SQLAlchemy engine, create the real tables, and run the real
`SqlTaskRepository` behind the real tool bodies, so the SQL that scopes by
`Task.user_id` is genuinely executed. Only the *session factory* is redirected
at SQLite, because CI has no Postgres. `list_tools()` introspection and the live
stdio handshake run against the real MCP library with no stubbing at all.
"""

import asyncio
import ast
import json
import os
import re
import subprocess
import sys
from pathlib import Path

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import sessionmaker

BACKEND_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_DIR.parents[1]
COMPOSE_FILE = REPO_ROOT / "docker-compose.yml"

import mcp_server  # noqa: E402  (needs the conftest sys.path + env)

ALICE = "alice-tenant-id"
BOB = "bob-tenant-id"
#: Owns no tasks. A tenant with nothing must still see nothing — otherwise
#: "no rows" could just mean the read was broken rather than correctly scoped.
CAROL = "carol-tenant-id"

TOOL_NAMES = ("add_task", "list_tasks", "complete_task", "delete_task", "update_task")


# --- SQLite shim ------------------------------------------------------------
# `models.Task.id` is a `postgresql.UUID`, which has no SQLite compiler. Give it
# one so the real DDL renders. Without this the schema cannot be created at all.


@compiles(PGUUID, "sqlite")
def _uuid_on_sqlite(type_, compiler, **kw):  # noqa: ARG001
    return "CHAR(32)"


@pytest.fixture
def tenant_db(monkeypatch):
    """A real database with one task per tenant, wired into the real tools.

    Returns a callable `(server, tool, **kwargs) -> str` that invokes a tool on
    the real `FastMCP` dispatch path — pydantic argument validation included.
    """
    engine = create_engine("sqlite://")

    # FK enforcement stays off: tasks reference Better Auth's `user` table and
    # the tests create no user rows. Postgres enforces this in production; here
    # it would only fail setup for a reason unrelated to tenancy.
    @event.listens_for(engine, "connect")
    def _disable_fk(dbapi_conn, _record):  # noqa: ARG001
        dbapi_conn.execute("PRAGMA foreign_keys=OFF")

    from database import Base
    import models  # noqa: F401  registers tables on Base.metadata

    Base.metadata.create_all(engine)
    session_factory = sessionmaker(bind=engine)

    setup = session_factory()
    from models import Task

    alice_task = Task(user_id=ALICE, title="Alice private task")
    bob_task = Task(user_id=BOB, title="Bob private task")
    setup.add_all([alice_task, bob_task])
    setup.commit()
    bob_task_id = str(bob_task.id)
    setup.close()

    # Redirect the session factory only. Everything downstream — the repository,
    # its queries, the tool bodies, the identity binding — is the real thing.
    monkeypatch.setattr(mcp_server, "SessionLocal", session_factory)

    def call(server, tool_name, **kwargs):
        """Invoke a tool through the real FastMCP dispatch path.

        `Tool.run(..., convert_result=True)` hands back
        `(content_blocks, structured)`; the tool's own JSON string is the text
        of the first block. Schema validation happens inside, so an argument
        the tool does not declare is dropped before the body is entered — which
        is precisely what makes a forged `user_id` inert.
        """
        tool = next(
            t for t in server._tool_manager.list_tools() if t.name == tool_name
        )
        raw = asyncio.run(tool.run(kwargs, convert_result=True))
        blocks, _structured = raw
        return blocks[0].text

    call.bob_task_id = bob_task_id
    yield call

    Base.metadata.drop_all(engine)
    engine.dispose()


def _tool_schemas(server):
    """Real JSON schemas as MCP publishes them to a client."""
    return {t.name: t.parameters for t in server._tool_manager.list_tools()}


# --- (a) Guard: no tool schema may expose identity as an argument -----------


def test_no_tool_signature_exposes_user_id():
    """AC-3 (a): identity must never be a tool argument.

    This is the guard that matters most, because it fails at *schema
    construction* — before any request, any database, or any transport. A
    regression that reintroduced `user_id` into a signature would be caught
    here without needing to mount an attack.
    """
    server = mcp_server.build_server(ALICE)

    offenders = {
        name: sorted(params.get("properties", {}))
        for name, params in _tool_schemas(server).items()
        if "user_id" in params.get("properties", {})
    }
    assert not offenders, (
        "tool signatures still expose `user_id` as caller-supplied identity: "
        f"{offenders}"
    )


def test_build_server_registers_every_tool_without_identity_argument():
    """All five tools survive the closure refactor, none demanding `user_id`."""
    schemas = _tool_schemas(mcp_server.build_server(ALICE))

    assert set(schemas) == set(TOOL_NAMES), (
        f"tool set changed: missing {set(TOOL_NAMES) - set(schemas)}, "
        f"unexpected {set(schemas) - set(TOOL_NAMES)}"
    )
    for name, params in schemas.items():
        assert "user_id" not in params.get("required", []), (
            f"{name} still requires a caller-supplied user_id"
        )


# --- (b) Guard: compose must not publish an MCP port -----------------------


def _service_blocks(text: str) -> dict:
    """Minimal indent-aware parse of the top-level `services:` mapping.

    Hand-rolled on purpose: PyYAML is not in `requirements-dev.txt`, so a test
    that imports it would pass locally and fail in CI.
    """
    lines = text.splitlines()
    services = {}
    current = None
    in_services = False
    for line in lines:
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        indent = len(line) - len(line.lstrip())
        if indent == 0:
            in_services = line.startswith("services:")
            current = None
            continue
        if not in_services:
            continue
        if indent == 2:
            name = line.strip().rstrip(":")
            current = name
            services[name] = []
        elif current is not None:
            services[current].append(line.strip())
    return services


def test_compose_publishes_no_mcp_port():
    """AC-3 (b): the tool service must not be reachable from the host."""
    assert COMPOSE_FILE.exists(), f"compose file not found at {COMPOSE_FILE}"
    text = COMPOSE_FILE.read_text()
    services = _service_blocks(text)

    published = {
        name: [ln for ln in lines if re.search(r"\b8001\b", ln)]
        for name, lines in services.items()
    }
    offenders = {n: ls for n, ls in published.items() if ls}
    assert not offenders, f"compose still publishes port 8001: {offenders}"


def test_compose_has_no_mcp_service_and_no_sse_hop():
    """The SSE service and the backend's `depends_on`/`MCP_SERVER_URL` go away."""
    text = COMPOSE_FILE.read_text()
    services = _service_blocks(text)

    assert "mcp" not in services, (
        "compose still defines an `mcp` service; the tool layer must run as a "
        "stdio subprocess spawned per request, not as a standing network service"
    )
    assert "MCP_SERVER_URL" not in text, (
        "compose still routes the backend to an MCP URL; the stdio path takes "
        "no URL and must not be configurable back to a network hop"
    )


def test_no_sse_transport_remains_in_the_mcp_server():
    """The unauthenticated Starlette app must be gone, not merely unpublished.

    Checked against the parsed AST rather than the raw text, so the module
    docstring can still explain what the SSE server used to be without the
    guard firing on its own documentation.
    """
    tree = ast.parse((BACKEND_DIR / "mcp_server.py").read_text())

    imported, referenced = set(), set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            imported.update(a.name.split(".")[0] for a in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            imported.add(node.module.split(".")[0])
            imported.update(node.module.split("."))
        elif isinstance(node, ast.Name):
            referenced.add(node.id)
        elif isinstance(node, ast.Attribute):
            referenced.add(node.attr)

    banned = {"uvicorn", "starlette", "SseServerTransport", "sse"}
    assert not (imported & banned), f"mcp_server.py re-imports {imported & banned}"
    assert not (referenced & banned), f"mcp_server.py still references {referenced & banned}"

    assert not (BACKEND_DIR / "Dockerfile.mcp").exists(), (
        "Dockerfile.mcp still exists; it exists solely to run the SSE service"
    )


def test_backend_client_spawns_stdio_and_does_not_reinject_user_id():
    """`main.py` must spawn the child and stop hand-writing identity.

    The `tool_args["user_id"] = user_id` line is the client-side convention
    that made tenancy look enforced while being bypassable by any other caller.
    With identity bound in the child, the argument no longer exists.
    """
    source = (BACKEND_DIR / "main.py").read_text()
    assert "stdio_client" in source, "main.py must spawn the MCP server over stdio"
    assert "sse_client" not in source, "main.py still connects to the SSE transport"
    assert 'tool_args["user_id"]' not in source, (
        "main.py still injects user_id into tool arguments; identity is now bound "
        "by the server, not supplied by the caller"
    )


# --- (c) Fail fast when no identity is bound -------------------------------


def test_build_server_without_identity_raises():
    """AC-3 (c): no anonymous default. Failing closed, loudly."""
    for bad in (None, "", "   "):
        with pytest.raises(RuntimeError):
            mcp_server.build_server(bad)


def test_build_server_rejects_a_server_started_without_identity():
    """The module must not expose a usable server when nobody supplies identity."""
    assert not hasattr(mcp_server, "mcp"), (
        "mcp_server still exposes a module-level `mcp` server, which has no "
        "identity bound and would serve every caller as nobody"
    )


# --- (d) Cross-tenant read is empty ----------------------------------------


def test_cross_tenant_read_returns_nothing(tenant_db):
    """AC-3 (d): a tenant who owns nothing reads nothing.

    Carol has no tasks, yet Alice and Bob both do. If scoping is real, her read
    returns an empty list rather than the union of everyone else's rows.
    """
    carol_server = mcp_server.build_server(CAROL)
    result = json_loads(tenant_db(carol_server, "list_tasks"))

    assert result == [], f"carol's server read another tenant's rows: {result}"


def test_each_tenant_reads_only_its_own_tasks(tenant_db):
    """The positive control — scoping must narrow, not just deny everything."""
    for owner, other_title in ((ALICE, "Bob private task"), (BOB, "Alice private task")):
        server = mcp_server.build_server(owner)
        titles = [t["title"] for t in json_loads(tenant_db(server, "list_tasks"))]
        assert titles, f"{owner}'s own tasks went missing — scoping is over-restrictive"
        assert other_title not in titles, (
            f"{owner} read {other_title!r}: {titles}"
        )


# --- (e) Cross-tenant mutation cannot touch the other row ------------------


@pytest.mark.parametrize(
    "tool_name,kwargs_builder",
    [
        ("complete_task", lambda tid: {"task_id": tid}),
        ("delete_task", lambda tid: {"task_id": tid}),
        ("update_task", lambda tid: {"task_id": tid, "title": "hijacked"}),
    ],
    ids=["complete", "delete", "update"],
)
def test_cross_tenant_mutation_cannot_touch_the_other_row(tenant_db, tool_name, kwargs_builder):
    """AC-3 (e): a mutation aimed at Bob's task must not move Bob's task.

    The server is bound to **Alice**; the target is **Bob's** real UUID. Each
    tool resolves its target through `find_by_id_or_title`, which filters on
    `Task.user_id`, so Alice's lookup finds nothing and the mutation raises
    not-found.

    The assertion is on *database state*, not on the return value, so a tool
    that reported success while writing to the wrong row would still fail. And
    `test_owner_can_still_mutate_own_task` is the positive control — without it,
    a mutation that silently no-ops everywhere would pass this test too.
    """
    alice_server = mcp_server.build_server(ALICE)
    bob_id = tenant_db.bob_task_id
    before = _row_snapshot()

    with pytest.raises(Exception):  # noqa: B017,PT011 — ValueError or ToolError
        tenant_db(alice_server, tool_name, **kwargs_builder(bob_id))

    after = _row_snapshot()
    assert after == before, (
        f"{tool_name} mutated another tenant's row: {before} -> {after}"
    )

    # And Bob's row still belongs to Bob, still his, unchanged.
    assert ("Bob private task", "Pending", BOB) in after, (
        f"bob's row was altered by alice's {tool_name}: {after}"
    )


@pytest.mark.parametrize(
    "tool_name,kwargs_builder,expect",
    [
        ("complete_task", lambda tid: {"task_id": tid}, ("Bob private task", "Completed", BOB)),
        ("delete_task", lambda tid: {"task_id": tid}, None),
        ("update_task", lambda tid: {"task_id": tid, "title": "renamed"}, ("renamed", "Pending", BOB)),
    ],
    ids=["complete", "delete", "update"],
)
def test_owner_can_still_mutate_own_task(tenant_db, tool_name, kwargs_builder, expect):
    """Positive control: scoping narrows, it does not disable the tools.

    Without this, a `find_by_id_or_title` that matched nothing at all would pass
    every cross-tenant test while quietly breaking the feature.
    """
    bob_server = mcp_server.build_server(BOB)

    # No `pytest.raises` wrapper: a tenant acting on their own task must succeed.
    tenant_db(bob_server, tool_name, **kwargs_builder(tenant_db.bob_task_id))

    after = _row_snapshot()
    assert ("Alice private task", "Pending", ALICE) in after, (
        f"bob's {tool_name} reached alice's row: {after}"
    )
    if expect is None:  # delete: bob's row is gone, alice's untouched
        assert not [row for row in after if row[2] == BOB], (
            f"bob's own delete did not remove his row: {after}"
        )
    else:
        assert expect in after, f"bob's own {tool_name} left {expect} out of {after}"


# --- (f) A forged `user_id` argument is inert -------------------------------


def test_forged_user_id_argument_is_inert_on_every_tool(tenant_db):
    """AC-3 (f): smuggling `user_id` into the arguments dict changes nothing.

    Exercised through the real FastMCP dispatch path. FastMCP validates
    arguments against the tool's schema before invoking it, so an undeclared
    `user_id` is dropped before the function body is entered. The important
    part is not the drop itself — it is that the result is still the *bound*
    tenant's data. If the schema ever re-admits `user_id`, this returns the
    victim's rows and fails.
    """
    alice_server = mcp_server.build_server(ALICE)
    bob_id = tenant_db.bob_task_id

    # list_tasks: forging Bob's id must still return Alice's row.
    listed = json_loads(
        tenant_db(alice_server, "list_tasks", user_id=BOB)
    )
    assert [t["title"] for t in listed] == ["Alice private task"], (
        f"forged user_id changed which rows list_tasks returned: {listed}"
    )

    # complete/delete/update: forging Bob's id must not reach Bob's row.
    before = _row_snapshot()
    for tool_name in ("complete_task", "delete_task", "update_task"):
        with pytest.raises(Exception):  # noqa: B017,PT011
            tenant_db(alice_server, tool_name, user_id=BOB, task_id=bob_id)
    assert _row_snapshot() == before, (
        "a forged user_id argument mutated another tenant's row"
    )

    # add_task: a forged user_id must not create the row under the victim's id.
    tenant_db(alice_server, "add_task", user_id=BOB, title="planted")
    owners = {title: owner for title, _status, owner in _row_snapshot()}
    assert owners.get("planted") == ALICE, (
        f"add_task honoured a forged user_id; planted row owner: {owners.get('planted')}"
    )


# --- Live stdio handshake ---------------------------------------------------


def _run_stdio_subprocess(identity):
    """Spawn the real `mcp_server.py` over stdio and list its tools.

    Not a mock. This is the production transport, in a real subprocess, over
    the real JSON-RPC wire. It is the only test that proves the fix did not
    simply satisfy the in-process guards while leaving the shipped path broken
    — the `main.py` stdio swap is what actually runs in Docker, and a closure
    rebuild can break schema introspection at construction time in a way no
    in-process assertion would notice.
    """
    env = {
        **os.environ,
        "DATABASE_URL": os.environ.get(
            "DATABASE_URL", "postgresql://bootability:check@localhost:5432/bootability"
        ),
    }
    if identity is None:
        env.pop("MCP_USER_ID", None)
    else:
        env["MCP_USER_ID"] = identity

    code = (
        "import asyncio, json, sys\n"
        "from mcp import ClientSession, StdioServerParameters\n"
        "from mcp.client.stdio import stdio_client\n"
        "async def go():\n"
        "    params = StdioServerParameters(\n"
        "        command=sys.executable, args=['mcp_server.py'],\n"
        "        cwd=%r, env=%r,\n"
        "    )\n"
        "    async with stdio_client(params) as (r, w):\n"
        "        async with ClientSession(r, w) as s:\n"
        "            await s.initialize()\n"
        "            res = await s.list_tools()\n"
        "            print(json.dumps({t.name: t.inputSchema for t in res.tools}))\n"
        "asyncio.run(go())\n" % (str(BACKEND_DIR), env)
    )

    import subprocess

    result = subprocess.run(
        [sys.executable, "-c", code],
        cwd=BACKEND_DIR,
        capture_output=True,
        text=True,
        timeout=120,
    )
    assert result.returncode == 0, (
        f"live stdio handshake failed:\nstdout: {result.stdout}\n"
        f"stderr: {result.stderr[-2000:]}"
    )
    return json_loads(result.stdout.strip().splitlines()[-1])


def test_live_stdio_handshake_exposes_no_user_id():
    """The shipped transport publishes no identity argument."""
    schemas = _run_stdio_subprocess(ALICE)

    assert set(schemas) == set(TOOL_NAMES), f"stdio server exposed {sorted(schemas)}"
    offenders = {
        name: sorted(params.get("properties", {}))
        for name, params in schemas.items()
        if "user_id" in params.get("properties", {})
    }
    assert not offenders, f"stdio tool schemas expose user_id: {offenders}"


def test_live_stdio_server_refuses_to_start_without_identity():
    """No identity in the child env means no server — not an anonymous one."""
    import subprocess

    env = {
        **os.environ,
        "DATABASE_URL": os.environ.get(
            "DATABASE_URL", "postgresql://bootability:check@localhost:5432/bootability"
        ),
    }
    env.pop("MCP_USER_ID", None)

    result = subprocess.run(
        [sys.executable, "mcp_server.py"],
        cwd=BACKEND_DIR,
        env=env,
        capture_output=True,
        text=True,
        timeout=120,
        input="",
    )
    combined = result.stdout + result.stderr
    assert result.returncode != 0, (
        "mcp_server.py started with no identity bound; it must fail closed"
    )
    assert "identity" in combined.lower(), (
        f"expected an explicit identity error, got:\n{combined[-2000:]}"
    )


# --- helpers ----------------------------------------------------------------


def json_loads(value):
    return json.loads(value)


def _row_snapshot():
    """`{(title, status, owner)}` for every task — the mutation oracle.

    Asserting on database state rather than on a tool's return value is what
    makes these tests able to catch a tool that *reports* not-found while still
    writing to the other tenant's row.

    Reads through `mcp_server.SessionLocal` — the patched factory — not
    `database.SessionLocal`, which would reach for a real Postgres.
    """
    from sqlalchemy import select

    from models import Task

    session = mcp_server.SessionLocal()
    try:
        return sorted(
            (t.title, t.status.value, t.user_id)
            for t in session.scalars(select(Task)).all()
        )
    finally:
        session.close()