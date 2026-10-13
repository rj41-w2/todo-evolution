import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Every focused control must show the app's focus ring.
 *
 * `globals.css` draws the ring from two base-layer rules: `:focus { outline: none }`
 * (so a mouse click shows nothing) and, immediately after it, `:focus-visible {
 * outline: 2px solid var(--color-focus) }`. A Tailwind `outline-none` /
 * `outline-hidden` utility compiles into the *utilities* layer — which outranks
 * the base layer no matter the specificity — so `.focus\:outline-none:focus`
 * re-declares `outline-style: none` and wins. The computed style then reads
 * `none 2px <accent>`: the width and colour arrive, the style is overridden, and
 * nothing is drawn.
 *
 * The flat form controls carried that class twice (TaskForm and TaskEditForm,
 * five fields each, plus the date input's internal segments), which is why they
 * went dark part-way through the Tab order on `/tasks` in both themes. Pinned as
 * a guard so it cannot regress a third time.
 *
 * The ring needs one more rule than the two above. A date input walks its
 * internal segments as extra Tab stops, and there the host matches
 * `:focus-within` only — `:focus` and `:focus-visible` are both false — so a
 * bare `:focus-visible` rule leaves the field looking unfocused. The second test
 * pins the `:focus-within` rule that covers it.
 */

const FRONTEND_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SKIP_DIRS = new Set(['node_modules', '.next', '.git']);
const SUPPRESSES_THE_RING = /\boutline-(none|hidden)\b/;

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) sourceFiles(`${dir}/${entry.name}`, found);
    } else if (/\.tsx?$/.test(entry.name) && !entry.name.includes('.test.')) {
      found.push(`${dir}/${entry.name}`);
    }
  }
  return found;
}

describe('focus ring', () => {
  it('never suppresses it with a Tailwind outline utility', () => {
    const offenders = sourceFiles(FRONTEND_ROOT).flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .map((line, index) => ({ line, index }))
        .filter(({ line }) => SUPPRESSES_THE_RING.test(line))
        .map(
          ({ index }) =>
            `${file.replace(`${FRONTEND_ROOT}/`, '')}:${index + 1} — outline-none/outline-hidden beats the global :focus-visible ring; drop it`,
        ),
    );

    expect(offenders).toEqual([]);
  });

  it('draws the ring for a control that holds focus internally (date input)', () => {
    const css = readFileSync(join(FRONTEND_ROOT, 'app/globals.css'), 'utf8');
    const rule = /input\[type="date"\]\s*:\s*focus-within[^{]*\{[^}]*var\(--color-focus\)[^}]*\}/;

    expect(css).toMatch(rule);
  });
});
