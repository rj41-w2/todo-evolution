'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, ArrowRight, X } from 'lucide-react';
import TaskList from '../../../components/TaskList';
import TaskTabs from '../../../components/TaskTabs';
import { useTasks } from '../../../components/TasksProvider';
import { countByFilter, filterTasks, TaskFilter } from '../../../lib/task-filter';
import { DEFAULT_MY_TASKS_FILTER, myTasksEmptyState } from '../../../lib/my-tasks';

/**
 * The signed-in user's own outstanding work.
 *
 * Accounts are single-user, so there is no assignee concept here: no avatar, no
 * per-person filter, nothing partitioned by anyone else. The page reads the
 * shared `useTasks` source — the same one the status rail uses — so completing a
 * task clears it from this view at once, without a reload, because there is no
 * second copy of the list to go stale.
 */
export default function MyTasksPage() {
  const { tasks, loading, error, dismissError, updateTask, toggleTaskStatus, deleteTask } = useTasks();
  const [filter, setFilter] = useState<TaskFilter>(DEFAULT_MY_TASKS_FILTER);

  const counts = countByFilter(tasks);
  const visible = filterTasks(tasks, filter);
  const empty = myTasksEmptyState(filter, tasks);

  return (
    <div className="space-y-6">
      <section className="space-y-1">
        <h1 className="page-header text-[length:var(--text-2xl)]">My Tasks</h1>
        <p className="font-mono text-meta text-muted">
          {loading ? '…' : `${counts.Pending} open`}
        </p>
      </section>

      {error && (
        <div role="alert" className="alert">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <p className="flex-1 text-meta">{error}</p>
          <button onClick={dismissError} aria-label="Dismiss error" className="icon-btn">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <TaskTabs value={filter} onChange={setFilter} counts={counts} />

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
        ) : visible.length === 0 ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="py-16 text-center space-y-1"
          >
            <p className="font-display text-lg font-semibold text-ink">{empty.title}</p>
            <p className="text-meta text-muted">{empty.body}</p>
            <div className="pt-4">
              <Link href="/tasks" className="btn-ghost">
                Go to tasks
                <ArrowRight className="h-4 w-4" strokeWidth={1.75} />
              </Link>
            </div>
          </motion.div>
        ) : (
          <TaskList
            key="ledger"
            tasks={visible}
            hasAnyTasks={counts.All > 0}
            onToggleStatus={toggleTaskStatus}
            onDeleteTask={deleteTask}
            onUpdateTask={updateTask}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
