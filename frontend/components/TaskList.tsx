'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Circle, Trash2, Tag, Calendar } from 'lucide-react';
import { Task } from '../types';

interface TaskListProps {
  tasks: Task[];
  onToggleStatus: (task: Task) => Promise<void>;
  onDeleteTask: (id: string) => Promise<void>;
}

const priorityDot: Record<string, string> = {
  High: 'var(--color-danger)',
  Medium: 'var(--color-warn)',
  Low: 'var(--color-muted)',
};

const EASE_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function TaskList({ tasks, onToggleStatus, onDeleteTask }: TaskListProps) {
  const open = tasks.filter(t => t.status !== 'Completed');
  const done = tasks.filter(t => t.status === 'Completed');

  if (tasks.length === 0) {
    return (
      <div className="py-16 text-center space-y-1">
        <p className="font-display text-lg font-semibold text-ink">No tasks yet.</p>
        <p className="text-sm text-muted">Add your first one with the field above.</p>
      </div>
    );
  }

  if (open.length === 0 && done.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-muted">No tasks match your filters.</p>
      </div>
    );
  }

  const renderRows = (group: Task[]) => (
    <AnimatePresence mode="popLayout" initial={false}>
      {group.map(task => {
        const isDone = task.status === 'Completed';
        const overdue = task.due_date && new Date(task.due_date) < new Date() && !isDone;

        return (
          <motion.div
            key={task.id}
            layout
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: EASE_OUT }}
            className="ledger-row"
          >
            <button
              onClick={() => onToggleStatus(task)}
              aria-label={isDone ? 'Mark as open' : 'Mark as complete'}
              className="icon-btn mt-0.5 shrink-0"
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={isDone ? 'done' : 'open'}
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.8, opacity: 0 }}
                  transition={{ duration: 0.15, ease: EASE_OUT }}
                  className="flex"
                >
                  {isDone
                    ? <CheckCircle2 className="h-5 w-5 text-success" />
                    : <Circle className="h-5 w-5 text-muted" />}
                </motion.span>
              </AnimatePresence>
            </button>

            <div className="flex-1 min-w-0 space-y-1.5">
              <div className="flex items-start justify-between gap-3">
                <h3 className={`task-title ${isDone ? 'task-title--done' : ''}`}>
                  {task.title}
                </h3>
                <button
                  onClick={() => onDeleteTask(task.id)}
                  aria-label={`Delete ${task.title}`}
                  className="icon-btn-danger shrink-0"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              {task.description && (
                <p className="task-desc line-clamp-1">{task.description}</p>
              )}

              {(task.tags.length > 0 || task.due_date) && (
                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  <span className="chip">
                    <span
                      className="h-1.5 w-1.5 rounded-full shrink-0"
                      style={{ background: priorityDot[task.priority] }}
                    />
                    {task.priority}
                  </span>

                  {task.tags.map(tag => (
                    <span key={tag} className="chip">
                      <Tag className="h-3 w-3" />
                      {tag}
                    </span>
                  ))}

                  {task.due_date && (
                    <span className={`chip ${overdue ? 'text-danger bg-danger-soft border-danger-soft' : ''}`}>
                      <Calendar className="h-3 w-3" />
                      Due {formatDate(task.due_date)}
                    </span>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        );
      })}
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