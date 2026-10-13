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
 * A task is overdue when it is **not** `Completed` **and** its due date is
 * strictly **before today** (i.e. before the start of `now`'s day). A task due
 * *today* is **not** overdue. Accepts `now` so tests can pin the boundary.
 */
export function isOverdue(task: Task, now: Date): boolean {
  if (task.status === 'Completed') return false;
  if (task.due_date === null) return false;
  const due = new Date(task.due_date);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return due < today;
}

/**
 * How many tasks are overdue: not completed and with a `due_date` strictly in
 * the past (before today). This uses the same `isOverdue` predicate the ledger
 * row uses to tint its due chip, so the dashboard card and the row agree.
 */
export function countOverdue(tasks: Task[], now: Date): number {
  return tasks.filter(t => isOverdue(t, now)).length;
}
