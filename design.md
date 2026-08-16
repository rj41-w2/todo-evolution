# Design — EVO TODO

A locked design system for this app. Every page redesign reads this file before
emitting code. Do not regenerate per page — extend or amend this file when the
system needs to grow.

## Genre

modern-minimal — a task tool is a utility. Linear / Things school, executed as a
quiet workbench, not a clone. Light-first, dark optional, indigo reserved.

## Macrostructure family

- App pages:       **Workbench** — slim top rail + single-column task ledger
                    (hairline rows, grouped Open/Done sections with mono counts),
                    inline quick-add. Variation knobs: section grouping, count
                    placement, ledger density.
- Auth pages:       **Focused column** — quiet centred single-column form, no
                    hero, no decoration. Variation knobs: none (pages must match).

## Theme

Custom OKLCH palette anchored on brand indigo (hue ~262). Full token set in
`frontend/app/tokens.css`.

- `--color-paper`   oklch(97% 0.012 250)      · dark oklch(17% 0.015 262)
- `--color-paper-2` oklch(94% 0.015 250)      · dark oklch(21% 0.018 262)
- `--color-ink`     oklch(24% 0.03 262)       · dark oklch(94% 0.008 250)
- `--color-ink-2`   oklch(42% 0.02 258)       · dark oklch(80% 0.01 252)
- `--color-rule`    oklch(89% 0.012 250)      · dark oklch(29% 0.018 262)
- `--color-rule-2`  oklch(84% 0.014 250)      · dark oklch(35% 0.02 262)
- `--color-accent`  oklch(55% 0.19 262)       · dark oklch(70% 0.15 262)
- `--color-accent-ink` oklch(98% 0.01 250)    · dark oklch(20% 0.03 262)
- `--color-focus`   oklch(62% 0.15 265)       · dark oklch(72% 0.13 262)

Never switch hue between modes — only lightness and chroma move.

## Typography

- Display: **Space Grotesk**, weight 600–700, style **normal**. Letter-spacing
  -0.02em. Roman only — italic headers are banned.
- Body:    **Inter**, weight 400–500. UI density: 14–16 px, line-height 1.5.
- Mono:    **JetBrains Mono**, weight 500. Reserved for counts, dates, tags,
  meta — the outlier register, ≤ 2 slots per view.
- Type scale anchor: `--text-display` = clamp(2.5rem, 4vw + 1rem, 4rem); the
  dashboard header uses `--text-2xl` = clamp(1.75rem, 3vw, 2.5rem).
- Loaded via next/font in `app/layout.tsx`; exposed as `--font-display`,
  `--font-body`, `--font-mono`.

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

## Microinteractions stance

- Silent success. Completion toggle morphs circle → check. No success toasts.
- Optimistic updates with rollback (already in page.tsx — keep the pattern).
- Hover tooltips 800 ms delay · focus tooltips 0 ms.
- No `transition-all` anywhere. Specify properties.

## CTA voice

- Primary CTA: accent fill (`--color-accent`), text `--color-accent-ink`,
  radius 10 px, weight 600, press = translateY(1px). "Add task", "Sign in",
  "Create account".
- Secondary: ghost — ink text, hover `--color-paper-2`, hairline border.
- Danger: text `--color-danger`, ghost hover tint. Never a filled red button.

## Per-page allowances

- App pages MUST NOT use enrichment — function carries the page.
- Auth pages MUST NOT use enrichment.
- No photographic content anywhere in the app.

## What pages MUST share

- The wordmark "EVO TODO" (Space Grotesk 700; EVO in ink, TODO in accent).
- The accent colour and its placement: the "TODO" wordmark slice, the primary
  CTA fill, the completion toggle, focus rings — ≤ 5 % per viewport.
- The display + body + mono fonts.
- The CTA voice (radius 10 px, accent fill, accent-ink text).
- Hairline-rule dividers (`--color-rule`), never glass or glow.

## What pages MAY differ on

