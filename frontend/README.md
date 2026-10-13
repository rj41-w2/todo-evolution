# EVO TODO — frontend

The Phase II web client: **Next.js 16** (App Router) · React 19 · TypeScript
strict · Tailwind v4 · Better Auth · Framer Motion · lucide-react.

## Commands

```bash
npm install
npm run dev          # http://localhost:3000
npm test             # vitest (jsdom)
npm run lint         # eslint (flat config)
npx tsc --noEmit     # typecheck — CI runs lint, tsc, then npm test
npm run build        # next build
```

`.env.local` is not committed. It holds `DATABASE_URL` and
`BETTER_AUTH_SECRET` (Better Auth), plus `INTERNAL_BACKEND_URL` for the
`/api/backend/*` rewrite in `next.config.ts`.

## Routes

Inside the signed-in route group `app/(app)/` (shared shell + onboarding gate):
`/` dashboard · `/tasks` · `/my-tasks` · `/goals` · `/team` · `/activity` ·
`/settings`. Outside it: `/login`, `/register`, `/onboarding` (focused column)
and `/api/auth/[...all]` (Better Auth handler).

Goals, Team and Activity are honest "coming soon" placeholders — the backend has
no data model for them, so nothing is faked (see `../../design.md` and the
feature spec).

`proxy.ts` (Next 16's replacement for `middleware.ts`) redirects visitors
without a session cookie to `/login`.

## Architecture

- `components/AppShell.tsx` — the signed-in chrome: floating sidebar (a drawer
  below `lg`), main content card, right status rail, wrapped in `TasksProvider`.
- `components/TasksProvider.tsx` — the one task source: optimistic
  create/toggle/delete with rollback, shared by every page and the status rail.
- `lib/` — pure logic with unit tests (`task-filter`, `task-counts`,
  `dashboard`, `my-tasks`, `nav`, `workspace`, `agent-activity`) next to the I/O
  helpers (`api.ts` `secureFetch`, `auth-client.ts`).
- `lib/workspace.ts` — the first-run flag and workspace name, kept in
  localStorage and deliberately failure-tolerant: blocked storage reads as
  "already onboarded" so the onboarding gate can never loop.

## Design system

The contract is [`../design.md`](../design.md); the values are
`app/tokens.css`; `app/globals.css` maps them into Tailwind via `@theme inline`
and defines the shared component classes (`.wordmark`, `.btn-primary`,
`.accent-fill`, `.input`, `.chip`, `.nav-item`, …).

- Warm **light** is the default; dark is retained (`.dark` in `tokens.css`) and
  switchable from the shell toggle and settings.
- Accent rules: `--color-accent` is decorative/graphic only; text and
  label-bearing fills use `--color-accent-strong` via the shared classes.
- Never suppress the focus ring with `outline-none` / `outline-hidden` — it
  outranks the global `:focus-visible` rule and erases the ring.
- Tailwind v4 cannot infer the type of a bare `var()`, so a font-size token is
  written with an explicit `length:` hint (`text-[length:var(--text-2xl)]`),
  never the untyped form — which silently leaves the element with no font-size.

Design guards live in `app/`: `tokens.test.ts`, `focus-ring.test.ts`,
`heading-utility.test.ts`.

See `AGENTS.md` (and `../AGENTS.md`) before changing anything in `app/`.
