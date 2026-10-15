"""Database invariants the application assumes but never enforced.

Needs a real database: every assertion here is about what the *database*
refuses to accept, so a mock cannot be in the room.

Issue #6 asks for constraints enforcing required lifecycle values and valid
ownership, and for timestamps that preserve UTC. None of it was there. The
evidence, from the live schema before this work:

    tasks.status          timestamp? no — varchar/enum, NULLABLE, no default
    tasks.created_at      timestamp WITHOUT time zone, NULLABLE, no default
    messages.role         varchar, NULLABLE, unconstrained — any string
    messages_conversation_id_fkey -> conversations(id)   ← ownership untied

Defaults like `StatusEnum.PENDING` and `datetime.now(timezone.utc)` are
SQLAlchemy-side. They apply when a write goes through the ORM and nowhere
else. Nothing stopped a raw insert producing a task with no status, no
priority and no timestamp — a row that sorts unpredictably and reads as a
corrupt task forever.

The timestamp defect is the one users saw. `DateTime` maps to
`timestamp without time zone`, so a tz-aware UTC value was written and its
offset silently dropped; the API returned `2026-07-15T16:00:00` with no `Z`;
and `new Date("2026-07-15T16:00:00")` in a browser is *local* time. Every
overdue check was out by the reader's UTC offset.

These assert on database behaviour — a raw statement that must be refused —
because the ORM's own defaults would make a through-the-ORM test pass
regardless of what the database enforces.
"""

import uuid

import pytest
import sqlalchemy as sa

from database import engine

pytestmark = pytest.mark.integration

OWNER = "test-invariants-owner"
OTHER = "test-invariants-other"


@pytest.fixture
def owner():
    """A real row in Better Auth's `user` table, so the FKs hold."""
    with engine.begin() as conn:
        for uid, email in ((OWNER, "inv-owner@test.invalid"), (OTHER, "inv-other@test.invalid")):
            conn.execute(
                sa.text(
                    'INSERT INTO "user" (id, name, email, "emailVerified",'
                    ' "createdAt", "updatedAt")'
                    " VALUES (:id, :id, :email, false, now(), now())"
                    " ON CONFLICT (id) DO NOTHING"
                ),
                {"id": uid, "email": email},
            )
    try:
        yield
    finally:
        with engine.begin() as conn:
            conn.execute(
                sa.text('DELETE FROM "user" WHERE id IN (:a, :b)'),
                {"a": OWNER, "b": OTHER},
            )


def _raw(sql: str, **params):
    """Run a statement outside the ORM, and return how the database responded.

    Going around SQLAlchemy on purpose: its column defaults are exactly the
    thing being tested here, and they would answer for the database.
    """
    with engine.connect() as conn:
        return conn.execute(sa.text(sql), params)


def _column_type(table: str, column: str) -> tuple[str, str, str]:
    """(data_type, is_nullable, column_default) straight from the catalog."""
    with engine.connect() as conn:
        row = conn.execute(
            sa.text(
                "SELECT data_type, is_nullable, column_default"
                " FROM information_schema.columns"
                " WHERE table_schema='public' AND table_name=:t AND column_name=:c"
            ),
            {"t": table, "c": column},
        ).fetchone()
    return row


# --- Timestamps ------------------------------------------------------------


def test_every_timestamp_column_is_timezone_aware(owner):
    """`timestamp without time zone` silently discards the UTC offset.

    This is the one users saw: the API returned a string with no `Z`, and
    JavaScript reads such a string as local time, so every overdue check was
    out by the reader's offset.
    """
    for table, column in (
        ("tasks", "created_at"),
        ("tasks", "due_date"),
        ("conversations", "created_at"),
        ("conversations", "updated_at"),
        ("messages", "created_at"),
    ):
        data_type, _, _ = _column_type(table, column)
        assert data_type == "timestamp with time zone", (
            f"{table}.{column} is `{data_type}`; without a time zone the UTC "
            "offset is discarded and the value is ambiguous once it leaves "
            "Postgres"
        )


