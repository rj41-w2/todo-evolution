import uuid
from datetime import datetime
from enum import Enum
from typing import List, Optional
from sqlalchemy import Column, String, DateTime, Boolean, Text, JSON, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID
from pydantic import BaseModel, Field

from database import Base

# --- SQLAlchemy Models ---

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
    user_id = Column(String, nullable=True, index=True) # nullable=True to support backward compatibility
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    status = Column(SQLEnum(StatusEnum), default=StatusEnum.PENDING)
    priority = Column(SQLEnum(PriorityEnum), default=PriorityEnum.MEDIUM)
    tags = Column(JSON, default=[])
    created_at = Column(DateTime, default=datetime.utcnow)
    due_date = Column(DateTime, nullable=True)

# --- Pydantic Schemas ---

class TaskBase(BaseModel):
    title: str
    description: Optional[str] = None
    status: StatusEnum = StatusEnum.PENDING
    priority: PriorityEnum = PriorityEnum.MEDIUM
    tags: List[str] = []
    due_date: Optional[datetime] = None
    user_id: Optional[str] = None

class TaskCreate(TaskBase):
    pass

class TaskUpdate(BaseModel):
    title: Optional[str] = None
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
        # json_encoders = {
        #     uuid.UUID: lambda v: str(v)
        # }
