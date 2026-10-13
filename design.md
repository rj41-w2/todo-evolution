# Design — EVO TODO

A locked design system for this app. Every page redesign reads this file before
emitting code. Do not regenerate per page — extend or amend this file when the
system needs to grow.

This contract is the **warm-canvas** system. It supersedes the earlier
cold-indigo "quiet workbench" contract (slim top rail, Inter / Space Grotesk /
JetBrains Mono, no sidebar). Those choices are gone; nothing in this file
contradicts the warm system below.

Light is the default and it is **warm**. Dark mode is retained and switchable.
The token layer (`frontend/app/tokens.css`) is the single source of truth — this
document explains the system, it does not restate raw values.

As shipped: `next-themes` runs with `attribute="class"` and
`defaultTheme="light"`, so a first visit is warm-light regardless of the OS
preference; the `.dark` block in `tokens.css` is the whole dark theme. The shell
carries a toggle (sidebar and narrow-viewport header) and settings offers
Light / Dark / System — "System" is the only path to a machine-following theme,
and it stays switchable back.

## Genre

modern-minimal — a task tool is a utility, executed on a soft warm canvas:
floating panels, hairlines, a single violet accent. Not a neon dashboard, not a
glassmorphism showcase. Light-first, dark optional, accent reserved.

## Macrostructure family

- App pages:       **Floating sidebar** — a 240 px sidebar inset 24 px from the
                    viewport edges, a raised main content card, and a right
                    status rail. Hairline rules, grouped sections, inline
                    quick-add. Variation knobs: rail contents, panel elevation.
- Auth pages:      **Focused column** — quiet centred single-column form, no
                    hero, no decoration. Variation knobs: none (pages match).

## Theme

Warm custom palette authored in OKLCH. Values were derived from the measured
reference hex targets; the hex is recorded beside each token in
`frontend/app/tokens.css` and the conversion is documented there.

- Canvas `#EBE7E2` · raised `#EEEAE6` · inset `#DDD8D2` · card `#FFFAF4`
- Ink `#2F2823` · secondary `#3A3A3A` · muted `#686868`
  (the reference's measured `#6E6E6E` was nudged to `#686868` so muted meta
  clears WCAG AA on the canvas; it is visually indistinguishable)
- Accent violet `#996CE4` · accent-soft lavender `#C9B3F5`
- Success `#2ECC8A` · warning coral `#FF8077` · danger `#BD3228`
- Hairline `1px rgba(160,143,126,.2)` warm tan
- Elevation: `--shadow-card` (light top-left + warm bottom-right) and
  `--shadow-card-inset`; `--shadow-float` for the sidebar and chat drawer.

Token names are stable and their roles are fixed:

- `--color-paper` canvas · `--color-paper-2` raised · `--color-paper-3` inset ·
  `--color-card` the content card.
- `--color-ink` body · `--color-ink-2` secondary · `--color-muted` de-emphasised
  meta · `--color-neutral` neutral.
- `--color-rule` / `--color-rule-2` hairlines.
- `--color-accent` the violet **graphic/fill** accent · `--color-accent-strong`
  the **AA-safe text** accent · `--color-accent-ink` text on an accent fill ·
  `--color-accent-soft` a lavender surface · `--color-focus` the focus ring.
- `--color-success` / `--color-warn` / `--color-danger` semantic states, each
  with a `-soft` translucent surface.

### Accent contrast rule (non-negotiable)

The measured violet `#996CE4` is mid-luminance: on the warm canvas it reaches
only ~3.0:1, which is fine for a **graphic** (dot, pill, border, focus ring —
3:1) but fails WCAG AA for **normal text** (4.5:1). Therefore:

- accent **text** on any surface, and the "TODO" wordmark slice, use
  `--color-accent-strong` (a darker violet of the same hue, ≥4.5:1 on canvas and
  card);
- accent **fills** whose label sits on top use `--color-accent-strong` with
  `--color-accent-ink` (≥4.5:1);
- `--color-accent` is decorative/graphic only.

