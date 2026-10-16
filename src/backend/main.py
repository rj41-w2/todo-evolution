import os
import sys
import uuid
import logging
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import List, Optional
from fastapi import FastAPI, Depends, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from starlette import status as http_status
from sqlalchemy.orm import Session
import sqlalchemy as sa

logger = logging.getLogger("uvicorn.error")
import jwt
from jwt import PyJWKClient
from jwt.exceptions import PyJWKClientError

import json
import openai
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

from database import get_db, SessionLocal
from paging import InvalidCursor, clamp_limit, decode_cursor, encode_cursor
from models import (
    Task, TaskCreate, TaskUpdate, TaskResponse, StatusEnum, PriorityEnum,
    Conversation, Message, ChatRequest, ChatResponse, TaskListResponse,
    ConversationSummary, ConversationListResponse, MessageOut,
    ConversationMessagesResponse,
    Goal, GoalCreate, GoalUpdate, GoalResponse, GoalListResponse,
)
from repositories import (
    SqlTaskRepository, TaskRepository,
    SqlGoalRepository, GoalRepository,
    SqlConversationRepository, ConversationRepository,
    SqlMessageRepository, MessageRepository,
)

# Tables are managed by Alembic (`alembic upgrade head`), which must run before
# the app starts. See src/backend/migrations/.

# The MCP tool server, spawned as a stdio subprocess per chat request. Resolved
# next to this module so it is the same file in a local checkout and inside the
# backend image — `Dockerfile` does `COPY . .`, so no separate image is needed.
MCP_SERVER_SCRIPT = Path(__file__).resolve().parent / "mcp_server.py"

# OpenAI client singleton (Issue 7), built lazily.
#
# GEMINI_API_KEY is only needed by POST /chat, but constructing the client at
# import time made a missing key crash the whole API at boot — including task
# CRUD, which needs no key at all. The OpenAI SDK also raises when api_key is
# None, so the failure surfaced as a misleading "set OPENAI_API_KEY" error.
_openai_client = None

# The Gemini model id, overridable with GEMINI_MODEL.
#
# This was hardcoded to `gemini-1.5-flash-latest`, which Google has since
# retired — every chat request 500'd with a 404 naming a model that no longer
# exists. Nothing in CI caught it: the chat route needs a live key and a real
# model to fail at all.
#
# Picking the default is less obvious than it looks. Two traps, both hit while
# verifying on a live stack:
#
#   * `gemini-flash-latest` is the floating alias, and it was returning 503
#     "high demand" continuously. A floating alias points at whatever is newest,
#     which is also the most contended.
#   * `gemini-2.5-flash` and `gemini-2.5-flash-lite` are listed by the v1beta
#     `models` endpoint as supporting generateContent, but 404 through the
#     OpenAI-compatibility endpoint this client uses. Being listed is not the
#     same as being reachable here.
#
# `gemini-3.5-flash` answered a tool-calling request on every attempt. The env
# var means the next retirement or capacity spike is a config change rather than
# a code change across two call sites.
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.5-flash")


def get_openai_client() -> openai.AsyncOpenAI:
    """Return the shared Gemini client, building it on first use."""
    global _openai_client
    if _openai_client is None:
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise HTTPException(
                status_code=http_status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Chat is unavailable: GEMINI_API_KEY is not configured",
            )
        _openai_client = openai.AsyncOpenAI(
            api_key=api_key,
            base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
        )
    return _openai_client


# --- Startup / Readiness state ---------------------------------------------

# Holds the result of startup checks. Populated by lifespan, read by /ready.
# True = all passed, False = at least one failed, None = not run yet.
_startup_checks_passed: bool | None = None


def _set_startup_checks_result(passed: bool) -> None:
    global _startup_checks_passed
    _startup_checks_passed = passed


