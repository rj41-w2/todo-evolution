from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import List, Optional

class Status(Enum):
    PENDING = "Pending"
    IN_PROGRESS = "In Progress"
    COMPLETED = "Completed"

class Priority(Enum):
    LOW = "Low"
    MEDIUM = "Medium"
    HIGH = "High"

class Recurrence(Enum):
    NONE = "None"
    DAILY = "Daily"
    WEEKLY = "Weekly"
    MONTHLY = "Monthly"

@dataclass
class Task:
    """
    Represents a single task in the Todo application.
    """
    id: int
    title: str
    description: str
    status: Status = Status.PENDING
    priority: Priority = Priority.MEDIUM
    tags: List[str] = field(default_factory=list)
    due_date: Optional[datetime] = None
    is_recurring: bool = False
    recurrence_period: Recurrence = Recurrence.NONE

    def __str__(self) -> str:
        due_str = self.due_date.strftime("%Y-%m-%d %H:%M") if self.due_date else "N/A"
        tags_str = ", ".join(self.tags) if self.tags else "None"
        return (f"[{self.id}] {self.title} | Status: {self.status.value} | "
                f"Priority: {self.priority.value} | Due: {due_str} | Tags: {tags_str}")
