"""initial application schema: tasks, conversations, messages

Revision ID: 0001_initial_app_schema
Revises:
Create Date: 2026-10-13

The `tasks`, `conversations` and `messages` tables reference `"user"."id"`, which
is owned by Better Auth. Run `npx auth@latest migrate` in
`frontend/` before applying this migration.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0001_initial_app_schema"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# create_type=False: the types are created/dropped explicitly below, so the
# column definitions never emit a duplicate CREATE TYPE.
STATUS_ENUM = postgresql.ENUM("PENDING", "COMPLETED", name="statusenum", create_type=False)
PRIORITY_ENUM = postgresql.ENUM("LOW", "MEDIUM", "HIGH", name="priorityenum", create_type=False)


def upgrade() -> None:
    bind = op.get_bind()

    if not op.get_context().as_sql:
        if "user" not in sa.inspect(bind).get_table_names():
            raise RuntimeError(
                'Better Auth tables are missing. Run `npx auth@latest migrate` in frontend/ '
                'in frontend/ before applying backend migrations.'
            )

    STATUS_ENUM.create(bind, checkfirst=True)
    PRIORITY_ENUM.create(bind, checkfirst=True)

    op.create_table(
        "tasks",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", STATUS_ENUM, nullable=True),
        sa.Column("priority", PRIORITY_ENUM, nullable=True),
        sa.Column("tags", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("due_date", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_tasks_user_id", "tasks", ["user_id"])

    op.create_table(
        "conversations",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_conversations_user_id", "conversations", ["user_id"])

    op.create_table(
        "messages",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("conversation_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("role", sa.String(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["conversation_id"], ["conversations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_messages_conversation_id", "messages", ["conversation_id"])
    op.create_index("ix_messages_user_id", "messages", ["user_id"])


def downgrade() -> None:
    bind = op.get_bind()

    op.drop_index("ix_messages_user_id", table_name="messages")
    op.drop_index("ix_messages_conversation_id", table_name="messages")
    op.drop_table("messages")

    op.drop_index("ix_conversations_user_id", table_name="conversations")
    op.drop_table("conversations")

    op.drop_index("ix_tasks_user_id", table_name="tasks")
    op.drop_table("tasks")

    PRIORITY_ENUM.drop(bind, checkfirst=True)
    STATUS_ENUM.drop(bind, checkfirst=True)
