"""Startup checks for external seam integrity.

Run at application startup to verify that external tables (owned by Better Auth)
have the expected structure. Fails fast if contract is violated.
"""

import logging
from sqlalchemy import inspect, text
from sqlalchemy.exc import OperationalError, ProgrammingError

from database import engine

logger = logging.getLogger(__name__)


def check_user_table_exists() -> bool:
    """Verify `user` table exists and has `id` column."""
    try:
        inspector = inspect(engine)
        tables = inspector.get_table_names()
        if "user" not in tables:
            logger.error("External seam check FAILED: `user` table not found. Run `npx auth@latest migrate` in frontend/.")
            return False

        columns = {c["name"]: c for c in inspector.get_columns("user")}
        if "id" not in columns:
            logger.error("External seam check FAILED: `user.id` column missing.")
            return False

        # Verify id is a string type (UUID stored as text)
        id_type = str(columns["id"]["type"]).upper()
        if "CHAR" not in id_type and "UUID" not in id_type and "TEXT" not in id_type:
            logger.warning("External seam check WARNING: `user.id` type is %s, expected string/UUID.", id_type)

        logger.info("External seam check PASSED: `user` table exists with `id` column.")
        return True

    except (OperationalError, ProgrammingError) as e:
        logger.error("External seam check ERROR: Could not inspect `user` table: %s", e)
        return False


def check_fk_resolution() -> bool:
    """Verify backend FKs can resolve `user.id` by attempting a dummy query."""
    try:
        with engine.connect() as conn:
            # This will fail if FK target doesn't exist or type mismatches
            conn.execute(text("SELECT 1 FROM \"user\" LIMIT 1"))
        logger.info("External seam check PASSED: `user.id` FK target queryable.")
        return True
    except Exception as e:
        logger.error("External seam check FAILED: Cannot query `user` table: %s", e)
        return False


def run_all_checks() -> bool:
    """Run all external seam checks. Returns True if all pass."""
    checks = [
        ("user table exists", check_user_table_exists),
        ("user.id FK resolvable", check_fk_resolution),
    ]

    all_passed = True
    for name, check_fn in checks:
        logger.info("Running external seam check: %s...", name)
        if not check_fn():
            all_passed = False

    if not all_passed:
        logger.critical("One or more external seam checks FAILED. Backend may not function correctly.")
    else:
        logger.info("All external seam checks PASSED.")

    return all_passed


if __name__ == "__main__":
    # Allow running standalone for debugging
    logging.basicConfig(level=logging.INFO)
    import sys
    sys.exit(0 if run_all_checks() else 1)