Both pairings are shared classes, not per-page choices: the wordmark slice is
`.wordmark--accent`, and any accent fill with text on it is `.accent-fill`
(accent-strong fill + accent-ink label). A glyph on `--color-accent-soft` uses
`--color-accent-strong` for the same reason.

`frontend/app/tokens.test.ts` computes WCAG contrast from the token values for
both modes, fails if any guarantee above is broken, and fails if markup pairs
the decorative `bg-accent` with a `text-accent-ink` label (or `bg-accent-soft`
with a `text-accent` glyph) inline instead of going through those classes.

### Mode rule

Never switch hue between modes — only lightness and chroma move. `.dark`
overrides every colour and elevation token, so there is always a dark
counterpart.

## Typography

- **DM Sans only**, weights 300–600. The display, body and mono registers all
  resolve to DM Sans; there is no second family.
  Loaded via `next/font` in `app/layout.tsx` as `--font-dm-sans`; the
  `--font-display`, `--font-body` and `--font-mono` tokens reference it.
- Body 16 px (`--text-md`), line-height ~1.5.
- Dense meta 11–13 px (`--text-micro` 11 px, `--text-meta` 13 px; `--text-xs`
  12 px and `--text-sm` 14 px remain available).
- Display 42–50 px at weight 300 (`--text-display`).
- The `--font-mono` token is retained for the *outlier register* (counts, dates,
  tags) but renders DM Sans — the reference loads no monospace family.

## Spacing

4-point named scale. The values are in `frontend/app/tokens.css`. Pages use
named tokens (`var(--space-md)`), never raw values. Use `gap` for siblings.

## Motion

- Easings: `--ease-out` cubic-bezier(0.16, 1, 0.3, 1); `--ease-in`
  cubic-bezier(0.7, 0, 0.84, 0); `--ease-in-out` cubic-bezier(0.65, 0, 0.35, 1).
- Reveal pattern: none on load. The page is composed, not animated in.
- Allowed motion: task-row layout transitions (add / complete / delete via
  framer-motion `layout`), completion toggle morph, chat drawer slide,
  button press (100 ms). No springs on state, no bounce.
- Reduced-motion fallback: opacity-only crossfade, ≤ 150 ms, for every
  transition.

## Focus

One ring, drawn globally. `globals.css` clears the outline for `:focus` (so a
pointer click shows nothing) and draws `2px solid var(--color-focus)`,
`outline-offset: 2px` for `:focus-visible`. The shared `.input` class in
`globals.css` also carries a `:focus-visible` rule (border + outline colour) so
text fields show the same ring while keeping their border styling — this is the
only per-component focus exception and it is defined in the shared sheet, not in
a page or component. No component may suppress the ring with an `outline-none` /
`outline-hidden` utility: those land in Tailwind's utilities layer, which
outranks the base layer regardless of specificity, and the control then shows
nothing at all. Flat controls (the inline quick-add and the in-place row editor)
keep the same ring as everything else rather than hiding it.

A date input walks its internal segments as extra Tab stops, and on a segment
the host matches `:focus-within` but neither `:focus` nor `:focus-visible`. One
more global rule (`input[type="date"]:focus-within:not(:focus)`) draws the same
ring for that state, so the field does not read as unfocused part-way through
the Tab order; `:not(:focus)` keeps it off a plain pointer click. It is still a
single shared rule — no page or component carries its own focus styling.

`frontend/app/focus-ring.test.ts` fails if any source file carries such a
utility, and pins the date-input rule.

## Microinteractions stance

- Silent success. Completion toggle morphs circle → check. No success toasts.
- Optimistic updates with rollback (already in page.tsx — keep the pattern).
- Hover tooltips 800 ms delay · focus tooltips 0 ms.
- No `transition-all` anywhere. Specify properties.
- No glass and no glow. Depth is expressed with the elevation tokens
  (`--shadow-card`, `--shadow-card-inset`, `--shadow-float`), never with blur or
  coloured halos.

