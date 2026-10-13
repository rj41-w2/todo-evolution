'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useWorkspace } from '../lib/workspace';

/**
 * Sends a signed-in visitor through the one-time first-run step the first time
 * they reach the app.
 *
 * The onboarding flag lives in localStorage — it is client state, not a cookie —
 * so this gate belongs in the shell, not in `proxy.ts`. It renders its children
 * unconditionally and only redirects once it actually knows the flag; while the
 * flag is unknown (SSR/hydration) and when storage is blocked (which reads as
 * "already onboarded") it does nothing, so it can never bounce a visitor in a
 * redirect loop.
 */
export function OnboardingGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const workspace = useWorkspace();

  useEffect(() => {
    if (workspace && !workspace.onboarded) {
      router.replace('/onboarding');
    }
  }, [workspace, router]);

  return <>{children}</>;
}
