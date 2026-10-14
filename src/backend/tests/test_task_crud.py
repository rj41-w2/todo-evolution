"""Tests for TaskRepository CRUD operations via endpoints."""

from unittest.mock import MagicMock
from uuid import uuid4

from fastapi.testclient import TestClient

from main import app
from models import Task, StatusEnum, PriorityEnum, TaskCreate, TaskUpdate
from repositories.task_repository import TaskRepository


client = TestClient(app)


def _override_task_repo(mock_repo):
    from main import get_task_repo
    app.dependency_overrides[get_task_repo] = lambda: mock_repo


def _clear_overrides():
    app.dependency_overrides.clear()


def test_create_task_uses_repository():
    """POST /tasks calls task_repo.create()"""
    mock_repo = MagicMock(spec=TaskRepository)
    task_id = uuid4()
    created_task = Task(
        id=task_id,
        user_id="test-user",
        title="New Task",
        description="Description",
        status=StatusEnum.PENDING,
        priority=PriorityEnum.MEDIUM,
        tags=["tag1"],
        created_at="2026-01-01T00:00:00Z",
        due_date=None,
    )
    mock_repo.create.return_value = created_task

    _override_task_repo(mock_repo)
    try:
        response = client.post(
            "/api/test-user/tasks",
            json={"title": "New Task", "description": "Description", "tags": ["tag1"]},
            headers={"Authorization": "Bearer fake-token"},
        )
        assert response.status_code == 201
        data = response.json()
        assert data["title"] == "New Task"
        assert data["id"] == str(task_id)

        mock_repo.create.assert_called_once()
        call_args = mock_repo.create.call_args[0][0]
        assert isinstance(call_args, Task)
        assert call_args.title == "New Task"
        assert call_args.user_id == "test-user"
    finally:
        _clear_overrides()


def test_get_task_uses_repository():
    """GET /tasks/{id} calls task_repo.get_by_id_and_user()"""
    mock_repo = MagicMock(spec=TaskRepository)
    task_id = uuid4()
    existing_task = Task(
        id=task_id,
        user_id="test-user",
        title="Existing Task",
        description=None,
        status=StatusEnum.PENDING,
        priority=PriorityEnum.HIGH,
        tags=[],
        created_at="2026-01-01T00:00:00Z",
        due_date=None,
    )
    mock_repo.get_by_id_and_user.return_value = existing_task

    _override_task_repo(mock_repo)
    try:
        response = client.get(
            f"/api/test-user/tasks/{task_id}",
            headers={"Authorization": "Bearer fake-token"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["title"] == "Existing Task"

        mock_repo.get_by_id_and_user.assert_called_once_with(task_id, "test-user")
    finally:
        _clear_overrides()


def test_get_task_returns_404_when_not_found():
    """GET /tasks/{id} returns 404 when repository returns None"""
    mock_repo = MagicMock(spec=TaskRepository)
    mock_repo.get_by_id_and_user.return_value = None

    _override_task_repo(mock_repo)
    try:
        response = client.get(
            f"/api/test-user/tasks/{uuid4()}",
            headers={"Authorization": "Bearer fake-token"},
        )
        assert response.status_code == 404
    finally:
        _clear_overrides()


def test_update_task_uses_repository():
    """PUT /tasks/{id} calls task_repo.get_by_id_and_user() then task_repo.update()"""
    mock_repo = MagicMock(spec=TaskRepository)
    task_id = uuid4()
    existing_task = Task(
        id=task_id,
        user_id="test-user",
        title="Old Title",
        description="Old desc",
        status=StatusEnum.PENDING,
        priority=PriorityEnum.MEDIUM,
        tags=["old"],
        created_at="2026-01-01T00:00:00Z",
        due_date=None,
    )
    updated_task = Task(
        id=task_id,
        user_id="test-user",
        title="New Title",
        description="Old desc",
        status=StatusEnum.COMPLETED,
        priority=PriorityEnum.HIGH,
        tags=["new"],
        created_at="2026-01-01T00:00:00Z",
        due_date=None,
    )
    mock_repo.get_by_id_and_user.return_value = existing_task
    mock_repo.update.return_value = updated_task

    _override_task_repo(mock_repo)
    try:
        response = client.put(
            f"/api/test-user/tasks/{task_id}",
            json={"title": "New Title", "status": "Completed", "priority": "High", "tags": ["new"]},
            headers={"Authorization": "Bearer fake-token"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["title"] == "New Title"
        assert data["status"] == "Completed"

        mock_repo.get_by_id_and_user.assert_called_once_with(task_id, "test-user")
        mock_repo.update.assert_called_once()
    finally:
        _clear_overrides()


def test_delete_task_uses_repository():
    """DELETE /tasks/{id} calls task_repo.get_by_id_and_user() then task_repo.delete()"""
    mock_repo = MagicMock(spec=TaskRepository)
    task_id = uuid4()
    existing_task = Task(
        id=task_id,
        user_id="test-user",
        title="To Delete",
        description=None,
        status=StatusEnum.PENDING,
        priority=PriorityEnum.MEDIUM,
        tags=[],
        created_at="2026-01-01T00:00:00Z",
        due_date=None,
    )
    mock_repo.get_by_id_and_user.return_value = existing_task

    _override_task_repo(mock_repo)
    try:
        response = client.delete(
            f"/api/test-user/tasks/{task_id}",
            headers={"Authorization": "Bearer fake-token"},
        )
        assert response.status_code == 204

        mock_repo.get_by_id_and_user.assert_called_once_with(task_id, "test-user")
        mock_repo.delete.assert_called_once_with(existing_task)
        mock_repo.session.commit.assert_called_once()
    finally:
        _clear_overrides()