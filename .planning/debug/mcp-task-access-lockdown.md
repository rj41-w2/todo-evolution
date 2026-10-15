---
status: awaiting_human_verify
trigger: "[P0] Lock down MCP task access — MCP publishes 8001:8001 to host with no auth and every tool takes user_id as a caller-supplied argument"
created: 2026-10-15
updated: 2026-10-15
---

# Debug Session: mcp-task-access-lockdown

## Symptoms

- **Expected:** Task tools are reachable only through an authenticated backend execution path. No network caller can select another user identity or read/mutate another tenant's tasks. (Issue #2, AC-1/2/3.)
- **Actual:** The MCP SSE service publishes `8001:8001` on the host and binds `0.0.0.0` with no authentication. All five tools take `user_id` as their first caller-supplied argument, so any caller chooses its own identity.
- **Error messages:** None. There is no exception and no denial — the defect is the *absence* of a denial. `POST /api/{user_id}/tasks` et al. correctly 403 on `sub != user_id` (`main.py:150, 169, 185, 203, 225, 248`), which makes the unguarded MCP path the sole hole in an otherwise multi-tenant-correct API.
- **Timeline:** The SSE service arrived with `4f6ded7` ("Architectural issues — ... persistent MCP"), which converted the stdio subprocess the project originally shipped into a long-lived SSE service. The `user_id`-as-tool-argument pattern predates it. Never caught because no authorization test exists and `ci.yml`'s hard backend gate covers only `tests/test_bootability.py`.
- **Reproduction:**
  ```
  docker compose up
  # from any host that can reach the deployment host on 8001:
  #   connect to http://<host>:8001/sse, initialize, then call
  #   list_tasks  arguments={"user_id": "<victim-id>"}   -> victim's tasks
  #   delete_task arguments={"user_id": "<victim-id>", "task_id": "<id>"}
  # No token, no JWT, no header required.
  ```

## Root Cause (hypothesis)

Two independent, stacked defects — each of which alone defeats AC-1 or AC-2:

1. **The tool service is published to the host with no authentication.**
   `docker-compose.yml:42-43` maps `8001:8001`; `mcp_server.py:269` runs
   `uvicorn.run(starlette_app, host="0.0.0.0", port=8001)`. The Starlette app
   built at `mcp_server.py:252-267` has exactly two routes, `/sse` and
   `/messages/`, and neither inspects a credential. Publishing the port is what
   makes this exploitable rather than merely unhardened.

2. **Identity is tool *data*, not trusted server *context*.**
   Every tool signature begins with `user_id: str` (`mcp_server.py:27, 82, 132,
   161, 189`). `main.py:362` (`tool_args["user_id"] = user_id`) overwrites
   whatever the model supplied, which is correct for the Gemini path — but it
   is a *client-side convention*, and it is the only thing enforcing tenancy at
   the tool layer. Any caller that is not `main.py` passes its own `user_id`
   and the repository happily scopes to it.

The repository layer is **not** at fault and must not change:
`repositories/task_repository.py` filters every read (`list_by_user:47`,
`get_by_id_and_user:57`) and every mutation's lookup (`find_by_id_or_title:73, 83`)
by `user_id`. Given a trustworthy identity it cannot cross tenants. The only
missing piece is a trustworthy *source* for that identity.

Secondary drift worth recording: `README.md:61` and `AGENTS.md:40` both already
describe the chat path as spawning `mcp_server.py` as a **stdio subprocess**.
That is MCP's native shape and it matches the project's documented intent — the
SSE service is undocumented drift, and the fix restores the documented design
rather than inventing a new one.

## Evidence

