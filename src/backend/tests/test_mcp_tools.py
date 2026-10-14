"""Tests for MCP tools using TaskRepository."""

from unittest.mock import MagicMock
from uuid import uuid4

from models import Task, StatusEnum, PriorityEnum
from repositories.task_repository import TaskRepository


def test_find_by_id_or_title_by_uuid():
    """find_by_id_or_title finds task by UUID."""
    mock_repo = MagicMock(spec=TaskRepository)
    task_id = uuid4()
    task = Task(
        id=task_id,
        user_id="test-user",
        title="Test Task",
        description=None,
        status=StatusEnum.PENDING,
        priority=PriorityEnum.MEDIUM,
        tags=[],
        created_at="2026-01-01T00:00:00Z",
        due_date=None,
    )
    mock_repo.find_by_id_or_title.return_value = task

    result = mock_repo.find_by_id_or_title("test-user", str(task_id))

    mock_repo.find_by_id_or_title.assert_called_once_with("test-user", str(task_id))
    assert result.id == task_id


def test_find_by_id_or_title_by_title_substring():
    """find_by_id_or_title finds task by title substring."""
    mock_repo = MagicMock(spec=TaskRepository)
    task_id = uuid4()
    task = Task(
        id=task_id,
        user_id="test-user",
        title="Important Task",
        description=None,
        status=StatusEnum.PENDING,
        priority=PriorityEnum.HIGH,
        tags=[],
        created_at="2026-01-01T00:00:00Z",
        due_date=None,
    )
    mock_repo.find_by_id_or_title.return_value = task

    result = mock_repo.find_by_id_or_title("test-user", "Important")

    mock_repo.find_by_id_or_title.assert_called_once_with("test-user", "Important")
    assert result.title == "Important Task"


def test_find_by_id_or_title_returns_none_when_not_found():
    """find_by_id_or_title returns None when no match."""
    mock_repo = MagicMock(spec=TaskRepository)
    mock_repo.find_by_id_or_title.return_value = None

    result = mock_repo.find_by_id_or_title("test-user", "nonexistent")

    assert result is None
    mock_repo.find_by_id_or_title.assert_called_once_with("test-user", "nonexistent")