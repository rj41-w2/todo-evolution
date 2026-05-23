import os
import uuid
from typing import List, Optional
from fastapi import FastAPI, Depends, HTTPException, Header, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
import jwt
from jwt import PyJWKClient

from database import engine, get_db, Base
from models import Task, TaskCreate, TaskUpdate, TaskResponse, StatusEnum, PriorityEnum

# Create database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Todo API (Phase II - Authenticated)", version="2.0.0")

# CORS Middleware configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# JWT Secret and JWKS configuration
BETTER_AUTH_SECRET = os.getenv("BETTER_AUTH_SECRET", "fallback_auth_secret_key_12984712")
JWKS_URL = os.getenv("JWKS_URL", "http://localhost:3000/api/auth/jwks")
jwks_client = PyJWKClient(JWKS_URL)

# Dependency for extracting and verifying JWT tokens
def get_current_user(authorization: Optional[str] = Header(None)) -> str:
    print(f"[DEBUG AUTH] Authorization header: {authorization}")
    if not authorization:
        print("[DEBUG AUTH] Error: Authorization header is missing")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization token is missing"
        )
    
    if not authorization.startswith("Bearer "):
        print("[DEBUG AUTH] Error: Invalid authorization scheme")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization scheme (must be Bearer token)"
        )
    
    token = authorization.split(" ")[1]
    print(f"[DEBUG AUTH] Extracted token: {token[:15]}...{token[-15:] if len(token) > 30 else ''}")
    try:
        # Fetch public keys dynamically from the Better Auth JWKS endpoint based on 'kid' header
        signing_key = jwks_client.get_signing_key_from_jwt(token)
        # Decode and verify the EdDSA signature using the public key, ignoring audience constraint
        payload = jwt.decode(token, signing_key.key, options={"verify_aud": False}, algorithms=["EdDSA"])
        print(f"[DEBUG AUTH] Successfully decoded token payload: {payload}")
        user_id = payload.get("sub")
        if not user_id:
            print("[DEBUG AUTH] Error: Missing sub claim in JWT payload")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token structure: Missing user id (subject)"
            )
        return user_id
    except jwt.ExpiredSignatureError:
        print("[DEBUG AUTH] Error: JWT has expired")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization token has expired"
        )
    except jwt.InvalidTokenError as e:
        print(f"[DEBUG AUTH] Error decoding JWT: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid authorization token: {str(e)}"
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