- timestamp: 2026-10-15 — `docker-compose.yml:42-43` → `ports: - "8001:8001"` on the `mcp` service; no `expose`, no network restriction beyond the default bridge.
- timestamp: 2026-10-15 — `mcp_server.py:269` → `uvicorn.run(starlette_app, host="0.0.0.0", port=8001)`; `MCP_TRANSPORT=sse` set at `docker-compose.yml:46`.
- timestamp: 2026-10-15 — `mcp_server.py:252-267` → Starlette app registers only `/sse` and `/messages/`; no auth dependency, no middleware, no token check anywhere in the file.
- timestamp: 2026-10-15 — Tool signatures `user_id: str` at `mcp_server.py:27` (add_task), `:82` (list_tasks), `:132` (complete_task), `:161` (delete_task), `:189` (update_task).
- timestamp: 2026-10-15 — `main.py:318` → `mcp_server_url = os.getenv("MCP_SERVER_URL", "http://mcp:8001/sse")`; `:321` → `async with sse_client(mcp_server_url)`. No credentials passed to the MCP connection at all, because the server asks for none.
- timestamp: 2026-10-15 — `main.py:338-343` strips `user_id` from the schema shown to Gemini, and `:362` re-injects it. Both are client-side; neither constrains a direct SSE caller.
- timestamp: 2026-10-15 — Repository scoping is already correct: `task_repository.py:47, 57, 73, 83` all filter on `Task.user_id == user_id`.
- timestamp: 2026-10-15 — REST surface is already correct: `main.py:150, 169, 185, 203, 225, 248` each raise 403 when `authenticated_user_id != user_id`.
- timestamp: 2026-10-15 — `tests/test_mcp_tools.py` is 3 mocked tests of `find_by_id_or_title`; no test asserts cross-tenant denial at the tool layer. AC-3 unproven.
- timestamp: 2026-10-15 — `ci.yml` backend job hard-gates only `python -m pytest tests/test_bootability.py`; the full suite runs with `continue-on-error: true` (10 known failures, issue #9).
- timestamp: 2026-10-15 — `README.md:61` (`mcp_server.py # MCP tool definitions (stdio)`) and `AGENTS.md:40` ("spawns `mcp_server.py` as a stdio subprocess") document stdio, contradicting the shipped SSE service.

- timestamp: 2026-10-15 — VERIFICATION PASS (agent re-read every cited site; all 11 pre-filled items confirmed). One correction: the six 403 sites in `main.py` are at lines `152, 171, 186, 205, 228, 250` (the `status_code=` lines), not `150, 169, 185, 203, 225, 248`. Sites correct; line numbers off by two.
- timestamp: 2026-10-15 — `mcp_server.py:242-244` → the `__main__` block reads `transport = os.getenv("MCP_TRANSPORT", "stdio")`; the stdio branch (`mcp.run()`, line 271) already existed. `docker-compose.yml:46` sets `MCP_TRANSPORT=sse` from outside. stdio was never deleted — it was overridden by an env var. The fix is removing the override, not rebuilding a transport.
- timestamp: 2026-10-15 — `mcp` is pinned `mcp<2`; resolved version `1.30.0`. `mcp.StdioServerParameters` and `mcp.client.stdio.stdio_client(server, errlog=sys.stderr)` are both importable, so the stdio swap needs no new dependency and no requirements change.
- timestamp: 2026-10-15 — `src/backend/Dockerfile:24` already does `COPY . .`, so the backend image already ships `mcp_server.py`, `models.py`, `database.py`, `user_stub.py`, `repositories/`. Deleting `Dockerfile.mcp` removes no runtime asset the backend needs — confirming `test_bootability.py:110-119` guards an artifact that is about to be deleted, not a live import path.
- timestamp: 2026-10-15 — `src/backend/tests/test_mcp_tools.py` contains exactly 3 tests, all against `find_by_id_or_title` with a mocked repository. None builds a server, none crosses a tenant boundary. AC-3 was unproven, not merely unasserted — there is no scaffolding to extend.

- timestamp: 2026-10-15 — RED CONFIRMED. `tests/test_mcp_authz.py` written first, run against the UNFIXED tree: **16 failed, 0 passed**. No production code had been touched at that point. The 12 tests named in the issue plan are a subset of these 16.
- timestamp: 2026-10-15 — FALSIFICATION TEST PASSED (hypothesis confirmed by observation, not inference). A throwaway probe drove the *current, unfixed* tools through the real FastMCP dispatch path against a real SQLite database with real `SqlTaskRepository`. Three results: (1) a caller with **no identity of its own** invoked `list_tasks(user_id="bob-tenant-id")` and received Bob's task verbatim; (2) `delete_task(user_id="bob-tenant-id", task_id=<bob's real uuid>)` returned `{"status": "deleted", "title": "Bob private task"}`; (3) the task table afterwards contained only Alice's row. A caller-chosen identity demonstrably reached the database. Defect 2 is real, not theoretical.
- timestamp: 2026-10-15 — `mcp.client.stdio.stdio_client` merges its `env=` argument OVER `get_default_environment()` (`stdio_client` source: `env=({**get_default_environment(), **server.env} if server.env is not None else get_default_environment())`), and `DEFAULT_INHERITED_ENV_VARS` resolves to exactly `['HOME','LOGNAME','PATH','SHELL','TERM','USER']`. `DATABASE_URL` is therefore **not** inherited — `main.py` must pass it explicitly or the child dies at `database.py:10` and the chat route 500s. This was blind spot #2 in the reasoning checkpoint; it is now closed.
- timestamp: 2026-10-15 — `FuncMetadata.call_fn_with_arg_validation` validates arguments against `arg_model` (pydantic, `extra` unset → defaults to `ignore`) and then calls `fn(**model_dump_one_level())`. Probed on a closure-built tool: passing an undeclared `user_id` is **silently dropped before the function body is entered**, and the call proceeds against the bound identity. So "forged `user_id` is inert" is provable behaviourally — the result is still the bound tenant's data — not merely by asserting the schema lacks the key.
- timestamp: 2026-10-15 — `mcp` 1.30.0 `ToolManager.list_tools()` returns `Tool` objects exposing `.parameters` (a JSON-Schema dict); `.inputSchema` does not exist on the object. Test helpers introspect `.parameters`. `Tool.run(arguments, convert_result=True)` returns a **tuple** `(content_blocks, structured)`, not a str — helpers unwrap `result[0][0].text`. Caught by running the tests before the fix rather than after.

## Eliminated

- hypothesis: "The repository layer is the hole — a task lookup can cross tenants."
  evidence: Read `repositories/task_repository.py` in full. `list_by_user:47`, `get_by_id_and_user:57`, and both branches of `find_by_id_or_title:73, 83` filter on `Task.user_id == user_id`. No path in the repository returns another tenant's row. Given a trustworthy identity it cannot cross tenants; the defect is upstream in where that identity comes from.
  timestamp: 2026-10-15
- hypothesis: "Only the published port needs removing; the tool signatures are harmless."
  evidence: Falsified by construction. Keeping `user_id` in the signature while removing SSE still leaves identity as caller-supplied data — any future transport, or a regression in `main.py:362`, re-opens AC-2 with no change to the tools. Conversely, keeping SSE while binding identity in `build_server` cannot work: a long-lived shared server has no per-connection context to bind, so every caller would share one identity. Both defects are load-bearing.
  timestamp: 2026-10-15

## Current Focus

reasoning_checkpoint:
  hypothesis: "Cross-tenant task access is possible because two independent defects stack — the MCP tool service is published to the host on 8001 with no credential check (config), and every tool takes `user_id` as a caller-supplied argument rather than reading it from trusted server context (code). Removing the published port AND moving identity into a `build_server(user_id)` closure bound before the server is constructed closes both."
  confirming_evidence:
    - "`docker-compose.yml:42-43` maps `ports: - \"8001:8001\"`; `mcp_server.py:269` runs `uvicorn.run(starlette_app, host=\"0.0.0.0\", port=8001)`."
    - "`mcp_server.py:262-267` builds a Starlette app with exactly two routes (`/sse`, `/messages/`) and no auth dependency, middleware, or token check anywhere in the file."
    - "All five tool signatures begin `user_id: str` (`mcp_server.py:27, 82, 132, 161, 189`); none reads identity from anywhere else."
    - "`main.py:362` (`tool_args[\"user_id\"] = user_id`) is the only tenancy enforcement at the tool layer, and it runs client-side of the MCP connection."
    - "`repositories/task_repository.py` filters every read and every mutation lookup on `Task.user_id == user_id` — so the repository is not the hole."
  falsification_test: "Write `tests/test_mcp_authz.py` and run it against the UNFIXED tree. If a forged `user_id` in the arguments dict changes which rows a tool returns, defect 2 is confirmed. If the forged `user_id` is already inert before any fix, defect 2 is disproven and the published port alone is the whole story."
  fix_rationale: "The repository already scopes correctly; it is handed an untrustworthy identity. Binding identity at `build_server(user_id)` time — before `FastMCP` constructs the tool schemas — moves it from caller-supplied data to server-side context, so the argument no longer exists to forge. Deleting the `mcp` service removes the network surface entirely, so there is no longer a caller who is not `main.py`. Both fixes address the mechanism (untrusted identity source; reachable unauthenticated surface), not the symptom."
  blind_spots:
    - "Not tested: whether the stdio handshake works in a live subprocess. A closure-rebuilt tool set could break FastMCP's schema introspection at construction time — the boot gate only proves the module imports."
    - "Not tested: whether `stdio_client` propagates `DATABASE_URL` into the child env. If it does not, the child dies at import and the chat route 500s."
    - "Not tested: whether Gemini, which may hallucinate a `user_id` argument from prompt history, breaks when the tool schema no longer accepts one. The strip block at `main.py:338-343` suggests this was already a real failure mode."
    - "Not checked: whether any frontend code or `next.config.ts` rewrite references `MCP_SERVER_URL` or port 8001."
  candidate_causes:
    - "config: `docker-compose.yml` publishes the MCP service on `8001:8001` and pins `MCP_TRANSPORT=sse`, creating a reachable unauthenticated surface that did not exist under the documented stdio design."
    - "code: `mcp_server.py` declares `mcp = FastMCP(\"TodoMCP\")` at module level and puts `user_id: str` in every tool signature, so the only available tenancy control is a value the caller supplies."
    - "environment: `MCP_SERVER_URL=http://mcp:8001/sse` in the backend service makes the SSE hop mandatory, so drift persisted unnoticed inside an otherwise-working deployment."
  and_gate: "Yes — both must hold for the failure to be exploitable over the network. Defect 1 (config) makes the tool surface reachable by an attacker who is not `main.py`; defect 2 (code) is the only thing that would have stopped that attacker choosing a victim identity, and it does not. Fixing only defect 1 leaves AC-2 open to any future transport or a regression in `main.py:362`. Fixing only defect 2 is impossible while the server is a shared long-lived process: there is no per-connection context to bind, so a closure would either bind nothing (all calls denied) or bind one identity shared by every caller (still cross-tenant). Both are required."

