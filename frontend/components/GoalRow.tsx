'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Target, Pencil, Trash2 } from 'lucide-react';
import GoalEditForm from './GoalEditForm';
import { formatTargetDate, goalStatusPillClass } from '../lib/goals';
import type { Goal, GoalUpdate } from '../types';

interface GoalRowProps {
  goal: Goal;
  /**
   * Omitted by any future read-only view; when present the row offers an
   * in-place editor, like `TaskRow` does.
   */
  onUpdateGoal?: (goal: Goal, patch: GoalUpdate) => Promise<void>;
  /**
   * Asks the list to confirm and perform a deletion (issue #18). The row does
   * not delete itself: the confirmation dialog lives above it in `GoalList`, so
   * it survives the row's optimistic removal.
   */
  onRequestDelete?: (goal: Goal) => void;
}

const EASE_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1];

/**
 * One goal card: title, status badge, optional description and target date.
 *
 * No completion checkbox — a goal is edited, not ticked off. Deleting asks for
 * confirmation first, which the list owns.
 */
export default function GoalRow({ goal, onUpdateGoal, onRequestDelete }: GoalRowProps) {
  const [editing, setEditing] = useState(false);
  const showEditor = editing && !!onUpdateGoal;

  return (
    <motion.div
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25, ease: EASE_OUT }}
      className="ledger-row"
    >
      <div className="flex-1 min-w-0 space-y-1.5">
        {showEditor && onUpdateGoal ? (
          <GoalEditForm goal={goal} onSave={onUpdateGoal} onClose={() => setEditing(false)} />
        ) : (
          <>
            <div className="flex items-start justify-between gap-3">
              <h3 className="task-title">{goal.title}</h3>
              <div className="flex items-center gap-1 shrink-0">
                {onUpdateGoal && (
                  <button
                    onClick={() => setEditing(true)}
                    aria-label={`Edit ${goal.title}`}
                    className="icon-btn"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                )}
                {onRequestDelete && (
                  <button
                    onClick={() => onRequestDelete(goal)}
                    aria-label={`Delete ${goal.title}`}
                    className="icon-btn-danger"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>

            {goal.description && (
              <p className="task-desc line-clamp-2">{goal.description}</p>
            )}

            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              <span className={goalStatusPillClass(goal.status)}>{goal.status}</span>

              {goal.target_date && (
                <span className="chip">
                  <Target className="h-3 w-3" />
                  {formatTargetDate(goal.target_date)}
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
}
