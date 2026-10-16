'use client';

import React, { useCallback, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import GoalRow from './GoalRow';
import ConfirmDialog from './ConfirmDialog';
import { GoalFilter } from '../lib/goals';
import type { Goal, GoalUpdate } from '../types';

interface GoalListProps {
  goals: Goal[];
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => Promise<void>;
  onUpdateGoal: (goal: Goal, patch: GoalUpdate) => Promise<void>;
  /** Omitted by any future read-only view; when present every row can delete. */
  onDeleteGoal?: (goal: Goal) => Promise<void>;
  /** The active filter, used only to word the empty state honestly. */
  filter?: GoalFilter;
}

/**
 * The goals list, newest first. Rows stay in exactly the order the backend
 * returned; the status is a badge on each row, not a section header (issue #17).
 *
 * `loadMore` only appears while the backend still reports a cursor, and the
 * page owns the loading state, so an empty list here is either "no goals" (on
 * `All`) or "nothing matches this filter" — never both.
 *
 * The delete confirmation (issue #18) lives here rather than in `GoalRow`,
 * because a confirmed delete removes the row optimistically: a dialog owned by
 * the row would vanish with it, taking its pending state along.
 */
export default function GoalList({
  goals,
  hasMore,
  loadingMore,
  onLoadMore,
  onUpdateGoal,
  onDeleteGoal,
  filter = 'All',
}: GoalListProps) {
  const [deleteTarget, setDeleteTarget] = useState<Goal | null>(null);
  const [deleting, setDeleting] = useState(false);
  // Mirrors `deleting` for the stable callbacks below, so the dialog's Escape
  // handler can refuse to close mid-flight without re-running the focus trap on
  // every render.
  const deletingRef = useRef(false);

  const requestDelete = useCallback((goal: Goal) => setDeleteTarget(goal), []);

  const cancelDelete = useCallback(() => {
    if (deletingRef.current) return;
    setDeleteTarget(null);
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget || !onDeleteGoal || deletingRef.current) return;
    deletingRef.current = true;
    setDeleting(true);
    try {
      await onDeleteGoal(deleteTarget);
    } finally {
      deletingRef.current = false;
      setDeleting(false);
      setDeleteTarget(null);
    }
  }, [deleteTarget, onDeleteGoal]);

  if (goals.length === 0) {
    return (
      <div className="space-y-2">
        <div className="py-16 text-center space-y-1">
          {filter === 'All' ? (
            <>
              <p className="font-display text-lg font-semibold text-ink">No goals yet.</p>
              <p className="text-meta text-muted">Add your first one with the field above.</p>
            </>
          ) : (
            <>
              <p className="font-display text-lg font-semibold text-ink">
                No goals match this filter.
              </p>
              <p className="text-meta text-muted">Choose another filter to see the rest.</p>
            </>
          )}
        </div>

        <ConfirmDialog
          open={deleteTarget !== null}
          pending={deleting}
          title="Delete this goal?"
          description={
            deleteTarget
              ? `“${deleteTarget.title}” will be removed. This cannot be undone.`
              : undefined
          }
          confirmLabel="Delete"
          onConfirm={() => void confirmDelete()}
          onCancel={cancelDelete}
        />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <AnimatePresence mode="popLayout" initial={false}>
        {goals.map(goal => (
          <GoalRow
            key={goal.id}
            goal={goal}
            onUpdateGoal={onUpdateGoal}
            onRequestDelete={onDeleteGoal ? requestDelete : undefined}
          />
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

      <ConfirmDialog
        open={deleteTarget !== null}
        pending={deleting}
        title="Delete this goal?"
        description={
          deleteTarget
            ? `“${deleteTarget.title}” will be removed. This cannot be undone.`
            : undefined
        }
        confirmLabel="Delete"
        onConfirm={() => void confirmDelete()}
        onCancel={cancelDelete}
      />
    </div>
  );
}