- hypothesis: Removing the published port and deriving `user_id` from trusted server context instead of a tool argument closes both holes; the repository layer needs no change.
- test: Write the six AC-3 tests in `src/backend/tests/test_mcp_authz.py` FIRST and run them against the unfixed tree to confirm RED — specifically that a forged `user_id` argument reaches the repository today. Then delete the `mcp` service from `docker-compose.yml`, switch `main.py` from `sse_client` to `stdio_client` with the JWT-verified `user_id` in the child env, and replace the module-level `mcp` with `build_server(user_id)` closing over identity.
- expecting: `8001` is no longer reachable from the host at all; the five tools expose no `user_id` parameter; a forged `user_id` inside the arguments dict is inert because identity is bound before the server is constructed.
- next_action: AWAITING HUMAN VERIFICATION. All automated signals pass. The remaining step is the human-verify checkpoint (`request_human_verification`): confirming the deployed stack behaves — `docker compose up`, log in, use chat — which needs a live Neon database, a real `GEMINI_API_KEY`, and a browser, none of which exist in the agent environment. On confirmation: run `archive_session` (status -> resolved, move this file to `.planning/debug/resolved/`, commit the fix code and this doc, append the Prevention entry to `.planning/debug/knowledge-base.md`). If something still fails, reply with what failed and this session returns to investigation.

