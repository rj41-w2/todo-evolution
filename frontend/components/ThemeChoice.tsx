'use client';

import { useSyncExternalStore } from 'react';
import { useTheme } from 'next-themes';
import { Monitor, Moon, Sun } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const THEMES: { value: 'light' | 'dark' | 'system'; label: string; icon: LucideIcon }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

/**
 * The full theme surface: pick light, dark or follow the OS. It drives the same
 * `next-themes` state the shell's quick toggle does, so the two never disagree.
 * Renders nothing until mounted to avoid a hydration mismatch (the selected
 * theme is only known on the client).
 */
export function ThemeChoice() {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );

  if (!mounted) return null;

  return (
    <div role="group" aria-label="Theme" className="flex flex-wrap gap-2">
      {THEMES.map(({ value, label, icon: Icon }) => {
        const selected = theme === value;
        return (
          <button
            key={value}
            type="button"
            aria-pressed={selected}
            onClick={() => setTheme(value)}
            className={`inline-flex items-center gap-2 h-10 px-4 rounded-[var(--radius-input)] border text-sm font-medium transition-colors cursor-pointer ${
              selected
                ? 'border-transparent bg-accent-soft text-ink'
                : 'border-rule-2 bg-paper text-ink-2 hover:bg-paper-2 hover:text-ink'
            }`}
          >
            <Icon className="h-4 w-4" strokeWidth={1.75} />
            {label}
          </button>
        );
      })}
    </div>
  );
}
