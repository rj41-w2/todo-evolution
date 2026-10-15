"""Retrieval must be ordered, bounded, and indexable.

Needs a database.

Issue #7. Three things were missing, and only the first shows up in a
response body:

1. `list_by_user` had no `ORDER BY`. SQL does not define an order without one,
   so the order Postgres happened to choose was the order users saw — and
   nothing client-side sorted either (`TasksProvider` does `setTasks(data)`
   with no sort anywhere). Two identical requests are entitled to return the
   same rows in different orders.
2. No limit. Every task a user ever created came back in one response.
3. No index matching the filter and the ordering. `tasks` had only
   `ix_tasks_user_id` and its primary key.
"""

import uuid

import pytest
import sqlalchemy as sa

from database import engine, SessionLocal
from main import app, get_current_user
from models import Task, StatusEnum, PriorityEnum

pytestmark = pytest.mark.integration

ALICE = "test-scale-alice"
PAGE = 3
CAP = 50


@pytest.fixture
def alice():
    with engine.begin() as conn:
        conn.execute(
            sa.text(
                'INSERT INTO "user" (id, name, email, "emailVerified",'
                ' "createdAt", "updatedAt")'
                " VALUES (:id, :id, :email, false, now(), now())"
                " ON CONFLICT (id) DO NOTHING"
            ),
            {"id": ALICE, "name": ALICE, "email": "scale@test.invalid"},
        )
    app.dependency_overrides[get_current_user] = lambda: ALICE
    try:
        yield
    finally:
        app.dependency_overrides.pop(get_current_user, None)
        with engine.begin() as conn:
            conn.execute(sa.text('DELETE FROM "user" WHERE id = :id'), {"id": ALICE})


def seed(count: int) -> list[str]:
    """Insert `count` tasks whose `created_at` order is the reverse of insertion.

    The reversal is the point: if the query returns insertion order it will not
    match `created_at` order, so a missing `ORDER BY` cannot pass by accident on
    a small table where the two happen to coincide.
    """
    from datetime import datetime, timedelta, timezone

    ids = [str(uuid.uuid4()) for _ in range(count)]
    base = datetime(2026, 5, 1, tzinfo=timezone.utc)
    with SessionLocal() as session:
        for i, tid in enumerate(ids):
            session.add(
                Task(
                    id=tid,
                    user_id=ALICE,
                    title=f"task {i:02}",
                    status=StatusEnum.PENDING,
                    priority=PriorityEnum.MEDIUM,
                    tags=[],
                    created_at=base + timedelta(minutes=count - 1 - i),
                )
            )
        session.commit()
    return ids


def fetch(**params):
    """One page, failing legibly if the envelope is not what paging needs.

    The route answers with a bare array today. Checking the shape first turns
    every `TypeError: list indices must be integers` into a sentence naming the
    actual defect, so a red run says what is missing rather than what shape it
    tripped over.
    """
    from fastapi.testclient import TestClient

    query = "&".join(f"{k}={v}" for k, v in params.items())
    payload = TestClient(app).get(f"/api/{ALICE}/tasks?{query}").json()

    if isinstance(payload, list):
        pytest.fail(
            "GET /tasks answers with a bare array; it must answer with "
            '{"tasks": [...], "next_cursor": ...} so a client can page. '
            f"Got a list of {len(payload)}."
        )
    return payload


def walk_pages():
    """Follow `next_cursor` to the end, collecting ids."""
    seen: list[str] = []
    cursor = None
    for _ in range(50):
        params = {"limit": PAGE}
        if cursor:
            params["cursor"] = cursor
        page = fetch(**params)
        seen.extend(t["id"] for t in page["tasks"])
        cursor = page.get("next_cursor")
        if not cursor:
            break
    return seen


# --- Ordering --------------------------------------------------------------


def test_tasks_come_back_newest_first(alice):
    """Asserted on `created_at`, not on titles.

    The fixture numbers titles in insertion order and gives them `created_at`
    in reverse, so "newest first" and "title 00 first" happen to coincide
    here. Asserting on the title would pass for the wrong reason and would
    break the moment someone renumbers the fixture.
    """
    seed(6)

    stamps = [t["created_at"] for t in fetch()["tasks"]]

    assert stamps == sorted(stamps, reverse=True), (
        f"expected newest first, got {stamps}. A query with no ORDER BY returns "
        "rows in whatever order the plan produces, and the client does not sort."
    )


def test_the_order_is_stable_across_identical_requests(alice):
    seed(8)

    first = [t["id"] for t in fetch()["tasks"]]
    second = [t["id"] for t in fetch()["tasks"]]

    assert first == second, "two identical requests returned different orders"


def test_ties_are_broken_deterministically(alice):
    """Tasks sharing a `created_at` must still have a total order.

    `created_at` is not unique. Ordering on it alone leaves equal rows in an
    order the database does not promise, which is exactly how a paginating
    client starts skipping and repeating rows.
    """
    from datetime import datetime, timezone

    same = datetime(2026, 6, 1, tzinfo=timezone.utc)
    with SessionLocal() as session:
        for _ in range(4):
            session.add(
                Task(
                    id=str(uuid.uuid4()),
                    user_id=ALICE,
                    title="tied",
                    status=StatusEnum.PENDING,
                    priority=PriorityEnum.MEDIUM,
                    tags=[],
                    created_at=same,
                )
            )
        session.commit()

    first = [t["id"] for t in fetch()["tasks"]]
    second = [t["id"] for t in fetch()["tasks"]]

    assert first == second, (
        f"rows sharing a created_at came back in different orders: {first} vs {second}"
    )
    assert len(set(first)) == len(first), "the same task appeared twice"


