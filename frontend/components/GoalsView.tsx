'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, X } from 'lucide-react';
import GoalForm from './GoalForm';
import GoalList from './GoalList';
import { useGoals } from './GoalsProvider';

/**
 * The goals page body. It reads the `GoalsProvider` it is mounted inside, so
 * the create form, the list and the paging control all share one source of
 * truth. Loading, empty and error states are all explicit: none of them is
 * allowed to look like "there is nothing here" when there is.
 */
export default function GoalsView() {
  const { goals, loading, loadingMore, hasMore, error, dismissError, loadMore, createGoal, updateGoal } = useGoals();
  const total = goals.length;

  return (
    <div className="space-y-6">
      <section className="space-y-1">
        <h1 className="page-header text-[length:var(--text-2xl)]">Goals</h1>
        <p className="font-mono text-meta text-muted" data-testid="goal-total">
          {loading ? '…' : `${total} ${total === 1 ? 'goal' : 'goals'}`}
        </p>
      </section>

      <GoalForm onGoalCreated={createGoal} />

      {error && (
        <div role="alert" className="alert">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <p className="flex-1 text-meta">{error}</p>
          <button onClick={dismissError} aria-label="Dismiss error" className="icon-btn">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div
            key="loader"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex justify-center items-center py-16"
          >
            <div className="h-8 w-8 border-2 border-rule-2 border-t-accent rounded-full animate-spin" />
          </motion.div>
        ) : (
          <motion.div key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <GoalList
              goals={goals}
              hasMore={hasMore}
              loadingMore={loadingMore}
              onLoadMore={loadMore}
              onUpdateGoal={updateGoal}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