## Verification

### 1. Reproduction no longer occurs

- **The exploit itself.** Before the fix, a throwaway probe drove the real tools against a real database: `list_tasks(user_id="bob-tenant-id")` returned Bob's task and `delete_task(user_id="bob-tenant-id", task_id=<bob's uuid>)` deleted his row, leaving only Alice's. After the fix there is no `user_id` argument to pass, and the argument dict has nowhere to put it.
- **Network surface.** `docker-compose.yml` parses to `['auth-migrate', 'backend', 'frontend']`. No `mcp` service, no `MCP_SERVER_URL`, backend publishes only `8000:8000`. `mcp_server.py` no longer imports or references `uvicorn`, `starlette`, `SseServerTransport`, or `sse` (AST-checked, so the docstring explaining the old design does not trip the guard). `Dockerfile.mcp` deleted.
- **Tool surface.** All five tools build and report schemas with no `user_id` property and no `user_id` in `required`.

### 2. Mechanism understood

Identity is decided once, in `build_server(user_id)`, and captured by closure. FastMCP derives each tool's schema from the closure's signature, so the schema has no identity parameter. On dispatch, `FuncMetadata.call_fn_with_arg_validation` validates the arguments dict against that schema; pydantic's default `extra='ignore'` drops the undeclared `user_id` **before the function body is entered**. So the forged value is inert because it is never read, not because it is checked and rejected.

### 3. RED → GREEN on the final test file

The test file was written before any production change and then re-verified after three of its own bugs were found and fixed, because "green" tests that were never seen red prove nothing.

| Tree | `tests/test_mcp_authz.py` |
|---|---|
| `HEAD` (production code reverted, tests kept) | **19 failed, 0 passed** |
| Fixed tree | **19 passed, 0 failed** |

### 4. Real subprocess, not mocks

`test_live_stdio_handshake_exposes_no_user_id` spawns the actual `mcp_server.py` over stdio in a subprocess, runs a real MCP `initialize` + `list_tools` over JSON-RPC, and asserts no schema exposes `user_id`. `test_live_stdio_server_refuses_to_start_without_identity` asserts the process exits non-zero and mentions identity. Both are wired the same way `main.py` wires it.

Separately, `main.py`'s **own** `MCP_SERVER_SCRIPT` and `StdioServerParameters` construction were exercised directly (not a test-local copy): the child booted, handshaked, published the five schemas with no `user_id`, and a forged `list_tasks(user_id="victim")` dropped the argument and reached the tool body — failing only on the absent Postgres, which is the expected outcome in this environment. This closed blind spot #1.

### 5. Regression testing

| Suite | Result |
|---|---|
| `tests/test_bootability.py` (CI hard gate) | **8 passed** |
| `tests/test_mcp_authz.py` (CI hard gate, new) | **19 passed** |
| Full backend suite | **32 passed, 10 failed** — exactly the 10 pre-existing issue #9 auth-stub failures, unchanged. No new failures. |
| Phase I `python -m unittest discover -s tests` (CI `python` job) | **3 passed, OK** — Phase I untouched (`git status -- src tests` shows only `src/backend/` changes) |

`test_bootability.py` needed two updates because the artifacts it guarded are gone by design: `test_mcp_registers_every_tool` asserted `mcp_server.mcp`, which no longer exists, and now calls `build_server(...)`; `test_mcp_container_copies_every_first_party_module_it_imports` asserted `Dockerfile.mcp` shipped modules, and now asserts the single backend `Dockerfile`'s `COPY . .` covers the spawned child.

### 6. Environment / stability

All of the above was run three times (once per fix iteration plus the final sweep) with identical results. `docker-compose.yml` was validated by parsing, not by eye. `docker compose build` was **not** run — no image build in this environment.

### 7. Test design notes (why these are not mock-only)

Three tests were wrong on first run and were corrected rather than loosened, because each was testing the opposite of its intent:
- `test_cross_tenant_read_returns_nothing` initially asserted Bob sees `[]`, but Bob legitimately owns a task. Introduced `CAROL`, who owns none: "no rows" now means *correctly scoped* rather than *broken read*.
- `test_cross_tenant_mutation_cannot_touch_the_other_row` initially had **Bob's** server targeting **Bob's** task and asserted it raised — i.e. it demanded the tool fail on its own data. Corrected to Alice's server targeting Bob's task, and paired with `test_owner_can_still_mutate_own_task` as the positive control, without which a `find_by_id_or_title` that matched nothing at all would pass every cross-tenant test while quietly breaking the feature.
- `_row_snapshot` read through `database.SessionLocal` (real Postgres) instead of the patched `mcp_server.SessionLocal`.

Mutations assert on **database state**, not on return values, so a tool that reports not-found while still writing to the other tenant's row would fail.

### 8. Known limits of this verification

- `docker compose build` / `docker compose up` was never run; container-level behaviour is inferred from the Dockerfile (`COPY . .` already covers the child) and guarded by `test_backend_image_ships_the_mcp_tool_server`.
- The chat route's Gemini call was never exercised end-to-end (needs a real `GEMINI_API_KEY`). What *was* exercised is everything around it: subprocess spawn, handshake, tool listing, and identity binding.
- `find_by_id_or_title`'s title-substring branch means a task title is guessable *within* a tenant. That is a UX property, not a tenancy hole — the query still filters `Task.user_id == identity` — but it is worth knowing the tool answers "whose task is named X" questions only about yourself.

## Prevention

- **Why not caught:** `ci.yml`'s backend job hard-gated only `tests/test_bootability.py`. That gate asserts *the services boot*, never *what they do*, and the full suite — which does assert behaviour — ran `continue-on-error: true` over a 10-failure baseline, so a new failure there would have been reported without blocking anything. Nothing anywhere asserted tenancy at the tool layer. The `user_id`-as-argument pattern predates the SSE service and was therefore never a "regression" — it shipped as the original design, which is why no test ever looked at it.
- **Recurrence guard:** `src/backend/tests/test_mcp_authz.py` — 19 tests, a CI **hard** gate. Four independent layers, so no single one being weak leaves the hole open: (a) schema introspection asserting no tool exposes `user_id`; (b) compose parsing asserting no MCP service and no published port; (c) AST assertion that the SSE transport is not merely unpublished but deleted; (d) behavioural tests against a real database asserting cross-tenant reads return nothing, cross-tenant mutations do not move the other tenant's row, and a forged `user_id` argument is inert — each paired with a positive control so a tool that silently no-ops cannot pass. Plus a live stdio-subprocess handshake, so the transport that actually ships is exercised rather than assumed.
- **Class-level lesson:** the defect was identity passed as *data* across a trust boundary. The general form — an auth identifier arriving as a function argument, a query parameter, or a message field that the server is expected to overwrite — is worth grepping for whenever a new tool, route, or tool-call is added. `AGENTS.md` now states the rule explicitly.

## Files Changed

- `src/backend/mcp_server.py` — `build_server(user_id) -> FastMCP` closure; five tool signatures lose `user_id`; SSE/uvicorn/Starlette block deleted; `main()` reads `MCP_USER_ID` and runs stdio.
- `src/backend/main.py` — `sse_client` → `stdio_client(StdioServerParameters(...))` with `MCP_USER_ID` and `DATABASE_URL` in the child env; `MCP_SERVER_SCRIPT` constant; deleted the schema-stripping block and the `tool_args["user_id"] = user_id` injection.
- `docker-compose.yml` — `mcp` service, `MCP_SERVER_URL`, and the backend's `depends_on: mcp` deleted; comment records why there is no MCP service.
- `src/backend/Dockerfile.mcp` — deleted.
- `src/backend/tests/test_mcp_authz.py` — new, 19 tests. AC-3.
- `src/backend/tests/test_bootability.py` — two tests updated for the deleted artifacts.
- `.github/workflows/ci.yml` — `tests/test_mcp_authz.py` added as a hard gate next to `test_bootability.py`.
- `AGENTS.md`, `README.md` — chat-path and tool-definition docs corrected.

## Resolution

- root_cause: Two independent, stacked defects. (1) config — `docker-compose.yml` published the MCP service on `8001:8001` and `MCP_TRANSPORT=sse` made `mcp_server.py` bind `0.0.0.0:8001` with no credential check on `/sse` or `/messages/`. (2) code — every one of the five tools took `user_id` as a caller-supplied argument, so identity was tool data rather than server context, and the only tenancy control was `main.py:362`, a client-side convention any non-`main.py` caller bypasses. Both were required for the exploit: the published port supplied the attacker, and the argument supplied the victim's identity. The repository layer was correct throughout and was not changed.
- fix: Moved the chat path from a published SSE service to a stdio subprocess spawned per request, and moved identity from a tool argument into a `build_server(user_id)` closure bound before tool schemas are constructed — so no tool exposes `user_id` and a forged one is dropped by schema validation before any tool body runs. `build_server` raises `RuntimeError` with no identity rather than serving anonymously.
- verification:
  target_test: { result: pass, detail: "19/19 in tests/test_mcp_authz.py; same file is 19 failed / 0 passed on HEAD" }
  mutation_check: { result: skipped, reason: "Stryker not installed in this environment and not configured for this repo (checked: `import stryker` -> ModuleNotFoundError). Per the Gall's-Law degradation path this signal is skipped, NOT assumed passed. Substitute evidence for the fix site: the fix site is `build_server`'s identity binding, and `test_build_server_without_identity_raises` (no identity -> RuntimeError) plus `test_forged_user_id_argument_is_inert_on_every_tool` (forged argument -> bound tenant's data) together cover both ways the fix site could be broken — removed binding, or binding read from the wrong place." }
  no_op_deletion: { result: pass, deletion_justified_by_rca: true, detail: "Net +329/-285. Not deletion-only. The three deletions — the SSE/uvicorn/Starlette block, the `user_id` parameter on five signatures, and `tool_args[\"user_id\"] = user_id` — are each named explicitly in the reasoning_checkpoint as the defect itself, and each is covered by a guard that fails if it returns." }
  adjacent_tests: { result: pass, suites_run: ["tests/test_bootability.py (8/8)", "full backend pytest (32 passed / 10 failed)", "Phase I unittest (3/3)"], detail: "The 10 failures are the pre-existing issue #9 auth-stub baseline, unchanged in count and identity before and after. No new failures." }
  revert_and_reconfirm: { result: pass, bug_returned_on_revert: true, fixed_on_reapply: true, detail: "Reverted only the production files (mcp_server.py, main.py, docker-compose.yml, Dockerfile.mcp) to HEAD, kept the new tests: 19 failed. Reapplied: 19 passed. This is also the proof that the tests were red before they were green." }
  guardrail_verdict: accepted
  rejected_signal: none
  minimality_note: "The fix spans several files. That is not incidental sprawl — it is the two AND-gate causes (compose config + tool signatures) plus the transport that joined them (main.py), plus the guards that keep them fixed (new test file, ci.yml), plus doc sync. `repositories/task_repository.py` is untouched, as the RCA required. No unrelated hunks were introduced."
- files_changed: src/backend/mcp_server.py, src/backend/main.py, src/backend/tests/test_mcp_authz.py, src/backend/tests/test_bootability.py, docker-compose.yml, .github/workflows/ci.yml, AGENTS.md, README.md (plus src/backend/Dockerfile.mcp deleted)