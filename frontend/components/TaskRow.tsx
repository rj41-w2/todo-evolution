'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Circle, Trash2, Tag, Calendar, Pencil } from 'lucide-react';
import { Task, TaskUpdate } from '../types';
import TaskEditForm from './TaskEditForm';

interface TaskRowProps {
  task: Task;
  onToggleStatus: (task: Task) => Promise<void>;
  onDeleteTask: (id: string) => Promise<void>;
  /**
   * Omitted by views that are read-only for now; when present the row offers an
   * in-place editor. Views that share this row get the same editing for free.
   */
  onUpdateTask?: (task: Task, patch: TaskUpdate) => Promise<void>;
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

/**
 * One dense ledger row: completion marker, title, status pill, optional
 * description and the meta line of priority, tags and due date. Shared by the
 * tasks views so a row reads the same wherever it appears.
 *
 * When a view hands it `onUpdateTask` the row also edits itself in place, so
 * editing keeps the ledger's density instead of opening a dialog.
 */
export default function TaskRow({ task, onToggleStatus, onDeleteTask, onUpdateTask }: TaskRowProps) {
  const [editing, setEditing] = useState(false);
  const isDone = task.status === 'Completed';
  const overdue = task.due_date && new Date(task.due_date) < new Date() && !isDone;
  const showEditor = editing && !!onUpdateTask;

  return (
    <motion.div
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
              ? <CheckCircle2 className="h-5 w-5 text-accent" />
              : <Circle className="h-5 w-5 text-muted" />}
          </motion.span>
        </AnimatePresence>
      </button>

      <div className="flex-1 min-w-0 space-y-1.5">
        {showEditor && onUpdateTask ? (
          <TaskEditForm task={task} onSave={onUpdateTask} onClose={() => setEditing(false)} />
        ) : (
          <>
            <div className="flex items-start justify-between gap-3">
              <h3 className={`task-title ${isDone ? 'task-title--done' : ''}`}>
                {task.title}
              </h3>
              <div className="flex items-center gap-1 shrink-0">
                {onUpdateTask && (
                  <button
                    onClick={() => setEditing(true)}
                    aria-label={`Edit ${task.title}`}
                    className="icon-btn"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                )}
                <button
                  onClick={() => onDeleteTask(task.id)}
                  aria-label={`Delete ${task.title}`}
                  className="icon-btn-danger"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>

            {task.description && (
              <p className="task-desc line-clamp-1">{task.description}</p>
            )}

            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              <span className={`pill ${isDone ? 'pill--done' : 'pill--open'}`}>
                {isDone ? 'Completed' : 'Pending'}
              </span>

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
          </>
        )}
      </div>
    </motion.div>
  );
}
