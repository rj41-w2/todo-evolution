"""add composite index on messages(conversation_id, created_at) for chat history query

Revision ID: 0002_add_composite_index_messages
Revises: 0001_initial_app_schema
Create Date: 2026-10-14

Optimizes the query in main.py:235-238:
    db.query(Message).filter(
        Message.conversation_id == conversation.id,
        Message.user_id == user_id
    ).order_by(Message.created_at.desc()).limit(10)
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0002_add_composite_idx"
down_revision: Union[str, None] = "0001_initial_app_schema"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Composite index for chat history query: ORDER BY created_at DESC LIMIT 10
    op.create_index(
        "ix_messages_conversation_id_created_at",
        "messages",
        ["conversation_id", sa.desc("created_at")],
        postgresql_using="btree",
    )


def downgrade() -> None:
    op.drop_index("ix_messages_conversation_id_created_at", table_name="messages")