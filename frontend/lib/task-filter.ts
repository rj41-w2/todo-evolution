import type { Status, Task } from '../types';

/**
 * The filter tabs the tasks views share.
 *
 * `Status` is the two states the backend actually models, so there is nowhere
 * for a fake "In Progress" / "Blocked" tab to hide. `All` is the default view.
 */
export type TaskFilter = 'All' | Status;

export const TASK_FILTERS: TaskFilter[] = ['All', 'Pending', 'Completed'];

export interface TaskFilterCounts {
  All: number;
  Pending: number;
  Completed: number;
}

/** The tasks a tab shows — `All` is the untouched list. */
export function filterTasks(tasks: Task[], filter: TaskFilter): Task[] {
  if (filter === 'All') return tasks;
  return tasks.filter(t => t.status === filter);
}

/**
 * Live per-tab counts, computed from the real tasks the API returned. Every
 * tab is counted from the same array, so a tab can never disagree with the
 * ledger it filters.
 */
export function countByFilter(tasks: Task[]): TaskFilterCounts {
  const completed = tasks.filter(t => t.status === 'Completed').length;
  return { All: tasks.length, Pending: tasks.length - completed, Completed: completed };
}
