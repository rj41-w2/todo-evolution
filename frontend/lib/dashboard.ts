/**
 * Dashboard presentation helpers.
 *
 * Everything here is pure and takes its `now` as an argument, so the greeting,
 * the date and any clock reading can be pinned by a test instead of depending on
 * when the suite happens to run. The component never calls `new Date()` in a way
 * no test can reach — it hands the helpers a real (or injected) instant.
 *
 * The locale is fixed to `en-GB` because the app's copy is English-only and a
 * visitor-locale-dependent format would make the rendered date unassertable.
 */

/** The parts of the day the greeting is drawn from. */
const AFTERNOON_FROM = 12;
const EVENING_FROM = 18;

export function greetingFor(now: Date): string {
  const hour = now.getHours();
  if (hour < AFTERNOON_FROM) return 'Good morning';
  if (hour < EVENING_FROM) return 'Good afternoon';
  return 'Good evening';
}

const DATE_FORMAT = new Intl.DateTimeFormat('en-GB', { dateStyle: 'full' });

/** Today's date as "Wednesday, 14 October 2026". */
export function formatToday(now: Date): string {
  return DATE_FORMAT.format(now);
}

const CLOCK_FORMAT = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });

/** An ISO instant as a 24h wall clock, "09:05". */
export function formatClockTime(iso: string): string {
  return CLOCK_FORMAT.format(new Date(iso));
}
