"""MCP task tools, served over stdio with identity bound by the parent process.

This module used to expose a module-level `FastMCP` server whose five tools all
took `user_id` as their first argument, served unauthenticated over SSE on
0.0.0.0:8001. Any caller could therefore name any identity (issue #2).

Both halves are gone. Identity is a *construction argument*, captured by
closure, so it is decided by whoever builds the server — in practice `main.py`,
after verifying the caller's JWT — and never by the caller of a tool. The server
speaks stdio over a pipe to that parent, so there is no port and no credential
to present.

Do not reintroduce a `user_id` tool parameter, and do not reintroduce a network
transport. Both were the vulnerability.
"""

import os
import json
from datetime import datetime

from mcp.server.fastmcp import FastMCP

from database import SessionLocal
from models import Task, StatusEnum, PriorityEnum
from repositories import SqlTaskRepository

#: Environment variable carrying the authenticated user's id from the spawning
#: process into this one. Set by `main.py` from the JWT-verified subject.
IDENTITY_ENV_VAR = "MCP_USER_ID"


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


# How many tasks a single `list_tasks` call may return to the model.
# Issue #7: unbounded here would put every task a user ever created into a
# context window, and a model shown 50 of 300 will confidently report "you
# have 50 tasks".
MCP_TASK_PAGE_SIZE = 50


def build_server(user_id: str | None) -> FastMCP:
    """Build a FastMCP server whose every tool acts as `user_id`.

    `user_id` is captured in the closure, not taken from the call. That is the
    whole point: identity is decided here, at construction, and the resulting
    tool schemas contain no identity parameter for a caller to forge.

    Raises RuntimeError when `user_id` is missing or blank. There is
    deliberately no anonymous fallback — a server that served tasks for nobody
    in particular would be a server that served everyone's.
    """
    if not user_id or not user_id.strip():
        raise RuntimeError(
            "MCP server requires an authenticated identity. Pass user_id to "
            "build_server(), or set "
            f"{IDENTITY_ENV_VAR} in the environment when running this module "
            "directly."
        )

    identity = user_id.strip()

    mcp = FastMCP("TodoMCP")

    @mcp.tool()
    def add_task(
        title: str,
        description: str = None,
        priority: str = None,
        tags: list[str] = None,
        due_date: str = None
    ) -> str:
        """Create a new todo task for the authenticated user.

        Args:
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
                "user_id": identity,
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
        status: str = None,
        priority: str = None
    ) -> str:
        """Fetch the authenticated user's tasks with optional filters.

        Args:
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

            # Bounded and ordered like the HTTP list route (issue #7). An
            # unbounded read here would put every task a user ever created
            # into a model's context window.
            tasks, has_more = repo.list_page_by_user(
                identity, status_enum, priority_enum, None, MCP_TASK_PAGE_SIZE
            )
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
            if has_more:
                # Say so, rather than letting the model present a
                # truncated list as a complete one.
                result.append({
                    "note": (
                        f"More tasks match this filter than are shown here. "
                        f"This call returned at most {MCP_TASK_PAGE_SIZE}. "
                        f"Narrow the filter, or use the tasks endpoint to page."
                    )
                })
            return json.dumps(result)
        finally:
            repo.session.close()

    @mcp.tool()
    def complete_task(
        task_id: str
    ) -> str:
        """Mark one of the authenticated user's tasks as completed.

        Args:
            task_id: The UUID string of the task to complete, OR the task title name.
        """
        repo = _get_task_repo()
        try:
            db_task = repo.find_by_id_or_title(identity, task_id)

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
        task_id: str
    ) -> str:
        """Delete one of the authenticated user's tasks.

        Args:
            task_id: The UUID string of the task to delete, OR the task title name.
        """
        repo = _get_task_repo()
        try:
            db_task = repo.find_by_id_or_title(identity, task_id)

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
        task_id: str,
        title: str = None,
        description: str = None,
        priority: str = None,
        due_date: str = None
    ) -> str:
        """Update one of the authenticated user's tasks.

        Args:
            task_id: The UUID string of the task to update, OR the task title name.
            title: Optional new title.
            description: Optional new description.
            priority: Optional priority ("Low", "Medium", "High").
            due_date: Optional ISO-8601 formatted datetime string for the new task deadline.
        """
        repo = _get_task_repo()
        try:
            db_task = repo.find_by_id_or_title(identity, task_id)

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

    return mcp


def main() -> None:
    """Serve the tools over stdio, bound to the identity we were given.

    Runs once per chat request: `main.py` spawns this as a subprocess, sets
    `MCP_USER_ID` to the JWT-verified subject, and tears it down afterwards.
    """
    build_server(os.environ.get(IDENTITY_ENV_VAR)).run(transport="stdio")


if __name__ == "__main__":
    main()
