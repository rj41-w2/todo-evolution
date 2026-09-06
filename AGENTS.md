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
npm run build
```

`frontend/README.md` and `GEMINI.md` are stale (backed Next.js/CRA-style boilerplate). Trust `package.json`/CI above them.

## Backend (src/backend)

- Importing `main.py` runs `Base.metadata.create_all(bind=engine)` (main.py:23) — **no Alembic/migrations** (`migrations/` is empty). Schema changes happen by editing models + recreating tables.
- **Requires `DATABASE_URL`** (database.py:10 raises `RuntimeError` otherwise). Secrets come from env / `.env`, never hardcode.
- **Auth**: Better Auth (frontend) issues EdDSA JWTs fetched from `JWKS_URL` (`http://frontend:3000/api/auth/jwks` by default). Backend verifies via `PyJWKClient` (main.py:38). All `/api/{user_id}/...` routes are multi-tenant: they 403 if the token's `sub` != the URL `user_id`.
- **Chat** (`POST /api/{user_id}/chat`) spawns `mcp_server.py` as a stdio subprocess and calls Gemini via OpenAI-compat endpoint; requires `GEMINI_API_KEY`. Server injects `user_id` into tool args — don't trust client-supplied `user_id`.

## Frontend (frontend/)

- **Read `frontend/AGENTS.md`**: this Next.js has breaking changes vs. older versions; consult `node_modules/next/dist/docs/` before writing code.
- **Auth**: Better Auth (`lib/auth.ts`) with email/password + JWT plugin. `frontend/proxy.ts` middleware redirects unauthenticated users to `/login`.
- **Backend calls**: client uses `secureFetch` (`lib/api.ts`) which injects the JWT Bearer token. API base is `/api/backend/...` on the client (rewritten in `next.config.ts`) and `INTERNAL_BACKEND_URL` server-side — don't hardcode the backend origin in components.

## Keep in sync when adding/enhancing a field

Per GEMINI.md, a single change touches all three: SQLAlchemy model (`src/backend/models.py`), Pydantic schema (`src/backend/models.py`), and `frontend/types/index.ts`.

## docker-compose

`docker-compose.yml` wires backend (:8000) + frontend (:3000) with env from root `.env` (`DATABASE_URL`, `BETTER_AUTH_SECRET`, `GEMINI_API_KEY`). Backend default `JWKS_URL` points at `http://frontend:3000`.
