"""Goals: persistence, tenant isolation, and paged ordering against PostgreSQL.

Requires a real database with both migration sets applied — run with
`pytest -m integration`. See `docs/backend-verification.md`.

The assertions read the database back through a **fresh session**, never the
response body. A response can lie; a second connection to the database cannot.
That distinction is the whole reason this file exists rather than trusting
`test_goal_api.py`, whose mock confirms a write was prepared just as happily as
one that was rolled back a millisecond later.
"""

import uuid

import pytest
import sqlalchemy as sa
from fastapi.testclient import TestClient

from database import SessionLocal, engine
from main import app, get_current_user
from models import Goal

pytestmark = pytest.mark.integration

ALICE = "test-goal-alice"
BOB = "test-goal-bob"


@pytest.fixture
def tenants():
    """Two real rows in Better Auth's `user` table, so the FK holds."""
    with engine.begin() as conn:
        for uid, email in ((ALICE, "goal-alice@test.invalid"), (BOB, "goal-bob@test.invalid")):
            conn.execute(
                sa.text(
                    'INSERT INTO "user" (id, name, email, "emailVerified",'
                    ' "createdAt", "updatedAt")'
                    " VALUES (:id, :name, :email, false, now(), now())"
                    " ON CONFLICT (id) DO NOTHING"
                ),
                {"id": uid, "name": uid, "email": email},
            )

    try:
        yield
    finally:
        with engine.begin() as conn:
            conn.execute(sa.text('DELETE FROM "user" WHERE id IN (:a, :b)'), {"a": ALICE, "b": BOB})


def _as(user_id: str) -> TestClient:
    app.dependency_overrides[get_current_user] = lambda: user_id
    return TestClient(app)


def _reset_auth():
    app.dependency_overrides.pop(get_current_user, None)


def _stored(user_id: str) -> list[Goal]:
    """This user's goals, read through a brand new session.

    A fresh session matters: reading back through the writer's session is
    answered by SQLAlchemy's identity map, which would show a row that was never
    committed.
    """
    SessionLocal().close()
    with SessionLocal() as session:
        return (
            session.query(Goal)
            .filter(Goal.user_id == user_id)
            .order_by(Goal.created_at.desc(), Goal.id.desc())
            .all()
        )


# --- Persistence ------------------------------------------------------------


def test_create_persists_the_row(tenants):
    """201 must mean a row exists, not that one was prepared."""
    try:
        client = _as(ALICE)
        response = client.post(
            f"/api/{ALICE}/goals",
            json={"title": "Run a half marathon"},
        )
        assert response.status_code == 201, response.text

        stored = _stored(ALICE)
        assert [g.title for g in stored] == ["Run a half marathon"], (
            f"POST answered 201 but the database holds {[g.title for g in stored]!r}"
        )
    finally:
        _reset_auth()


def test_all_agreed_fields_round_trip(tenants):
    """Title, description, date-only target and status survive PostgreSQL."""
    try:
        client = _as(ALICE)
        response = client.post(
            f"/api/{ALICE}/goals",
            json={
                "title": "Run a half marathon",
                "description": "Sub two hours",
                "target_date": "2026-04-15",
                "status": "Active",
            },
        )
        assert response.status_code == 201, response.text
        body = response.json()
        assert body["target_date"] == "2026-04-15"
        assert body["status"] == "Active"

        goal = _stored(ALICE)[0]
        assert goal.description == "Sub two hours"
        assert goal.target_date.isoformat() == "2026-04-15"
        assert goal.status.value == "Active"
    finally:
        _reset_auth()


def test_update_persists_the_row(tenants):
    """200 must mean the change was written, not just staged."""
    try:
        client = _as(ALICE)
        created = client.post(f"/api/{ALICE}/goals", json={"title": "BEFORE"}).json()

        response = client.put(
            f"/api/{ALICE}/goals/{created['id']}",
            json={"title": "AFTER", "status": "Completed", "target_date": "2026-12-31"},
        )
        assert response.status_code == 200, response.text

        goal = _stored(ALICE)[0]
        assert goal.title == "AFTER"
        assert goal.status.value == "Completed"
        assert goal.target_date.isoformat() == "2026-12-31"
    finally:
        _reset_auth()


