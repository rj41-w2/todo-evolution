import type { Goal, GoalStatus } from '../types';

/**
 * The four goal statuses, in the order the create form and the editors offer
 * them. Kept in one place so the form, the row badge and the editor cannot
 * disagree about the set (issue #17).
 */
export const GOAL_STATUSES: readonly GoalStatus[] = ['Draft', 'Active', 'Paused', 'Completed'];

/**
 * The lifecycle filters the Goals page offers (issue #18).
 *
 * `Done` is a UI word for the `Completed` status — the tab label and the stored
 * status are deliberately different names, and `goalStatusForFilter` is the one
 * place that translates between them. `All` is not a status: it means "send no
 * filter at all", which is why it maps to `null` rather than to a real value.
 */
export type GoalFilter = 'All' | 'Active' | 'Done' | 'Draft' | 'Paused';

/** Tab order on the Goals page: broadest first, then by lifecycle. */
export const GOAL_FILTERS: readonly GoalFilter[] = ['All', 'Active', 'Done', 'Draft', 'Paused'];

/**
 * The status a filter narrows to, or `null` for `All`.
 *
 * `Done → Completed` because that is the only mapping the stored enum does not
 * already make; every other filter is its own status.
 */
export function goalStatusForFilter(filter: GoalFilter): GoalStatus | null {
  if (filter === 'All') return null;
  if (filter === 'Done') return 'Completed';
  return filter;
}

/** Whether a goal belongs in the current filter's result set. */
export function goalMatchesFilter(goal: Goal, filter: GoalFilter): boolean {
  const status = goalStatusForFilter(filter);
  return status === null || goal.status === status;
}

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