def test_a_value_written_as_utc_reads_back_as_utc(owner):
    """Not just the right column type — the right instant."""
    from datetime import datetime, timezone

    moment = datetime(2026, 7, 15, 16, 0, tzinfo=timezone.utc)
    task_id = str(uuid.uuid4())
    with engine.begin() as conn:
        conn.execute(
            sa.text(
                "INSERT INTO tasks (id, user_id, title, status, priority, tags, created_at, due_date)"
                " VALUES (:i, :u, 'TZ', 'PENDING', 'MEDIUM', '[]'::json, :c, :d)"
            ),
            {"i": task_id, "u": OWNER, "c": moment, "d": moment},
        )
    try:
        with engine.connect() as conn:
            stored = conn.execute(
                sa.text("SELECT created_at FROM tasks WHERE id = :i"), {"i": task_id}
            ).scalar_one()

        assert stored.tzinfo is not None, (
            f"read back a naive datetime ({stored!r}) from a timezone-aware "
            "column; the instant is only correct by accident of the session "
            "timezone"
        )
        assert stored.astimezone(timezone.utc) == moment, (
            f"stored {stored.astimezone(timezone.utc)} but wrote {moment}"
        )
    finally:
        with engine.begin() as conn:
            conn.execute(sa.text("DELETE FROM tasks WHERE id = :i"), {"i": task_id})


def test_the_serialised_timestamp_carries_an_offset(owner):
    """What the browser actually receives.

    A datetime that Python considers aware still serialises without a `Z`
    if the column is naive, so this is the assertion that matters to a user —
    it is the string `new Date(...)` will parse.
    """
    from fastapi.testclient import TestClient

    from main import app, get_current_user
    from models import TaskCreate

    app.dependency_overrides[get_current_user] = lambda: OWNER
    try:
        response = TestClient(app).post(
            f"/api/{OWNER}/tasks",
            json=TaskCreate(title="OFFSET CHECK").model_dump(mode="json"),
        )
        assert response.status_code == 201, response.text
        created = response.json()["created_at"]

        assert created.endswith("Z") or "+" in created[10:], (
            f"the API returned {created!r} with no offset. JavaScript parses "
            "that as *local* time, so every client renders it out by its own "
            "UTC offset."
        )
    finally:
        app.dependency_overrides.pop(get_current_user, None)


# --- Required lifecycle values -------------------------------------------


def test_lifecycle_columns_are_not_nullable(owner):
    for table, column in (
        ("tasks", "status"),
        ("tasks", "priority"),
        ("tasks", "created_at"),
        ("tasks", "tags"),
        ("conversations", "created_at"),
        ("conversations", "updated_at"),
        ("messages", "created_at"),
        ("messages", "role"),
    ):
        _, is_nullable, _ = _column_type(table, column)
        assert is_nullable == "NO", (
            f"{table}.{column} is nullable; the ORM defaults do not protect "
            "a write path that bypasses the ORM"
        )


def test_omitting_lifecycle_values_gets_database_defaults(owner):
    """A raw insert with the lifecycle columns left out must still be valid.

    The ORM would have filled these in, which is exactly why they need a
    database-level default rather than a Python-side one.
    """
    task_id = str(uuid.uuid4())
    with engine.begin() as conn:
        conn.execute(
            sa.text(
                "INSERT INTO tasks (id, user_id, title) VALUES (:i, :u, 'DEFAULTS')"
            ),
            {"i": task_id, "u": OWNER},
        )
    try:
        with engine.connect() as conn:
            row = conn.execute(
                sa.text(
                    "SELECT status, priority, tags, created_at FROM tasks WHERE id = :i"
                ),
                {"i": task_id},
            ).fetchone()
        assert row.status == "PENDING", f"status defaulted to {row.status!r}, expected PENDING"
        assert row.priority == "MEDIUM", f"priority defaulted to {row.priority!r}"
        assert row.tags is not None, "tags defaulted to NULL"
        assert row.created_at is not None, "created_at defaulted to NULL — the row has no time"
    finally:
        with engine.begin() as conn:
            conn.execute(sa.text("DELETE FROM tasks WHERE id = :i"), {"i": task_id})