def _get_startup_checks_result() -> bool | None:
    return _startup_checks_passed


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Run startup checks on application startup.

    Issue #3/#11. `startup_checks.run_all_checks()` was documented as a
    "fails fast" gate but nothing called it. The lifespan now invokes it and
    caches the result for /ready. A failure does NOT crash the process — it
    logs a critical error and marks readiness as failed. Liveness (/health)
    stays ok so orchestrators don't restart endlessly.
    """
    global _startup_checks_passed

    # Import here to avoid circular import at module level
    from startup_checks import run_all_checks

    logger.info("Running external seam startup checks...")
    passed = run_all_checks()
    _startup_checks_passed = passed

    if not passed:
        logger.critical(
            "Startup checks FAILED. Backend will report not ready. "
            "Fix: run `npx auth@latest migrate` in frontend/ and ensure DB is reachable."
        )
    else:
        logger.info("All startup checks PASSED.")

    yield

    # Shutdown: nothing special needed
    logger.info("Application shutting down.")


app = FastAPI(
    title="Todo API (Phase II - Authenticated)",
    version="2.0.0",
    lifespan=lifespan,
)

# CORS Middleware configuration
cors_origins = os.getenv("CORS_ORIGINS")
if not cors_origins:
    raise RuntimeError("CORS_ORIGINS must be configured")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in cors_origins.split(",") if origin.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# JWT Secret and JWKS configuration
JWKS_URL = os.getenv("JWKS_URL", "http://frontend:3000/api/auth/jwks")
jwks_client = PyJWKClient(JWKS_URL)

# Dependency for extracting and verifying JWT tokens
def get_current_user(authorization: Optional[str] = Header(None)) -> str:
    if not authorization:
        raise HTTPException(
            status_code=http_status.HTTP_401_UNAUTHORIZED,
            detail="Authorization token is missing"
        )
    
    scheme, _, token = authorization.partition(" ")
    token = token.strip()
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(
            status_code=http_status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization scheme (must be Bearer token)"
        )
    
    try:
        # Fetch public keys dynamically from the Better Auth JWKS endpoint based on 'kid' header
        signing_key = jwks_client.get_signing_key_from_jwt(token)
        # Decode and verify the EdDSA signature using the public key, ignoring audience constraint
        payload = jwt.decode(token, signing_key.key, options={"verify_aud": False}, algorithms=["EdDSA"])
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(
                status_code=http_status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token structure: Missing user id (subject)"
            )
        return user_id
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=http_status.HTTP_401_UNAUTHORIZED,
            detail="Authorization token has expired"
        )
    except jwt.InvalidTokenError:
        # Do not expose token validation details to clients or logs.
        raise HTTPException(
            status_code=http_status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization token"
        )
    except PyJWKClientError as e:
        # JWKS errors (network, key not found, malformed JWKS) -> 503.
        # This is a service configuration/availability issue, not a bad token.
        # The client cannot fix it by getting a new token.
        logger.warning("JWKS error during token verification: %s", e)
        raise HTTPException(
            status_code=http_status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication service temporarily unavailable"
        )

# --- Repository Dependencies ---

def get_task_repo(db: Session = Depends(get_db)) -> TaskRepository:
    return SqlTaskRepository(db)


def get_goal_repo(db: Session = Depends(get_db)) -> GoalRepository:
    return SqlGoalRepository(db)


def get_conversation_repo(db: Session = Depends(get_db)) -> ConversationRepository:
    return SqlConversationRepository(db)


def get_message_repo(db: Session = Depends(get_db)) -> MessageRepository:
    return SqlMessageRepository(db)


# Note the asymmetry. The chat *write* route does not use these: it opens its
# own short-lived sessions so that no connection is held across an LLM call.
# The conversation *read* routes do use them, because they do no waiting at all
# and nothing is gained by hand-rolling sessions for a single query.


@app.get("/")
def root():
    return {"message": "Welcome to the Secured Todo API (Phase II)"}

@app.get("/health")
def health():
    """Liveness probe — process is up. Does NOT check dependencies.

    Kubernetes/container orchestrators use this to know if the process is
    alive. It must NOT check DB, JWKS, or startup checks — those are
    readiness concerns (/ready).
    """
    return {"status": "ok"}


@app.get("/ready")
def ready():
    """Readiness probe — all dependencies healthy and startup checks passed.

    Checks:
    - Database connection (engine.connect())
    - JWKS endpoint reachable (HTTP GET)
    - Startup checks passed (cached from lifespan)

    Returns 200 with {"ready": true} when all healthy.
    Returns 503 with {"ready": false, "detail": "..."} naming the failed
    dependency when any check fails.
    """
    import httpx

    # 1. Startup checks
    startup = _get_startup_checks_result()
    if startup is False:
        raise HTTPException(
            status_code=http_status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Startup checks failed. Run `npx auth@latest migrate` in frontend/."
        )
    if startup is None:
        # Should not happen — lifespan runs before first request
        raise HTTPException(
            status_code=http_status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Startup checks not yet run"
        )

    # 2. Database
    try:
        from database import engine
        with engine.connect() as conn:
            conn.execute(sa.text("SELECT 1"))
    except Exception as e:
        logger.warning("Readiness DB check failed: %s", e)
        raise HTTPException(
            status_code=http_status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Database unreachable: {e}"
        )

    # 3. JWKS reachable
    try:
        with httpx.Client(timeout=5.0) as client:
            resp = client.get(JWKS_URL)
            resp.raise_for_status()
            # Validate it's actually JWKS (has "keys" array)
            data = resp.json()
            if not isinstance(data.get("keys"), list):
                raise ValueError("JWKS response missing 'keys' array")
    except Exception as e:
        logger.warning("Readiness JWKS check failed: %s", e)
        raise HTTPException(
            status_code=http_status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"JWKS unreachable: {e}"
        )

    return {"ready": True}

@app.get("/api/{user_id}/conversations", response_model=ConversationListResponse)
def list_conversations(
    user_id: str,
    authenticated_user_id: str = Depends(get_current_user),
    conversation_repo: ConversationRepository = Depends(get_conversation_repo),
):
    """The user's conversations, most recently active first.

    Issue #13. Until this existed a conversation could be *addressed* by id
    but never *found*, so a saved thread was unreachable on any browser that
    had not started it.

    Ordering comes from the last message, not from `conversations.updated_at`
    — nothing updates that column, so it still equals `created_at` and would
    order threads by when they were started rather than when they were used.
    """
    if authenticated_user_id != user_id:
        raise HTTPException(
            status_code=http_status.HTTP_403_FORBIDDEN,
            detail="Access denied: You cannot manage resources of another identity"
        )

    rows = conversation_repo.list_by_user(user_id)
    return ConversationListResponse(
        conversations=[
            ConversationSummary(
                id=r["id"],
                preview=r["preview"],
                message_count=r["message_count"],
                created_at=r["created_at"],
                last_activity_at=r["last_activity_at"],
            )
            for r in rows
        ]
    )


@app.get(
    "/api/{user_id}/conversations/{conversation_id}/messages",
    response_model=ConversationMessagesResponse,
)
def read_conversation_messages(
    user_id: str,
    conversation_id: uuid.UUID,
    authenticated_user_id: str = Depends(get_current_user),
    conversation_repo: ConversationRepository = Depends(get_conversation_repo),
    message_repo: MessageRepository = Depends(get_message_repo),
):
    """A thread's messages, oldest first.

    Scoped by owner, not merely by id: a conversation id is a UUID, so the
    threat is not guessing one but *using* a known one, and a caller who
    belongs to a different user must get 404 rather than another tenant's
    content.
    """
    if authenticated_user_id != user_id:
        raise HTTPException(
            status_code=http_status.HTTP_403_FORBIDDEN,
            detail="Access denied: You cannot manage resources of another identity"
        )

    conversation = conversation_repo.get_by_id_and_user(conversation_id, user_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    return ConversationMessagesResponse(
        conversation_id=conversation_id,
        messages=[
            MessageOut(id=m.id, role=m.role, content=m.content, created_at=m.created_at)
            for m in message_repo.list_for_conversation(conversation_id, user_id)
        ],
    )


# --- CRUD Endpoints ---

@app.post("/api/{user_id}/tasks", response_model=TaskResponse, status_code=http_status.HTTP_201_CREATED)
def create_task(
    user_id: str, 
    task: TaskCreate, 
    authenticated_user_id: str = Depends(get_current_user),
    task_repo: TaskRepository = Depends(get_task_repo),
):
    # Enforce multi-tenant access: user cannot create tasks for other user IDs
    if authenticated_user_id != user_id:
        raise HTTPException(
            status_code=http_status.HTTP_403_FORBIDDEN, 
            detail="Access denied: You cannot manage resources of another identity"
        )
    
    task_data = task.model_dump()
    task_data["user_id"] = user_id
    db_task = Task(**task_data)
    return task_repo.create(db_task)

@app.get("/api/{user_id}/tasks", response_model=TaskListResponse)
def get_tasks(
    user_id: str,
    status: Optional[StatusEnum] = None,
    priority: Optional[PriorityEnum] = None,
    limit: Optional[int] = None,
    cursor: Optional[str] = None,
    authenticated_user_id: str = Depends(get_current_user),
    task_repo: TaskRepository = Depends(get_task_repo),
):
    """One page of a user's tasks, newest first.

    Issue #7. This used to answer a bare array with no ordering and no bound:
    every task a user had ever created came back at once, in whatever order
    the query plan produced. The client does not sort, so that order *was* the
    order on screen.

    Keyset paging rather than `OFFSET` — see `paging.py` for why an offset
    repeats and skips rows when anything is written mid-walk.
    """
    if authenticated_user_id != user_id:
        raise HTTPException(
            status_code=http_status.HTTP_403_FORBIDDEN,
            detail="Access denied: You cannot manage resources of another identity"
        )

    try:
        page_size = clamp_limit(limit)
        after = decode_cursor(cursor) if cursor else None
    except InvalidCursor as exc:
        # 400, not a silent restart. Ignoring a bad cursor begins the walk
        # again, which the caller cannot distinguish from a fresh request.
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    rows, has_more = task_repo.list_page_by_user(
        user_id, status, priority, after, page_size
    )

    next_cursor = None
    if has_more and rows:
        next_cursor = encode_cursor((rows[-1].created_at, rows[-1].id))

    return TaskListResponse(
        tasks=[TaskResponse.model_validate(t) for t in rows],
        next_cursor=next_cursor,
    )

@app.get("/api/{user_id}/tasks/{task_id}", response_model=TaskResponse)
def get_task(
    user_id: str, 
    task_id: uuid.UUID, 
    authenticated_user_id: str = Depends(get_current_user),
    task_repo: TaskRepository = Depends(get_task_repo),
):
    if authenticated_user_id != user_id:
        raise HTTPException(
            status_code=http_status.HTTP_403_FORBIDDEN, 
            detail="Access denied: You cannot manage resources of another identity"
        )
        
    db_task = task_repo.get_by_id_and_user(task_id, user_id)
    if not db_task:
        raise HTTPException(status_code=404, detail="Task not found")
    return db_task

@app.put("/api/{user_id}/tasks/{task_id}", response_model=TaskResponse)
def update_task(
    user_id: str, 
    task_id: uuid.UUID, 
    task_update: TaskUpdate, 
    authenticated_user_id: str = Depends(get_current_user),
    task_repo: TaskRepository = Depends(get_task_repo),
):
    if authenticated_user_id != user_id:
        raise HTTPException(
            status_code=http_status.HTTP_403_FORBIDDEN, 
            detail="Access denied: You cannot manage resources of another identity"
        )
        
    db_task = task_repo.get_by_id_and_user(task_id, user_id)
    if not db_task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    update_data = task_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_task, key, value)
    
    return task_repo.update(db_task)

@app.delete("/api/{user_id}/tasks/{task_id}", status_code=http_status.HTTP_204_NO_CONTENT)
def delete_task(
    user_id: str, 
    task_id: uuid.UUID, 
    authenticated_user_id: str = Depends(get_current_user),
    task_repo: TaskRepository = Depends(get_task_repo),
):
    if authenticated_user_id != user_id:
        raise HTTPException(
            status_code=http_status.HTTP_403_FORBIDDEN, 
            detail="Access denied: You cannot manage resources of another identity"
        )
        
    db_task = task_repo.get_by_id_and_user(task_id, user_id)
    if not db_task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    task_repo.delete(db_task)
    # No explicit commit: `get_db` owns the transaction. This route used to be
    # the only one that committed by hand, reaching past the repository into
    # `task_repo.session` — which is not part of the narrow `TaskRepository`
    # protocol. That inconsistency is why DELETE persisted while POST and PUT
    # silently did not.
    return None


# --- Goals (issue #17) ------------------------------------------------------
#
# Standalone personal goals, deliberately not connected to tasks. The routes
# mirror the task routes' authorization exactly: the JWT subject must equal the
# URL `user_id` (403 otherwise), and an id belonging to someone else is
# indistinguishable from a missing one (404) because every lookup is scoped by
# owner at the repository. There is no DELETE and no detail route — this issue
# does not add them.


@app.get("/api/{user_id}/goals", response_model=GoalListResponse)
def list_goals(
    user_id: str,
    limit: Optional[int] = None,
    cursor: Optional[str] = None,
    authenticated_user_id: str = Depends(get_current_user),
    goal_repo: GoalRepository = Depends(get_goal_repo),
):
    """One page of a user's goals, newest first.

    One list, no grouping or filtering by status: the status is shown on each
    goal, and the agreed behavior is a single newest-first list. The status of a
    goal can change without moving it.
    """
    if authenticated_user_id != user_id:
        raise HTTPException(
            status_code=http_status.HTTP_403_FORBIDDEN,
            detail="Access denied: You cannot manage resources of another identity"
        )

    try:
        page_size = clamp_limit(limit)
        after = decode_cursor(cursor) if cursor else None
    except InvalidCursor as exc:
        # 400, not a silent restart — see the task list route and paging.py.
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    rows, has_more = goal_repo.list_page_by_user(user_id, after, page_size)

    next_cursor = None
    if has_more and rows:
        next_cursor = encode_cursor((rows[-1].created_at, rows[-1].id))

    return GoalListResponse(
        goals=[GoalResponse.model_validate(g) for g in rows],
        next_cursor=next_cursor,
    )


@app.post("/api/{user_id}/goals", response_model=GoalResponse, status_code=http_status.HTTP_201_CREATED)
def create_goal(
    user_id: str,
    goal: GoalCreate,
    authenticated_user_id: str = Depends(get_current_user),
    goal_repo: GoalRepository = Depends(get_goal_repo),
):
    if authenticated_user_id != user_id:
        raise HTTPException(
            status_code=http_status.HTTP_403_FORBIDDEN,
            detail="Access denied: You cannot manage resources of another identity"
        )

    # Owner comes from the verified path identity, never from the request body.
    goal_data = goal.model_dump()
    goal_data["user_id"] = user_id
    return goal_repo.create(Goal(**goal_data))


@app.put("/api/{user_id}/goals/{goal_id}", response_model=GoalResponse)
def update_goal(
    user_id: str,
    goal_id: uuid.UUID,
    goal_update: GoalUpdate,
    authenticated_user_id: str = Depends(get_current_user),
    goal_repo: GoalRepository = Depends(get_goal_repo),
):
    if authenticated_user_id != user_id:
        raise HTTPException(
            status_code=http_status.HTTP_403_FORBIDDEN,
            detail="Access denied: You cannot manage resources of another identity"
        )

    db_goal = goal_repo.get_by_id_and_user(goal_id, user_id)
    if not db_goal:
        raise HTTPException(status_code=404, detail="Goal not found")

    update_data = goal_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_goal, key, value)

    return goal_repo.update(db_goal)

@app.post("/api/{user_id}/chat", response_model=ChatResponse)
async def chat_with_agent(
    user_id: str,
    chat_req: ChatRequest,
    authenticated_user_id: str = Depends(get_current_user),
):
    if authenticated_user_id != user_id:
        raise HTTPException(
            status_code=http_status.HTTP_403_FORBIDDEN, 
            detail="Access denied: You cannot manage resources of another identity"
        )

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="GEMINI_API_KEY is not configured on the backend server."
        )

    # --- Phase 1: a short-lived database session ------------------------------
    #
    # This route used to take one dependency-injected session and hold it for the
    # whole request — across two Gemini calls, tens of seconds of network
    # round-trips during which it sat idle inside an open transaction. Neon is
    # reached through the *pooler*, which reclaims exactly that kind of
    # connection. The symptom was nasty and silent: the tool had already created
    # the task, Gemini had already written its reply, and then the final
    # `INSERT INTO messages` failed with "SSL connection has been closed
    # unexpectedly", so the user got a 500 and lost the whole conversation.
    #
    # Everything in this phase is fast and transactional, so it commits and
    # closes before any LLM call is made. The user's message is committed here
    # rather than at the end, so it survives an LLM failure instead of vanishing
    # with the rolled-back transaction.
    with SessionLocal() as session:
        conversation_repo = SqlConversationRepository(session)
        message_repo = SqlMessageRepository(session)

        if chat_req.conversation_id:
            conversation = conversation_repo.get_by_id_and_user(chat_req.conversation_id, user_id)
            if not conversation:
                raise HTTPException(status_code=404, detail="Conversation session not found")
        else:
            # No conversation_id always means a new conversation. Issue #5.
            #
            # This used to resume the most recent conversation instead, which
            # made the client's "New chat" button impossible: `clearChat` sets
            # the id to null, so the very next message carried no id and the
            # backend put it back in the thread the user had just abandoned.
            #
            # The server cannot distinguish "this is a new chat" from "the
            # client forgot the id", so guessing is the wrong move — and it
            # guessed the one answer that made the feature unusable. Resuming
            # is now something the client asks for, by sending an id.
            #
            # This also removes the need for the advisory lock that stood
            # here: it only existed to stop two requests racing to create
            # *the* conversation for a user. Every unadorned request creates
            # its own, so there is nothing left to serialise.
            conversation = conversation_repo.create_for_user(user_id)

        conversation_id = conversation.id

        # Read history as plain tuples, not ORM instances. Phase 1 closes this
        # session before the LLM runs, and touching `msg.content` afterwards
        # raises DetachedInstanceError. Extract what is needed while the
        # session is still open. Also maps 'model' to 'assistant', which the
        # OpenAI-shaped SDK expects.
        history = [
            ("assistant" if m.role in ("model", "assistant") else "user", m.content)
            for m in reversed(message_repo.history(conversation_id, user_id, limit=10))
        ]

        message_repo.add_message(
            conversation_id=conversation_id,
            user_id=user_id,
            role="user",
            content=chat_req.message,
        )
        session.commit()

    # --- Phase 2: no database connection held ---------------------------------
    # Gemini and the MCP subprocess both run here, and neither touches the
    # database connection pool.

    system_instruction = f"""You are a premium, highly intelligent, and friendly AI Todo Assistant for the EVO-TODO app.
