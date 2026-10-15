---
status: resolved
trigger: "https://github.com/rj41-w2/todo-evolution/issues/1"
created: 2026-10-15
updated: 2026-10-15
---

# Debug Session: backend-mcp-bootability

## Symptoms

- **Expected:** `import main` and `import mcp_server` both succeed; backend test command runs and passes; MCP container starts.
- **Actual:** Both raise `ImportError: cannot import name 'Conversation' from partially initialized module 'models'`. All 4 backend test modules error on import. MCP container would `ModuleNotFoundError` on `repositories`.
- **Error messages:** See tracebacks reproduced below.
- **Timeline:** Introduced by `b7c3f45` (repository layer refactor), left latent/masked by `471f24c` (external seam checks). Never caught by CI because `ci.yml` runs no backend job.
- **Reproduction:**
  ```
  cd src/backend && python -c "import main"
  cd src/backend && python -c "import mcp_server"
  cd src/backend && python -m unittest discover -s tests -v
  ```

## Root Cause

Three independent defects, stacked:

1. **Circular import (primary).** `models.py:13` did `from repositories.user_stub import user`. Importing the `repositories.user_stub` submodule executes `repositories/__init__.py`, which eagerly re-exports the repository implementations. `conversation_repository.py:8` then does `from models import Conversation` against a partially-initialized `models` module → ImportError. This is a layer inversion: `repositories` depends on `models`, so `models` must never depend on `repositories`.

