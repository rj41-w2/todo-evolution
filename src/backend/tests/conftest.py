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

BACKEND_DIR = Path(__file__).resolve().parents[1]

if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

os.environ.setdefault(
    "DATABASE_URL", "postgresql://bootability:check@localhost:5432/bootability"
)
os.environ.setdefault("CORS_ORIGINS", "http://localhost:3000")
