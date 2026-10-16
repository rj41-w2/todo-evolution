'use client';

import React from 'react';
import { GOAL_FILTERS, GoalFilter } from '../lib/goals';

interface GoalTabsProps {
  value: GoalFilter;
  onChange: (filter: GoalFilter) => void;
}

/** The tab label. `Done` is the visible word for the stored `Completed` status. */
const LABELS: Record<GoalFilter, string> = {
  All: 'All',
  Active: 'Active',
  Done: 'Done',
  Draft: 'Draft',
  Paused: 'Paused',
};

/**
 * The goal lifecycle tabs (issue #18).
 *
 * Deliberately no per-tab counts: the list is server-filtered and paged, so a
 * client-side count could only ever describe the pages loaded so far and would
 * disagree with the server the moment a filter had more rows than one page.
 * The tabs therefore make no numeric promise they cannot keep.
 */
export default function GoalTabs({ value, onChange }: GoalTabsProps) {
  return (
    <div
      role="tablist"
      aria-label="Filter goals by status"
      className="flex flex-wrap items-center gap-1"
    >
      {GOAL_FILTERS.map(filter => {
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
          </button>
        );
      })}
    </div>
  );
}
