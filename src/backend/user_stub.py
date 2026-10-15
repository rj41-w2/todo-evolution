"""Better Auth `user` table stub — external seam documentation.

The `user` table is owned and managed by Better Auth (frontend).
- Created by: `npx auth@latest migrate` in `frontend/`
- Never created, altered, or dropped by backend Alembic migrations
- Referenced via FK from: `tasks.user_id`, `conversations.user_id`, `messages.user_id`

This stub exists solely so SQLAlchemy can resolve ForeignKey constraints at
mapper configuration time. Without it, the mapper raises NoReferencedTableError
on INSERT/UPDATE because `user.id` is not in our metadata.

It lives at the backend root rather than under `repositories/` because
`repositories/*` imports `models`; keeping it out of that package is what stops
`import models` and `import main` from deadlocking on a circular import.

Alembic's `include_object()` (in `migrations/env.py`) excludes this table from
autogenerate comparisons so backend migrations never touch the real table.
"""

from sqlalchemy import Column, String, Table

from database import Base


# Minimal stub: only the columns needed for FK resolution.
# Do NOT add columns that exist in the real table (email, name, etc.) —
# this metadata is not the source of truth.
if "user" not in Base.metadata.tables:
    Table(
        "user",
        Base.metadata,
        Column("id", String, primary_key=True),
    )