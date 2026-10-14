from mcp.server.fastmcp import FastMCP
import uuid
from typing import List, Optional
import json
from datetime import datetime, timezone

from database import SessionLocal
from models import Task, StatusEnum, PriorityEnum
from repositories import SqlTaskRepository

mcp = FastMCP("TodoMCP")

def _get_task_repo() -> SqlTaskRepository:
    """Get a task repository with a new session."""
    return SqlTaskRepository(SessionLocal())

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
        raise ValueError("title is required")

    repo = _get_task_repo()
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
        repo.create(db_task)
        repo.session.commit()
        return json.dumps({
            "task_id": str(db_task.id),
            "status": "created",
            "title": db_task.title
        })
    finally:
        repo.session.close()

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
    repo = _get_task_repo()
    try:
        status_enum = None
        if status and status.lower() != "all":
            if status.lower() == "completed":
                status_enum = StatusEnum.COMPLETED
            elif status.lower() == "pending":
                status_enum = StatusEnum.PENDING
                
        priority_enum = None
        if priority:
            if priority.lower() == "low":
                priority_enum = PriorityEnum.LOW
            elif priority.lower() == "medium":
                priority_enum = PriorityEnum.MEDIUM
            elif priority.lower() == "high":
                priority_enum = PriorityEnum.HIGH
        
        tasks = repo.list_by_user(user_id, status_enum, priority_enum)
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
        repo.session.close()

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
    repo = _get_task_repo()
    try:
        db_task = repo.find_by_id_or_title(user_id, task_id)
            
        if not db_task:
            raise ValueError(f"Task not found with ID or name matching '{task_id}'.")
            
        db_task.status = StatusEnum.COMPLETED
        repo.update(db_task)
        repo.session.commit()
        return json.dumps({
            "task_id": str(db_task.id),
            "status": "completed",
            "title": db_task.title
        })
    finally:
        repo.session.close()

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
    repo = _get_task_repo()
    try:
        db_task = repo.find_by_id_or_title(user_id, task_id)
            
        if not db_task:
            raise ValueError(f"Task not found with ID or name matching '{task_id}'.")
            
        repo.delete(db_task)
        repo.session.commit()
        return json.dumps({
            "task_id": str(db_task.id),
            "status": "deleted",
            "title": db_task.title
        })
    finally:
        repo.session.close()

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
    repo = _get_task_repo()
    try:
        db_task = repo.find_by_id_or_title(user_id, task_id)
            
        if not db_task:
            raise ValueError(f"Task not found with ID or name matching '{task_id}'.")
            
        if title is not None:
            if not title.strip():
                raise ValueError("title cannot be empty")
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
                
        repo.update(db_task)
        repo.session.commit()
        return json.dumps({
            "task_id": str(db_task.id),
            "status": "updated",
            "title": db_task.title
        })
    finally:
        repo.session.close()

if __name__ == "__main__":
    import os
    transport = os.getenv("MCP_TRANSPORT", "stdio")
    if transport == "sse":
        # For SSE, use uvicorn directly to control host/port
        import uvicorn
        from mcp.server.sse import SseServerTransport
        from starlette.applications import Starlette
        from starlette.routing import Route, Mount
        
        sse = SseServerTransport("/messages/")
        
        async def handle_sse(request):
            async with sse.connect_sse(
                request.scope, request.receive, request._send
            ) as streams:
                await mcp._mcp_server.run(
                    streams[0], streams[1], mcp._mcp_server.create_initialization_options()
                )
        
        starlette_app = Starlette(
            routes=[
                Route("/sse", handle_sse),
                Mount("/messages/", app=sse.handle_post_message),
            ]
        )
        
        uvicorn.run(starlette_app, host="0.0.0.0", port=8001)
    else:
        mcp.run()