## CTA voice

- Primary CTA: accent fill, text `--color-accent-ink`, radius `--radius-card`,
  weight 600, press = translateY(1px). Fills whose label sits on top use
  `--color-accent-strong` so the label meets AA; that pairing is the shared
  `.accent-fill` class. "Add task", "Sign in",
  "Create account".
- Secondary: ghost — ink text, hover `--color-paper-2`, hairline border.
- Danger: text `--color-danger`, ghost hover tint. Never a filled red button.
- Pills (tags, status) use `--radius-pill`.

## Per-page allowances

- App pages MUST NOT use enrichment — function carries the page.
- Auth pages MUST NOT use enrichment.
- No photographic content anywhere in the app.

## What pages MUST share

- The wordmark "EVO TODO" (DM Sans 600; EVO in ink, TODO in
  `--color-accent-strong` — the shared `.wordmark--accent` class).
- The accent colour and its placement: the "TODO" wordmark slice, primary CTA
  fills, the completion toggle, focus rings — ≤ 5 % per viewport. Accent *text*
  uses `--color-accent-strong`; `--color-accent` is graphic/fill only.
- The DM Sans family across display, body and mono registers.
- The CTA voice (accent fill, accent-ink text, card radius).
- Hairline-rule dividers (`--color-rule`), never glass or glow.
- Warm surfaces: canvas, raised `--color-paper-2`, inset `--color-paper-3`,
  card `--color-card`; elevation via the shadow tokens.

## What pages MAY differ on

- The right status rail: dashboard keeps the agent activity panel; other app
  pages may show different rail content or none.
- The chat button + drawer exist only on the dashboard.
- Ledger density (row meta on one line on mobile, two on desktop).

The sidebar (identity chip, theme toggle, logout) is mounted by `AppShell` for
**every** signed-in page — it is not a dashboard-only element.

## Exports

Drop-in formats for re-using this design system in other projects. Values mirror
`frontend/app/tokens.css`.

### tokens.css (light / `:root`)
```css
:root {
  --color-paper:      oklch(93.01% 0.00797 73.7);  /* #EBE7E2 */
  --color-paper-2:    oklch(93.87% 0.00685 67.7);  /* #EEEAE6 */
  --color-paper-3:    oklch(88.50% 0.00984 72.7);  /* #DDD8D2 */
  --color-card:       oklch(98.72% 0.00964 72.7);  /* #FFFAF4 */
  --color-ink:        oklch(28.26% 0.01383 57.7);  /* #2F2823 */
  --color-ink-2:      oklch(34.85% 0 0);           /* #3A3A3A */
  --color-muted:      oklch(51.73% 0 0);           /* #686868 */
  --color-rule:       oklch(66% 0.032 67.2 / 0.2);
  --color-accent:        oklch(63.12% 0.17627 298.5); /* #996CE4 */
  --color-accent-strong: oklch(52.06% 0.14488 298.4); /* #7552B0 */
  --color-accent-ink:    oklch(98.72% 0.00964 72.7);  /* #FFFAF4 */
  --color-accent-soft:   oklch(80.83% 0.0944 299.6);  /* #C9B3F5 */
  --color-focus:         oklch(63.12% 0.17627 298.5); /* #996CE4 */
  --color-success:      oklch(75.07% 0.15904 159.7);  /* #2ECC8A */
  --color-warn:         oklch(74.35% 0.15617 25.7);   /* #FF8077 */
  --color-danger:       oklch(53.09% 0.17743 28.7);   /* #BD3228 */

  --font-display: var(--font-dm-sans, "DM Sans"), ui-sans-serif, system-ui, sans-serif;
  --font-body:    var(--font-dm-sans, "DM Sans"), ui-sans-serif, system-ui, sans-serif;
  --font-mono:    var(--font-dm-sans, "DM Sans"), ui-sans-serif, system-ui, sans-serif;

  --space-3xs: 0.125rem; --space-2xs: 0.25rem; --space-xs: 0.5rem;
  --space-sm: 0.75rem;   --space-md: 1rem;     --space-lg: 1.5rem;
  --space-xl: 2.5rem;    --space-2xl: 4rem;    --space-3xl: 6rem;

  --text-micro: 0.6875rem; --text-meta: 0.8125rem; --text-xs: 0.75rem;
  --text-sm: 0.875rem; --text-md: 1rem; --text-lg: 1.25rem;
  --text-xl: 1.5625rem; --text-2xl: 1.9531rem; --text-3xl: 2.4414rem;
  --text-display: clamp(2.625rem, 2.5vw + 1.75rem, 3.125rem);

  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-in: cubic-bezier(0.7, 0, 0.84, 0);
  --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
  --dur-micro: 120ms; --dur-short: 220ms; --dur-long: 420ms;
  --radius-card: 10px; --radius-input: 10px; --radius-panel: 14px;
  --radius-pill: 9999px;
  --shadow-card: -6px -6px 16px 0 oklch(100% 0 0 / 0.7), 8px 8px 20px -6px oklch(53% 0.03 72 / 0.22);
  --shadow-card-inset: inset -3px -3px 8px 0 oklch(100% 0 0 / 0.65), inset 3px 3px 8px 0 oklch(53% 0.03 72 / 0.16);
}
```

