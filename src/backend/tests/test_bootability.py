"""Boot smoke checks for the backend API and MCP services.

Guards the import graph at the two seams that took the whole backend down
(issue #1):

* a circular import between `models` and `repositories`, and
* a missing runtime module in the backend image.

These tests are hermetic by design — no database connection, no network, no
credentials. They assert that the services *start*, not that they work.
"""

import importlib
import os
import subprocess
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]

MCP_TOOLS = ("add_task", "list_tasks", "complete_task", "delete_task", "update_task")


def _run_in_fresh_interpreter(code: str) -> subprocess.CompletedProcess:
    """Run `code` in a clean interpreter rooted at the backend directory.

    This is the check that matters for circular imports. Inside a pytest run,
    some other module may already have imported `models` by the time we get
    here, which can mask a broken import graph. A fresh interpreter cannot be
    fooled.
    """
    return subprocess.run(
        [sys.executable, "-c", code],
        cwd=BACKEND_DIR,
        capture_output=True,
        text=True,
    )


def test_api_imports_in_a_fresh_interpreter():
    """`import main` must succeed from cold. This is the P0 regression guard."""
    result = _run_in_fresh_interpreter("import main")
    assert result.returncode == 0, f"backend API failed to import:\n{result.stderr}"


def test_mcp_imports_in_a_fresh_interpreter():
    """`import mcp_server` must succeed from cold."""
    result = _run_in_fresh_interpreter("import mcp_server")
    assert result.returncode == 0, f"MCP server failed to import:\n{result.stderr}"


def test_api_exposes_a_fastapi_app_with_routes():
    main = importlib.import_module("main")
    assert hasattr(main, "app"), "main must expose `app` for `uvicorn main:app`"
    assert len(main.app.routes) > 0, "FastAPI app registered no routes"


def test_mcp_builds_a_server_with_every_tool():
    """`build_server(user_id)` must produce a server carrying all five tools.

    There is no module-level `mcp` any more: identity is a construction
    argument, so there is nothing to register tools onto until a caller supplies
    one. See `tests/test_mcp_authz.py` for why.
    """
    mcp_server = importlib.import_module("mcp_server")
    server = mcp_server.build_server("bootability-check-user")
    registered = set(server._tool_manager._tools)
    missing = [name for name in MCP_TOOLS if name not in registered]
    assert not missing, f"MCP tools not registered: {missing}"


def test_metadata_registers_application_tables_and_the_user_seam():
    """`user` must be in metadata or every FK to it fails at mapper configuration."""
    from database import Base

    import models  # noqa: F401  registers tables on Base.metadata

    expected = {"user", "tasks", "conversations", "messages"}
    assert expected <= set(Base.metadata.tables)


def test_alembic_chain_generates_ddl_without_a_database():
    """Migrations must render offline — catches a broken revision chain."""
    from alembic import command
    from alembic.config import Config

    config = Config(str(BACKEND_DIR / "alembic.ini"))
    command.upgrade(config, "head", sql=True)


def test_api_boots_without_an_llm_key():
    """A missing GEMINI_API_KEY must not take the whole API down.

    Only POST /chat needs the key; task CRUD does not. Building the OpenAI
    client at import time made every route depend on it (issue #1).

    The key is set to an empty string rather than removed because `database.py`
    calls `load_dotenv()`, which would refill it from the local `.env`.
    """
    env = {
        **os.environ,
        "CORS_ORIGINS": "http://localhost:3000",
        "GEMINI_API_KEY": "",
    }
    result = subprocess.run(
        [sys.executable, "-c", "import main"],
        cwd=BACKEND_DIR,
        env=env,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, (
        f"backend API refused to boot without GEMINI_API_KEY:\n{result.stderr}"
    )


def test_backend_image_ships_the_mcp_tool_server():
    """The backend image must carry `mcp_server.py` and everything it imports.

    This replaced a guard on `Dockerfile.mcp`. The MCP server is no longer a
    separate service with its own image — it is a stdio subprocess of the API,
    so what matters is that the one backend image can serve it. Both files do
    `COPY . .`, which covers `repositories/` and `user_stub.py` transitively.
    """
    dockerfile = (BACKEND_DIR / "Dockerfile").read_text()

    mcp_server = (BACKEND_DIR / "mcp_server.py").read_text()
    # `database`, `models` and `repositories` are the first-party imports here.
    assert "from repositories import SqlTaskRepository" in mcp_server

    assert "COPY . ." in dockerfile, (
        "backend Dockerfile must copy the whole source tree, or the stdio MCP "
        "subprocess cannot be spawned from inside the container"
    )
    assert not (BACKEND_DIR / "Dockerfile.mcp").exists(), (
        "Dockerfile.mcp is gone — it existed only to run the SSE service that "
        "published port 8001 without auth"
    )
