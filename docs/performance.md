# Performance baseline (Step 0) — page load / API latency

Measured: **2026-10-16, ~16:17–16:41 UTC** · commit **`65c240e`** · prod containers
(`docker compose up`, Dockerfile `npm run build` + `npm start`), WSL2 (ThinkPad), Neon
`aws-us-east-1` (`ep-super-rice-b87cwr46-pooler`, free plan, fixed 0.25 CU,
`autosc/scaling min=max=0.25`, `suspend_timeout_seconds: 0`).

Bench user: `bench@evoperf.local` (name "Perf Bench"), 5 seeded tasks. Cookies/JWT at
`/tmp/opencode/perf/` (ephemeral). Reuse this user for every later measurement run so
numbers stay comparable.

## Method

The frontend is a client-rendered SPA, so its critical path is a fixed sequence of
HTTP calls. Without a browser harness (no DuckDuckGo browser on this machine — its
MCP server has nothing to connect to here; checked Windows side and WSL — and no
passwordless sudo to install browser system libs), the waterfall was replayed with
`curl` using the same endpoints the browser hits, in the same order:

1. `GET /api/auth/get-session`        (cookie → Better Auth → Neon)
2. `GET /api/auth/token`              (cookie → mint JWT → Neon)
3. `GET /api/backend/api/<uid>/tasks` (browser → Next rewrite → backend → Neon)

Each measured with `curl -w %{time_total}` (fresh connection per call, like the
browser). Plus `tasks(direct)` against `localhost:8000` (no Next hop). Each row shows
`[status] duration_ms`. TCP RTT to Neon measured before each run (`:5432` connect,
no auth — does not wake the compute).

Caveats: no DOM paint timing; "time-to-name" ≈ `get-session` completion,
"time-to-tasks" ≈ the sum of the three calls (maps to `TasksProvider.tsx:63/:52`).
WSL2→Neon RTT jitters 270–540ms run to run; relative comparisons are valid.

## Numbers

**Warm DB (compute active), corrected auth tokens — this is the steady state a
real user gets on every reload:**

| run | neon-rtt | get-session | token | tasks(next→be) | tasks(direct) | TOTAL |
|---|---|---|---|---|---|---|
| WARM-OK-1 | 301ms | **3595**ms | 2487ms | 1941ms | 834ms | **8.06s** |
| WARM-OK-2 | 331ms | **2734**ms | 2648ms | 653ms | 704ms | **6.09s** |
| WARM-OK-3 | 388ms | **2456**ms | 2421ms | 650ms | 810ms | **5.57s** |

**Cold (after 7 min of full DB idleness, Neon suspended):**

| run | neon-rtt | get-session | token | TOTAL |
|---|---|---|---|---|
| COLD-1 | 542ms | 4155ms | 3531ms | **7.72s** |

**Docker boot:** `compose down` 5s; `up → both containers healthy` = **26s**.
First waterfall after boot: TOTAL **8.92s**.

**User's original observation (DevTools screenshot, Chrome):** DOMContentLoaded 643ms,
Load 1.16s, `Finish 16.67s`, 30 requests. Consistent with the data: the app's own
waterfall is ~6–9s and the browser additionally pays `TasksProvider`'s **duplicate**
`getSession()` (`TasksProvider.tsx:41` + `:63`) and `Chatbot`'s third one
(`Chatbot.tsx:40`) — every one of those ~2.5–3.5s, plus more — which pushes the
measured `Finish` into the mid-teens. Nothing in the screenshot shows a bug we have
not already measured here.

## Attribution — jo cheez asal waqt kha rahi hai

Rank order (evidence in brackets):

1. **`lib/auth.ts` pool rebuild per request (NEW BUG, highest one-line win).**
   `route.ts` calls `getAuth()` on *every* auth request, and the pool cache is
   skipped in production:
   ```ts
   if (process.env.NODE_ENV !== 'production') { globalForAuth.postgresPool = pool; }
   ```
   → a fresh TCP+TLS connection to Neon per auth call (~3 RTT) plus Better Auth's
   several queries. Hence **get-session/token stay 2.4–3.6s even when the DB is
   fully warm** (Neon RTT is only ~330ms; 2.5s ≈ handshake + ~4 queries + setup).
   Fix: cache unconditionally (or always cache in prod). Expected: auth rows drop
   to roughly 1–2 RTT (~0.4–0.8s) warm.

2. **Waterfall depth.** get-session → token → tasks are sequential; the browser also
   duplicates get-session (×2 in TasksProvider) and adds Chatbot's (×1). At these
   per-call costs that alone is ~6–9s.

