"""Integration tests for external seam contracts.

These tests require a real database (Neon or local PostgreSQL) with Better Auth
migrations applied. They verify the backend's assumptions about the `user` table.
"""

import pytest
from sqlalchemy import inspect, text

from database import engine
from startup_checks import check_user_table_exists, check_fk_resolution, run_all_checks


@pytest.mark.integration
def test_user_table_exists_and_has_id_column():
    """`user` table exists with `id` column (Better Auth migration applied)."""
    assert check_user_table_exists(), "user table missing or lacks id column"


@pytest.mark.integration
def test_user_id_column_type_is_string_compatible():
    """`user.id` is a string-compatible type (VARCHAR, UUID, TEXT)."""
    inspector = inspect(engine)
    columns = {c["name"]: c for c in inspector.get_columns("user")}
    id_type = str(columns["id"]["type"]).upper()
    assert any(t in id_type for t in ("CHAR", "UUID", "TEXT")), f"user.id type {id_type} not string-compatible"


@pytest.mark.integration
def test_fk_target_queryable():
    """Can query `user` table — FK target is reachable."""
    assert check_fk_resolution(), "Cannot query user table"


@pytest.mark.integration
def test_backend_tables_have_fk_to_user():
    """Backend tables declare FK to user.id with ON DELETE CASCADE."""
    inspector = inspect(engine)

    for table_name in ("tasks", "conversations", "messages"):
        fks = inspector.get_foreign_keys(table_name)
        user_fks = [fk for fk in fks if fk["referred_table"] == "user"]
        assert len(user_fks) == 1, f"{table_name} should have exactly 1 FK to user"

        fk = user_fks[0]
        assert fk["referred_columns"] == ["id"], f"{table_name}.user_id should reference user.id"
        assert fk["options"].get("ondelete") == "CASCADE", f"{table_name}.user_id FK should have ON DELETE CASCADE"


@pytest.mark.integration
def test_all_startup_checks_pass():
    """All startup checks pass together."""
    assert run_all_checks(), "One or more startup checks failed"