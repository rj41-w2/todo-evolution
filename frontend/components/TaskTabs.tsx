'use client';

import React from 'react';
import { TASK_FILTERS, TaskFilter, TaskFilterCounts } from '../lib/task-filter';

interface TaskTabsProps {
  value: TaskFilter;
  onChange: (filter: TaskFilter) => void;
  counts: TaskFilterCounts;
}

const LABELS: Record<TaskFilter, string> = {
  All: 'All',
  Pending: 'Pending',
  Completed: 'Completed',
};

/**
 * The shared status tabs. Only the two statuses the backend models are offered,
 * and every count is read from the real tasks, so a tab can never promise a
 * view that has nothing behind it.
 */
export default function TaskTabs({ value, onChange, counts }: TaskTabsProps) {
  return (
    <div
      role="tablist"
      aria-label="Filter tasks by status"
      className="flex shrink-0 items-center gap-1"
    >
      {TASK_FILTERS.map(filter => {
        const selected = value === filter;
        return (
          <button
            key={filter}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(filter)}
            className={`tab ${selected ? 'tab--active' : ''}`}
          >
            {LABELS[filter]}
            <span className="tab-count">{counts[filter]}</span>
          </button>
        );
      })}
    </div>
  );
}
