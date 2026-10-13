import type { Task } from '../types';
import { TaskFilter } from './task-filter';

/**
 * The view logic My Tasks adds on top of the shared filter.
 *
 * Accounts are single-user, so there is no assignee to filter by and nothing to
 * partition per person: the page is simply the signed-in user's own outstanding
 * work. That is why it opens on the not-done filter rather than `All`.
 */
export const DEFAULT_MY_TASKS_FILTER: TaskFilter = 'Pending';

export interface MyTasksEmptyState {
  title: string;
  body: string;
}

/**
 * Honest copy for an empty ledger. It names the real reason the view is empty —
 * nothing open, nothing completed yet, or no tasks at all — instead of crying
 * error for what is the normal state of an empty list.
 */
export function myTasksEmptyState(filter: TaskFilter, tasks: Task[]): MyTasksEmptyState {
  if (filter === 'Completed') {
    return {
      title: 'Nothing completed yet.',
      body: 'Tasks you complete will be listed here.',
    };
  }

  if (filter === 'Pending' && tasks.length > 0) {
    return {
      title: 'All clear.',
      body: 'Nothing is open right now — everything you have is done.',
    };
  }

  return {
    title: 'No tasks yet.',
    body: 'Add a task and it will show up here.',
  };
}