### Tailwind v4 `@theme`
```css
@theme inline {
  --color-paper: var(--color-paper);
  --color-paper-2: var(--color-paper-2);
  --color-paper-3: var(--color-paper-3);
  --color-card: var(--color-card);
  --color-ink: var(--color-ink);
  --color-ink-2: var(--color-ink-2);
  --color-accent: var(--color-accent);
  --color-accent-strong: var(--color-accent-strong);
  --color-accent-ink: var(--color-accent-ink);
  --color-rule: var(--color-rule);
  --shadow-card: var(--shadow-card);
  --shadow-card-inset: var(--shadow-card-inset);
  --radius-pill: var(--radius-pill);
  --font-display: var(--font-display);
  --font-body: var(--font-body);
  --font-mono: var(--font-mono);
  /* mirror the rest of tokens.css with `--color-*` / `--font-*` / `--shadow-*` keys */
}
```

### DTCG `tokens.json`
```json
{
  "color": {
    "paper":  { "$value": "oklch(93.01% 0.00797 73.7)", "$type": "color" },
    "card":   { "$value": "oklch(98.72% 0.00964 72.7)", "$type": "color" },
    "ink":    { "$value": "oklch(28.26% 0.01383 57.7)", "$type": "color" },
    "accent": { "$value": "oklch(63.12% 0.17627 298.5)", "$type": "color" },
    "accentStrong": { "$value": "oklch(52.06% 0.14488 298.4)", "$type": "color" }
  },
  "font": {
    "display": { "$value": "DM Sans", "$type": "fontFamily" },
    "body":    { "$value": "DM Sans", "$type": "fontFamily" },
    "mono":    { "$value": "DM Sans", "$type": "fontFamily" }
  },
  "space": {
    "md": { "$value": "1rem", "$type": "dimension" }
  }
}
```

### shadcn/ui CSS variables
```css
:root {
  --background:         oklch(93.01% 0.00797 73.7);  /* paper */
  --card:               oklch(98.72% 0.00964 72.7);  /* card */
  --foreground:         oklch(28.26% 0.01383 57.7);  /* ink */
  --primary:            oklch(52.06% 0.14488 298.4); /* accent-strong (AA text/fill) */
  --primary-foreground: oklch(98.72% 0.00964 72.7);  /* accent-ink */
  --muted:              oklch(51.73% 0 0);           /* muted */
  --muted-foreground:   oklch(46% 0.008 70);         /* neutral */
  --border:             oklch(66% 0.032 67.2 / 0.2); /* rule */
  --input:              oklch(66% 0.032 67.2 / 0.32);/* rule-2 */
  --ring:               oklch(63.12% 0.17627 298.5); /* focus */
  --radius:             10px;
}
```
