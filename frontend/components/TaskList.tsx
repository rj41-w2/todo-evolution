'use client';

import React from 'react';
import { AnimatePresence } from 'framer-motion';
import TaskRow from './TaskRow';
import { Task, TaskUpdate } from '../types';

interface TaskListProps {
  tasks: Task[];
  hasAnyTasks: boolean;
  onToggleStatus: (task: Task) => Promise<void>;
  onDeleteTask: (id: string) => Promise<void>;
  /** Passed straight through to each row; omit for a read-only view. */
  onUpdateTask?: (task: Task, patch: TaskUpdate) => Promise<void>;
}

/**
 * The ledger: open tasks then done tasks, each group counted. Rows are the
 * shared `TaskRow`, so the tasks page and the dashboard read identically.
 */
export default function TaskList({ tasks, hasAnyTasks, onToggleStatus, onDeleteTask, onUpdateTask }: TaskListProps) {
  const open = tasks.filter(t => t.status !== 'Completed');
  const done = tasks.filter(t => t.status === 'Completed');

  if (tasks.length === 0 && !hasAnyTasks) {
    return (
      <div className="py-16 text-center space-y-1">
        <p className="font-display text-lg font-semibold text-ink">No tasks yet.</p>
        <p className="text-meta text-muted">Add your first one with the field above.</p>
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="text-meta text-muted">No tasks match this view.</p>
      </div>
    );
  }

  const renderRows = (group: Task[]) => (
    <AnimatePresence mode="popLayout" initial={false}>
      {group.map(task => (
        <TaskRow
          key={task.id}
          task={task}
          onToggleStatus={onToggleStatus}
          onDeleteTask={onDeleteTask}
          onUpdateTask={onUpdateTask}
        />
      ))}
    </AnimatePresence>
  );

  return (
    <div className="space-y-8">
      {open.length > 0 && (
        <section>
          <div className="section-head">
            <h2 className="section-head-title">Open</h2>
            <span className="section-head-count">{open.length}</span>
          </div>
          {renderRows(open)}
        </section>
      )}

      {done.length > 0 && (
        <section>
          <div className="section-head">
            <h2 className="section-head-title">Done</h2>
            <span className="section-head-count">{done.length}</span>
          </div>
          {renderRows(done)}
        </section>
      )}
    </div>
  );
}
