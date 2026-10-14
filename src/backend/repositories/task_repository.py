"""Task repository: narrow interface for Task entity."""

from typing import Protocol
from uuid import UUID

from sqlalchemy.orm import Session

from models import Task, StatusEnum, PriorityEnum
from repositories.base import Repository, SqlRepository


class TaskRepository(Repository[Task], Protocol):
    """Narrow protocol — only methods used by endpoints and MCP tools."""

    def list_by_user(
        self,
        user_id: str,
        status: StatusEnum | None = None,
        priority: PriorityEnum | None = None,
    ) -> list[Task]: ...

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

    def list_by_user(
        self,
        user_id: str,
        status: StatusEnum | None = None,
        priority: PriorityEnum | None = None,
    ) -> list[Task]:
        query = self._session.query(Task).filter(Task.user_id == user_id)
        if status is not None:
            query = query.filter(Task.status == status)
        if priority is not None:
            query = query.filter(Task.priority == priority)
        return query.all()

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