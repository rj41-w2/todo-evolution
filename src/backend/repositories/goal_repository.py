"""Goal repository: narrow interface for the Goal entity (issue #17).

Reads are owner-scoped at this boundary, not at the route, so a route that
forgets the check still cannot surface another tenant's row.
"""

from datetime import datetime
from typing import Protocol
from uuid import UUID

import sqlalchemy as sa
from sqlalchemy.orm import Session

from models import Goal, GoalStatusEnum
from paging import DEFAULT_LIMIT
from repositories.base import Repository, SqlRepository


class GoalRepository(Repository[Goal], Protocol):
    """Narrow protocol — only the methods the goal routes use."""

    def list_page_by_user(
        self,
        user_id: str,
        after: tuple[datetime, UUID] | None = None,
        limit: int = DEFAULT_LIMIT,
        status: GoalStatusEnum | None = None,
    ) -> tuple[list[Goal], bool]: ...

    def get_by_id_and_user(self, goal_id: UUID, user_id: str) -> Goal | None: ...

    # Base CRUD inherited: create, update, delete, get, list, exists


class SqlGoalRepository(SqlRepository[Goal]):
    """SQLAlchemy implementation of GoalRepository."""

    def __init__(self, session: Session):
        super().__init__(session)

    @property
    def _model(self) -> type[Goal]:
        return Goal

    def list_page_by_user(
        self,
        user_id: str,
        after: tuple[datetime, UUID] | None = None,
        limit: int = DEFAULT_LIMIT,
        status: GoalStatusEnum | None = None,
    ) -> tuple[list[Goal], bool]:
        """One page of a user's goals, newest first, and whether more remain.

        Mirrors the task ledger query: `ORDER BY created_at DESC, id DESC`, a
        keyset `after` position rather than an offset, and one row beyond
        `limit` to learn whether more exist without a `COUNT`.

        `id` is the tiebreaker because `created_at` is not unique; without it a
        page boundary can fall between rows the database did not promise to
        order, and cursor paging then repeats or skips a goal.

        `status` is an optional lifecycle filter (issue #18). It is applied to
        the query *before* the keyset predicate, so a page holds only matches
        and the cursor never walks past a goal of another status. `None` means
        "every status" — the `All` tab omits the predicate entirely rather than
        matching a sentinel value.

        Served by `ix_goals_user_created_at_id` (user_id, created_at DESC,
        id DESC).
        """
        query = self._session.query(Goal).filter(Goal.user_id == user_id)
        if status is not None:
            query = query.filter(Goal.status == status)
        if after is not None:
            created_at, identifier = after
            query = query.filter(
                sa.tuple_(Goal.created_at, Goal.id) < sa.tuple_(created_at, identifier)
            )

        rows = (
            query.order_by(Goal.created_at.desc(), Goal.id.desc())
            .limit(limit + 1)
            .all()
        )
        has_more = len(rows) > limit
        return rows[:limit], has_more

    def get_by_id_and_user(self, goal_id: UUID, user_id: str) -> Goal | None:
        return (
            self._session.query(Goal)
            .filter(Goal.id == goal_id, Goal.user_id == user_id)
            .first()
        )
