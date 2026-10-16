"""add standalone personal goals

Revision ID: 0005_goals
Revises: 0004_task_list_index
Create Date: 2026-10-17

Issue #17. A goal is its own entity: title, optional description, optional
calendar target date, a status, and an owner. Nothing here references `tasks`,
and no task column references `goals` — linking the two is a later issue, and a
migration that guessed at the relationship now would have to be undone.

Two things are worth spelling out:

* `target_date` is a SQL `date`, not a timestamp. A goal is targeted at a
  calendar day. Storing it as `timestamptz` would attach a time and an offset
  the user never chose, and the reader's timezone would decide which day it
  landed on.

* The status enum is created and dropped explicitly (as in `0001`) rather than
  left to the column definition, so the type is not duplicated or orphaned when
  the table is dropped on downgrade.

The table carries a `(user_id, created_at DESC, id DESC)` index: `user_id` is
always in the predicate and is the selective column, and the full sort key, in
the direction the list query sorts, is what lets Postgres walk the index
instead of sorting. `id` is in the key because `created_at` is not unique —
without it a cursor page boundary can fall between rows the database never
promised to order.

An ORM-side default protects nothing from a write that bypasses the ORM, so
`status` and `created_at` are NOT NULL with database defaults, and a check
constraint refuses a blank or over-long title independently of the API.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0005_goals"
down_revision: Union[str, None] = "0004_task_list_index"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# create_type=False: the type is created/dropped explicitly below, so the column
# definition never emits a duplicate CREATE TYPE.
GOAL_STATUS_ENUM = postgresql.ENUM(
    "DRAFT", "ACTIVE", "PAUSED", "COMPLETED",
    name="goalstatusenum",
    create_type=False,
)

COMPOSITE_INDEX = "ix_goals_user_created_at_id"


def upgrade() -> None:
    bind = op.get_bind()

    if not op.get_context().as_sql:
        if "user" not in sa.inspect(bind).get_table_names():
            raise RuntimeError(
                "Better Auth tables are missing. Run `npx auth migrate` in frontend/ "
                "before applying backend migrations."
            )

    GOAL_STATUS_ENUM.create(bind, checkfirst=True)

    op.create_table(
        "goals",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("target_date", sa.Date(), nullable=True),
        sa.Column(
            "status",
            GOAL_STATUS_ENUM,
            nullable=False,
            server_default=sa.text("'DRAFT'::goalstatusenum"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.CheckConstraint(
            "length(trim(title)) BETWEEN 1 AND 200",
            name="goals_title_check",
        ),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_index("ix_goals_user_id", "goals", ["user_id"])
    op.execute(
        f"CREATE INDEX IF NOT EXISTS {COMPOSITE_INDEX} "
        "ON goals (user_id, created_at DESC, id DESC)"
    )


def downgrade() -> None:
    bind = op.get_bind()

    op.drop_index(COMPOSITE_INDEX, table_name="goals")
    op.drop_index("ix_goals_user_id", table_name="goals")
    op.drop_table("goals")
    GOAL_STATUS_ENUM.drop(bind, checkfirst=True)
