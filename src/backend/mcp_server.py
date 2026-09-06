from mcp.server.fastmcp import FastMCP
import uuid
from typing import List, Optional
import json
from datetime import datetime

from database import SessionLocal
from models import Task, StatusEnum, PriorityEnum

mcp = FastMCP("TodoMCP")

def parse_due_date(value: str | None):
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace('Z', '+00:00'))
    except ValueError as exc:
        raise ValueError("due_date must be a valid ISO-8601 datetime") from exc

@mcp.tool()
def add_task(
    user_id: str,
    title: str,
    description: str = None,
    priority: str = None,
    tags: list[str] = None,
    due_date: str = None
) -> str:
    """Create a new todo task.
    
    Args:
        user_id: The authenticated user's ID.
        title: The title of the task.
        description: An optional description.
        priority: Optional priority ("Low", "Medium", "High").
        tags: Optional list of tags.
        due_date: Optional ISO-8601 formatted datetime string for the task deadline (e.g. "2026-07-01T15:00:00Z").
    """
    if not title or not title.strip():
        return json.dumps({"error": "title is required"})

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

        parsed_due_date = parse_due_date(due_date)

        task_data = {
            "user_id": user_id,
            "title": title,
            "description": description,
            "priority": p_enum,
            "tags": tags or [],
            "due_date": parsed_due_date,
            "status": StatusEnum.PENDING
        }
        db_task = Task(**task_data)
        db.add(db_task)
        db.commit()
        db.refresh(db_task)
        return json.dumps({
            "task_id": str(db_task.id),
            "status": "created",
            "title": db_task.title
        })
    finally:
        db.close()

@mcp.tool()
def list_tasks(
    user_id: str,
    status: str = None,
    priority: str = None
) -> str:
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
        result = [
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
        return json.dumps(result)
    finally:
        db.close()

@mcp.tool()
def complete_task(
    user_id: str,
    task_id: str
) -> str:
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
            return json.dumps({"error": f"Task not found with ID or name matching '{task_id}'."})
            
        db_task.status = StatusEnum.COMPLETED
        db.commit()
        db.refresh(db_task)
        return json.dumps({
            "task_id": str(db_task.id),
            "status": "completed",
            "title": db_task.title
        })
    finally:
        db.close()

@mcp.tool()
def delete_task(
    user_id: str,
    task_id: str
) -> str:
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
            return json.dumps({"error": f"Task not found with ID or name matching '{task_id}'."})
            
        db.delete(db_task)
        db.commit()
        return json.dumps({
            "task_id": str(db_task.id),
            "status": "deleted",
            "title": db_task.title
        })
    finally:
        db.close()

@mcp.tool()
def update_task(
    user_id: str,
    task_id: str,
    title: str = None,
    description: str = None,
    priority: str = None,
    due_date: str = None
) -> str:
    """Update an existing task's title, description, priority, or due date.
    
    Args:
        user_id: The authenticated user's ID.
        task_id: The UUID string of the task to update, OR the task title name.
        title: Optional new title.
        description: Optional new description.
        priority: Optional new priority ("Low", "Medium", "High").
        due_date: Optional ISO-8601 formatted datetime string for the new task deadline.
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
            return json.dumps({"error": f"Task not found with ID or name matching '{task_id}'."})
            
        if title is not None:
            if not title.strip():
                return json.dumps({"error": "title cannot be empty"})
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
        
        if due_date is not None:
            db_task.due_date = parse_due_date(due_date)
                
        db.commit()
        db.refresh(db_task)
        return json.dumps({
            "task_id": str(db_task.id),
            "status": "updated",
            "title": db_task.title
        })
    finally:
        db.close()

if __name__ == "__main__":
    mcp.run()
