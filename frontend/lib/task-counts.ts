import type { Task } from '../types';

export interface TaskCounts {
  total: number;
  open: number;
  done: number;
}

/**
 * Counts the real tasks the API returned — never a filtered view. The status
 * rail and any page badges share this so a count can't disagree with the ledger.
 */
export function countTasks(tasks: Task[]): TaskCounts {
  const done = tasks.filter(t => t.status === 'Completed').length;
  return { total: tasks.length, open: tasks.length - done, done };
}

/**
 * The share of the ledger that is done, rounded to a whole percent. Shared by
 * the status rail and the dashboard so the two can never show different figures.
 */
export function completionPercent(counts: TaskCounts): number {
  if (counts.total === 0) return 0;
  return Math.round((counts.done / counts.total) * 100);
}

/**
 * How many tasks are overdue: not completed and with a `due_date` strictly in
 * the past. This is the same definition the ledger row uses to tint its due
 * chip, so the dashboard card and the row agree.
 */
export function countOverdue(tasks: Task[], now: Date): number {
  return tasks.filter(
    t => t.status !== 'Completed' && t.due_date !== null && new Date(t.due_date) < now,
  ).length;
}
