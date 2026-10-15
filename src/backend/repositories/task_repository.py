"""Task repository: narrow interface for Task entity."""

from datetime import datetime
from typing import Protocol
from uuid import UUID

import sqlalchemy as sa
from sqlalchemy.orm import Session

from models import Task, StatusEnum, PriorityEnum
from paging import DEFAULT_LIMIT
from repositories.base import Repository, SqlRepository


class TaskRepository(Repository[Task], Protocol):
    """Narrow protocol — only methods used by endpoints and MCP tools."""

    def list_page_by_user(
        self,
        user_id: str,
        status: StatusEnum | None = None,
        priority: PriorityEnum | None = None,
        after: tuple[datetime, UUID] | None = None,
        limit: int = DEFAULT_LIMIT,
    ) -> tuple[list[Task], bool]: ...

    def get_by_id_and_user(self, task_id: UUID, user_id: str) -> Task | None: ...

    def find_by_id_or_title(self, user_id: str, task_id_or_title: str) -> Task | None: ...

    # Base CRUD inherited: create, update, delete, get, list, exists


class SqlTaskRepository(SqlRepository[Task]):
    """SQLAlchemy implementation of TaskRepository."""

    def __init__(self, session: Session):
        super().__init__(session)

    @property
    def _model(self) -> type[Task]:
        return Task

    # --- Task-specific queries ---

    def list_page_by_user(
        self,
        user_id: str,
        status: StatusEnum | None = None,
        priority: PriorityEnum | None = None,
        after: tuple[datetime, UUID] | None = None,
        limit: int = DEFAULT_LIMIT,
    ) -> tuple[list[Task], bool]:
        """One page of a user's tasks, newest first, and whether more remain.

        `ORDER BY created_at DESC, id DESC` is not decoration. There was no
        ordering at all, so Postgres returned rows in whatever order the plan
        produced and the client — which does not sort — showed exactly that.

        `id` is the tiebreaker because `created_at` is not unique. Without it,
        equal rows sit in an order the database does not promise, and a cursor
        boundary can fall between them.

        `after` is a keyset position, not an offset: rows inserted or deleted
        above the cursor cannot shift the walk the way they shift `OFFSET`.

        One row beyond `limit` is fetched to learn whether more exist, which
        costs a single index entry rather than a `COUNT`.

        Served by `ix_tasks_user_created_at_id` (user_id, created_at DESC,
        id DESC) — issue #7.
        """
        query = self._session.query(Task).filter(Task.user_id == user_id)
        if status is not None:
            query = query.filter(Task.status == status)
        if priority is not None:
            query = query.filter(Task.priority == priority)
        if after is not None:
            created_at, identifier = after
            query = query.filter(
                sa.tuple_(Task.created_at, Task.id) < sa.tuple_(created_at, identifier)
            )

        rows = (
            query.order_by(Task.created_at.desc(), Task.id.desc())
            .limit(limit + 1)
            .all()
        )
        has_more = len(rows) > limit
        return rows[:limit], has_more

    def get_by_id_and_user(self, task_id: UUID, user_id: str) -> Task | None:
        return (
            self._session.query(Task)
            .filter(Task.id == task_id, Task.user_id == user_id)
            .first()
        )

    def find_by_id_or_title(self, user_id: str, task_id_or_title: str) -> Task | None:
        """Find task by UUID or title substring (case-insensitive).
        
        Used by MCP tools that accept either a task ID or a title fragment.
        """
        from sqlalchemy import func
        
        # 1. Try search by UUID
        try:
            task_uuid = UUID(task_id_or_title)
            return (
                self._session.query(Task)
                .filter(Task.id == task_uuid, Task.user_id == user_id)
                .first()
            )
        except ValueError:
            pass
            
        # 2. Try search by title substring (case-insensitive)
        return (
            self._session.query(Task)
            .filter(
                Task.user_id == user_id,
                Task.title.ilike(func.concat("%", task_id_or_title, "%"))
            )
            .order_by(Task.status.asc(), Task.created_at.desc())
            .first()
        )