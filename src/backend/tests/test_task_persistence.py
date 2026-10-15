"""End-to-end persistence and tenant isolation against a real database.

Requires a real PostgreSQL with both migration sets applied — Better Auth's
(`npx auth migrate`) and the application's (`alembic upgrade head`). Run with
`pytest -m integration`. See `docs/backend-verification.md` for the setup.

These tests exist because every other endpoint test cannot see this class of
bug. They hand the app a `MagicMock(spec=TaskRepository)` and assert the
repository was *called* — which a mock will confirm just as happily about a
write that is rolled back a millisecond later. So for a long time:

    POST /api/{id}/tasks  ->  201 Created,  nothing written
    PUT  /api/{id}/tasks/{tid} -> 200 OK,     nothing written

The UI showed the task as created; a refresh lost it. `DELETE` survived only
because that one route committed by hand, reaching past the repository into
`task_repo.session`.

So the assertions here are deliberately about **database state**, read through
a fresh session, never about the response body. A response can lie. A second
connection to the database cannot.
"""

import uuid

import pytest
import sqlalchemy as sa
from fastapi.testclient import TestClient

from database import SessionLocal, engine
from main import app, get_current_user
from models import Task

pytestmark = pytest.mark.integration

ALICE = "test-alice"
BOB = "test-bob"


@pytest.fixture
def tenants():
    """Two real rows in Better Auth's `user` table, so the FKs hold.

    The application tables declare `ON DELETE CASCADE` foreign keys into
    `user`, which PostgreSQL enforces whether or not the test wants it to.
    Real rows are cheaper than disabling enforcement, and closer to reality.
    """
    with engine.begin() as conn:
        for uid, email in ((ALICE, "alice@test.invalid"), (BOB, "bob@test.invalid")):
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
    """A client authenticated as `user_id`, bypassing JWT verification.

    The JWT layer is a separate concern with its own tests. What is under test
    here is what happens *after* identity is established: that the identity is
    then used to scope every read and every write.
    """
    app.dependency_overrides[get_current_user] = lambda: user_id
    return TestClient(app)


def _stored(user_id: str) -> list[str]:
    """Task titles visible to `user_id`, read through a brand new session.

    A fresh session matters. Reading back through the same session that wrote
    would be answered by SQLAlchemy's identity map, which would happily show a
    row that was never committed.
    """
    SessionLocal().close()
    with SessionLocal() as session:
        return [t.title for t in session.query(Task).filter(Task.user_id == user_id).all()]


def _reset_auth():
    app.dependency_overrides.pop(get_current_user, None)


# --- Persistence ------------------------------------------------------------


def test_create_persists_the_row(tenants):
    """201 must mean a row exists, not that one was prepared."""
    try:
        client = _as(ALICE)
        response = client.post(f"/api/{ALICE}/tasks", json={"title": "CREATE PROBE"})
        assert response.status_code == 201, response.text
        assert _stored(ALICE) == ["CREATE PROBE"], (
            f"POST answered 201 but the database holds {_stored(ALICE)!r}"
        )
    finally:
        _reset_auth()


def test_update_persists_the_row(tenants):
    """200 must mean the change was written, not just staged."""
    try:
        client = _as(ALICE)
        created = client.post(f"/api/{ALICE}/tasks", json={"title": "BEFORE"}).json()

        response = client.put(
            f"/api/{ALICE}/tasks/{created['id']}", json={"title": "AFTER"}
        )
        assert response.status_code == 200, response.text
        assert _stored(ALICE) == ["AFTER"], (
            f"PUT answered 200 but the database holds {_stored(ALICE)!r}"
        )
    finally:
        _reset_auth()


def test_delete_removes_the_row(tenants):
    """204 must mean the row is gone."""
    try:
        client = _as(ALICE)
        created = client.post(f"/api/{ALICE}/tasks", json={"title": "DOOMED"}).json()
        assert _stored(ALICE) == ["DOOMED"]

        response = client.delete(f"/api/{ALICE}/tasks/{created['id']}")
        assert response.status_code == 204, response.text
        assert _stored(ALICE) == [], (
            f"DELETE answered 204 but the database still holds {_stored(ALICE)!r}"
        )
    finally:
        _reset_auth()


