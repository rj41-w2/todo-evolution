"""Conversation repository: narrow interface for Conversation entity."""

from typing import Protocol
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from models import Conversation, Message
from repositories.base import Repository, SqlRepository


class ConversationRepository(Repository[Conversation], Protocol):
    """Narrow protocol — only methods used by chat endpoints."""

    def get_by_id_and_user(self, conversation_id: UUID, user_id: str) -> Conversation | None: ...

    def list_by_user(self, user_id: str, limit: int = 50) -> list[dict]: ...

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

    def list_by_user(self, user_id: str, limit: int = 50) -> list[dict]:
        """The user's conversations, most recently active first.

        Activity comes from the last *message*, not from
        `conversations.updated_at`. That column carries an `onupdate`, but
        nothing ever updates a conversation row — messages do not touch it —
        so it stays permanently equal to `created_at`. Ordering by it would
        list threads by when they were *started*, putting a week-old
        conversation that has been busy all week below one from ten minutes
        ago.

        The per-conversation lookups are correlated subqueries rather than a
        join, so the row set is the conversations themselves and an empty
        thread still appears, with a null preview. Hiding one would make a
        freshly-started conversation disappear from the switcher, which reads
        as the app losing work the user just did.

        Written to be indexable later rather than pre-optimised; issue #7 owns
        the indexing question.
        """

        def _last(column):
            return (
                select(column)
                .where(Message.conversation_id == Conversation.id)
                .order_by(Message.created_at.desc())
                .limit(1)
                .correlate(Conversation)
                .scalar_subquery()
            )

        rows = (
            self._session.query(
                Conversation.id,
                Conversation.created_at,
                _last(Message.content).label("preview"),
                _last(Message.created_at).label("last_at"),
                func.count(Message.id).label("message_count"),
            )
            .outerjoin(Message, Message.conversation_id == Conversation.id)
            .filter(Conversation.user_id == user_id)
            .group_by(Conversation.id)
            .order_by(func.coalesce(_last(Message.created_at), Conversation.created_at).desc())
            .limit(limit)
            .all()
        )
        return [
            {
                "id": r.id,
                "created_at": r.created_at,
                "last_activity_at": r.last_at,
                "preview": r.preview,
                "message_count": r.message_count,
            }
            for r in rows
        ]

    def create_for_user(self, user_id: str) -> Conversation:
        conversation = Conversation(user_id=user_id)
        return self.create(conversation)