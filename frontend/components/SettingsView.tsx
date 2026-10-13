'use client';

import { useTasks } from './TasksProvider';
import { ThemeChoice } from './ThemeChoice';
import { SignOutButton } from './SignOutButton';

/**
 * The settings surface. It exposes only the two things the app can actually
 * honour — appearance (the same theme state the shell toggles) and the
 * signed-in account (the real identity the session reports, with sign-out).
 * Settings the app has no backing for are omitted, not rendered inert.
 */
export function SettingsView() {
  const { user } = useTasks();
  const initial = user?.name?.charAt(0)?.toUpperCase() || 'U';

  return (
    <div className="space-y-8">
      <section className="space-y-1.5">
        <p className="font-mono text-micro uppercase tracking-[0.08em] text-muted">Preferences</p>
        <h1 className="page-header text-[var(--text-2xl)]">Settings</h1>
        <p className="max-w-prose text-md text-ink-2">
          The things that are yours to change: how the app looks, and the account you are signed in as.
        </p>
      </section>

      <section className="space-y-4">
        <div className="section-head">
          <h2 className="section-head-title">Appearance</h2>
        </div>
        <p className="text-sm text-ink-2">
          Warm light is the default. Dark is always available; System follows your device.
        </p>
        <ThemeChoice />
      </section>

      <section className="space-y-4">
        <div className="section-head">
          <h2 className="section-head-title">Profile</h2>
        </div>
        {user ? (
          <div className="flex items-center gap-3 rounded-[var(--radius-card)] border border-rule bg-paper-2 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-input)] bg-accent-soft text-sm font-semibold uppercase text-accent-strong">
              {initial}
            </div>
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-medium text-ink">{user.name}</p>
              <p className="truncate text-meta text-muted">{user.email}</p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted">Loading your profile…</p>
        )}
      </section>

      <section className="space-y-4">
        <div className="section-head">
          <h2 className="section-head-title">Session</h2>
        </div>
        <p className="text-sm text-ink-2">
          Signing out clears this session and returns you to the login page.
        </p>
        <SignOutButton />
      </section>
    </div>
  );
}
