import uuid
from typing import List, Optional
from database import SessionLocal
from models import Task, StatusEnum, PriorityEnum

def add_task(
    user_id: str,
    title: str,
    description: str = None,
    priority: str = None,
    tags: list[str] = None
) -> dict:
    """Create a new todo task.
    
    Args:
        user_id: The authenticated user's ID.
        title: The title of the task.
        description: An optional description.
        priority: Optional priority ("Low", "Medium", "High").
        tags: Optional list of tags.
    """
    db = SessionLocal()
    try:
        p_enum = PriorityEnum.MEDIUM
        if priority:
            if priority.lower() == "low":
                p_enum = PriorityEnum.LOW
            elif priority.lower() == "medium":
                p_enum = PriorityEnum.MEDIUM
            elif priority.lower() == "high":
                p_enum = PriorityEnum.HIGH

        task_data = {
            "user_id": user_id,
            "title": title,
            "description": description,
            "priority": p_enum,
            "tags": tags or [],
            "status": StatusEnum.PENDING
        }
        db_task = Task(**task_data)
        db.add(db_task)
        db.commit()
        db.refresh(db_task)
        return {
            "task_id": str(db_task.id),
            "status": "created",
            "title": db_task.title
        }
    finally:
        db.close()

def list_tasks(
    user_id: str,
    status: str = None,
    priority: str = None
) -> list[dict]:
    """Fetch tasks with optional status and priority filters.
    
    Args:
        user_id: The authenticated user's ID.
        status: Optional status ("all", "pending", "completed").
        priority: Optional priority ("Low", "Medium", "High").
    """
    db = SessionLocal()
    try:
        query = db.query(Task).filter(Task.user_id == user_id)
        
        if status and status.lower() != "all":
            if status.lower() == "completed":
                query = query.filter(Task.status == StatusEnum.COMPLETED)
            elif status.lower() == "pending":
                query = query.filter(Task.status == StatusEnum.PENDING)
                
        if priority:
            p_enum = None
            if priority.lower() == "low":
                p_enum = PriorityEnum.LOW
            elif priority.lower() == "medium":
                p_enum = PriorityEnum.MEDIUM
            elif priority.lower() == "high":
                p_enum = PriorityEnum.HIGH
            if p_enum:
                query = query.filter(Task.priority == p_enum)
        
        tasks = query.all()
        return [
            {
                "task_id": str(t.id),
                "title": t.title,
                "description": t.description,
                "status": t.status.value,
                "priority": t.priority.value,
                "tags": t.tags,
                "created_at": t.created_at.isoformat() if t.created_at else None,
                "due_date": t.due_date.isoformat() if t.due_date else None
            }
            for t in tasks
        ]
    finally:
        db.close()

def complete_task(
    user_id: str,
    task_id: str
) -> dict:
    """Mark a task as completed.
    
    Args:
        user_id: The authenticated user's ID.
        task_id: The UUID string of the task to complete, OR the task title name.
    """
    db = SessionLocal()
    try:
        db_task = None
        # 1. Try search by UUID
        try:
            task_uuid = uuid.UUID(task_id)
            db_task = db.query(Task).filter(Task.id == task_uuid, Task.user_id == user_id).first()
        except ValueError:
            pass
            
        # 2. Try search by title substring (case-insensitive)
        if not db_task:
            db_task = db.query(Task).filter(
                Task.user_id == user_id,
                Task.title.ilike(f"%{task_id}%")
            ).order_by(Task.status.asc(), Task.created_at.desc()).first()
            
        if not db_task:
            return {"error": f"Task not found with ID or name matching '{task_id}'."}
            
        db_task.status = StatusEnum.COMPLETED
        db.commit()
        db.refresh(db_task)
        return {
            "task_id": str(db_task.id),
            "status": "completed",
            "title": db_task.title
        }
    finally:
        db.close()

def delete_task(
    user_id: str,
    task_id: str
) -> dict:
    """Delete an existing task.
    
    Args:
        user_id: The authenticated user's ID.
        task_id: The UUID string of the task to delete, OR the task title name.
    """
    db = SessionLocal()
    try:
        db_task = None
        # 1. Try search by UUID
        try:
            task_uuid = uuid.UUID(task_id)
            db_task = db.query(Task).filter(Task.id == task_uuid, Task.user_id == user_id).first()
        except ValueError:
            pass
            
        # 2. Try search by title substring (case-insensitive)
        if not db_task:
            db_task = db.query(Task).filter(
                Task.user_id == user_id,
                Task.title.ilike(f"%{task_id}%")
            ).order_by(Task.created_at.desc()).first()
            
        if not db_task:
            return {"error": f"Task not found with ID or name matching '{task_id}'."}
            
        db.delete(db_task)
        db.commit()
        return {
            "task_id": str(db_task.id),
            "status": "deleted",
            "title": db_task.title
        }
    finally:
        db.close()

def update_task(
    user_id: str,
    task_id: str,
    title: str = None,
    description: str = None,
    priority: str = None
) -> dict:
    """Update an existing task's title, description, or priority.
    
    Args:
        user_id: The authenticated user's ID.
        task_id: The UUID string of the task to update, OR the task title name.
        title: Optional new title.
        description: Optional new description.
        priority: Optional new priority ("Low", "Medium", "High").
    """
    db = SessionLocal()
    try:
        db_task = None
        # 1. Try search by UUID
        try:
            task_uuid = uuid.UUID(task_id)
            db_task = db.query(Task).filter(Task.id == task_uuid, Task.user_id == user_id).first()
        except ValueError:
            pass
            
        # 2. Try search by title substring (case-insensitive)
        if not db_task:
            db_task = db.query(Task).filter(
                Task.user_id == user_id,
                Task.title.ilike(f"%{task_id}%")
            ).order_by(Task.created_at.desc()).first()
            
        if not db_task:
            return {"error": f"Task not found with ID or name matching '{task_id}'."}
            
        if title is not None:
            db_task.title = title
        if description is not None:
            db_task.description = description
        if priority is not None:
            p_enum = None
            if priority.lower() == "low":
                p_enum = PriorityEnum.LOW
            elif priority.lower() == "medium":
                p_enum = PriorityEnum.MEDIUM
            elif priority.lower() == "high":
                p_enum = PriorityEnum.HIGH
            if p_enum:
                db_task.priority = p_enum
                
        db.commit()
        db.refresh(db_task)
        return {
            "task_id": str(db_task.id),
            "status": "updated",
            "title": db_task.title
        }
    finally:
        db.close()

