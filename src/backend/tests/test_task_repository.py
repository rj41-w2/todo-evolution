"""Tests for TaskRepository — verifies endpoint no longer depends on SQLAlchemy Session directly."""

from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from main import app
from models import Task, StatusEnum, PriorityEnum
from repositories.task_repository import TaskRepository


client = TestClient(app)


def test_get_tasks_uses_repository_not_session(auth_as_tenant):
    """Proof-of-concept: endpoint calls TaskRepository.list_page_by_user, not db.query()."""
    mock_repo = MagicMock(spec=TaskRepository)
    mock_task = Task(
        id=uuid4(),
        user_id="test-user",
        title="Test Task",
        description=None,
        status=StatusEnum.PENDING,
        priority=PriorityEnum.MEDIUM,
        tags=[],
        created_at="2026-01-01T00:00:00Z",
        due_date=None,
    )
    mock_repo.list_page_by_user.return_value = ([mock_task], False)

    # Override the dependency
    from main import get_task_repo
    app.dependency_overrides[get_task_repo] = lambda: mock_repo

    try:
        response = client.get(
            "/api/test-user/tasks",
            headers={"Authorization": "Bearer fake-token"},
        )
        assert response.status_code == 200
        data = response.json()
        # Issue #7: the route answers with an envelope so a client can page.
        assert len(data["tasks"]) == 1
        assert data["tasks"][0]["title"] == "Test Task"

        # Verify the repository was called, not the raw Session. The positional
        # filter arguments are unchanged; `after` and `limit` were added for
        # paging, so they are asserted rather than assumed.
        args, kwargs = mock_repo.list_page_by_user.call_args
        assert args[:3] == ("test-user", None, None), mock_repo.list_page_by_user.call_args
    finally:
        app.dependency_overrides.clear()


def test_get_tasks_filters_by_status_and_priority(auth_as_tenant):
    """Repository receives filter params correctly."""
    mock_repo = MagicMock(spec=TaskRepository)
    mock_repo.list_page_by_user.return_value = ([], False)

    from main import get_task_repo
    app.dependency_overrides[get_task_repo] = lambda: mock_repo

    try:
        response = client.get(
            "/api/test-user/tasks?status=Completed&priority=High",
            headers={"Authorization": "Bearer fake-token"},
        )
        assert response.status_code == 200
        mock_repo.list_page_by_user.assert_called_once()
        args, _ = mock_repo.list_page_by_user.call_args
        assert args[:3] == ("test-user", StatusEnum.COMPLETED, PriorityEnum.HIGH)
    finally:
        app.dependency_overrides.clear()


def test_get_tasks_returns_empty_list_when_no_tasks(auth_as_tenant):
    """Empty result from repository returns empty list."""
    mock_repo = MagicMock(spec=TaskRepository)
    mock_repo.list_page_by_user.return_value = ([], False)

    from main import get_task_repo
    app.dependency_overrides[get_task_repo] = lambda: mock_repo

    try:
        response = client.get(
            "/api/test-user/tasks",
            headers={"Authorization": "Bearer fake-token"},
        )
        assert response.status_code == 200
        assert response.json()["tasks"] == []
    finally:
        app.dependency_overrides.clear()