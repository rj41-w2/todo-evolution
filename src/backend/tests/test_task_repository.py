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
    """Proof-of-concept: endpoint calls TaskRepository.list_by_user, not db.query()."""
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
    mock_repo.list_by_user.return_value = [mock_task]

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
        assert len(data) == 1
        assert data[0]["title"] == "Test Task"

        # Verify repository was called, not raw Session
        mock_repo.list_by_user.assert_called_once_with("test-user", None, None)
    finally:
        app.dependency_overrides.clear()


def test_get_tasks_filters_by_status_and_priority(auth_as_tenant):
    """Repository receives filter params correctly."""
    mock_repo = MagicMock(spec=TaskRepository)
    mock_repo.list_by_user.return_value = []

    from main import get_task_repo
    app.dependency_overrides[get_task_repo] = lambda: mock_repo

    try:
        response = client.get(
            "/api/test-user/tasks?status=Completed&priority=High",
            headers={"Authorization": "Bearer fake-token"},
        )
        assert response.status_code == 200
        mock_repo.list_by_user.assert_called_once_with(
            "test-user", StatusEnum.COMPLETED, PriorityEnum.HIGH
        )
    finally:
        app.dependency_overrides.clear()


def test_get_tasks_returns_empty_list_when_no_tasks(auth_as_tenant):
    """Empty result from repository returns empty list."""
    mock_repo = MagicMock(spec=TaskRepository)
    mock_repo.list_by_user.return_value = []

    from main import get_task_repo
    app.dependency_overrides[get_task_repo] = lambda: mock_repo

    try:
        response = client.get(
            "/api/test-user/tasks",
            headers={"Authorization": "Bearer fake-token"},
        )
        assert response.status_code == 200
        assert response.json() == []
    finally:
        app.dependency_overrides.clear()