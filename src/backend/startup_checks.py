"""Startup checks for external seam integrity.

Run at application startup to verify that external tables (owned by Better Auth)
have the expected structure. Results are logged and fed to the `/ready`
endpoint. A failure marks the service as *not ready* (503 on `/ready`) but
does NOT crash the process — liveness (`/health`) stays ok so orchestrators
don't restart endlessly. This is intentional: a missing `npx auth migrate`
step should be visible and actionable, not an opaque crash loop.
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
    """Verify backend FKs to `user.id` are declared and resolvable.

    Inspects the FK metadata on `tasks`, `conversations`, `messages` to ensure:
    - Each has exactly one FK to `user`
    - The referenced column is `id`
    - ON DELETE CASCADE is set

    This catches schema drift (e.g., a migration that dropped the FK) that
    `SELECT 1 FROM "user"` would miss entirely.
    """
    try:
        inspector = inspect(engine)

        for table_name in ("tasks", "conversations", "messages"):
            fks = inspector.get_foreign_keys(table_name)
            user_fks = [fk for fk in fks if fk["referred_table"] == "user"]

            if len(user_fks) != 1:
                logger.error(
                    "External seam check FAILED: %s has %d FKs to user (expected 1)",
                    table_name,
                    len(user_fks),
                )
                return False

            fk = user_fks[0]
            if fk["referred_columns"] != ["id"]:
                logger.error(
                    "External seam check FAILED: %s.user_id references %s, expected user.id",
                    table_name,
                    fk["referred_columns"],
                )
                return False

            if fk["options"].get("ondelete") != "CASCADE":
                logger.error(
                    "External seam check FAILED: %s.user_id FK missing ON DELETE CASCADE",
                    table_name,
                )
                return False

        logger.info("External seam check PASSED: backend FKs to user.id declared with CASCADE.")
        return True

    except Exception as e:
        logger.error("External seam check ERROR: Could not inspect backend FKs: %s", e)
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