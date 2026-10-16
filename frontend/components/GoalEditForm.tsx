'use client';

import React, { useState } from 'react';
import { Target, Check } from 'lucide-react';
import { GOAL_STATUSES } from '../lib/goals';
import type { Goal, GoalStatus, GoalUpdate } from '../types';

interface GoalEditFormProps {
  goal: Goal;
  /** Hands the edit to the shared source, which updates optimistically and rolls back on failure. */
  onSave: (goal: Goal, patch: GoalUpdate) => Promise<void>;
  /** Leaves editing without touching the goal — used by Cancel and Escape. */
  onClose: () => void;
}

/** `2026-04-15` → `2026-04-15` (already what a date input wants). */
function toDateInputValue(value: string | null) {
  return value ? value.slice(0, 10) : '';
}

/**
 * The in-place editor for one goal. It swaps into the card it belongs to so an
 * edit keeps the page's density and locality, matching the task row editor.
 *
 * It sends every editable field, with `null` for a cleared description or
 * target date — the API only touches the keys it receives, so `null` is how a
 * field is removed.
 */
export default function GoalEditForm({ goal, onSave, onClose }: GoalEditFormProps) {
  const [title, setTitle] = useState(goal.title);
  const [description, setDescription] = useState(goal.description ?? '');
  const [status, setStatus] = useState<GoalStatus>(goal.status);
  const [targetDate, setTargetDate] = useState(toDateInputValue(goal.target_date));

  const trimmedTitle = title.trim();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!trimmedTitle) return;

    const patch: GoalUpdate = {
      title: trimmedTitle,
      description: description.trim() || null,
      status,
      target_date: targetDate || null,
    };

    onClose();
    void onSave(goal, patch);
  };

  return (
    <form
      aria-label={`Edit goal: ${goal.title}`}
      onSubmit={handleSubmit}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
      className="space-y-2"
    >
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        aria-label="Title"
        autoFocus
        required
        maxLength={200}
        className="w-full bg-transparent text-md font-medium text-ink placeholder:text-muted"
      />

      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        aria-label="Description"
        placeholder="Add a description…"
        rows={2}
        className="w-full bg-transparent text-sm text-ink-2 placeholder:text-muted resize-none"
      />

      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 pt-3 border-t border-rule">
        <label className="flex items-center gap-2 text-meta text-muted cursor-pointer">
          <span className="font-mono text-micro uppercase tracking-[0.08em]">Status</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as GoalStatus)}
            aria-label="Status"
            className="select-input bg-transparent border-none p-0 text-meta text-ink cursor-pointer"
          >
            {GOAL_STATUSES.map(s => (
              <option key={s} value={s} className="bg-paper text-ink">{s}</option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2 text-meta text-muted">
          <Target className="h-4 w-4" />
          <input
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
            aria-label="Target date"
            className="bg-transparent border-none p-0 text-meta text-ink cursor-pointer"
          />
        </label>

        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={onClose} className="btn-ghost">
            Cancel
          </button>
          <button type="submit" disabled={!trimmedTitle} className="btn-primary">
            <Check className="h-4 w-4" />
            Save
          </button>
        </div>
      </div>
    </form>
  );
}
