"""enforce persistence invariants: timezone-aware timestamps, required values, ownership

Revision ID: 0003_persistence_invariants
Revises: 0002_add_composite_idx
Create Date: 2026-10-16

Issue #6. Everything here is a value the application already assumed but the
database never enforced.

**Timestamps.** Every column was `timestamp without time zone`, while the
code wrote `datetime.now(timezone.utc)`. The offset was silently dropped, the
API returned `2026-07-15T16:00:00` with no `Z`, and JavaScript reads such a
string as *local* time — so every overdue check was out by the reader's UTC
offset. `DateTime(timezone=True)` now, which maps to `timestamptz`.

The conversion pins `SET LOCAL TimeZone = 'UTC'` for the duration. Postgres
interprets a naive timestamp being converted to `timestamptz` using the
*session* timezone, so on a server not set to UTC this migration would
silently shift every timestamp by the difference. It happened to be safe
here — the server reports GMT — but "happened to be" is how issue #10's
migration problem happened. The downgrade needs the same pin, because
`timestamptz` → `timestamp` is the same conversion in reverse.

**Required values.** `status`, `priority`, `tags`, `created_at` and
`updated_at` were all nullable with no database default; the only defaults
were Python-side, in the ORM. A write that bypassed the ORM produced a task
with no status, no priority and no timestamp — a row that sorts
unpredictably and reads as corrupt forever. They now have database defaults
and NOT NULL, so both write paths agree.

**Ownership.** `messages.user_id` is denormalised from
`conversations.user_id`, and nothing tied the two together: a message could
name one owner while belonging to another's conversation. A composite foreign
key now enforces it, which is cheaper and more obvious than a trigger. The
`UNIQUE (id, user_id)` it targets is redundant against the primary key but
required as an FK target.

Run `npx auth migrate` before this on a fresh database — `user` is owned by
Better Auth, not by us.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0003_persistence_invariants"
down_revision: Union[str, None] = "0002_add_composite_idx"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# (table, column) pairs whose type moves to `timestamptz`.
_TS = [
    ("tasks", "created_at"),
    ("tasks", "due_date"),
    ("conversations", "created_at"),
    ("conversations", "updated_at"),
    ("messages", "created_at"),
]

# (table, column, default) — applied before NOT NULL, so that a row which
# omits the column gets the default rather than failing.
_REQUIRED = [
    ("tasks", "status", "'PENDING'::statusenum"),
    ("tasks", "priority", "'MEDIUM'::priorityenum"),
    ("tasks", "tags", "'[]'::json"),
    ("tasks", "created_at", "now()"),
    ("conversations", "created_at", "now()"),
    ("conversations", "updated_at", "now()"),
    ("messages", "created_at", "now()"),
]

# Roles the application writes. `model` is what Gemini calls its own turn and
# is mapped to `assistant` before storage, so it is allowed here too — a
# constraint stricter than the code would reject writes the code makes.
_ROLE_VALUES = ("user", "assistant", "model")


def _to_timestamptz() -> None:
    for table, column in _TS:
        op.alter_column(
            table, column,
            type_=sa.DateTime(timezone=True),
            postgresql_using=f"{column} AT TIME ZONE 'UTC'",
        )


def _to_naive_timestamp() -> None:
    for table, column in _TS:
        # The same conversion in reverse: session timezone decides what a
        # `timestamptz` becomes when narrowed to `timestamp`.
        op.alter_column(
            table, column,
            type_=sa.DateTime(timezone=False),
            postgresql_using=f"({column} AT TIME ZONE 'UTC')",
        )


def upgrade() -> None:
    # Pin the session timezone so the conversion means "these naive values are
    # UTC", not "these naive values are whatever this server thinks".
    op.execute("SET LOCAL TimeZone = 'UTC'")

    # Existing rows must satisfy the constraints before they are declared.
    # There are none today on the live database, but a migration that only
    # works on an empty table is a migration that fails on the copy.
    op.execute("UPDATE tasks SET status = 'PENDING'::statusenum WHERE status IS NULL")
    op.execute("UPDATE tasks SET priority = 'MEDIUM'::priorityenum WHERE priority IS NULL")
    op.execute("UPDATE tasks SET tags = '[]'::json WHERE tags IS NULL")
    op.execute("UPDATE tasks SET created_at = now() WHERE created_at IS NULL")
    op.execute("UPDATE conversations SET created_at = now() WHERE created_at IS NULL")
    op.execute("UPDATE conversations SET updated_at = now() WHERE updated_at IS NULL")
    op.execute("UPDATE messages SET created_at = now() WHERE created_at IS NULL")

    # Ownership: tie `messages.user_id` to its conversation's owner.
    op.execute("ALTER TABLE conversations ADD CONSTRAINT conversations_id_user_key UNIQUE (id, user_id)")
    op.execute("ALTER TABLE messages DROP CONSTRAINT messages_conversation_id_fkey")
    op.execute(
        "ALTER TABLE messages ADD CONSTRAINT messages_conversation_fkey "
        "FOREIGN KEY (conversation_id, user_id) "
        "REFERENCES conversations (id, user_id) ON DELETE CASCADE"
    )

    op.create_check_constraint(
        "messages_role_check", "messages",
        sa.text("role IN ('user', 'assistant', 'model')"),
    )

    _to_timestamptz()

    for table, column, default in _REQUIRED:
        op.execute(f"ALTER TABLE {table} ALTER COLUMN {column} SET DEFAULT {default}")
        op.alter_column(table, column, nullable=False)


def downgrade() -> None:
    op.execute("SET LOCAL TimeZone = 'UTC'")

    for table, column, _ in _REQUIRED:
        op.alter_column(table, column, nullable=True)
        op.execute(f"ALTER TABLE {table} ALTER COLUMN {column} DROP DEFAULT")

    _to_naive_timestamp()

    op.drop_constraint("messages_role_check", "messages", type_="check")
    op.execute("ALTER TABLE messages DROP CONSTRAINT messages_conversation_fkey")
    op.execute(
        "ALTER TABLE messages ADD CONSTRAINT messages_conversation_id_fkey "
        "FOREIGN KEY (conversation_id) REFERENCES conversations (id) ON DELETE CASCADE"
    )
    op.execute("ALTER TABLE conversations DROP CONSTRAINT conversations_id_user_key")