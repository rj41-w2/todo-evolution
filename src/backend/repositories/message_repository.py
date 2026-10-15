"""Message repository: narrow interface for Message entity."""

from typing import Protocol
from uuid import UUID

from sqlalchemy.orm import Session

from models import Message
from repositories.base import Repository, SqlRepository


class MessageRepository(Repository[Message], Protocol):
    """Narrow protocol — only methods used by chat endpoint."""

    def history(
        self, conversation_id: UUID, user_id: str, limit: int = 10
    ) -> list[Message]: ...

    def list_for_conversation(
        self, conversation_id: UUID, user_id: str, limit: int = 200
    ) -> list[Message]: ...

    def add_message(
        self, conversation_id: UUID, user_id: str, role: str, content: str
    ) -> Message: ...

    # Base CRUD inherited: create, update, delete, get, list, exists


class SqlMessageRepository(SqlRepository[Message]):
    """SQLAlchemy implementation of MessageRepository."""

    def __init__(self, session: Session):
        super().__init__(session)

    @property
    def _model(self) -> type[Message]:
        return Message

    # --- Message-specific queries ---

    def history(
        self, conversation_id: UUID, user_id: str, limit: int = 10
    ) -> list[Message]:
        # Uses composite index: ix_messages_conversation_id_created_at
        # Index columns: (conversation_id, created_at DESC)
        # Query matches: WHERE conversation_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT ?
        return (
            self._session.query(Message)
            .filter(
                Message.conversation_id == conversation_id,
                Message.user_id == user_id,
            )
            .order_by(Message.created_at.desc())
            .limit(limit)
            .all()
        )

    def list_for_conversation(
        self, conversation_id: UUID, user_id: str, limit: int = 200
    ) -> list[Message]:
        """Every message in a thread, oldest first, for rendering it back.

        The mirror of `history`, which returns the most recent slice in
        descending order to build prompt context. This one exists so a client
        can display a conversation it did not start in this browser.
        """
        return (
            self._session.query(Message)
            .filter(
                Message.conversation_id == conversation_id,
                Message.user_id == user_id,
            )
            .order_by(Message.created_at.asc(), Message.id.asc())
            .limit(limit)
            .all()
        )

    def add_message(
        self, conversation_id: UUID, user_id: str, role: str, content: str
    ) -> Message:
        """Create and persist a new message."""
        message = Message(
            conversation_id=conversation_id,
            user_id=user_id,
            role=role,
            content=content,
        )
        return self.create(message)