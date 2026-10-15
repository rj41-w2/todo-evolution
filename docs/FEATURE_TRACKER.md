# FEATURE_TRACKER.md — EVO-TODO Feature & Version Registry

> **Purpose:** Single source of truth for every feature/component across backend & frontend, with version history so you know what's been built, how many times, and what's next.

> **Last Updated:** 2026-10-14  
> **Current Phase:** Phase IV (Containerization) — Repository Layer Refactor Complete

---

## 1. BACKEND — Database Schema Versions

| Entity | Current Version | Migrations | Columns | Indexes | Notes |
|--------|----------------|------------|---------|---------|-------|
| `tasks` | v2 | 0001, 0002 | id (UUID), user_id (FK), title, description, status (ENUM), priority (ENUM), tags (JSON), created_at, due_date | `ix_tasks_user_id` | Status/Priority = PostgreSQL ENUM; tags = opaque JSON (no GIN index yet) |
| `conversations` | v1 | 0001 | id (UUID), user_id (FK), created_at, updated_at | `ix_conversations_user_id` | FK → user.id CASCADE |
| `messages` | v1 | 0001, 0002 | id (UUID), user_id (FK), conversation_id (FK), role, content, created_at | `ix_messages_user_id`, `ix_messages_conversation_id`, `ix_messages_conversation_id_created_at` (composite) | Denormalized user_id for read perf; composite index for chat history query |
| `user` (external) | — | Better Auth CLI | id (PK), email, emailVerified, createdAt, updatedAt, ... | — | **Owned by Frontend**; excluded from Alembic autogenerate; see `docs/external-seams.md` |

---

## 2. BACKEND — API Endpoints (FastAPI)

| Endpoint | Current Version | Auth | Repository | MCP Tool | Status |
|----------|----------------|------|------------|----------|--------|
| `POST /api/{uid}/tasks` | v2 | JWT (EdDSA) | `TaskRepository.create` | `add_task` | ✅ Done |
| `GET /api/{uid}/tasks` | v2 | JWT | `TaskRepository.list_by_user` | `list_tasks` | ✅ Done |
| `GET /api/{uid}/tasks/{id}` | v2 | JWT | `TaskRepository.get_by_id_and_user` | — | ✅ Done |
| `PUT /api/{uid}/tasks/{id}` | v2 | JWT | `TaskRepository.update` | `update_task` | ✅ Done |
| `DELETE /api/{uid}/tasks/{id}` | v2 | JWT | `TaskRepository.delete` | `delete_task` | ✅ Done |
| `POST /api/{uid}/chat` | v2 | JWT | `ConversationRepository` + `MessageRepository` | — | ✅ Done |

**Auth Notes:** Multi-tenant — every endpoint validates `authenticated_user_id == path_user_id` (403 if mismatch). JWT verified via Better Auth JWKS (`http://frontend:3000/api/auth/jwks`).

---

## 3. BACKEND — Repository Layer (v1 — Added 2026-10-14)

| Repository | Version | Key Methods | Used By |
|------------|---------|-------------|---------|
| `TaskRepository` | v1 | `list_by_user(uid, status?, priority?)`, `get_by_id_and_user(id, uid)`, `find_by_id_or_title(uid, str)`, `create/update/delete/get/list/exists` | `main.py`, `mcp_server.py` |
| `ConversationRepository` | v1 | `get_by_id_and_user(id, uid)`, `get_latest_by_user(uid)`, `create_for_user(uid)`, `CRUD` | `main.py` |
| `MessageRepository` | v1 | `history(conv_id, uid, limit=10)`, `add_message(conv_id, uid, role, content)`, `CRUD` | `main.py` |
| **Base** | v1 | `SqlRepository[T]` — generic CRUD + session mgmt | All repositories |

**Pattern:** Narrow protocols (`Repository[T]` + entity-specific methods). `user_id` passed per-call (not stored) → enforces multi-tenancy. Returns SQLAlchemy models; Pydantic conversion at API boundary.

---

## 4. BACKEND — MCP Server Tools (v2 — Refactored 2026-10-14)

| Tool | Version | Repository | Features |
|------|---------|------------|----------|
| `add_task` | v2 | `SqlTaskRepository` | UUID/title search, tags, priority, due_date |
| `list_tasks` | v2 | `SqlTaskRepository` | status (`all/pending/completed`), priority filters |
| `complete_task` | v2 | `SqlTaskRepository` | `find_by_id_or_title` (UUID or title substring) |
| `delete_task` | v2 | `SqlTaskRepository` | `find_by_id_or_title` |
| `update_task` | v2 | `SqlTaskRepository` | `find_by_id_or_title`, partial updates (title, desc, priority, due_date) |

**Transport:** stdio (default) or SSE (`MCP_TRANSPORT=sse` on port 8001). Each tool creates own `SessionLocal()` via `_get_task_repo()`.

---

## 5. BACKEND — External Seams & Safety (v1 — Added 2026-10-14)

