"""Conversation repository: narrow interface for Conversation entity."""

from typing import Protocol
from uuid import UUID

from sqlalchemy.orm import Session

from models import Conversation
from repositories.base import Repository, SqlRepository


class ConversationRepository(Repository[Conversation], Protocol):
    """Narrow protocol — only methods used by chat endpoint."""

    def get_by_id_and_user(self, conversation_id: UUID, user_id: str) -> Conversation | None: ...

    def create_for_user(self, user_id: str) -> Conversation: ...

    # Base CRUD inherited: create, update, delete, get, list, exists


class SqlConversationRepository(SqlRepository[Conversation]):
    """SQLAlchemy implementation of ConversationRepository."""

    def __init__(self, session: Session):
        super().__init__(session)

    @property
    def _model(self) -> type[Conversation]:
        return Conversation

    # --- Conversation-specific queries ---

    def get_by_id_and_user(self, conversation_id: UUID, user_id: str) -> Conversation | None:
        return (
            self._session.query(Conversation)
            .filter(Conversation.id == conversation_id, Conversation.user_id == user_id)
            .first()
        )


    def create_for_user(self, user_id: str) -> Conversation:
        conversation = Conversation(user_id=user_id)
        return self.create(conversation)