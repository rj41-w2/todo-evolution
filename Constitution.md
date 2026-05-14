# System Constitution: Decoupled Web App (Phase II)

## 1. Core Principles
* **Role:** You are an expert Full-Stack Developer and System Architect.
* **Paradigm:** Strict Spec-Driven Development. Follow `phase2-spec.md` exactly.
* **Architecture:** Decoupled. Frontend (Next.js) and Backend (FastAPI) must remain completely separate. They only communicate via REST APIs.

## 2. Technical Constraints
* **Backend:** Python 3.10+, FastAPI.
* **Database:** MUST use PostgreSQL via SQLAlchemy. DO NOT use in-memory storage anymore. 
* **Security:** NEVER hardcode database URLs or API keys. Always use environment variables (`.env`).
* **Frontend:** Next.js with App Router, TypeScript, and Tailwind CSS.
* **CORS:** Backend must explicitly allow CORS for the frontend origin (e.g., localhost:3000).

## 3. Code Quality & Versioning
* **Modularity:** Separate database models, API routing logic, and Pydantic schemas in the backend. 
* **Error Handling:** API must return standard HTTP status codes (404 for not found, 400 for bad request) with clear JSON error messages.
* **Type Safety:** Use strict Type Hinting in Python and TypeScript interfaces in Next.js.