| Artifact | Purpose |
|----------|---------|
| `docs/external-seams.md` | Formal sync contract for Better Auth `user` table (owner, assumptions, FK behavior, change protocol) |
| `src/backend/repositories/user_stub.py` | Minimal `user` table stub for FK resolution + documentation |
| `src/backend/startup_checks.py` | `run_all_checks()` — verifies `user` table exists, `id` column queryable, FKs resolvable |
| `src/backend/tests/test_external_seams.py` | Integration tests (require real DB): table exists, column types, FK cascade, startup checks |

---

## 6. FRONTEND — Pages & Components (Next.js 16 App Router)

| Page / Component | Route | Current Version | Key Features | Backend Integration |
|------------------|-------|----------------|--------------|---------------------|
| **Dashboard** | `/` | v2 | Greeting, stats cards (open/done/overdue), agent panel, quick actions | `GET /api/{uid}/tasks` |
| **My Tasks** | `/tasks` | v2 | Filter tabs (All/Pending/Completed), inline edit, empty states, overdue chips | `GET/PUT/DELETE /api/{uid}/tasks` |
| **All Tasks** | `/tasks/all` | v1 | Shared task source (`TasksProvider`), same filters | `GET /api/{uid}/tasks` |
| **Task Form** | (modal) | v2 | Title, description, priority select, tags (comma-separated input) | `POST /api/{uid}/tasks` |
| **Task Edit Form** | (inline) | v2 | Same fields, pre-filled, save/cancel | `PUT /api/{uid}/tasks/{id}` |
| **Settings** | `/settings` | v1 | Theme (Light/Dark/System), profile display | — |
| **Onboarding** | `/onboarding` | v1 | Workspace name, one-time gate | — |
| **Login** | `/login` | v1 | Better Auth email/password + JWT | — |
| **Register** | `/register` | v1 | Better Auth email/password + JWT | — |
| **Chatbot** | (floating) | v1 | Conversation history, tool calls display, streaming response | `POST /api/{uid}/chat` |
| **Coming Soon** | `/goals`, `/team`, `/activity` | v0 (placeholder) | Honest empty states, no backend calls | — |
| **App Shell** | — | v2 | Floating sidebar, nav groups, live status rail, theme toggle | — |
| **Task Row** | — | v2 | Checkbox, due chip (overdue tint), inline edit trigger, delete | — |
| **Task Tabs** | — | v1 | Filter tabs (All/Pending/Completed) | — |

---

## 7. FRONTEND — Lib / Utilities

| Module | Version | Purpose | Key Exports |
|--------|---------|---------|-------------|
| `lib/api.ts` | v2 | `secureFetch` with JWT injection, backend proxy rewrite | `secureFetch`, `API_BASE` |
| `lib/my-tasks.ts` | v1 | My Tasks view logic, empty state copy | `DEFAULT_MY_TASKS_FILTER`, `myTasksEmptyState()` |
| `lib/task-counts.ts` | v1 | Counts, completion %, overdue logic (shared by rail + dashboard) | `countTasks`, `completionPercent`, `isOverdue`, `countOverdue` |
| `lib/task-filter.ts` | v1 | `TaskFilter` type, filter logic | `TaskFilter`, `filterTasks` |
| `lib/auth.ts` | v1 | Better Auth client, session handling | `authClient`, `useSession` |
| `lib/agent-activity.ts` | v1 | Chatbot agent activity types | `AgentActivity`, `ToolCall` |

---

## 8. FRONTEND — Design System (Warm Canvas)

| Token / Component | Version | Notes |
|-------------------|---------|-------|
| `app/tokens.css` | v1 | Single source of truth for colors, spacing, radius, elevation |
| `app/globals.css` | v1 | `@theme inline` extending tokens, global focus ring |
| Color palette | v1 | Warm light default (`.dark` overrides all tokens) |
| Accent roles | v1 | `--color-accent` (graphic only), `--color-accent-strong` (text) |
| Typography | v1 | Inter (UI), Space Grotesk (display), JetBrains Mono (code) |

---

## 9. PLANNED / FROM SPECS (Not Yet Implemented)

| Feature | Phase | Spec Reference | Priority |
|---------|-------|----------------|----------|
| Task search by keyword | I | phase1-spec.md §4.22 | Medium |
| Task filter by tags (backend + frontend) | I | phase1-spec.md §4.23 | Medium |
| Task sort by priority/due date | I | phase1-spec.md §4.24 | Medium |
| Recurring tasks (Daily/Weekly/Monthly) | I | phase1-spec.md §5.28 | Low |
| Overdue highlighting (backend query) | I | phase1-spec.md §5.29 | Medium |
| Goals page | II | phase2-spec.md, phase3-spec.md | Low |
| Team page | II | phase2-spec.md, phase3-spec.md | Low |
| Activity page | II | phase2-spec.md, phase3-spec.md | Low |
| Goals v2: link goals ↔ tasks | II | — | Medium |
| Goals v3: categories/tags + target dates | II | — | Low |
| Goals v4: OKR key results/metrics | II | — | Low |
| Goals v5: parent/child hierarchy | II | — | Low |
| Helm/K8s deployment (Minikube) | IV | phase4-spec.md | High |
| Mobile app (React Native / Expo) | V | phase4-spec.md | Future |
| Global scale (CDN, edge, multi-region) | V | phase4-spec.md | Future |

