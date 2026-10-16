import type { GoalStatus } from '../types';

/**
 * The four goal statuses, in the order the create form and the editors offer
 * them. Kept in one place so the form, the row badge and the editor cannot
 * disagree about the set (issue #17).
 */
export const GOAL_STATUSES: readonly GoalStatus[] = ['Draft', 'Active', 'Paused', 'Completed'];

/**
 * The status pill's modifier class.
 *
 * Each variant keeps the label on an ink/ink-2 token over a soft surface, so
 * the badge stays AA-safe in both themes; the colour is the graphic, not the
 * text. `.pill` supplies the shape.
 */
export function goalStatusPillClass(status: GoalStatus): string {
  switch (status) {
    case 'Active':
      return 'pill pill--active';
    case 'Paused':
      return 'pill pill--paused';
    case 'Completed':
      return 'pill pill--completed';
    case 'Draft':
    default:
      return 'pill pill--draft';
  }
}

/** `2026-04-15` → `Apr 15, 2026`; a date-only string, so it is parsed as a day. */
export function formatTargetDate(value: string): string {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