def test_a_rejected_request_writes_nothing(tenants):
    try:
        client = _as(ALICE)
        response = client.post(f"/api/{ALICE}/goals", json={"title": "   "})
        assert response.status_code == 422, response.text
        assert _stored(ALICE) == [], "a rejected request left a row behind"
    finally:
        _reset_auth()


# --- Tenant isolation -------------------------------------------------------


def test_a_tenant_cannot_read_another_tenants_goals(tenants):
    try:
        alice = _as(ALICE)
        alice.post(f"/api/{ALICE}/goals", json={"title": "ALICE PRIVATE"})

        app.dependency_overrides[get_current_user] = lambda: BOB
        bob = TestClient(app)
        response = bob.get(f"/api/{ALICE}/goals")

        assert response.status_code == 403, response.text
        assert [g.title for g in _stored(ALICE)] == ["ALICE PRIVATE"]
        assert _stored(BOB) == []
    finally:
        _reset_auth()


def test_a_tenant_cannot_write_into_another_tenants_url(tenants):
    try:
        app.dependency_overrides[get_current_user] = lambda: ALICE
        client = TestClient(app)
        response = client.post(f"/api/{BOB}/goals", json={"title": "PLANTED"})

        assert response.status_code == 403, response.text
        assert _stored(BOB) == [], "a goal landed in bob's account"
    finally:
        _reset_auth()


def test_a_tenant_cannot_mutate_another_tenants_goal_through_their_own_url(tenants):
    """Alice's known goal id, bob's own URL: 404, and alice's row is untouched.

    The lookup is scoped by owner, so a known UUID is not a capability. This is
    the attack a same-tenant 404 check would miss.
    """
    try:
        alice = _as(ALICE)
        created = alice.post(f"/api/{ALICE}/goals", json={"title": "ALICE PRIVATE"}).json()

        app.dependency_overrides[get_current_user] = lambda: BOB
        bob = TestClient(app)
        response = bob.put(
            f"/api/{BOB}/goals/{created['id']}",
            json={"title": "HIJACKED"},
        )

        assert response.status_code == 404, response.text
        assert [g.title for g in _stored(ALICE)] == ["ALICE PRIVATE"]
    finally:
        _reset_auth()


# --- Ordering and paging ----------------------------------------------------


def _seed(alice_count: int) -> list[str]:
    from datetime import datetime, timedelta, timezone

    ids = [str(uuid.uuid4()) for _ in range(alice_count)]
    base = datetime(2026, 5, 1, tzinfo=timezone.utc)
    with SessionLocal() as session:
        for i, gid in enumerate(ids):
            session.add(
                Goal(
                    id=gid,
                    user_id=ALICE,
                    title=f"goal {i:02}",
                    # `created_at` order is the reverse of insertion, so a query
                    # that returns insertion order cannot pass by accident.
                    created_at=base + timedelta(minutes=alice_count - 1 - i),
                )
            )
        session.commit()
    return ids


def _walk_pages(page_size: int) -> list[str]:
    client = TestClient(app)
    seen: list[str] = []
    cursor = None
    for _ in range(20):
        query = f"limit={page_size}" + (f"&cursor={cursor}" if cursor else "")
        page = client.get(f"/api/{ALICE}/goals?{query}").json()
        seen.extend(g["id"] for g in page["goals"])
        cursor = page.get("next_cursor")
        if not cursor:
            break
    return seen


def test_goals_come_back_newest_first_and_page_exactly_once_each(tenants):
    try:
        _as(ALICE)
        _seed(10)

        stamps = [g["created_at"] for g in TestClient(app).get(f"/api/{ALICE}/goals").json()["goals"]]
        assert stamps == sorted(stamps, reverse=True), stamps

        seen = _walk_pages(page_size=3)
        assert len(seen) == 10, f"paging visited {len(seen)} of 10 goals"
        assert len(set(seen)) == 10, f"paging repeated a goal: {seen}"
    finally:
        _reset_auth()


# --- Schema -----------------------------------------------------------------


def test_the_composite_index_for_the_list_query_exists(tenants):
    with engine.connect() as conn:
        indexes = {
            r[0]: r[1]
            for r in conn.execute(
                sa.text("SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'goals'")
            ).fetchall()
        }

    covering = [
        name
        for name, definition in indexes.items()
        if "user_id" in definition and "created_at" in definition
    ]
    assert covering, (
        "no index on goals covers both the filter (user_id) and the ordering "
        f"(created_at). Existing: {sorted(indexes)}"
    )