---

## 10. VERSION HISTORY LOG (Recent First)

| Date | Version | Component | Change |
|------|---------|-----------|--------|
| 2026-10-14 | Backend v2 | Repository Layer | Added Task/Conversation/Message repositories; refactored all 5 Task endpoints + chat endpoint + all 5 MCP tools |
| 2026-10-14 | Backend v2 | External Seams | Documented Better Auth `user` table contract (`docs/external-seams.md`); added `user_stub.py`, `startup_checks.py`, integration tests |
| 2026-10-14 | Backend v2 | MessageRepository | Added `history(conv_id, uid, limit)` + `add_message(conv_id, uid, role, content)` — uses composite index |
| 2026-10-14 | Backend v2 | TaskRepository | Added `find_by_id_or_title(uid, str)` for MCP tools (UUID or title substring search) |
| 2026-10-13 | Frontend v2 | Dashboard/MyTasks | Complete redesign (warm-canvas): greeting, stats, agent panel, inline edit, status rail, overdue chips |
| 2026-10-13 | Frontend v1 | Auth | Better Auth integration: login, register, session, JWT plugin, middleware proxy |
| 2026-10-13 | Frontend v1 | Task Components | TaskForm, TaskEditForm, TaskRow, TaskTabs, TasksProvider (shared source) |
| 2026-10-12 | Backend v1 | MCP Server | Initial 5 tools (`add_task`, `list_tasks`, `complete_task`, `delete_task`, `update_task`) with direct `SessionLocal()` |
| 2026-10-11 | Backend v1 | FastAPI | CRUD endpoints with direct SQLAlchemy `db.query()`; JWT auth via Better Auth JWKS |
| 2026-10-10 | DB v1 | Migrations | 0001: tasks, conversations, messages tables + ENUMs + FKs to `user`; 0002: composite index on messages |
| 2026-10-09 | Phase I | CLI | In-memory TaskManager with priority, tags, recurrence, due dates, overdue tracking |

---

## 11. SUMMARY TABLE (Quick Reference)

| Layer | Current Version | Last Updated | Next Planned |
|-------|----------------|--------------|--------------|
| Database Schema | v2 | 2026-10-14 | GIN index on tags (when filtering added) |
| FastAPI Endpoints | v2 | 2026-10-14 | Tag filter query param |
| Repository Layer | v1 (new) | 2026-10-14 | — |
| MCP Tools | v2 | 2026-10-14 | — |
| Frontend Pages | v2 (Dashboard/MyTasks), v1 (others) | 2026-10-13 | Goals/Team/Activity (v1) |
| Frontend Libs | v1-v2 | 2026-10-13 | — |
| Design System | v1 | 2026-10-13 | — |
| Docker/Compose | v1 | 2026-10-12 | Helm/K8s (Phase IV) |
| External Seams | v1 (new) | 2026-10-14 | — |

---

## 12. NAMING CONVENTIONS

| Convention | Rule |
|------------|------|
| **Backend versions** | Increment when repository layer or endpoint signatures change (v1→v2 = repository intro) |
| **Frontend versions** | Increment per-page/component when UI/UX or data contract changes |
| **DB versions** | Match Alembic migration count (v1 = 0001, v2 = 0001+0002) |
| **v0** | Placeholder/stub only (Coming Soon pages) |
| **MCP versions** | Match backend endpoint versions they wrap |

---

## 13. HOW TO UPDATE THIS FILE

1. **Adding/modifying a feature:** Update its row, bump version, add entry to Version History Log (§10)
2. **New component/page created:** Add row to appropriate table (§6, §7)
3. **Spec changes:** Update Planned section (§9) — move to Implemented when done
4. **Database migration:** Update §1 table, increment version
5. **External seam changes:** Update `docs/external-seams.md` + this file

---

## 14. QUICK LOOKUP: "WHAT VERSION AM I ON?"

| Question | Answer |
|----------|--------|
| Backend API version? | **v2** (repository layer) |
| Database schema version? | **v2** (2 migrations applied) |
| MCP tools version? | **v2** (refactored to use repositories) |
| Dashboard UI version? | **v2** (warm-canvas redesign) |
| My Tasks UI version? | **v2** (inline edit, filter tabs) |
| Auth system version? | **v1** (Better Auth email/password) |
| Design system version? | **v1** (tokens.css + globals.css) |
| Containerization version? | **v1** (docker-compose only; Helm pending) |

---

> **Tip:** When in doubt, check the Version History Log (§10) — it's the ground truth.