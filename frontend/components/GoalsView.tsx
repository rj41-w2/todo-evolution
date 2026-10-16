'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, X } from 'lucide-react';
import GoalForm from './GoalForm';
import GoalList from './GoalList';
import GoalTabs from './GoalTabs';
import { useGoals } from './GoalsProvider';

/**
 * The goals page body. It reads the `GoalsProvider` it is mounted inside, so
 * the create form, the status filter, the list and the paging control all share
 * one source of truth. Loading, empty and error states are all explicit: none of
 * them is allowed to look like "there is nothing here" when there is.
 *
 * The filter is sent to the server, not applied to the rows already loaded, so
 * each tab describes every matching goal rather than one cursor page.
 */
export default function GoalsView() {
  const {
    goals,
    loading,
    loadingMore,
    hasMore,
    filter,
    setFilter,
    error,
    dismissError,
    loadMore,
    createGoal,
    updateGoal,
    deleteGoal,
  } = useGoals();
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

      <GoalTabs value={filter} onChange={setFilter} />

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
              filter={filter}
              hasMore={hasMore}
              loadingMore={loadingMore}
              onLoadMore={loadMore}
              onUpdateGoal={updateGoal}
              onDeleteGoal={deleteGoal}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
