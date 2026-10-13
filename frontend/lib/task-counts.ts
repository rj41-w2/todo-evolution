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
