# AGENTS.md

## Layout & project state

EVO-TODO is a multi-phase educational project. Do not mix phases:
- **`src/` root** = Phase I terminal CLI (`main.py`, `manager.py`, `models.py`) — keep working independently.
- **`src/backend/`** = Phase II FastAPI REST API (SQLAlchemy + PostgreSQL/Neon, JWT auth, Gemini chatbot via MCP).
- **`frontend/`** = Phase II Next.js 16 (App Router) client.

Constitution.md mandates spec-driven work ("Follow `specs/phase4-spec.md` exactly") — check `specs/` before building features.

## Commands

```bash
# Phase I CLI + tests
python src/main.py
python -m unittest discover -s tests -v          # CI runs this; no pytest

# Backend (run from src/backend/)
pip install -r requirements.txt
uvicorn main:app --reload                        # http://127.0.0.1:8000

# Frontend (run from frontend/)
npm install
npm run dev                                      # http://localhost:3000
npm run lint
npx tsc --noEmit                                 # typecheck (CI runs lint then tsc)
npm test                                         # vitest (CI runs after lint + tsc)
npm run build
```

`frontend/README.md` and `frontend/GEMINI.md` describe the frontend as shipped (warm-canvas design system, routes, commands); `package.json`/CI are still the authority for scripts.

## Backend (src/backend)

