"""Pytest bootstrap for the backend test suite.

Two jobs, both about keeping tests runnable and hermetic:

1. Put the backend directory on `sys.path`. The backend uses flat imports
   (`import models`, `from repositories import SqlTaskRepository`), so the
   module root must be importable no matter where pytest is invoked from.
2. Supply every environment variable the backend needs in order to *import*.
   Without this, `import main` raises and the tests cannot run at all:
     - `DATABASE_URL`  — `database.py` raises RuntimeError without it
     - `CORS_ORIGINS`  — `main.py` raises RuntimeError without it

   Both are real fail-fast checks and must stay. They are satisfied here rather
   than loosened, and `create_engine` is lazy, so no connection is opened
   unless a test actually queries.

   `setdefault` never overwrites a value the caller exported, and
   `database.py`'s `load_dotenv()` does not overwrite an already-set variable,
   so a developer's local `.env` still wins when they want it to.
"""

import os
import sys
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parents[1]

if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

os.environ.setdefault(
    "DATABASE_URL", "postgresql://bootability:check@localhost:5432/bootability"
)
os.environ.setdefault("CORS_ORIGINS", "http://localhost:3000")


@pytest.fixture
def auth_as_tenant():
    """Authenticate as `test-user` without going through JWT verification.

    Opt-in, deliberately never autouse.

    The endpoint tests in `test_task_crud.py` and `test_task_repository.py` are
    about the repository layer: they hand the app a `MagicMock` repository and
    assert the endpoint called it. They had no identity problem until auth
    landed — after that every one of them began failing 401, because the real
    `get_current_user` tried to verify `"Bearer fake-token"` against the JWKS
    endpoint. That is issue #9, and these ten tests had been failing silently
    behind CI's `continue-on-error` ever since.

    Autouse would have been the quick fix and the wrong one: applied to every
    test, it would mean `get_current_user` is never exercised anywhere in the
    suite, and a regression in JWT verification would pass unnoticed. Only
    tests that are about something else should request this.

    The identity is fixed at `test-user` because every `/api/{user_id}/...`
    route enforces `sub == user_id`. An override returning any other value
    would 403 before reaching the code under test, which would look like a
    different bug entirely.
    """
    from main import app, get_current_user

    app.dependency_overrides[get_current_user] = lambda: "test-user"
    try:
        yield "test-user"
    finally:
        app.dependency_overrides.pop(get_current_user, None)