3. **Neon region + compute.** ~330ms RTT (us-east-1), suspend-on-idle causing
   cold first-query stalls (this run: signup 5.0s, first seed write 5.1s, then
   0.9–1.1s once warm). Singapore (`ap-southeast-1`) measured ~175ms — Step 3 fix.

4. **Backend read path.** `tasks(direct)` warm 650–830ms ≈ pre-ping + SELECT +
   `COMMIT` (3 RTT). The per-request `authClient.token()` call adds a full ~2.5s
   hop to *every* mutation (Step 1c memoization fixes).

5. **Docker boot readiness gap.** 26s until healthy with no healthcheck gating —
   first browser requests right after `up` land on a just-started frontend and a
   backend that already finished boot, but nothing prevents an unlucky early call.

## Baseline to verify Steps 1–4 against

| metric | baseline (warm) | target after 1+2 | target +3 |
|---|---|---|---|
| get-session | ~2.5–3.6s | ~0.3–0.4s | ~0.15–0.2s |
| token (per call) | ~2.4–2.6s | cached (0) / ~0.3–0.4s on refresh | ~0.15–0.2s |
| tasks (browser path) | 0.65–1.9s | 0.65–1.9s | ~0.35–1s |
| TOTAL time-to-tasks | **5.6–8.1s** | ~1–1.5s | ~0.6–1s |
| docker up → healthy | 26s | 26s | 26s (Step 4 makes it *known*) |

Step order unchanged: 1 (frontend dedupe+token cache) → 2 (cookieCache 5 min +
`auth.ts` pool fix — fold both into this step, same file area) → 4 (healthchecks)
→ 3 (Neon Singapore). Step 5 stays deferred.

## Post Step 1+2 (2026-10-16 ~17:31–17:39 UTC, same env, commit + changes below)

Implemented & deployed (frontend image rebuilt, backend untouched):
1. `TasksProvider.tsx` — one `get-session` per load (`userIdRef`), no duplicate.
2. `lib/api.ts` — JWT memoized 10 min (JWT exp is 15m), 401 → clear + one retry;
   `clearTokenCache()` wired into `SignOutButton`.
3. `lib/auth.ts` — **two** production-only bugs fixed:
   - pg `Pool` was rebuilt *per auth request* (the `NODE_ENV !== 'production'`
     guard skipped the cache in prod).
   - `betterAuth(...)` itself was rebuilt per auth request (~0.8–1s constant).
     Both are now cached globally (`getAuth()` → cached instance + pool).
   - `session.cookieCache` enabled, `maxAge: 5 * 60` — get-session verifies from
     the signed cookie instead of Postgres (the `better-auth.session_data`
     Set-Cookie is confirmed live).
4. Guard tests added: `lib/api.test.ts` (mint-once, 401-retry-once, no-token
   fallback, sign-out clears) and a session-lookup count in
   `TasksProvider.test.tsx`. All 15 frontend tests pass; `tsc --noEmit`, lint OK.

**Measured (warm DB):**

| call | baseline | after Step 1+2 | |
|---|---|---|---|
| get-session | 2456–3595ms | **235–274ms** | cookie-cache hit, no DB, no pool rebuild |
| token | 2421–2648ms | **238–254ms** | same |
| tasks (browser path) | 650–1941ms | 699–731ms | backend unchanged (Step 3/5 target) |
| tasks(direct) | 704–834ms | 664–803ms | unchanged (≈ pre-ping+SELECT+COMMIT, Step 5) |
| **TOTAL time-to-tasks** | **5.57–8.06s** | **1.25–1.27s** | |

**Cold (7 min idle → Neon suspended):** TOTAL 5.58s; get-session 3.0s (compute
wake + expired cookie-cache refresh), tasks(rewrite) 2.3s. First-request-after-
container-restart adds ~2s of cold Node paths (seen completing at 3.13s once,
then steady). The cold penalty is exactly what Step 3 (Singapore move → ~half
RTT) and the optional keep-alive address.

Real-browser implication: the DevTools screenshot's 16.67s `Finish` path becomes
roughly `document 53ms + name ~0.25s + token 0.25s + tasks ~0.7s ≈ 1.3s` warm,
because the browser's duplicate session calls are gone and the token is fetched
once per 10 minutes rather than per request.

Method note: the waterfall always pays a fresh `/api/auth/token`; the deployed
client caches it, so real in-app totals are at or below these numbers.
