"""index task retrieval for the filter and ordering the list route actually uses

Revision ID: 0004_task_list_index
Revises: 0003_persistence_invariants
Create Date: 2026-10-16

Issue #7. `tasks` carried only `ix_tasks_user_id` and its primary key.

The list route filters on `user_id`, optionally on `status` and `priority`,
and orders by `created_at DESC, id DESC`. None of those indexes supported that
query, so it ran as a sequential scan over the table.

The index covers `(user_id, created_at DESC, id DESC)`:

- `user_id` first, because it is always in the predicate and is the selective
  one — a query for one user's tasks should not walk everyone's;
- then the full sort key, in the direction the query sorts. Postgres can walk
  an index backwards, but declaring it in the order asked for keeps the plan
  free of a sort node;
- `id` is in the index because `created_at` is not unique. Without a
  tiebreaker in the key, the cursor boundary can fall between rows the server
  did not guarantee to be ordered — which is how the same task ends up on two
  pages or on none.

`status` and `priority` are deliberately *not* in the index. They are optional
filters over what is already one user's tasks, which is a selective enough set;
a four-column index costs write throughput on every insert for a filter the
majority of requests do not use. Revisit if filtered listing shows up in a
slow query log rather than speculatively.

Descending is declared explicitly: Postgres defaults an index to ascending, and
`created_at DESC, id DESC` is not the reverse of `created_at ASC, id ASC` —
reversing a multi-column index reverses each column's *direction* independently,
so the leading column would come back ascending. Declaring it removes the
reasoning entirely.

Downgrade is safe and online; dropping an index takes no data with it.
"""

from typing import Sequence, Union

from alembic import op

revision: str = "0004_task_list_index"
down_revision: Union[str, None] = "0003_persistence_invariants"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

INDEX_NAME = "ix_tasks_user_created_at_id"


def upgrade() -> None:
    op.execute(
        f"CREATE INDEX IF NOT EXISTS {INDEX_NAME} "
        "ON tasks (user_id, created_at DESC, id DESC)"
    )


def downgrade() -> None:
    op.execute(f"DROP INDEX IF EXISTS {INDEX_NAME}")