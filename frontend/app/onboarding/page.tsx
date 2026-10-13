import { OnboardingView } from '../../components/OnboardingView';

/**
 * The first-run step deliberately sits outside the `(app)` route group, like
 * login and register, so it renders as a focused full-screen moment rather than
 * inside the shell chrome.
 */
export default function OnboardingPage() {
  return <OnboardingView />;
}
