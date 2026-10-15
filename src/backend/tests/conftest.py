"""Pytest bootstrap for the backend test suite.

Two jobs, both about keeping tests runnable and hermetic:

1. Put the backend directory on `sys.path`. The backend uses flat imports
   (`import models`, `from repositories import SqlTaskRepository`), so the
   module root must be importable no matter where pytest is invoked from.
2. Provide a dummy `DATABASE_URL` before anything imports `database`.
   `database.py` raises `RuntimeError` without it, and `load_dotenv()` does not
   override an already-set variable. `create_engine` is lazy, so no connection is
   ever opened unless a test actually queries.
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
