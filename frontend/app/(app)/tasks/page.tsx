'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, X } from 'lucide-react';
import TaskForm from '../../../components/TaskForm';
import TaskList from '../../../components/TaskList';
import TaskTabs from '../../../components/TaskTabs';
import { useTasks } from '../../../components/TasksProvider';
import { countByFilter, filterTasks, TaskFilter } from '../../../lib/task-filter';

/**
 * The all-tasks page. It reads the shared `useTasks` source, so the right status
 * rail and every other view move with it — there is no second copy of the list
 * to drift.
 */
export default function TasksPage() {
  const { tasks, loading, error, dismissError, createTask, toggleTaskStatus, deleteTask } = useTasks();
  const [filter, setFilter] = useState<TaskFilter>('All');

  const counts = countByFilter(tasks);
  const visible = filterTasks(tasks, filter);
  const total = counts.All;

  return (
    <div className="space-y-6">
      <section className="space-y-1">
        <h1 className="page-header text-[length:var(--text-2xl)]">Tasks</h1>
        <p className="font-mono text-meta text-muted" data-testid="task-total">
          {loading ? '…' : `${total} ${total === 1 ? 'task' : 'tasks'}`}
        </p>
      </section>

      <TaskForm onTaskCreated={createTask} />

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
        ) : (
          <TaskList
            key="ledger"
            tasks={visible}
            hasAnyTasks={total > 0}
            onToggleStatus={toggleTaskStatus}
            onDeleteTask={deleteTask}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
