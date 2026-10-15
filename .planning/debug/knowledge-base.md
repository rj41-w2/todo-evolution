# Debug knowledge base

Patterns that cost real debugging time here, recorded so the next occurrence is
recognised rather than re-diagnosed. Entries name the failure mode as it was
actually observed — the symptom first, because the symptom is what you meet.

---

## A green boot gate proves the repo is self-consistent, not that the database agrees

**Observed:** the backend container exited 255 on `Can't locate revision
identified by '351b75580900'`. `tests/test_bootability.py` — which includes
`alembic upgrade head --sql` — was green.

**Why:** the offline render checks the chain *committed here*. The database's
`alembic_version` pointed at an id the repo had never contained, so the repo
had nothing to be inconsistent with. The deleted migration left no trace in
git, on disk, in a stash, in the reflog, or in a `__pycache__`.

**Prevention:**
- A database-pointer problem needs a test that opens the database. `tests/test_migration_drift.py`
  is that test; `test_bootability.py::test_alembic_chain_committed_here_is_sound` is not, and
  says so in its own docstring.
- Never delete or rename a migration already applied to a shared database.
- **`alembic stamp` does not work in an orphaned state.** It resolves the
  current revision before writing the new one, so it fails with the same error
  being fixed. Update `alembic_version` directly.
- **Never stamp to head** to clear an orphan. It silently skips whatever the
  database never applied. Re-anchor to the revision whose schema the database
  actually has, after proving it — diff the live schema against that revision
  applied to a scratch database — then `upgrade head`.
- Verify by diff, not by eye: apply the revision to a scratch database and
  compare columns, indexes, foreign keys and enums. On Neon all four can be
  compared in one query.

---

## Container logs outlive the container that wrote them

**Observed:** after the migration fix, `docker compose logs backend` still
grepped `Can't locate revision`. The backend was healthy and `/health` returned
200. Chasing this cost a detour into "why is it still broken".

**Prevention:** before believing a log line, compare its timestamp against
`docker inspect --format '{{.State.StartedAt}}'`. Errors from before the current
container started are ghosts.

---

## A connection pooler will take a connection that is only waiting

**Observed:** chat returned 500 with `SSL connection has been closed
unexpectedly` — *after* the tool had created the task and Gemini had written its
reply. The task persisted; the reply was discarded.

**Why:** Neon is reached through the pooler. The chat route held one
dependency-injected session across two LLM calls, so the connection sat idle
inside an open transaction long enough to be reclaimed. A `GET /tasks` from the
same configuration took 2.7s and returned 200 — only the request that waited on
the network died.

**Prevention:**
- A session acquired by dependency injection is held for the route's lifetime
  by definition. That is the bug in miniature. Do slow work in phases with short
  sessions, and never hold one across an external call.
- Commit early. The user's message now commits before the LLM runs, so an LLM
  failure no longer erases it.
- When a failure's error names a subsystem, verify the subsystem. An SSL error
  is not evidence of an SSL problem.

---

## Model ids rot, and being listed is not being reachable

**Observed:** every chat request 500'd with `404 — models/gemini-1.5-flash-latest
is not found`. Replacing it with `gemini-flash-latest` made things worse: `503
high demand`, on every attempt. `gemini-2.5-flash` appeared in the v1beta models
list and still 404'd.

**Prevention:**
- Model ids belong in configuration, not in two hardcoded call sites.
- To pick a replacement, send a real request with a real tool-calling payload to
  the candidates. Six probes took seconds. Two of the plausible answers were
  wrong, so guessing was not an option.
- `generateContent` support in the models endpoint does not imply availability
  through the OpenAI-compatibility endpoint. They differ.

---

## CI cannot see what needs a live key, a live database, or a real pooler

**Observed:** three separate defects (retired model, pooler connection lifetime,
orphaned migration) all reached the deployed stack while every CI job was green.
The backend job has no PostgreSQL service and every test is hermetic.

**Prevention:**
- When a defect only reproduces against real infrastructure, the guard must
  assert the *structural property* that prevents it, in a hermetic test, and say
  in its docstring what it cannot see.
- Show a guard red against the previous code before trusting it green. Each of
  the three guards here was: 19 failed → 19 passed for the tenancy fix, a
  deliberate orphan stamp for the migration fix, one connection held across the
  LLM call for the session fix.
- A test that passes on a developer machine and fails on a clean checkout is
  worse than no test. `test_chat_session_scope.py` sets `GEMINI_API_KEY` itself
  for exactly this reason.

---

## A test that proves nothing must say so

**Observed:** a guard asserted "zero sessions open during the LLM call". It was
green while the fake LLM client was never reached at all — the route had failed
earlier, so the count was vacuously zero.

**Prevention:** if the probe that makes a test meaningful was never reached, the
test must fail and name the real cause. `test_chat_session_scope.py` asserts the
probe ran and surfaces the route's log when it did not.