2. **Missing name binding (masked by #1).** `repositories/user_stub.py` calls `Table("user", Base.metadata, ...)` without assigning the result, so the name `user` never exists in that module. `from repositories.user_stub import user` fails independently of the cycle. Only surfaced after breaking the cycle.

3. **MCP container incomplete.** `Dockerfile.mcp` copies only `mcp_server.py`, `models.py`, `database.py`. `mcp_server.py:9` imports `repositories`, which is absent from the image → `ModuleNotFoundError` at container start.

4. **API could not boot without an LLM key** (found during container verification, not visible locally because `src/backend/.env` masks it). `main.py` constructed `openai.AsyncOpenAI(api_key=os.getenv("GEMINI_API_KEY"))` at module level. The OpenAI SDK raises when `api_key` is None, so a missing `GEMINI_API_KEY` killed the entire API — including task CRUD, which needs no key — with a misleading "set OPENAI_API_KEY" error. Chat is one endpoint; it should not gate the other eleven.

Additionally: `ci.yml` has no backend job, and all backend tests are pytest-style (0 `unittest.TestCase` classes), so `unittest discover -s src/backend/tests` reports "Ran 0 tests" — a green-but-vacuous gate. And `Dockerfile` ran `COPY . .` with no `.dockerignore`, baking a real `.env` (plaintext `DATABASE_URL`, `BETTER_AUTH_SECRET`, `GEMINI_API_KEY`) plus two virtualenvs into the backend image.

## Evidence

- timestamp: 2026-10-15 — `cd src/backend && .venv/bin/python -c "import main"` → ImportError chain `main.py:22 → models.py:13 → repositories/__init__.py:4 → conversation_repository.py:8`.
- timestamp: 2026-10-15 — Same failure via `import mcp_server` (`mcp_server.py:8 → models.py:13`).
- timestamp: 2026-10-15 — `unittest discover -s tests -v` → `Ran 4 tests ... FAILED (errors=4)`.
- timestamp: 2026-10-15 — Sandbox `/tmp/opencode/fixA` (lazy `repositories/__init__.py`) surfaced the second bug: `ImportError: cannot import name 'user' from 'repositories.user_stub'`.
- timestamp: 2026-10-15 — Sandbox `/tmp/opencode/fixA` + module-form import → `models OK; tables=['conversations','messages','tasks','user']`, `main OK routes=12`, `mcp_server OK`.
- timestamp: 2026-10-15 — Sandbox `/tmp/opencode/fixB` (stub moved to backend root) → same results, plus `alembic upgrade head --sql` generates DDL offline.
- timestamp: 2026-10-15 — Grep: `Dockerfile.mcp` lacks `repositories/`; `mcp_server.py:9` requires it.
- timestamp: 2026-10-15 — `ci.yml` jobs = `python` (root `tests/`) and `frontend` only. No backend job.
- timestamp: 2026-10-15 — For each `src/backend/tests/*.py`: `TestCase` classes = 0, module-level `def test_*` present. `unittest discover` collects 0.
- timestamp: 2026-10-15 — `pytest tests -q` (sandbox, after cycle fix) → `15 failed, 5 passed`. Failures are stale auth mocks (401) and integration tests needing a real DB — out of scope for this issue.

## Eliminated

- hypothesis: Missing runtime dependency in `requirements.txt`. — Eliminated: every import that fails is a first-party module cycle; all third-party imports resolve.
- hypothesis: Python version incompatibility. — Eliminated: failure is identical on 3.10 and 3.12; `str | None` (PEP 604) is valid on 3.10+.
- hypothesis: Missing `DATABASE_URL` causes the import failure. — Eliminated: reproduced with a valid dummy `DATABASE_URL` set.
- hypothesis: Alembic migration chain is broken. — Eliminated: `0001 → 0002` chain is intact and generates DDL offline.

## Fix

Applied Option B (stub moved out of the data-access layer), per user decision:

1. `src/backend/tests/test_bootability.py` — hermetic boot smoke test (written first, fails pre-fix).
2. `git mv src/backend/repositories/user_stub.py src/backend/user_stub.py`; update `models.py:13` and `migrations/env.py:33` to module-form import; update doc references.
3. `Dockerfile.mcp` — copy `repositories/` and `user_stub.py`; align base image to `python:3.10-slim`.
4. `.dockerignore` — stop baking `.env`, `.venv`, `__pycache__` into the image.
5. `ci.yml` — add `backend` job; `src/backend/pytest.ini` — register `integration` marker, deselect it by default.
6. `main.py` — OpenAI client built lazily via `get_openai_client()`; chat returns 503 with a clear message when `GEMINI_API_KEY` is unset, instead of the process dying at import.

## Verification

Bootability test was written first and failed 7/7 before the fix, 8/8 after.

### First CI run caught a real gap

The first push of the gate went **red**. `conftest.py` supplied only
`DATABASE_URL`, so on a clean checkout `import main` hit `main.py:65` →
`RuntimeError: CORS_ORIGINS must be configured`. Every local run had passed
because `src/backend/.env` supplies `CORS_ORIGINS`, and that file is not
tracked. This is precisely the failure mode the new CI job exists to catch —
the gate worked on its first outing.

`conftest.py` now supplies both variables the backend needs to import. The
fail-fast checks in `database.py` and `main.py` are left intact; only the test
environment is populated. Verified against a clean `git archive` checkout with
no `.env`, on Python 3.10, before re-pushing.

- [x] `cd src/backend && python -c "import main, mcp_server"` → `BOOT OK — routes: 12 | mcp tools: 5`
- [x] `python -m pytest tests/test_bootability.py -q` → `8 passed`
- [x] Clean checkout (no `.env`), Python 3.10, CI commands verbatim → `8 passed`
- [x] `python -m pytest -q` (full backend) → `10 failed, 13 passed, 5 deselected` — the 10 are pre-existing auth-stub failures, unchanged in count and out of scope (tracked as issue #9)
- [x] Phase I `python -m unittest discover -s tests` → `Ran 3 tests ... OK` (untouched)
- [x] `alembic upgrade head --sql` renders DDL offline; revision chain `0001 → 0002` intact
- [x] `docker compose build` → all four images built (backend, mcp, frontend, auth-migrate)
- [x] `docker run todo-evolution-mcp python -c "import mcp_server"` → `OK | tools: 5`
- [x] `docker run todo-evolution-backend python -c "import main"` (no `GEMINI_API_KEY`) → `OK | routes: 12`
- [x] `docker run todo-evolution-backend python -c "import main"` (full env) → `OK | routes: 12`
- [x] MCP container live SSE handshake → `HTTP 200`, `text/event-stream`, `event: endpoint` with session id
- [x] Neither image contains `.env`, `.venv` or `venv`
- [ ] `docker compose up` end-to-end against Neon (`alembic upgrade head` on a real database, backend↔MCP integration, frontend) — NOT RUN: would mutate the live Neon database, so left to the owner.

## Out of Scope (follow-up needed)

10 backend tests fail for a reason unrelated to bootability: they override
`get_task_repo` but never `get_current_user`, so the real EdDSA/JWKS
verification rejects their fake token with 401. They predate the auth work in
`4f6ded7`.

- `tests/test_task_crud.py` — 5 failures
- `tests/test_task_repository.py` — 3 failures
- `tests/test_message_repository.py` — 2 failures

CI runs these with `continue-on-error: true` so the P0 boot gate stays hard while
the baseline remains visible. Fix: add
`app.dependency_overrides[get_current_user] = lambda: "test-user"`, then drop the
flag.

## Files Changed

- `src/backend/tests/test_bootability.py` (new)
- `src/backend/tests/conftest.py` (new)
- `src/backend/user_stub.py` (moved from `repositories/user_stub.py`)
- `src/backend/models.py`
- `src/backend/migrations/env.py`
- `src/backend/Dockerfile.mcp`
- `src/backend/.dockerignore` (new)
- `src/backend/pytest.ini` (new)
- `src/backend/requirements-dev.txt` (new)
- `.github/workflows/ci.yml`
- `docs/external-seams.md`
- `AGENTS.md`
