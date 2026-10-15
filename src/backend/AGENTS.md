# AGENTS.md — backend (`src/backend/`)

The file-level companion to the backend section in the root `AGENTS.md`. Root
covers project shape and commands; this covers the traps that are specific to
this directory. Read the root one first — it is not repeated here.

## Layout

Flat imports, so `src/backend` itself must be on `sys.path` (`conftest.py` does
it). Nothing is a package.

```
main.py            FastAPI app + the chat route (the largest file here)
models.py          SQLAlchemy models and Pydantic schemas, both
database.py        engine, SessionLocal, get_db — the transaction boundary
mcp_server.py      MCP tools, built by build_server(user_id)
repositories/      narrow Protocols + SQLAlchemy implementations
migrations/        Alembic; versions/ holds the chain
user_stub.py       Better Auth's `user` table, registered so FKs resolve
startup_checks.py  dead code — see issue #11, nothing calls it
```

## Running it

```bash
python -m pytest                      # hermetic: no database
python -m pytest -m integration       # needs a real PostgreSQL
python -m pytest tests/test_bootability.py    # CI hard gate
alembic upgrade head
```

Integration tests need **both** schema sets, Better Auth's first:

```bash
cd frontend && DATABASE_URL=... npx auth migrate --yes
cd ../src/backend && DATABASE_URL=... alembic upgrade head
```

`docs/backend-verification.md` has the full recipe.

## Traps

**`get_db` owns the transaction.** Commit on success, rollback on failure, close
always. `SqlRepository.create/update/delete` only `flush()`. If a route needs a
commit, the bug is upstream — reaching for `task_repo.session` is the escape
that let `DELETE` persist while `POST` and `PUT` answered 201 and 200 and wrote
nothing.

**`ChatRequest.message` has no conversation id means "start a new
conversation".** Not "resume the latest" — that is what made "New chat"
impossible. Resuming is something the client asks for by sending one.

**Never hold a database session across an LLM call.** Neon is reached through
the pooler, which reclaims idle connections. The chat route is three phases —
short session, no session, short session — for this reason. A regression here
surfaces as `SSL connection has been closed unexpectedly` on the *final* write,
long after the tool that already committed its work has succeeded.

**A failing tool does not raise.** `call_tool` returns `isError=True` with a
plain sentence, not JSON. Feeding that to `json.loads` turns every "task not
found" into a 500 that claims the service is down. Check `isError` first.

**A chat turn's status code does not say what happened.** Everything inside a
turn is a 200; `ChatResponse.outcome` (`completed` / `partial` / `failed`) and
`tool_calls[].ok` carry the truth. Neither is persisted — the database stores
only `messages.role` and `messages.content`, not the outcome or the tool calls.

**`datetime` must be `DateTime(timezone=True)`.** Plain `DateTime` maps to
`timestamp without time zone`, the UTC offset is dropped, and the API returns a
string with no `Z` — which JavaScript reads as *local* time. Every overdue check
was out by the reader's offset.

**A Pydantic schema may only name classes defined above it.** The dev box runs
Python 3.14, the image runs 3.10. 3.14 implements PEP 649, so annotations are
deferred and a forward reference silently works locally; on 3.10 the same
expression is evaluated while the class body executes and the app dies at import
with a `NameError` that never appears locally. `TaskListResponse` did exactly
this. Only the container runs catch it — which is why `backend-integration`
builds the production image rather than trusting a passing local suite.

**Migrations pin `SET LOCAL TimeZone = 'UTC'`** in both directions.
`timestamp` ↔ `timestamptz` conversion is interpreted at the *session* timezone,
so on a server not set to UTC every timestamp shifts silently.

**Never delete or rename a migration already applied to a shared database.**
Re-anchor with `UPDATE alembic_version`; `alembic stamp` does not work in an
orphaned state because it resolves the current revision first.

**Identity is not an argument.** `main.py` passes the JWT-verified `user_id`
through `MCP_USER_ID` and `mcp_server.build_server(user_id)` captures it in a
closure. `stdio_client` does not inherit `DATABASE_URL`; pass it explicitly.

**A mock cannot prove persistence.** The endpoint tests hand the app a
`MagicMock(spec=TaskRepository)` and assert the repository was *called*, which
a mock confirms just as happily about a write rolled back a millisecond later.
Anything claiming a row exists must read it back through a fresh session.

## Guards

| File | Claims | Needs a DB? |
|---|---|---|
| `test_bootability.py` | cold imports, tool registration, packaging, migration chain renders both ways | no |
| `test_mcp_authz.py` | task tenancy at the tool layer | no |
| `test_task_persistence.py` | writes actually persist; cross-tenant 403/404 | yes |
| `test_chat_outcome.py` | a turn reports what it actually did | yes |
| `test_conversation_lifecycle.py` | new chat is new; resume appends; concurrency holds identity | yes |
| `test_persistence_invariants.py` | the database refuses what it should | yes |
| `test_conversation_listing.py` | conversations are findable and owner-scoped | yes |
| `test_retrieval_scaling.py` | task reads are ordered, bounded, paged, and index-served | yes |
| `test_migration_drift.py` | the database sits on a revision this repo knows | yes |

Each was written to fail against the code it replaced before being trusted. A
guard that has never been seen failing is a guess — when adding one, run it
against `HEAD` first.

## Adding a field

A single change touches three files, and they drift apart silently if you miss
one: the SQLAlchemy model and Pydantic schema (`models.py`), a migration, and
`frontend/types/index.ts`. A column with only an ORM default protects nothing —
a write that bypasses the ORM writes NULL, which is how `status` ended up
nullable while the code assumed otherwise.