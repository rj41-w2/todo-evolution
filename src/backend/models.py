import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import List, Optional
from sqlalchemy import Column, String, DateTime, Boolean, Text, JSON, Enum as SQLEnum, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from pydantic import BaseModel, Field

from database import Base

# Import the `user` stub to register the FK target in metadata.
# See user_stub.py for documentation of this external seam.
#
# This module lives at the backend root, NOT under `repositories/`, on purpose:
# `repositories/*` imports `models`, so importing anything from that package
# here would create a circular import and break `import main` entirely. The
# stub only needs `database`, which keeps this edge one-way: models -> stub.
import user_stub  # noqa: F401  registers `user` on Base.metadata

class PriorityEnum(str, Enum):
    LOW = "Low"
    MEDIUM = "Medium"
    HIGH = "High"

class StatusEnum(str, Enum):
    PENDING = "Pending"
    COMPLETED = "Completed"

class Task(Base):
    __tablename__ = "tasks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # FK to Better Auth `user.id` — see docs/external-seams.md for sync contract
    # Owner: Frontend (Better Auth). ON DELETE CASCADE: user deletion removes tasks.
    user_id = Column(String, ForeignKey("user.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    status = Column(SQLEnum(StatusEnum), default=StatusEnum.PENDING)
    priority = Column(SQLEnum(PriorityEnum), default=PriorityEnum.MEDIUM)
    tags = Column(JSON, default=[])
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    due_date = Column(DateTime(timezone=True), nullable=True)

class Conversation(Base):
    __tablename__ = "conversations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # FK to Better Auth `user.id` — see docs/external-seams.md for sync contract
    # Owner: Frontend (Better Auth). ON DELETE CASCADE: user deletion removes conversations.
    user_id = Column(String, ForeignKey("user.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

class Message(Base):
    __tablename__ = "messages"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # FK to Better Auth `user.id` — see docs/external-seams.md for sync contract
    # Owner: Frontend (Better Auth). ON DELETE CASCADE: user deletion removes messages.
    # Note: denormalized (also on conversations.user_id) for read performance.
    user_id = Column(String, ForeignKey("user.id", ondelete="CASCADE"), nullable=False, index=True)
    conversation_id = Column(UUID(as_uuid=True), ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(String, nullable=False) # "user" or "assistant"
    content = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

# --- Pydantic Schemas ---

class TaskBase(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: Optional[str] = None
    status: StatusEnum = StatusEnum.PENDING
    priority: PriorityEnum = PriorityEnum.MEDIUM
    tags: List[str] = Field(default_factory=list, max_length=50)
    due_date: Optional[datetime] = None

class TaskCreate(TaskBase):
    pass

class TaskUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = None
    status: Optional[StatusEnum] = None
    priority: Optional[PriorityEnum] = None
    tags: Optional[List[str]] = None
    due_date: Optional[datetime] = None

class TaskResponse(TaskBase):
    id: uuid.UUID
    created_at: datetime

    class Config:
        from_attributes = True

class ChatRequest(BaseModel):
    conversation_id: Optional[uuid.UUID] = None
    message: str = Field(min_length=1, max_length=4000)

class ChatResponse(BaseModel):
    conversation_id: uuid.UUID
    response: str
    #: What actually happened to the user's data, which is not always what the
    #: status code suggests. Issue #4: a chat turn used to answer 500 while a
    #: tool it had already run had committed its work, so the user was told to
    #: retry something that had succeeded.
    #:
    #:   completed — the model summarised the turn and every tool succeeded
    #:   partial   — some of it happened, or the model could not summarise it
    #:   failed    — nothing happened
    #:
    #: Additive, so existing clients keep working; they simply ignore it until
    #: something renders it.
    outcome: str = "completed"
    tool_calls: List[dict] = []
