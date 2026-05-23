# System Constitution: AI-Powered Todo Chatbot (Phase III)

## 1. Core Principles
* **Role:** You are a Principal AI Architect and Full-Stack Developer.
* **Paradigm:** Strict Spec-Driven Development. Follow `specs/phase3-spec.md` exactly.
* **Architecture:** Stateless Agentic Architecture. The backend is decoupled into a FastAPI Server, an OpenAI Agents SDK loop, and an MCP Server exposing stateless task tools.
* **Security & Isolation:** Strict multi-tenant isolation. No user can view or alter tasks, conversations, or messages belonging to another user. Enforce verified JWT authentication on all endpoints.

---

## 2. Technical Constraints

### 2.1 Backend Layer (FastAPI & Agentic Stack)
* **Framework:** Python 3.10+ and FastAPI.
* **Agent Integration:** Use the **OpenAI Agents SDK** for conversational loops and agent reasoning.
* **MCP Integration:** Use the **Official MCP SDK** to construct a stateless Model Context Protocol (MCP) server that exposes CRUD tasks as tools.
* **Shared Secret:** Verify incoming JWT signatures against `BETTER_AUTH_SECRET` using public keys from the JWKS endpoint `http://localhost:3000/api/auth/jwks` using PyJWKClient.
* **Statelessness:** The backend server and MCP tools must hold **no memory or local state**. Conversation history and session variables must be fetched and persisted to the Neon PostgreSQL DB on every single request cycle.

### 2.2 Database Layer (Neon DB & SQLModel)
* **Storage:** Neon Serverless PostgreSQL.
* **Tables:** Manage relational schemas for `tasks`, `conversations`, and `messages` (chat history).
* **Constraints:** Enforce Cascading Deletes on conversations. Indexes must exist on all `user_id` and `conversation_id` foreign keys.

### 2.3 Frontend Layer (Next.js & ChatKit)
* **Framework:** Next.js with App Router, TypeScript, and Tailwind CSS.
* **Messaging UI:** Use **OpenAI ChatKit** or a custom premium dark-themed conversational interface.
* **Session Management:** Better Auth credentials flow. Automatically append JWT tokens as `Authorization: Bearer <token>` to chat requests.

---

## 3. Code Quality & Agent Behavior
* **Modularity:** Separate API routing (`main.py`), database model schemas (`models.py`), and MCP tool logic.
* **Conversational Politeness:** The AI agent must always respond in a helpful, friendly, and precise manner, confirming database mutations (adds, updates, deletes) in natural language.
* **Robust Error Handling:** Gracefully handle "Task Not Found", database connection drops, and API limits. Return appropriate HTTP status codes (e.g., `401 Unauthorized`, `403 Forbidden`, `404 Not Found`).