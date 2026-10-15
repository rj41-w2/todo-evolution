# Backend verification

Two kinds of backend test exist, and they answer different questions. Both run
in CI, in separate jobs, because one needs no database and the other cannot
exist without one.

| Job | Tests | Database | Answers |
|---|---|---|---|
| `backend` | `python -m pytest` | none | Does it import, start, and wire up correctly? |
| `backend-integration` | `python -m pytest -m integration` | PostgreSQL 16 | Does it actually work against a database? |

The split is not tidiness. `create_engine` is lazy and the tests that run
without a database never dialled the URL, so they cannot see anything about
persistence. That gap was expensive — see [Why the second job exists](#why-the-second-job-exists).

## The hermetic suite

```bash
cd src/backend
python -m pytest
```

No database, no network, no credentials. Includes the two hard gates:

- `tests/test_bootability.py` — cold-interpreter imports, MCP tool
  registration, container packaging, and the committed migration chain
- `tests/test_mcp_authz.py` — task tenancy at the MCP tool layer

Both were shown **red against the code they replaced** before being trusted.
A guard that has never been seen failing is a guess.

## The integration suite

```bash
cd src/backend
python -m pytest -m integration
```

Needs a real PostgreSQL with **both** schema sets applied, in this order:

```bash
# 1. Better Auth owns user, session, account, verification, jwks.
cd frontend
npm ci
DATABASE_URL=... BETTER_AUTH_SECRET=... BETTER_AUTH_URL=... npx auth migrate --yes

# 2. The application owns tasks, conversations, messages.
cd ../src/backend
DATABASE_URL=... alembic upgrade head

# 3. Now the tests can run.
DATABASE_URL=... CORS_ORIGINS=... python -m pytest -m integration
```

The order matters. Every application table declares a foreign key into
`user`, which PostgreSQL enforces whether or not a test wants it to.

With Docker, which is how CI does it:

```bash
docker run -d --name ci-pg -e POSTGRES_PASSWORD=ci -e POSTGRES_USER=ci \
  -e POSTGRES_DB=todorev -p 55432:5432 postgres:16
```

Use the **real** Better Auth migration rather than a hand-written SQL stand-in
for the `user` table. `tests/test_external_seams.py` exists to verify the
backend's assumptions about a table it does not own; verifying it against an
approximation of that table would be checking the approximation.

## Why the second job exists

`POST /api/{user_id}/tasks` answered **201 Created** and wrote nothing. `PUT`
answered **200** and changed nothing. Both had been that way since the
repository layer was introduced.

Every endpoint test passed throughout, because they hand the app a
`MagicMock(spec=TaskRepository)` and assert the repository was *called*:

```python
mock_repo.create.assert_called_once()
```

A mock confirms that just as happily about a write that is rolled back a
millisecond later. The cause was that `SqlRepository.create()` calls `flush()`
rather than `commit()`, and `get_db` closed its session without committing —
so closing the request rolled the transaction back.

`DELETE` survived only because that one route reached past the repository and
called `task_repo.session.commit()` by hand. That inconsistency was visible in
the code the whole time, and one of the stale tests was asserting it.

The fix made `get_db` own the transaction: commit on success, roll back on
failure, always close.

## What the integration tests assert

`tests/test_task_persistence.py` reads through a **fresh session** rather than
trusting the response body, because a response can lie and a second connection
to the database cannot:

- `POST`, `PUT` and `DELETE` each leave the database in the state they claim
- a rejected request (422) leaves no partial row
- a tenant hitting another tenant's URL gets 403
- a tenant holding a known task UUID, querying *their own* URL with it, gets
  404 — the lookup is scoped by user, so the row is never surfaced
- an unauthenticated request gets 401

`tests/test_external_seams.py` and `tests/test_migration_drift.py` check the
seams: that Better Auth's `user` table has the shape the backend assumes, and
that the database sits on a revision this repository actually knows about.

`tests/test_chat_failure.py` covers what a failed AI turn leaves behind:

- the user's message is still there — the route commits it before calling the
  model, so an outage costs the reply, not the input
- no assistant message is written for a turn that produced none
- the conversation still exists and a later successful turn joins it, rather
  than every outage silently splitting the user's history
- an unauthorized request writes nothing at all, not even the input

The first two were shown red against the pre-#12 code, where a failed turn
rolled the user's message back with everything else.

## Container startup

The integration job also builds the image the backend ships and runs it:

```bash
docker build -t todo-backend .
docker run -d -p 8000:8000 -e DATABASE_URL=... -e CORS_ORIGINS=... \
  -e GEMINI_API_KEY="" todo-backend
curl -sf http://localhost:8000/health
```

This covers the startup order (`alembic upgrade head` then uvicorn, as the
image's CMD does) and the packaging together — neither is reachable from a test
running against the source tree. `GEMINI_API_KEY` is deliberately empty: the
client is built lazily, so a missing key must not stop the other eleven routes
from serving.

## Adding an integration test

Mark it and say why it needs a database:

```python
pytestmark = pytest.mark.integration
```

If it does not need a database, do not mark it. The `backend` job stays fast
only because its tests are honest about what they exercise, and an
integration mark that does not need one taxes every future run for nothing.