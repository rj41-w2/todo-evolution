# 🚀 EVO-TODO: General Project Developer Guide

Welcome to the **EVO-TODO** (Evolutionary Task Manager) codebase! This document serves as the primary gateway and general developer guide for Gemini and other AI coding assistants. It outlines the overarching architectural paradigm, the multi-phase roadmap, global directory layout, and quick-start instructions.

---

## 📅 The Evolutionary Architecture & Roadmap

EVO-TODO is designed as a multi-phase software engineering journey. It tracks the evolution of an application from a simple local command-line interface to a decoupled, cloud-ready, production-grade SaaS product.

```mermaid
graph TD
    P1[Phase I: In-Memory CLI] -->|Decouple & Database| P2[Phase II: Decoupled Full-Stack]
    P2 -->|Security & Personalization| P3[Phase III: Auth & Multi-Tenancy]
    P3 -->|Data Science & Visuals| P4[Phase IV: Analytics & Insights]
    P4 -->|Scale & Platforms| P5[Phase V: Cloud & Mobile App]
    
    style P2 fill:#4f46e5,stroke:#312e81,stroke-width:2px,color:#fff
```

### Phase Summary

*   **Phase I: The In-Memory CLI (Completed)**
    *   *Features:* Priority levels, custom tags, task recurrence, and overdue tracking.
    *   *Data Layer:* Strict in-memory operations (lost on program exit).
*   **Phase II: Decoupled Full-Stack Architecture (Current Phase - ~50%)**
    *   *Features:* Web Dashboard, database persistence, REST API.
    *   *Next Steps:* Implement advanced filtering, due-date pickers, and real-time reminders.
*   **Phase III: User Authentication & Multi-Tenancy (Planned)**
    *   *Features:* Multi-user isolation, signup/login flows, session tokens.
*   **Phase IV: Advanced Analytics & Productivity Insights (Planned)**
    *   *Features:* Interactive charts, productivity scoring, task completion trends.
*   **Phase V: Global Scale & Mobile Integration (Planned)**
    *   *Features:* Cloud deployment, React Native or native mobile companion apps.

---

## 📂 Global Directory Layout

```bash
todo-evolution/
├── .gitignore
├── README.md               # Original project overview & roadmap
├── GEMINI.md               # THIS FILE - Core project overview for AI assistants
├── AI_INSTRUCTIONS.md      # Instructions & prompt directives
├── Constitution.md         # Coding standards and rules
├── specs/                  # Phase specs & functional requirements
│   ├── phase1-spec.md
│   └── phase2-spec.md
├── src/                    # Python Core Codebase
│   ├── main.py             # Phase I CLI Entry point
│   ├── manager.py          # Phase I TaskManager Logic
│   ├── models.py           # Phase I Data objects
│   └── backend/            # Phase II FastAPI server (REST API)
│       ├── main.py         # REST API routes & CORS middleware
│       ├── database.py     # Neon DB connection & Session management
│       ├── models.py       # SQLAlchemy database models & Pydantic schemas
│       └── requirements.txt
└── frontend/               # Phase II Next.js Client (Web UI)
    ├── package.json
    ├── app/                # Next.js App Router (pages & styles)
    ├── components/         # Interactive UI components
    └── types/              # TypeScript global interface definitions
```

---

## 🏃‍♂️ Global Setup & Run Cheat Sheet

Here is a quick cheat sheet for spinning up the different components of the application.

### 📟 Running Phase I: Python CLI
1. Navigate to the `src/` directory.
2. Run:
   ```bash
   python main.py
   ```

### 🌐 Running Phase II: Full-Stack Web App

To run Phase II, you must run **both** the backend and the frontend servers concurrently.

#### 1. Start the FastAPI Backend
1. Navigate to `src/backend/` directory.
2. Install Python dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Copy `.env.example` to `.env` and fill in your connection string:
   ```env
   DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require
   ```
4. Run the development server:
   ```bash
   uvicorn main:app --reload
   ```
   *The backend will be available at:* `http://127.0.0.1:8000`

#### 2. Start the Next.js Frontend
1. Navigate to `frontend/` directory.
2. Install Node dependencies:
   ```bash
   npm install
   ```
3. Run the Next.js development server:
   ```bash
   npm run dev
   ```
   *The client dashboard will be available at:* `http://localhost:3000`

---

## 🤖 Guidelines for AI Coding Assistants (Gemini)

When tasked with modifications or extensions, adhere strictly to the following architectural guidelines:

> [!IMPORTANT]
> **Maintain Separation of Concerns:**
> Do not mix CLI-specific code with Web API structures. Ensure that Phase I logic stays intact in the root of `src/` so the terminal app continues to function, while Phase II logic expands under `src/backend/` and `frontend/`.

> [!TIP]
> **Schema Evolution Alignment:**
> When adding features (e.g., due dates or recurrence) to the web UI, always make sure:
> 1. The database model in `src/backend/models.py` is updated.
> 2. The Pydantic request/response schemas are modified.
> 3. The TypeScript types in `frontend/types/index.ts` align exactly with the new backend responses.

> [!WARNING]
> **Database Security:**
> Never hardcode the `DATABASE_URL` or secret keys. Always fetch them via `os.getenv` or configuration libraries, loading from local `.env` files which are excluded from Git repository tracking.