- **Backend tests**: `src/backend/` me pytest chalta hai, Phase I ke unittest ke alag. `python -m pytest` (integration marker deselect hota hai), `python -m pytest tests/test_bootability.py` — ye P0 gate hai, backend/MCP ka cold boot check karta hai. `user_stub.py` backend root par hai, `repositories/` me nahi — wahan se import karne se circular import ban jata hai.
- **Do test suite hain, dono alag CI job me.** `backend` job hermetic hai — koi DB nahi, `create_engine` lazy hai. `backend-integration` job PostgreSQL 16 + real Better Auth migration + `alembic upgrade head` chalata hai aur `pytest -m integration` — uske baad production image build karke `/health` bhi check karta hai. Full recipe `docs/backend-verification.md` me hai. **Hermetic test koi bhi claim nahi kar sakta ki kuch persist hua** — mocks repository ke *call* ko confirm karti hain, us write ko nahi jo ek millisecond baad rollback ho jaye. Yahi galti se `POST /tasks` 201 return karke kuch nahi likhta tha. Koi bhi test jo persistence ya tenancy claim kare, `tests/test_task_persistence.py` jaisa hona chahiye: fresh session se DB state padho, response body par bharosa mat karo.
- **`get_db` transaction boundary hai.** Commit on success, rollback on failure, close always. Routes ya repositories apna commit na karte — `SqlRepository.create/update/delete` sirf `flush()` karte hain. Kisi bhi route ko `.session` tak pahunchna hua to woh transaction ownership chura raha hai, aur `DELETE` ek waqt yahi karta tha: wahi akela route persist karta tha jabki `POST`/`PUT` chup-chaap kuch nahi likhte the.
- Schema is managed by **Alembic** (`src/backend/migrations/`). Run `alembic upgrade head` from `src/backend/` (or just start the Docker image, whose CMD does it) **before** the API can serve requests. After editing models: `alembic revision --autogenerate -m "..."` then `alembic upgrade head`. Do not re-add `Base.metadata.create_all` — it crashes on the `tasks.user_id -> user.id` FK because Better Auth's `user` table is not in our metadata.
- **Never delete or rename a migration that has been applied to a shared database** (issue #10). Doing so leaves `alembic_version` pointing at an id no code can resolve, and the backend container dies at boot with `Can't locate revision identified by '<id>'` — a failure whose cause is invisible in the repo, because the deleted file left no trace in git, on disk, or in any cache. Re-anchor with `UPDATE alembic_version SET version_num = '<revision>'` instead, where `<revision>` is the one whose schema the database actually has — **never stamp straight to head**, which skips whatever was never applied and fails silently. Two guards exist, and they catch different things: `test_bootability.py::test_alembic_chain_committed_here_is_sound` is hermetic and checks only the chain committed here (it cannot see a database pointer); `tests/test_migration_drift.py` is the one that catches this class and needs a live database — `pytest -m integration`.
- **Requires `DATABASE_URL`** (database.py:10 raises `RuntimeError` otherwise). Secrets come from env / `.env`, never hardcode.
- **Auth**: Better Auth (frontend) issues EdDSA JWTs fetched from `JWKS_URL` (`http://frontend:3000/api/auth/jwks` by default). Backend verifies via `PyJWKClient` (main.py:38). All `/api/{user_id}/...` routes are multi-tenant: they 403 if the token's `sub` != the URL `user_id`.
- **Chat turn outcome (`POST /api/{user_id}/chat`)** — tool calls MCP subprocess me chalti hain, apni alag transaction ke saath. Jo commit hua woh phase 2 khatam hone se pehle commit ho chuka hota hai, isliye rollback ka option hi nahi hai. Is liye route **jhooth nahi bolta**: `ChatResponse.outcome` (`completed` / `partial` / `failed`) batata hai ki actually kya hua, aur har tool call me `ok` flag. **Turn ke andar koi bhi failure 200 deta hai** — 5xx ka matlab hai "kuch nahi hua", jo tool commit kar chuke hone par galat hota hai aur blind retry duplicate banata hai. Phase 3 tabhi assistant message likhta hai jab kuch kehne ko ho, warna khali message history me noise banega. Poori matrix aur retry rules `docs/chat-failure-modes.md` me hain — retried karne se pehle wahi padho. Guarded by `tests/test_chat_outcome.py`.
- **Chat me `conversation_id` ke bina naya conversation banta hai** (issue #5). Pehle backend `get_latest_by_user` se pichli conversation resume kar deta tha, jisse frontend ka "New chat" button bilkul kaam hi nahi karta tha — `clearChat` id null karta hai, to agli message wapas abandoned thread me chali jaati thi. Ab resume karna client ki request hai: id bhejo to usi me jao, na bhejo to naya banao. Isi wajah se `get_latest_by_user` aur chat route ka advisory lock dono hataye gaye — unadorned request apni conversation banata hai, to create hone ki koi race nahi bachi. Guarded by `tests/test_conversation_lifecycle.py`.
- **Conversation listing (issue #13)** — `GET /api/{user_id}/conversations` latest-activity-first, aur `GET /api/{user_id}/conversations/{id}/messages` poori thread. **List `conversations.updated_at` se order mat karo** — us column ka `onupdate` laga hai par koi conversation row update nahi karta (messages use chhute nahi), to woh hamesha `created_at` ke barabar rehta hai aur threads "shuru hone ke order" me list honge, "use hue order" me nahi. Activity last *message* se aati hai. Empty thread list me dikhti hai (null preview) — use chhupane se lagta hai user ka kaam gum ho gaya.
- **Chat** (`POST /api/{user_id}/chat`) spawns `mcp_server.py` as a **stdio subprocess** (no port, no network service) and calls Gemini via OpenAI-compat endpoint; **requires `GEMINI_API_KEY`** — the client is built lazily, so a missing key returns 503 on this one route instead of killing the whole API at boot. Identity is **not** a tool argument: `main.py` passes the JWT-verified `user_id` to the child via the `MCP_USER_ID` env var and `mcp_server.build_server(user_id)` captures it in a closure, so no tool schema exposes `user_id` and a forged one in the arguments dict is dropped before the tool body runs. `build_server` raises `RuntimeError` if no identity is bound — there is no anonymous default. `stdio_client` does **not** inherit `DATABASE_URL`; `main.py` must pass it explicitly. Guarded by `src/backend/tests/test_mcp_authz.py` (a CI hard gate) — add a test there if you touch tool signatures or identity handling.

## Frontend (frontend/)

- **Read `frontend/AGENTS.md`**: this Next.js has breaking changes vs. older versions; consult `node_modules/next/dist/docs/` before writing code.
- **Auth**: Better Auth (`lib/auth.ts`) with email/password + JWT plugin. `frontend/proxy.ts` middleware redirects unauthenticated users to `/login`.
- **Backend calls**: client uses `secureFetch` (`lib/api.ts`) which injects the JWT Bearer token. API base is `/api/backend/...` on the client (rewritten in `next.config.ts`) and `INTERNAL_BACKEND_URL` server-side — don't hardcode the backend origin in components.
- **Design contract**: `design.md` (repo root) is locked and supersedes the old cold-indigo "quiet workbench" system (top rail, Inter/Space Grotesk/JetBrains Mono, no sidebar) — that system is gone from code and docs; don't reintroduce it. `frontend/app/tokens.css` is the single source of truth for values; extend `@theme inline` in `globals.css` too when adding a token.
- **Warm light is the default** (`next-themes` `defaultTheme="light"`); `.dark` in `tokens.css` overrides every colour + elevation token and is retained/switchable via the shell toggle and settings (Light / Dark / System).
- **Accent roles**: `--color-accent` is decorative/graphic only; accent *text* (including the "TODO" slice of the wordmark) uses `--color-accent-strong` — shared classes `.wordmark--accent` and `.accent-fill`, never per page.
- **Focus ring**: one global `:focus-visible` rule in `globals.css`. Never add `outline-none`/`outline-hidden` utilities — they outrank it via Tailwind's utilities layer and erase the ring. Guarded by `app/focus-ring.test.ts`.
- **Frontend tests**: `npm test` (vitest + jsdom, `vitest.config.mts`). `app/*.test.ts` hold the source-level design guards; `components/`/`lib/` tests cover behaviour. Prefer adding a guard test when a defect has shipped twice.

## Keep in sync when adding/enhancing a field

Per GEMINI.md, a single change touches all three: SQLAlchemy model (`src/backend/models.py`), Pydantic schema (`src/backend/models.py`), and `frontend/types/index.ts`.

## docker-compose

`docker-compose.yml` wires `auth-migrate` (one-shot) + backend (:8000) + frontend (:3000) with env from root `.env` (`DATABASE_URL`, `BETTER_AUTH_SECRET`, `GEMINI_API_KEY`). Backend default `JWKS_URL` points at `http://frontend:3000`.

`auth-migrate` runs `npx auth migrate --yes` from the frontend builder stage and must complete before the backend starts — the app tables have FKs into Better Auth's `user`. The backend CMD then runs `alembic upgrade head` before uvicorn.
