import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Tailwind v4 cannot infer the type of a bare `var()` reference, so
 * `text-[var(--text-2xl)]` compiles to an INVALID `color: var(--text-2xl)`
 * declaration — the element gets no `font-size` at all and silently renders at
 * inherited body size. A font-size token must be written with an explicit type
 * hint: `text-[length:var(--text-2xl)]`.
 *
 * This regressed twice (five pages in the shell/auth/placeholder tickets, then
 * again in a brand-new component), which is why it is pinned as a guard rather
 * than fixed case by case.
 */

const FRONTEND_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SKIP_DIRS = new Set(['node_modules', '.next', '.git']);
const AMBIGUOUS = /text-\[var\(--text-/;

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) sourceFiles(`${dir}/${entry.name}`, found);
    } else if (entry.name.endsWith('.tsx')) {
      found.push(`${dir}/${entry.name}`);
    }
  }
  return found;
}

describe('heading size utilities', () => {
  it('never uses a --text-* token in the ambiguous text-[var(...)] shorthand', () => {
    const offenders = sourceFiles(FRONTEND_ROOT).flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .map((line, index) => ({ line, index }))
        .filter(({ line }) => AMBIGUOUS.test(line))
        .map(
          ({ index }) =>
            `${file.replace(`${FRONTEND_ROOT}/`, '')}:${index + 1} — use text-[length:var(--text-…)] instead`,
        ),
    );

    expect(offenders).toEqual([]);
  });
});
