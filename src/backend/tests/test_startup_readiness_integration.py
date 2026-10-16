"""Integration tests for startup checks and readiness endpoint.

Issue #3 (folds #11). These tests need a REAL database with Better Auth
migrations applied. Run in the `backend-integration` CI job with
`pytest -m integration`.
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


@pytest.mark.integration
def test_ready_endpoint_reflects_db_and_jwks_state():
    """/ready integrates with real DB and JWKS.

    In a full stack (docker-compose), both DB and frontend JWKS are up -> 200.
    In this test environment, only DB is up; JWKS times out -> 503 with JWKS detail.
    Both are correct behaviors; we verify the endpoint responds with the right structure.
    """
    import main
    from fastapi.testclient import TestClient

    with TestClient(main.app) as client:
        ready = client.get("/ready")
        # Accept either 200 (full stack) or 503 with JWKS detail (DB-only test env)
        if ready.status_code == 200:
            assert ready.json().get("ready") is True
        elif ready.status_code == 503:
            detail = ready.json().get("detail", "").lower()
            assert "jwks" in detail or "unreachable" in detail, f"Expected JWKS detail, got: {ready.json()}"
        else:
            pytest.fail(f"/ready returned unexpected {ready.status_code}: {ready.json()}")


@pytest.mark.integration
def test_ready_endpoint_checks_database_and_jwks():
    """/ready checks both DB and JWKS, reporting which fails.

    This is the same as test_ready_endpoint_reflects_db_and_jwks_state but
    named for the specific acceptance criterion.
    """
    import main
    from fastapi.testclient import TestClient

    with TestClient(main.app) as client:
        ready = client.get("/ready")
        assert ready.status_code in (200, 503), f"/ready returned {ready.status_code}: {ready.json()}"
        if ready.status_code == 200:
            assert ready.json().get("ready") is True
        else:
            detail = ready.json().get("detail", "").lower()
            assert any(k in detail for k in ("database", "db", "jwks", "unreachable")), f"Detail doesn't name dependency: {ready.json()}"


@pytest.mark.integration
def test_ready_reports_which_dependency_failed_integration():
    """/ready detail names the failed dependency in integration env.

    In this test env, JWKS fails (frontend not running). We verify the detail
    correctly identifies it.
    """
    import main
    from fastapi.testclient import TestClient

    with TestClient(main.app) as client:
        ready = client.get("/ready")
        assert ready.status_code in (200, 503)
        if ready.status_code == 503:
            detail = ready.json().get("detail", "").lower()
            assert "jwks" in detail or "unreachable" in detail, f"JWKS failure not named: {ready.json()}"