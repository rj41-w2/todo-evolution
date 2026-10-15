"""The chat route must not hold a database connection across an LLM call.

Found on a live stack, not in CI, and it failed in the most expensive way
possible. Neon is reached through the *pooler*, which reclaims connections
that sit idle inside an open transaction. The chat route held one
dependency-injected session for the whole request — across two Gemini
calls, tens of seconds of nothing happening. The pooler took it back.

The visible result was deceptive:

* the MCP tool had already created the task, and that write survived,
  because it went through a separate session in the subprocess;
* Gemini had already composed its reply;
* then the final `INSERT INTO messages` failed with `SSL connection has
  been closed unexpectedly`;
* the user received a 500 and lost the conversation.

So the tool's work persisted, the assistant's words were generated and
thrown away, and the failure pointed at a database error with nothing in
it pointing at the database being the problem.

CI cannot see this: it has no PostgreSQL service, and the failure needs a
real pooler with a real idle timeout. So this test asserts the structural
property that prevents it — during the LLM phase, nothing is checked out
of the connection pool.

The measurement is taken at the pool rather than by intercepting a session
factory, so it is independent of *how* the route obtains its session. That
matters: the bug appeared in two shapes, a dependency-injected session and
a directly constructed one, and a test bound to either factory would have
passed on the other.
"""

import pytest


@pytest.fixture
def scratch_db(tmp_path):
    """A real, isolated database whose pool we can interrogate.

    File-backed rather than `sqlite://` so the default `QueuePool` applies.
    That matters because `QueuePool` is the only pool here exposing
    `checkedout()`, and the whole measurement is "is anything still holding a
    connection". An in-memory database with `SingletonThreadPool` would force
    one connection and make the test unable to observe the bug at all.
    """
    import sqlalchemy as sa
    from sqlalchemy.dialects.postgresql import UUID as PGUUID
    from sqlalchemy.ext.compiler import compiles

    from database import Base
    import models  # noqa: F401  registers tables

    # `postgresql.UUID` has no SQLite compiler; give it one so the schema can
    # be created at all. What is stored is irrelevant — only connection
    # checkout counts here.
    @compiles(PGUUID, "sqlite")
    def _uuid_on_sqlite(type_, compiler, **kw):  # noqa: ARG001
        return "CHAR(32)"

    engine = sa.create_engine(f"sqlite:///{tmp_path}/scratch.db")

    assert isinstance(engine.pool, sa.pool.QueuePool), (
        f"expected a QueuePool so `checkedout()` exists, got "
        f"{type(engine.pool).__name__}"
    )

    # The conversation-creation path takes a Postgres advisory lock. SQLite
    # has no such function; stub it. The lock's behaviour is not what is
    # under test.
    @sa.event.listens_for(engine, "connect")
    def _stub_advisory_lock(dbapi_conn, _record):
        dbapi_conn.create_function("pg_advisory_xact_lock", 1, lambda _key: None)

    # `user` is already registered — it is the Better Auth seam from
    # `user_stub.py`.
    Base.metadata.create_all(engine)

    yield engine, sa.orm.sessionmaker(bind=engine)

    engine.dispose()


