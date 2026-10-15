import os
import uuid
import logging
from datetime import datetime
from typing import List, Optional
from fastapi import FastAPI, Depends, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from starlette import status as http_status
from sqlalchemy.orm import Session
import sqlalchemy as sa

logger = logging.getLogger("uvicorn.error")
import jwt
from jwt import PyJWKClient

import json
import openai
from mcp import ClientSession
from mcp.client.sse import sse_client

from database import get_db
from models import (
    Task, TaskCreate, TaskUpdate, TaskResponse, StatusEnum, PriorityEnum,
    Conversation, Message, ChatRequest, ChatResponse
)
from repositories import (
    SqlTaskRepository, TaskRepository,
    SqlConversationRepository, ConversationRepository,
    SqlMessageRepository, MessageRepository,
)

# Tables are managed by Alembic (`alembic upgrade head`), which must run before
# the app starts. See src/backend/migrations/.

# OpenAI client singleton (Issue 7), built lazily.
#
# GEMINI_API_KEY is only needed by POST /chat, but constructing the client at
# import time made a missing key crash the whole API at boot — including task
# CRUD, which needs no key at all. The OpenAI SDK also raises when api_key is
# None, so the failure surfaced as a misleading "set OPENAI_API_KEY" error.
_openai_client = None


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

app = FastAPI(title="Todo API (Phase II - Authenticated)", version="2.0.0")

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
    except jwt.InvalidTokenError as e:
        # Do not expose token validation details to clients or logs.
        raise HTTPException(
            status_code=http_status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization token"
        )

# --- Repository Dependencies ---

def get_task_repo(db: Session = Depends(get_db)) -> TaskRepository:
    return SqlTaskRepository(db)


def get_conversation_repo(db: Session = Depends(get_db)) -> ConversationRepository:
    return SqlConversationRepository(db)


def get_message_repo(db: Session = Depends(get_db)) -> MessageRepository:
    return SqlMessageRepository(db)


@app.get("/")
def root():
    return {"message": "Welcome to the Secured Todo API (Phase II)"}

@app.get("/health")
def health():
    return {"status": "ok"}

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

@app.get("/api/{user_id}/tasks", response_model=List[TaskResponse])
def get_tasks(
    user_id: str,
    status: Optional[StatusEnum] = None, 
    priority: Optional[PriorityEnum] = None,
    authenticated_user_id: str = Depends(get_current_user),
    task_repo: TaskRepository = Depends(get_task_repo),
):
    if authenticated_user_id != user_id:
        raise HTTPException(
            status_code=http_status.HTTP_403_FORBIDDEN, 
            detail="Access denied: You cannot manage resources of another identity"
        )
        
    return task_repo.list_by_user(user_id, status, priority)

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
    task_repo.session.commit()
    return None

@app.post("/api/{user_id}/chat", response_model=ChatResponse)
async def chat_with_agent(
    user_id: str,
    chat_req: ChatRequest,
    authenticated_user_id: str = Depends(get_current_user),
    conversation_repo: ConversationRepository = Depends(get_conversation_repo),
    message_repo: MessageRepository = Depends(get_message_repo),
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

    if chat_req.conversation_id:
        conversation = conversation_repo.get_by_id_and_user(chat_req.conversation_id, user_id)
        if not conversation:
            raise HTTPException(status_code=404, detail="Conversation session not found")
    else:
        # Prevent race condition: use PostgreSQL advisory lock on user_id hash
        # This serializes conversation creation per user
        lock_key = abs(hash(user_id)) % (2**31)
        # Need raw session for advisory lock - get it from repository
        session = conversation_repo.session
        session.execute(sa.text("SELECT pg_advisory_xact_lock(:lock_key)"), {"lock_key": lock_key})
        
        # Re-check inside lock: another request may have created a conversation
        conversation = conversation_repo.get_latest_by_user(user_id)
        
        if not conversation:
            conversation = conversation_repo.create_for_user(user_id)

    # Get recent history using repository (uses composite index)
    messages = message_repo.history(conversation.id, user_id, limit=10)
    messages.reverse()

    # Add user message via repository
    user_msg_record = message_repo.add_message(
        conversation_id=conversation.id,
        user_id=user_id,
        role="user",
        content=chat_req.message
    )

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
    for msg in messages:
        # map 'model' role to 'assistant' for openai SDK
        role = "assistant" if msg.role == "model" or msg.role == "assistant" else "user"
        openai_history.append({"role": role, "content": msg.content})
    openai_history.append({"role": "user", "content": chat_req.message})

    # Use the shared singleton client (Issue 7), built on first use
    client = get_openai_client()

    executed_tools = []
    response_text = None

    mcp_server_url = os.getenv("MCP_SERVER_URL", "http://mcp:8001/sse")

    try:
        async with sse_client(mcp_server_url) as (read, write):
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

                # Remove user_id from parameters since the agent doesn't provide it
                for t in openai_tools:
                    if "user_id" in t["function"]["parameters"].get("properties", {}):
                        del t["function"]["parameters"]["properties"]["user_id"]
                    if "user_id" in t["function"]["parameters"].get("required", []):
                        t["function"]["parameters"]["required"].remove("user_id")

                response = await client.chat.completions.create(
                    model="gemini-1.5-flash-latest",
                    messages=openai_history,
                    tools=openai_tools,
                    temperature=0.7
                )
                
                response_message = response.choices[0].message
                
                if response_message.tool_calls:
                    openai_history.append(response_message)
                    
                    for tool_call in response_message.tool_calls:
                        tool_name = tool_call.function.name
                        tool_args = json.loads(tool_call.function.arguments)
                        
                        # Inject user_id securely before passing to MCP
                        tool_args["user_id"] = user_id
                        
                        result = await session.call_tool(tool_name, arguments=tool_args)
                        tool_result_str = result.content[0].text if result.content else "{}"
                        
                        executed_tools.append({
                            "tool": tool_name,
                            "parameters": tool_args,
                            "result": json.loads(tool_result_str)
                        })
                        
                        openai_history.append({
                            "role": "tool",
                            "tool_call_id": tool_call.id,
                            "name": tool_name,
                            "content": tool_result_str
                        })
                        
                    second_response = await client.chat.completions.create(
                        model="gemini-1.5-flash-latest",
                        messages=openai_history,
                        tools=openai_tools,
                        temperature=0.7
                    )
                    response_text = second_response.choices[0].message.content
                else:
                    response_text = response_message.content

    except Exception as exc:
        logger.error("Chat failed for user %s: %s", user_id, exc, exc_info=True)
        # Session auto-rolls back on exception; no manual cleanup needed
        raise HTTPException(status_code=500, detail="AI Chatbot service is temporarily unavailable")

    # Add assistant message via repository
    message_repo.add_message(
        conversation_id=conversation.id,
        user_id=user_id,
        role="assistant",
        content=response_text or ""
    )
    message_repo.session.commit()

    return ChatResponse(
        conversation_id=conversation.id,
        response=response_text or "",
        tool_calls=executed_tools
    )