# --- Bounded size ----------------------------------------------------------


def test_the_response_is_bounded(alice):
    seed(25)

    assert len(fetch()["tasks"]) <= CAP, (
        f"one request returned more than {CAP} tasks with no bound"
    )


def test_limit_is_honoured(alice):
    seed(10)

    assert len(fetch(limit=PAGE)["tasks"]) == PAGE


def test_a_limit_beyond_what_exists_is_not_an_error(alice):
    seed(2)

    assert len(fetch(limit=100)["tasks"]) == 2


def test_an_absurd_limit_is_capped(alice):
    seed(4)

    assert len(fetch(limit=100000)["tasks"]) == 4, (
        "limit=100000 was honoured; the cap is meant to bound the response, not "
        "to let a caller ask for everything"
    )


# --- Paging ----------------------------------------------------------------


def test_paging_reaches_every_task_exactly_once(alice):
    seed(10)

    seen = walk_pages()

    assert len(seen) == 10, f"paging visited {len(seen)} of 10 tasks"
    assert len(set(seen)) == 10, f"paging repeated a task: {seen}"


def test_paging_survives_a_task_created_mid_walk(alice):
    """Keyset paging, not offset.

    With `LIMIT/OFFSET`, a task created between two requests shifts everything
    after it by one and the reader sees a duplicate; one deleted in the same
    window and the reader skips a row. Keyset paging anchors on the last row
    seen, so both are harmless.
    """
    from datetime import datetime, timedelta, timezone

    seed(9)

    first_page = fetch(limit=PAGE)
    cursor = first_page["next_cursor"]
    assert cursor

    with SessionLocal() as session:
        session.add(
            Task(
                id=str(uuid.uuid4()),
                user_id=ALICE,
                title="arrived mid-walk",
                status=StatusEnum.PENDING,
                priority=PriorityEnum.MEDIUM,
                tags=[],
                created_at=datetime(2026, 5, 1, tzinfo=timezone.utc) + timedelta(days=1),
            )
        )
        session.commit()

    second_page = fetch(limit=PAGE, cursor=cursor)

    first_ids = {t["id"] for t in first_page["tasks"]}
    second_ids = {t["id"] for t in second_page["tasks"]}

    assert not (first_ids & second_ids), (
        f"a task appeared on both pages: {first_ids & second_ids}"
    )
    assert len(second_ids) == PAGE


def test_the_final_page_reports_no_next_cursor(alice):
    seed(4)

    first_page = fetch(limit=3)
    assert first_page["next_cursor"]

    last = fetch(limit=3, cursor=first_page["next_cursor"])
    assert last["next_cursor"] is None, (
        "a fully-consumed sequence still advertised another page; a client "
        "following it would ask forever"
    )


def test_a_bogus_cursor_is_refused_rather_than_silently_ignored(alice):
    seed(3)

    from fastapi.testclient import TestClient

    response = TestClient(app).get(f"/api/{ALICE}/tasks?cursor=not-a-real-cursor")

    assert response.status_code in (400, 422), (
        f"a malformed cursor answered {response.status_code}; ignoring it would "
        "restart from the beginning and silently duplicate the first page"
    )


# --- Indexes ---------------------------------------------------------------


def test_the_index_exists_and_covers_the_order(alice):
    """Named check, so the failure names what is missing rather than a plan."""
    with engine.connect() as conn:
        indexes = {
            r[0]: r[1]
            for r in conn.execute(
                sa.text("SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'tasks'")
            ).fetchall()
        }

    covering = [
        name
        for name, definition in indexes.items()
        if "user_id" in definition and "created_at" in definition
    ]
    assert covering, (
        "no index on tasks covers both the filter (user_id) and the ordering "
        f"(created_at). Existing: {sorted(indexes)}"
    )


def test_the_filter_and_order_are_served_by_an_index(alice):
    """Not "an index exists" — that the plan uses it for this query.

    Seeded with real volume and `enable_seqscan` left alone. At a dozen rows
    Postgres prefers a sequential scan whatever the indexes say, so checking at
    small scale would pass or fail for a reason that has nothing to do with the
    schema.
    """
    seed(400)
    with engine.begin() as conn:
        conn.execute(
            sa.text(
                "INSERT INTO tasks (id, user_id, title, status, priority, tags, created_at)"
                " SELECT gen_random_uuid(), :u, 'bulk ' || g, 'PENDING'::statusenum,"
                " 'MEDIUM'::priorityenum, '[]'::json, now() - (g || ' minutes')::interval"
                " FROM generate_series(1, 3000) g"
            ),
            {"u": ALICE},
        )

    with engine.connect() as conn:
        conn.execute(sa.text("ANALYZE tasks"))
        plan = "\n".join(
            r[0]
            for r in conn.execute(
                sa.text(
                    "EXPLAIN (ANALYZE) SELECT * FROM tasks"
                    " WHERE user_id = :u AND status = 'PENDING'::statusenum"
                    " ORDER BY created_at DESC, id DESC LIMIT 50"
                ),
                {"u": ALICE},
            ).fetchall()
        )

    assert "Seq Scan" not in plan, (
        f"the ordered, filtered task query still scans sequentially:\n{plan}\n"
        "Either the index does not match (user_id, created_at DESC, id DESC) or "
        "the ordering is not index-supported."
    )