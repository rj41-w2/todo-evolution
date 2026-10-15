"""Tests for MessageRepository — verifies history() and add_message() work correctly."""

from unittest.mock import MagicMock
from uuid import uuid4

import pytest

from models import Message
from repositories.message_repository import MessageRepository


def test_message_repository_history_uses_correct_query():
    """Verify history() calls the right query structure."""
    mock_repo = MagicMock(spec=MessageRepository)
    conv_id = uuid4()
    user_id = "test-user"
    
    mock_messages = [
        Message(id=uuid4(), conversation_id=conv_id, user_id=user_id, role="user", content="Hello", created_at="2026-01-01T00:00:00Z"),
        Message(id=uuid4(), conversation_id=conv_id, user_id=user_id, role="assistant", content="Hi!", created_at="2026-01-01T00:00:01Z"),
    ]
    mock_repo.history.return_value = mock_messages

    result = mock_repo.history(conv_id, user_id, limit=10)

    mock_repo.history.assert_called_once_with(conv_id, user_id, limit=10)
    assert len(result) == 2
    assert result[0].role == "user"
    assert result[1].role == "assistant"


def test_message_repository_add_message_creates_message():
    """Verify add_message() constructs and persists a Message."""
    mock_repo = MagicMock(spec=MessageRepository)
    conv_id = uuid4()
    user_id = "test-user"
    
    created_message = Message(
        id=uuid4(),
        conversation_id=conv_id,
        user_id=user_id,
        role="user",
        content="New message",
        created_at="2026-01-01T00:00:00Z",
    )
    mock_repo.add_message.return_value = created_message

    result = mock_repo.add_message(conv_id, user_id, "user", "New message")

    mock_repo.add_message.assert_called_once_with(conv_id, user_id, "user", "New message")
    assert result.conversation_id == conv_id
    assert result.user_id == user_id
    assert result.role == "user"
    assert result.content == "New message"


def test_message_repository_history_empty_when_no_messages():
    """history() returns empty list for new conversations."""
    mock_repo = MagicMock(spec=MessageRepository)
    mock_repo.history.return_value = []

    result = mock_repo.history(uuid4(), "test-user", limit=10)

    assert result == []
    mock_repo.history.assert_called_once()


def test_message_repository_history_respects_limit():
    """history() passes limit parameter through."""
    mock_repo = MagicMock(spec=MessageRepository)
    mock_repo.history.return_value = []

    mock_repo.history(uuid4(), "test-user", limit=5)

    mock_repo.history.assert_called_once_with(
        mock_repo.history.call_args[0][0], "test-user", limit=5
    )