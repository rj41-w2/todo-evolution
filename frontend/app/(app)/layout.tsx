import AppShell from '../../components/AppShell';
import { OnboardingGate } from '../../components/OnboardingGate';

/**
 * Route group for every signed-in page. It has no URL segment of its own, so
 * `/` stays `/` — but login and register live outside the group and keep their
 * own focused-column presentation (ticket 01/09).
 *
 * The onboarding gate wraps the shell: the flag it reads is client-side, so it
 * cannot live in `proxy.ts`. Keeping it here (rather than inside `AppShell`)
 * leaves the shell component itself independent of first-run state.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <OnboardingGate>
      <AppShell>{children}</AppShell>
    </OnboardingGate>
  );
}
