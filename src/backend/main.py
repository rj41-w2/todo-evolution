import os
import uuid
from datetime import datetime
from typing import List, Optional
from fastapi import FastAPI, Depends, HTTPException, Header, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
import jwt
from jwt import PyJWKClient

import json
import openai
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

from database import engine, get_db, Base
from models import (
    Task, TaskCreate, TaskUpdate, TaskResponse, StatusEnum, PriorityEnum,
    Conversation, Message, ChatRequest, ChatResponse
)

# Create database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Todo API (Phase II - Authenticated)", version="2.0.0")

# CORS Middleware configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",") if origin.strip()],
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
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization token is missing"
        )
    
    scheme, _, token = authorization.partition(" ")
    token = token.strip()
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
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
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token structure: Missing user id (subject)"
            )
        return user_id
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization token has expired"
        )
    except jwt.InvalidTokenError as e:
        # Do not expose token validation details to clients or logs.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization token"
        )

@app.get("/")
def root():
    return {"message": "Welcome to the Secured Todo API (Phase II)"}

# --- CRUD Endpoints ---

@app.post("/api/{user_id}/tasks", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
def create_task(
    user_id: str, 
    task: TaskCreate, 
    db: Session = Depends(get_db), 
    authenticated_user_id: str = Depends(get_current_user)
):
    # Enforce multi-tenant access: user cannot create tasks for other user IDs
    if authenticated_user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail="Access denied: You cannot manage resources of another identity"
        )
    
    task_data = task.model_dump()
    task_data["user_id"] = user_id
    db_task = Task(**task_data)
    db.add(db_task)
    db.commit()
    db.refresh(db_task)
    return db_task

@app.get("/api/{user_id}/tasks", response_model=List[TaskResponse])
def get_tasks(
    user_id: str,
    status: Optional[StatusEnum] = None, 
    priority: Optional[PriorityEnum] = None,
    db: Session = Depends(get_db),
    authenticated_user_id: str = Depends(get_current_user)
):
    if authenticated_user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail="Access denied: You cannot manage resources of another identity"
        )
        
    query = db.query(Task).filter(Task.user_id == user_id)
    if status:
        query = query.filter(Task.status == status)
    if priority:
        query = query.filter(Task.priority == priority)
    return query.all()

@app.get("/api/{user_id}/tasks/{task_id}", response_model=TaskResponse)
def get_task(
    user_id: str, 
    task_id: uuid.UUID, 
    db: Session = Depends(get_db), 
    authenticated_user_id: str = Depends(get_current_user)
):
    if authenticated_user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail="Access denied: You cannot manage resources of another identity"
        )
        
    db_task = db.query(Task).filter(Task.id == task_id, Task.user_id == user_id).first()
    if not db_task:
        raise HTTPException(status_code=404, detail="Task not found")
    return db_task

@app.put("/api/{user_id}/tasks/{task_id}", response_model=TaskResponse)
def update_task(
    user_id: str, 
    task_id: uuid.UUID, 
    task_update: TaskUpdate, 
    db: Session = Depends(get_db), 
    authenticated_user_id: str = Depends(get_current_user)
):
    if authenticated_user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail="Access denied: You cannot manage resources of another identity"
        )
        
    db_task = db.query(Task).filter(Task.id == task_id, Task.user_id == user_id).first()
    if not db_task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    update_data = task_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_task, key, value)
    
    db.commit()
    db.refresh(db_task)
    return db_task

@app.delete("/api/{user_id}/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(
    user_id: str, 
    task_id: uuid.UUID, 
    db: Session = Depends(get_db), 
    authenticated_user_id: str = Depends(get_current_user)
):
    if authenticated_user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail="Access denied: You cannot manage resources of another identity"
        )
        
    db_task = db.query(Task).filter(Task.id == task_id, Task.user_id == user_id).first()
    if not db_task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    db.delete(db_task)
    db.commit()
    return None

@app.post("/api/{user_id}/chat", response_model=ChatResponse)
async def chat_with_agent(
    user_id: str,
    chat_req: ChatRequest,
    db: Session = Depends(get_db),
    authenticated_user_id: str = Depends(get_current_user)
):
    if authenticated_user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail="Access denied: You cannot manage resources of another identity"
        )

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="GEMINI_API_KEY is not configured on the backend server."
        )

    if chat_req.conversation_id:
        conversation = db.query(Conversation).filter(
            Conversation.id == chat_req.conversation_id,
            Conversation.user_id == user_id
        ).first()
        if not conversation:
            raise HTTPException(status_code=404, detail="Conversation session not found")
    else:
        conversation = Conversation(user_id=user_id)
        db.add(conversation)
        db.commit()
        db.refresh(conversation)

    messages = db.query(Message).filter(
        Message.conversation_id == conversation.id,
        Message.user_id == user_id
    ).order_by(Message.created_at.desc()).limit(10).all()
    messages.reverse()

    user_msg_record = Message(
        user_id=user_id,
        conversation_id=conversation.id,
        role="user",
        content=chat_req.message
    )
    db.add(user_msg_record)
    db.commit()
    db.refresh(user_msg_record)

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

    client = openai.AsyncOpenAI(
        api_key=api_key,
        base_url="https://generativelanguage.googleapis.com/v1beta/openai/"
    )

    executed_tools = []
    response_text = "I have processed your request."

    try:
        server_params = StdioServerParameters(
            command="python",
            args=[os.path.join(os.path.dirname(__file__), "mcp_server.py")],
            env=os.environ.copy()
        )

        async with stdio_client(server_params) as (read, write):
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
                    model="gemini-2.5-flash",
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
                        model="gemini-2.5-flash",
                        messages=openai_history,
                        tools=openai_tools,
                        temperature=0.7
                    )
                    response_text = second_response.choices[0].message.content
                else:
                    response_text = response_message.content

    except Exception:
        db.delete(user_msg_record)
        db.commit()
        raise HTTPException(status_code=500, detail="AI Chatbot service is temporarily unavailable")

    assistant_msg_record = Message(
        user_id=user_id,
        conversation_id=conversation.id,
        role="assistant",
        content=response_text or ""
    )
    db.add(assistant_msg_record)
    db.commit()

    return ChatResponse(
        conversation_id=conversation.id,
        response=response_text or "",
        tool_calls=executed_tools
    )
