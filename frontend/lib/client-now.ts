import { useSyncExternalStore } from 'react';

/**
 * The visitor's clock, read once on the client.
 *
 * There is no way to know the visitor's local time during server rendering, so
 * the server snapshot is `null` and the server renders a time-free placeholder —
 * which also keeps hydration matching. `useSyncExternalStore` is used rather
 * than a `setState` inside an effect (React 19's lint rules reject that, and it
 * would risk the same hydration mismatch).
 */
const clock: Date | null = typeof window === 'undefined' ? null : new Date();

function subscribe(): () => void {
  // The clock is read once and never changes, so there is nothing to watch.
  return () => {};
}

function getSnapshot(): Date | null {
  return clock;
}

/** The server has no visitor clock, so it renders the placeholder. */
function getServerSnapshot(): Date | null {
  return null;
}

export function useClientNow(): Date | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
