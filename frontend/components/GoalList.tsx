'use client';

import React from 'react';
import { AnimatePresence } from 'framer-motion';
import GoalRow from './GoalRow';
import type { Goal, GoalUpdate } from '../types';

interface GoalListProps {
  goals: Goal[];
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => Promise<void>;
  onUpdateGoal: (goal: Goal, patch: GoalUpdate) => Promise<void>;
}

/**
 * The goals list, newest first. One list, no grouping or filtering by status —
 * the status is a badge on each row, not a section header (issue #17).
 *
 * `loadMore` only appears while the backend still reports a cursor, and the
 * row order is exactly what the backend returned; nothing here sorts. The
 * page owns the loading state, so an empty list here always means "no goals".
 */
export default function GoalList({
  goals,
  hasMore,
  loadingMore,
  onLoadMore,
  onUpdateGoal,
}: GoalListProps) {
  if (goals.length === 0) {
    return (
      <div className="py-16 text-center space-y-1">
        <p className="font-display text-lg font-semibold text-ink">No goals yet.</p>
        <p className="text-meta text-muted">Add your first one with the field above.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <AnimatePresence mode="popLayout" initial={false}>
        {goals.map(goal => (
          <GoalRow key={goal.id} goal={goal} onUpdateGoal={onUpdateGoal} />
        ))}
      </AnimatePresence>

      {hasMore && (
        <div className="pt-4 text-center">
          <button
            type="button"
            onClick={() => void onLoadMore()}
            disabled={loadingMore}
            className="btn-ghost"
          >
            {loadingMore ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  );
}
