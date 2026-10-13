'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { completeOnboarding, skipOnboarding, useWorkspace } from '../lib/workspace';

/**
 * The one-time first-run step. It sits outside the app shell (like login and
 * register) so it reads as a focused full-screen moment rather than a page
 * inside the chrome. Naming is optional: "Skip for now" is a first-class path,
 * not an error path.
 */
export function OnboardingView() {
  const router = useRouter();
  const workspace = useWorkspace();
  const [name, setName] = useState('');

  // Already through first-run (or storage is blocked): this step has no business
  // showing itself, so send the visitor to the dashboard.
  useEffect(() => {
    if (workspace?.onboarded) router.replace('/');
  }, [workspace, router]);

  if (workspace?.onboarded) return null;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    completeOnboarding(name);
    router.replace('/');
  };

  const handleSkip = () => {
    skipOnboarding();
    router.replace('/');
  };

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center bg-paper px-4 py-12">
      <main className="w-full max-w-sm">
        <div className="text-center mb-6">
          <p className="wordmark inline-block">
            EVO<span className="text-accent-strong">TODO</span>
          </p>
        </div>

        <div className="bg-card border border-rule rounded-[var(--radius-panel)] shadow-card p-6 sm:p-8">
          <header className="space-y-1.5 mb-6">
            <h1 className="page-header text-[length:var(--text-2xl)]">Name your workspace.</h1>
            <p className="text-sm text-muted">
              It becomes the label at the top of your sidebar.
            </p>
          </header>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="workspace-name" className="field-label">
                Workspace name
              </label>
              <input
                id="workspace-name"
                name="workspace"
                type="text"
                autoComplete="organization"
                value={name}
                onChange={event => setName(event.target.value)}
                placeholder="Acme Team"
                className="input"
                required
              />
            </div>

            <button type="submit" className="btn-primary w-full">
              Continue
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </button>
          </form>

          <p className="text-center text-sm text-muted mt-6 pt-6 border-t border-rule">
            <button
              type="button"
              onClick={handleSkip}
              className="text-accent-strong font-medium hover:underline cursor-pointer"
            >
              Skip for now
            </button>
          </p>
        </div>
      </main>
    </div>
  );
}