def test_the_database_refuses_a_task_with_no_status(owner):
    """An explicit NULL is refused even though omitting the column is fine.

    This test originally omitted `status` and expected a refusal. It stopped
    raising once the database default landed — which is correct behaviour, and
    is exactly what `test_omitting_lifecycle_values_gets_database_defaults`
    asserts. What it now covers is the other half: a default serves omission,
    but a default cannot turn an explicit NULL back into a value. That is what
    NOT NULL is for, and a column with only a default would still accept one.
    """
    task_id = str(uuid.uuid4())
    with pytest.raises(sa.exc.IntegrityError):
        with engine.begin() as conn:
            conn.execute(
                sa.text(
                    "INSERT INTO tasks"
                    " (id, user_id, title, status, priority, tags, created_at)"
                    " VALUES (:i, :u, 'NULL STATUS', NULL, 'MEDIUM', '[]'::json, now())"
                ),
                {"i": task_id, "u": OWNER},
            )
    with engine.begin() as conn:
        conn.execute(sa.text("DELETE FROM tasks WHERE id = :i"), {"i": task_id})


def test_the_database_refuses_a_message_with_an_unknown_role(owner):
    try:
        with engine.begin() as conn:
            conv = conn.execute(
                sa.text(
                    "INSERT INTO conversations (id, user_id) VALUES (:i, :u) RETURNING id"
                ),
                {"i": str(uuid.uuid4()), "u": OWNER},
            ).scalar_one()
        with pytest.raises(sa.exc.IntegrityError):
            with engine.begin() as conn:
                conn.execute(
                    sa.text(
                        "INSERT INTO messages (id, user_id, conversation_id, role, content, created_at)"
                        " VALUES (:i, :u, :c, 'definitely-not-a-role', 'x', now())"
                    ),
                    {"i": str(uuid.uuid4()), "u": OWNER, "c": conv},
                )
    finally:
        with engine.begin() as conn:
            conn.execute(sa.text("DELETE FROM conversations WHERE user_id = :u"), {"u": OWNER})


# --- Ownership -------------------------------------------------------------


def test_a_message_cannot_disown_its_conversation(owner):
    """`messages.user_id` is denormalised from `conversations.user_id`.

    Nothing tied the two together: a message could claim one owner while
    belonging to another's conversation. The application never does this, so
    no test caught it, and any future write path would inherit the gap.
    """
    try:
        with engine.begin() as conn:
            conv = conn.execute(
                sa.text(
                    "INSERT INTO conversations (id, user_id) VALUES (:i, :u) RETURNING id"
                ),
                {"i": str(uuid.uuid4()), "u": OWNER},
            ).scalar_one()
        with pytest.raises(sa.exc.IntegrityError):
            with engine.begin() as conn:
                conn.execute(
                    sa.text(
                        "INSERT INTO messages (id, user_id, conversation_id, role, content, created_at)"
                        " VALUES (:i, :u_other, :c, 'user', 'x', now())"
                    ),
                    {"i": str(uuid.uuid4()), "u_other": OTHER, "c": conv},
                )
    finally:
        with engine.begin() as conn:
            conn.execute(sa.text("DELETE FROM conversations WHERE user_id = :u"), {"u": OWNER})


def test_the_honest_write_is_still_accepted(owner):
    """The constraint must not break the case that is legitimate."""
    try:
        with engine.begin() as conn:
            conv = conn.execute(
                sa.text(
                    "INSERT INTO conversations (id, user_id) VALUES (:i, :u) RETURNING id"
                ),
                {"i": str(uuid.uuid4()), "u": OWNER},
            ).scalar_one()
            conn.execute(
                sa.text(
                    "INSERT INTO messages (id, user_id, conversation_id, role, content, created_at)"
                    " VALUES (:i, :u, :c, 'user', 'hello', now())"
                ),
                {"i": str(uuid.uuid4()), "u": OWNER, "c": conv},
            )
    finally:
        with engine.begin() as conn:
            conn.execute(sa.text("DELETE FROM conversations WHERE user_id = :u"), {"u": OWNER})