- The top rail: dashboard keeps user chip + theme + logout; auth pages show
  only the wordmark. Chatbot button + drawer exist only on the dashboard.
- Ledger density (row meta on one line on mobile, two on desktop).

## Exports

Drop-in formats for re-using this design system in other projects.

### tokens.css
```css
:root {
  --color-paper:      oklch(97% 0.012 250);
  --color-paper-2:    oklch(94% 0.015 250);
  --color-ink:        oklch(24% 0.03 262);
  --color-ink-2:      oklch(42% 0.02 258);
  --color-neutral:    oklch(55% 0.02 255);
  --color-muted:      oklch(45% 0.02 255);
  --color-rule:       oklch(89% 0.012 250);
  --color-rule-2:     oklch(84% 0.014 250);
  --color-accent:     oklch(55% 0.19 262);
  --color-accent-ink: oklch(98% 0.01 250);
  --color-focus:      oklch(62% 0.15 265);
  --color-success:    oklch(55% 0.13 150);
  --color-warn:       oklch(60% 0.15 70);
  --color-danger:     oklch(55% 0.19 25);

  --font-display: "Space Grotesk", "Inter", sans-serif;
  --font-body:    "Inter", ui-sans-serif, system-ui, sans-serif;
  --font-mono:    "JetBrains Mono", ui-monospace, monospace;

  --space-3xs: 0.125rem; --space-2xs: 0.25rem; --space-xs: 0.5rem;
  --space-sm: 0.75rem;   --space-md: 1rem;     --space-lg: 1.5rem;
  --space-xl: 2.5rem;    --space-2xl: 4rem;    --space-3xl: 6rem;

  --text-xs: 0.75rem; --text-sm: 0.875rem; --text-md: 1rem;
  --text-lg: 1.25rem; --text-xl: 1.5625rem; --text-2xl: 1.9531rem;

  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-in: cubic-bezier(0.7, 0, 0.84, 0);
  --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
  --dur-micro: 120ms; --dur-short: 220ms; --dur-long: 420ms;
  --radius-card: 10px; --radius-input: 10px;
}
```

### Tailwind v4 `@theme`
```css
@theme inline {
  --color-paper: var(--color-paper);
  --color-paper-2: var(--color-paper-2);
  --color-ink: var(--color-ink);
  --color-ink-2: var(--color-ink-2);
  --color-accent: var(--color-accent);
  --color-accent-ink: var(--color-accent-ink);
  --color-rule: var(--color-rule);
  --font-display: var(--font-display);
  --font-body: var(--font-body);
  --font-mono: var(--font-mono);
  /* mirror the rest of tokens.css with `--color-*` / `--font-*` keys */
}
```

### DTCG `tokens.json`
```json
{
  "color": {
    "paper":  { "$value": "oklch(97% 0.012 250)", "$type": "color" },
    "ink":    { "$value": "oklch(24% 0.03 262)",   "$type": "color" },
    "accent": { "$value": "oklch(55% 0.19 262)",   "$type": "color" }
  },
  "font": {
    "display": { "$value": "Space Grotesk", "$type": "fontFamily" },
    "body":    { "$value": "Inter",         "$type": "fontFamily" },
    "mono":    { "$value": "JetBrains Mono","$type": "fontFamily" }
  },
  "space": {
    "md": { "$value": "1rem", "$type": "dimension" }
  }
}
```

### shadcn/ui CSS variables
```css
:root {
  --background:        97%  0.012 250;   /* paper */
  --foreground:        24%  0.03  262;   /* ink */
  --primary:           55%  0.19  262;   /* accent */
  --primary-foreground: 98%  0.01  250;   /* accent-ink */
  --muted:             45%  0.02  255;   /* muted */
  --muted-foreground:  55%  0.02  255;   /* neutral */
  --border:            89%  0.012 250;   /* rule */
  --input:             84%  0.014 250;   /* rule-2 */
  --ring:              62%  0.15  265;   /* focus */
  --radius:            10px;
}
```