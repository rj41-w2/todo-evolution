'use client';

import React, { useState } from 'react';
import { Plus, Target } from 'lucide-react';
import { GOAL_STATUSES } from '../lib/goals';
import type { GoalCreate, GoalStatus } from '../types';

interface GoalFormProps {
  onGoalCreated: (goal: GoalCreate) => Promise<void>;
}

/**
 * The quick-add for a goal. Mirrors `TaskForm`: one flat row-style form that
 * clears on submit and hands the goal to the shared source, which surfaces a
 * failure on the page rather than here.
 *
 * Status defaults to `Draft`; the date is a calendar day, so it is sent as
 * `YYYY-MM-DD` with no time.
 */
export default function GoalForm({ onGoalCreated }: GoalFormProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<GoalStatus>('Draft');
  const [targetDate, setTargetDate] = useState('');

  const trimmedTitle = title.trim();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trimmedTitle) return;

    const newGoal: GoalCreate = {
      title: trimmedTitle,
      description: description.trim() || undefined,
      status,
      target_date: targetDate || undefined,
    };

    setTitle('');
    setDescription('');
    setStatus('Draft');
    setTargetDate('');

    try {
      await onGoalCreated(newGoal);
    } catch (error) {
      console.error('Failed to create goal:', error);
    }
  };

  return (
    <section aria-label="Add a goal">
      <form onSubmit={handleSubmit} className="bg-paper-2 border border-rule rounded-[var(--radius-card)] p-4 space-y-3">
        <input
          type="text"
          placeholder="What do you want to achieve?"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-label="Goal title"
          maxLength={200}
          className="w-full bg-transparent text-md font-medium placeholder:text-muted text-ink"
          required
        />

        <textarea
          placeholder="Add a description…"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          aria-label="Goal description"
          className="w-full bg-transparent text-sm text-ink-2 placeholder:text-muted resize-none"
          rows={2}
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

          <button type="submit" disabled={!trimmedTitle} className="btn-primary ml-auto">
            <Plus className="h-4 w-4" />
            Add goal
          </button>
        </div>
      </form>
    </section>
  );
}