def test_chat_route_checks_out_nothing_during_the_llm_phase(
    scratch_db, monkeypatch, caplog
):
    """No pooled connection may be held while Gemini and MCP are running.

    The fake LLM client records how many connections are checked out at the
    moment it is called, then aborts. Aborting is deliberate — it keeps the
    test away from faking tool results and a second completion, while still
    reaching the exact line where the LLM phase begins.
    """
    import asyncio
    import contextlib
    import inspect

    from fastapi import HTTPException
    from models import ChatRequest
    from repositories import SqlConversationRepository, SqlMessageRepository

    import main

    engine, session_factory = scratch_db

    # The route refuses to start without a key. Locally that came from the
    # untracked `.env`, which CI does not have — and a test that passes on a
    # developer's machine and fails on a clean checkout is worse than no test.
    monkeypatch.setenv("GEMINI_API_KEY", "test-key-not-used")

    # The current route builds its own sessions from `main.SessionLocal`.
    # Point that at the scratch database so phase one runs for real and the
    # pool measurement is meaningful. `raising=False` because the older shape
    # this test must also catch had no such module attribute.
    monkeypatch.setattr(main, "SessionLocal", session_factory, raising=False)

    def checked_out() -> int:
        return engine.pool.checkedout()

    observed: dict[str, object] = {}

    class _Boom(Exception):
        pass

    class _FakeMessage:
        content = "unused"
        tool_calls = None

    class _FakeResponse:
        choices = [type("C", (), {"message": _FakeMessage()})()]

    class _FakeCompletions:
        async def create(self, **kwargs):
            # The assertion: is anything still holding a connection?
            observed["checked_out_during_llm"] = checked_out()
            raise _Boom("abort before any tool work")

    class _FakeClient:
        chat = type("Chat", (), {"completions": _FakeCompletions()})()

    monkeypatch.setattr(main, "get_openai_client", lambda: _FakeClient())

    # The MCP subprocess is spawned before the first completion call and opens
    # no connection of its own — that is the property under test.
    @contextlib.asynccontextmanager
    async def _fake_stdio_client(params):
        yield (None, None)

    class _FakeClientSession:
        def __init__(self, read, write):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

        async def initialize(self):
            return None

        async def list_tools(self):
            # Must not raise: this is called before the first completion.
            return type("R", (), {"tools": []})()

    monkeypatch.setattr(main, "stdio_client", _fake_stdio_client)
    monkeypatch.setattr(main, "ClientSession", _FakeClientSession)

    # Supply whatever repository dependencies the route declares, so the test
    # is meaningful against the old shape too. The route under test takes
    # none — that is the point — but a missing-argument error would make the
    # failure meaningless.
    extra = {}
    # One session for both, as FastAPI's cached `get_db` would have supplied.
    # Two separate sessions would not just be unrealistic, they would deadlock
    # against a file-backed SQLite database and fail for the wrong reason.
    shared = session_factory()
    for name in inspect.signature(main.chat_with_agent).parameters:
        if name == "conversation_repo":
            extra[name] = SqlConversationRepository(shared)
        elif name == "message_repo":
            extra[name] = SqlMessageRepository(shared)

    with pytest.raises(HTTPException) as excinfo:
        asyncio.run(
            main.chat_with_agent(
                user_id="user-a",
                chat_req=ChatRequest(message="hello"),
                authenticated_user_id="user-a",
                **extra,
            )
        )

    assert excinfo.value.status_code == 500, "expected the abort to surface as a 500"

    # If the fake LLM client was never reached, the route failed earlier and
    # the count below would be vacuously zero. Say what actually went wrong
    # rather than reporting a clean bill of health.
    assert observed.get("checked_out_during_llm") is not None, (
        "the fake LLM client was never called, so this test proved nothing. "
        f"Route log: {[r.getMessage() for r in caplog.records][-3:]}"
    )

    assert observed.get("checked_out_during_llm") == 0, (
        f"the chat route held {observed.get('checked_out_during_llm')} pooled "
        "connection(s) open while calling the LLM. Neon is reached through the "
        "pooler, which reclaims idle connections — that one will be gone by "
        "the time the request writes its result, and the write fails with an "
        "SSL error that points nowhere near the real cause."
    )


def test_chat_route_takes_no_repository_dependencies():
    """Structural guard: the route builds its own repositories per phase.

    Dependency injection is what made this bug natural in the first place — a
    session handed to the route is held for the route's whole lifetime, by
    definition. If a repository dependency is ever added back, this fails
    before the runtime cost is paid.
    """
    import inspect

    import main

    params = inspect.signature(main.chat_with_agent).parameters
    repo_dependencies = [
        name
        for name in params
        if name not in ("user_id", "chat_req", "authenticated_user_id")
    ]
    assert not repo_dependencies, (
        f"chat_with_agent must not take dependencies {repo_dependencies}; a "
        "session acquired that way is held for the whole request, including "
        "the LLM calls. See the module docstring."
    )