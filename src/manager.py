from datetime import datetime, timedelta
from calendar import monthrange
from typing import List, Optional
from models import Task, Status, Priority, Recurrence

class TaskManager:
    """
    Handles all in-memory task operations including CRUD, filtering, sorting, 
    and recurring task logic.
    """
    def __init__(self):
        self.tasks: List[Task] = []
        self._next_id: int = 1

    def add_task(self, title: str, description: str, 
                 priority: Priority = Priority.MEDIUM, 
                 tags: List[str] = None, 
                 due_date: Optional[datetime] = None, 
                 is_recurring: bool = False,
                 recurrence_period: Recurrence = Recurrence.NONE) -> Task:
        if not title or not title.strip():
            raise ValueError("Task title is required")

        task = Task(
            id=self._next_id,
            title=title,
            description=description,
            priority=priority,
            tags=tags or [],
            due_date=due_date,
            is_recurring=is_recurring,
            recurrence_period=recurrence_period
        )
        self.tasks.append(task)
        self._next_id += 1
        return task

    def delete_task(self, task_id: int) -> bool:
        for i, task in enumerate(self.tasks):
            if task.id == task_id:
                self.tasks.pop(i)
                return True
        return False

    def update_task(self, task_id: int, **kwargs) -> Optional[Task]:
        task = self.get_task_by_id(task_id)
        if not task:
            return None
        
        was_completed = task.status == Status.COMPLETED
        for key, value in kwargs.items():
            if hasattr(task, key):
                setattr(task, key, value)
        
        # Handle recurring logic if status changed to completed
        if (kwargs.get('status') == Status.COMPLETED and not was_completed
                and task.is_recurring):
            self.handle_recurring_logic(task)
            
        return task

    def get_task_by_id(self, task_id: int) -> Optional[Task]:
        return next((t for t in self.tasks if t.id == task_id), None)

    def filter_tasks(self, status: Optional[Status] = None, 
                     priority: Optional[Priority] = None, 
                     tag: Optional[str] = None) -> List[Task]:
        filtered = self.tasks
        if status:
            filtered = [t for t in filtered if t.status == status]
        if priority:
            filtered = [t for t in filtered if t.priority == priority]
        if tag:
            filtered = [t for t in filtered if tag in t.tags]
        return filtered

    def sort_tasks(self, by: str = 'id', reverse: bool = False) -> List[Task]:
        if by == 'due_date':
            # Keep undated tasks at the end in both sort directions.
            dated = sorted(
                (task for task in self.tasks if task.due_date is not None),
                key=lambda task: task.due_date,
                reverse=reverse,
            )
            return dated + [task for task in self.tasks if task.due_date is None]
        elif by == 'priority':
            priority_map = {Priority.HIGH: 3, Priority.MEDIUM: 2, Priority.LOW: 1}
            return sorted(self.tasks, key=lambda t: priority_map[t.priority], reverse=reverse)
        return sorted(self.tasks, key=lambda t: getattr(t, by, t.id), reverse=reverse)

    def check_overdue(self) -> List[Task]:
        now = datetime.now()
        return [t for t in self.tasks if t.due_date and t.due_date < now and t.status != Status.COMPLETED]

    def handle_recurring_logic(self, task: Task):
        """
        When a recurring task is completed, create a new instance for the next period.
        """
        if not task.due_date:
            return

        next_due = task.due_date
        if task.recurrence_period == Recurrence.DAILY:
            next_due += timedelta(days=1)
        elif task.recurrence_period == Recurrence.WEEKLY:
            next_due += timedelta(weeks=1)
        elif task.recurrence_period == Recurrence.MONTHLY:
            next_month = next_due.month % 12 + 1
            next_year = next_due.year + (next_due.month == 12)
            next_day = min(next_due.day, monthrange(next_year, next_month)[1])
            next_due = next_due.replace(year=next_year, month=next_month, day=next_day)

        self.add_task(
            title=task.title,
            description=task.description,
            priority=task.priority,
            tags=task.tags,
            due_date=next_due,
            is_recurring=True,
            recurrence_period=task.recurrence_period
        )
