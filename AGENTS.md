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

- **Backend tests**: `src/backend/` me pytest chalta hai, Phase I ke unittest ke alag. `python -m pytest` (integration marker deselect hota hai), `python -m pytest tests/test_bootability.py` — ye P0 gate hai, backend/MCP ka cold boot check karta hai. CI me `backend` job yehi chalata hai. `user_stub.py` backend root par hai, `repositories/` me nahi — wahan se import karne se circular import ban jata hai.
- Schema is managed by **Alembic** (`src/backend/migrations/`). Run `alembic upgrade head` from `src/backend/` (or just start the Docker image, whose CMD does it) **before** the API can serve requests. After editing models: `alembic revision --autogenerate -m "..."` then `alembic upgrade head`. Do not re-add `Base.metadata.create_all` — it crashes on the `tasks.user_id -> user.id` FK because Better Auth's `user` table is not in our metadata.
- **Requires `DATABASE_URL`** (database.py:10 raises `RuntimeError` otherwise). Secrets come from env / `.env`, never hardcode.
- **Auth**: Better Auth (frontend) issues EdDSA JWTs fetched from `JWKS_URL` (`http://frontend:3000/api/auth/jwks` by default). Backend verifies via `PyJWKClient` (main.py:38). All `/api/{user_id}/...` routes are multi-tenant: they 403 if the token's `sub` != the URL `user_id`.
- **Chat** (`POST /api/{user_id}/chat`) spawns `mcp_server.py` as a stdio subprocess and calls Gemini via OpenAI-compat endpoint; **requires `GEMINI_API_KEY`** — the client is built lazily, so a missing key returns 503 on this one route instead of killing the whole API at boot. Server injects `user_id` into tool args — don't trust client-supplied `user_id`.

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