def test_a_rejected_request_writes_nothing(tenants):
    """A 422 must not leave a partial row behind."""
    try:
        client = _as(ALICE)
        response = client.post(f"/api/{ALICE}/tasks", json={"title": ""})
        assert response.status_code == 422, response.text
        assert _stored(ALICE) == [], f"a rejected request wrote {_stored(ALICE)!r}"
    finally:
        _reset_auth()


# --- Tenant isolation -------------------------------------------------------


def test_a_tenant_cannot_read_another_tenants_tasks(tenants):
    """Bob asking for alice's list is refused, and alice keeps her data.

    Note the shape: the *path* names the victim. An attacker does not get to
    choose an identity to be treated as — they can only name someone else in
    the URL, and `sub != user_id` is what stops them.
    """
    try:
        alice = _as(ALICE)
        alice.post(f"/api/{ALICE}/tasks", json={"title": "ALICE PRIVATE"})

        app.dependency_overrides[get_current_user] = lambda: BOB
        bob = TestClient(app)
        response = bob.get(f"/api/{ALICE}/tasks")

        assert response.status_code == 403, (
            f"bob reading alice's list answered {response.status_code}, expected 403"
        )
        assert _stored(ALICE) == ["ALICE PRIVATE"], (
            f"alice's data changed during bob's attempt: {_stored(ALICE)!r}"
        )
        assert _stored(BOB) == [], f"bob's own view holds {_stored(BOB)!r}"
    finally:
        _reset_auth()


@pytest.mark.parametrize("method,body", [
    ("put", {"title": "HIJACKED"}),
    ("delete", None),
])
def test_a_tenant_cannot_mutate_another_tenants_task(tenants, method, body):
    try:
        alice = _as(ALICE)
        created = alice.post(f"/api/{ALICE}/tasks", json={"title": "ALICE PRIVATE"}).json()

        app.dependency_overrides[get_current_user] = lambda: BOB
        bob = TestClient(app)
        url = f"/api/{ALICE}/tasks/{created['id']}"

        if method == "put":
            response = bob.put(url, json=body)
        else:
            response = bob.delete(url)

        assert response.status_code == 403, (
            f"{method.upper()} as bob against alice's task answered "
            f"{response.status_code}, expected 403 — the token subject did not "
            "match the path user_id"
        )
        assert _stored(ALICE) == ["ALICE PRIVATE"], (
            f"bob's {method} reached alice's row: {_stored(ALICE)!r}"
        )
    finally:
        _reset_auth()


def test_a_tenant_cannot_read_a_known_task_id_of_another_tenant(tenants):
    """The attack that a same-tenant 404 check would miss.

    Bob already knows alice's task UUID. Hitting *bob's own* URL with it must
    not surface alice's row — the lookup is scoped by user, so this is a 404
    rather than a 403, and the point is that alice's data stays put.
    """
    try:
        alice = _as(ALICE)
        created = alice.post(f"/api/{ALICE}/tasks", json={"title": "ALICE PRIVATE"}).json()

        app.dependency_overrides[get_current_user] = lambda: BOB
        bob = TestClient(app)
        response = bob.get(f"/api/{BOB}/tasks/{created['id']}")

        assert response.status_code == 404, (
            f"bob fetching alice's task by id answered {response.status_code}, "
            "expected 404"
        )
        assert _stored(ALICE) == ["ALICE PRIVATE"], (
            f"alice's row was disturbed by bob's read: {_stored(ALICE)!r}"
        )
    finally:
        _reset_auth()


def test_a_tenant_cannot_write_into_another_tenants_url(tenants):
    """POST to another tenant's URL must be refused, not silently redirected."""
    try:
        app.dependency_overrides[get_current_user] = lambda: ALICE
        client = TestClient(app)
        response = client.post(f"/api/{BOB}/tasks", json={"title": "PLANTED"})

        assert response.status_code == 403, response.text
        assert _stored(BOB) == [], f"a task landed in bob's account: {_stored(BOB)!r}"
    finally:
        _reset_auth()


def test_an_unauthenticated_request_is_refused(tenants):
    """No override at all means the real JWT check runs, and must refuse."""
    try:
        _reset_auth()
        response = TestClient(app).get(f"/api/{ALICE}/tasks")
        assert response.status_code == 401, (
            f"an unauthenticated read answered {response.status_code}, expected 401"
        )
    finally:
        _reset_auth()