Your job is to help the user manage their tasks (add, update, delete, complete, and list tasks) using your available tools.

The current local date and time is: {datetime.now().isoformat()}
Use this to accurately parse and set any relative dates (like 'tomorrow', 'next week') into standard ISO-8601 strings when calling tools.

Guidelines:
1. When user requests an action, invoke the appropriate tool.
2. Always summarize what was done in a natural, friendly, and professional tone.
3. If the user addresses you in Urdu, respond in a friendly hybrid Urdu/English (Hinglish/Urdu-English).
4. Do not mention tool details or internal task IDs unless asked, but confirm the changes clearly.
5. STRICT LATENCY CONSTRAINT: Keep your confirmation responses extremely short, concise, and direct.
"""
    
    openai_history = [{"role": "system", "content": system_instruction}]
    for role, content in history:
        openai_history.append({"role": role, "content": content})
    openai_history.append({"role": "user", "content": chat_req.message})

    # Use the shared singleton client (Issue 7), built on first use
    client = get_openai_client()

    executed_tools = []
    response_text = None

    # The MCP tool server runs as a stdio subprocess of this request, bound to
    # the identity we already verified from the JWT above. stdio is the only
    # shape this uses: there is no port to publish and no unauthenticated
    # network surface. See mcp_server.build_server for why identity cannot be
    # passed as a tool argument any more.
    mcp_server_params = StdioServerParameters(
        command=sys.executable,
        args=[str(MCP_SERVER_SCRIPT)],
        cwd=str(MCP_SERVER_SCRIPT.parent),
        env={
            # stdio_client merges this over a safe default subset that does NOT
            # include DATABASE_URL, so the child needs it passed explicitly or
            # it dies in database.py at import.
            "DATABASE_URL": os.environ["DATABASE_URL"],
            # The authenticated subject, and the only identity the child has.
            "MCP_USER_ID": user_id,
        },
    )

    # Failures inside this phase are recorded, not raised. Two separate
    # guarantees depend on that:
    #
    #   * The MCP tools run in their own process and commit their own
    #     transactions. There is nothing to roll back, so a 500 after a tool
    #     succeeded cannot undo it — it can only lie about it. Lying is what
    #     made "delete my task called grocery" answer *AI Chatbot service is
    #     temporarily unavailable* when the real problem was a typo, and made a
    #     created task vanish behind a failure the user was told to retry.
    #   * A failing tool is a normal outcome, not an outage. `call_tool` returns
    #     `isError=True` with a plain-English sentence rather than raising, so
    #     feeding that text to `json.loads` is what used to turn every one of
    #     them into a 500.
    phase_failed: str | None = None

    try:
        async with stdio_client(mcp_server_params) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()

                mcp_tools_res = await session.list_tools()

                openai_tools = []
                for tool in mcp_tools_res.tools:
                    openai_tools.append({
                        "type": "function",
                        "function": {
                            "name": tool.name,
                            "description": tool.description or "",
                            "parameters": tool.inputSchema
                        }
                    })

                response = await client.chat.completions.create(
                    model=GEMINI_MODEL,
                    messages=openai_history,
                    tools=openai_tools,
                    temperature=0.7
                )

                response_message = response.choices[0].message

                if response_message.tool_calls:
                    openai_history.append(response_message)

                    for tool_call in response_message.tool_calls:
                        tool_name = tool_call.function.name
                        try:
                            tool_args = json.loads(tool_call.function.arguments)
                        except (TypeError, ValueError):
                            tool_args = {}

                        # Each tool is its own intent. One failing must not
                        # abandon the rest — a user asking to delete one task
                        # and create another still wants the task created.
                        entry = {"tool": tool_name, "parameters": tool_args}
                        try:
                            result = await session.call_tool(tool_name, arguments=tool_args)
                            tool_result_str = result.content[0].text if result.content else "{}"

                            if getattr(result, "isError", False):
                                # `text` here is `Error executing tool <name>: <reason>`.
                                # The reason can be a friendly message or a driver
                                # traceback, so it is logged in full and never
                                # surfaced. Leaking it is #3's acceptance
                                # criterion, not this one's.
                                entry.update(ok=False, result=None)
                                logger.info(
                                    "Tool %s failed for user %s: %s",
                                    tool_name, user_id, tool_result_str,
                                )
                            else:
                                try:
                                    parsed = json.loads(tool_result_str)
                                except (TypeError, ValueError):
                                    parsed = None
                                entry.update(ok=True, result=parsed)
                        except Exception as tool_exc:  # noqa: BLE001 - one tool, one verdict
                            logger.warning(
                                "Tool %s raised for user %s: %s",
                                tool_name, user_id, tool_exc, exc_info=True,
                            )
                            entry.update(ok=False, result=None)

                        executed_tools.append(entry)
                        openai_history.append({
                            "role": "tool",
                            "tool_call_id": tool_call.id,
                            "name": tool_name,
                            "content": json.dumps(entry.get("result") or {"ok": entry.get("ok")})
                        })

                    # The model may not come back even though the tools did. That
                    # is a partial turn, and it is exactly when the user most
                    # needs to be told what happened to their data.
                    second_response = await client.chat.completions.create(
                        model=GEMINI_MODEL,
                        messages=openai_history,
                        tools=openai_tools,
                        temperature=0.7
                    )
                    response_text = second_response.choices[0].message.content
                else:
                    response_text = response_message.content

    except Exception as exc:  # noqa: BLE001 - the turn failed; the record must not
        phase_failed = str(exc)
        logger.error("Chat turn failed for user %s: %s", user_id, exc, exc_info=True)

    # --- The turn's verdict ----------------------------------------------------
    #
    # Derived from what actually happened, not from whether an exception was
    # raised. The distinction matters: a turn that failed loudly is worse than
    # one that failed honestly, because the natural response to "it failed" is
    # to ask again.
    succeeded = [t for t in executed_tools if t.get("ok")]
    failed = [t for t in executed_tools if not t.get("ok")]

    if succeeded and not failed and not phase_failed:
        outcome = "completed"
    elif succeeded:
        outcome = "partial"
    elif failed or phase_failed:
        outcome = "partial" if response_text else "failed"
    else:
        outcome = "failed" if phase_failed else "completed"

    # When the model produced nothing, the conversation still has to say what
    # happened. Built from the tool results rather than from the model, because
    # the model is the thing that is missing.
    if not response_text and (succeeded or failed):
        parts = [f"Completed {len(succeeded)} action(s)."] if succeeded else []
        if failed:
            parts.append(f"{len(failed)} action(s) could not be completed.")
        if phase_failed:
            parts.append("The assistant could not summarise the result.")
        response_text = " ".join(parts)

    # --- Phase 3: a second short-lived session ---------------------------------
    # Opened only now, after the LLM phase has finished, so it is never idle
    # long enough for the pooler to reclaim it. It runs even when the turn
    # failed, because a tool that already committed its work has to be
    # recorded — otherwise the user's next turn has no idea it happened.
    #
    # But only when there is something to say. A turn where the model died
    # before speaking and no tool ran would otherwise append an empty assistant
    # message: noise in the history the model is later replayed, and a message
    # row that claims something happened when nothing did.
    if response_text:
        with SessionLocal() as session:
            SqlMessageRepository(session).add_message(
                conversation_id=conversation_id,
                user_id=user_id,
                role="assistant",
                content=response_text,
            )
            session.commit()

    return ChatResponse(
        conversation_id=conversation_id,
        response=response_text or "",
        outcome=outcome,
        tool_calls=executed_tools
    )
