import { describe, it, expect } from 'vitest';
import {
  GOAL_FILTERS,
  goalMatchesFilter,
  goalStatusForFilter,
} from './goals';
import type { Goal } from '../types';

function goal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: 'g1',
    title: 'Run a half marathon',
    description: null,
    target_date: null,
    status: 'Draft',
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('goalStatusForFilter', () => {
  it('maps Done to the stored Completed status', () => {
    // The tab says "Done"; the enum says "Completed". If this mapping drifts,
    // the Done tab silently shows nothing while the backend holds the rows.
    expect(goalStatusForFilter('Done')).toBe('Completed');
  });

  it('treats All as no filter at all', () => {
    // `null`, not a status: `All` must omit the query parameter, or the backend
    // would look for a status literally called "All" and return nothing.
    expect(goalStatusForFilter('All')).toBeNull();
  });

  it('passes the remaining statuses through unchanged', () => {
    expect(goalStatusForFilter('Active')).toBe('Active');
    expect(goalStatusForFilter('Draft')).toBe('Draft');
    expect(goalStatusForFilter('Paused')).toBe('Paused');
  });

  it('offers the five agreed tabs in order', () => {
    expect([...GOAL_FILTERS]).toEqual(['All', 'Active', 'Done', 'Draft', 'Paused']);
  });
});

describe('goalMatchesFilter', () => {
  it('matches everything on All', () => {
    expect(goalMatchesFilter(goal({ status: 'Paused' }), 'All')).toBe(true);
  });

  it('matches only the mapped status otherwise', () => {
    expect(goalMatchesFilter(goal({ status: 'Completed' }), 'Done')).toBe(true);
    expect(goalMatchesFilter(goal({ status: 'Active' }), 'Done')).toBe(false);
    expect(goalMatchesFilter(goal({ status: 'Active' }), 'Active')).toBe(true);
  });
});
