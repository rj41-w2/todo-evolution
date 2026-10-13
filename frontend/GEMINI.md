# EVO TODO — frontend guide (Next.js 16)

The client is a **Next.js 16 App Router** app in TypeScript, styled with
**Tailwind v4** on a warm-canvas token layer, animated with **Framer Motion**
(only where the contract allows it) and authenticated with **Better Auth**.

This file is the orientation guide; [`../design.md`](../design.md) is the locked
design contract and [`README.md`](README.md) has the commands and route map.

## Design system

The shipped system is the **warm canvas**, not the older dark-first
glassmorphic look: no ambient blobs, no `glass`/backdrop-blur utilities, no
indigo/blue accents. Light is the default and warm; dark mode is retained and
switchable.

- `app/tokens.css` — every colour, type, space, motion, radius, elevation and
  glyph value, for `:root` (light) and `.dark`. The single source of truth.
- `app/globals.css` — `@import "tailwindcss"` + the tokens, the `@theme inline`
  map that makes each token usable as a Tailwind utility (`bg-card`,
  `text-ink-2`, `border-rule`, `rounded-[var(--radius-card)]`, …), the base
  layers, and the shared component classes.
- Shared classes, not per-page styling: `.wordmark` / `.wordmark--accent`,
  `.page-header`, `.section-head*`, `.nav-item`, `.ledger-row`, `.task-title*`,
  `.chip`, `.pill*`, `.tab*`, `.alert`, `.btn-primary`, `.btn-ghost`,
  `.icon-btn(-danger)`, `.field-label`, `.input`, `.select-input`,
  `.accent-fill`.
- Accent rules: `--color-accent` is decorative/graphic only (~3:1 on canvas).
  Accent **text** uses `--color-accent-strong`; an accent fill that carries a
  label is `.accent-fill` (accent-strong + `--color-accent-ink`).
- Focus: one global `:focus-visible` ring. Never add `outline-none` /
  `outline-hidden` — those utilities outrank the base layer and erase the ring.

Design rules that have already regressed once are pinned by tests in `app/`:
`tokens.test.ts` (contrast in both modes, no raw colours outside the token
layer, no unsafe accent pairings), `focus-ring.test.ts`,
`heading-utility.test.ts` (`text-[length:var(--text-…)]`).

## File architecture

- `app/(app)/` — the signed-in route group: `layout.tsx` mounts
  `OnboardingGate` + `AppShell`; one `page.tsx` per destination.
- `app/login`, `app/register`, `app/onboarding` — standalone focused-column
  pages outside the shell.
- `app/api/auth/[...all]/route.ts` — the Better Auth handler.
- `components/` — `AppShell`, `AppSidebar`, `SidebarNav`, `SidebarDrawer`,
  `StatusRail`, `TasksProvider`, `OnboardingGate`, `OnboardingView`,
  `DashboardView`, `TaskForm`, `TaskEditForm`,
  `TaskList`, `TaskRow`, `TaskTabs`, `Chatbot`, `ComingSoon`,
  `SettingsView`, `ThemeChoice`, `ThemeToggle`, `SignOutButton`.
- `lib/` — `task-filter`, `task-counts`, `dashboard`, `my-tasks`, `nav`,
  `workspace`, `agent-activity`, `client-now`, `use-focus-trap` (pure, tested)
  and `api`, `auth-client`, `config`, `auth` (I/O).

Data flow, one source: `TasksProvider` fetches through `secureFetch` (which
injects the Better Auth JWT) and owns optimistic create / toggle / delete with
rollback. Every page, the status rail and the chatbot's post-tool-call refresh
read that same state; the dashboard's chatbot mounts only on `/`.

## Guidelines

> [!IMPORTANT]
> **Use the token layer.** Consume tokens and the shared classes above; do not
> introduce a raw colour, a second font family, glass/glow, or a per-page focus
> style. New values go into `tokens.css` first, then `@theme inline`.

> [!TIP]
> **Keep the tests honest.** Behavioural tests live next to the module
> (`lib/*.test.ts`, `components/*.test.tsx`, `app/*.test.tsx`); source-level
> design guards live in `app/*.test.ts`. If a defect ships twice, add a guard.

> [!WARNING]
> **Server/client boundaries.** Server components: `app/layout.tsx`, `app/onboarding/page.tsx`, `app/(app)/layout.tsx`, `app/(app)/page.tsx`, `app/(app)/settings/page.tsx`, `app/(app)/goals/page.tsx`, `app/(app)/team/page.tsx`, `app/(app)/activity/page.tsx`. `lib/auth.ts` is server-only (reads `DATABASE_URL` / `BETTER_AUTH_SECRET`); `lib/auth-client.ts` is browser-only. Components without `'use client'` (`Chatbot`, `ComingSoon`) rely on being imported from a client parent.
