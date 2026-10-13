'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  CircleDashed,
  MessageSquare,
  Percent,
  Plus,
  Sparkles,
  TriangleAlert,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import TaskForm from './TaskForm';
import Chatbot from './Chatbot';
import { useTasks } from './TasksProvider';
import { useAgentActivity } from '../lib/agent-activity';
import { useClientNow } from '../lib/client-now';
import { completionPercent, countOverdue, countTasks } from '../lib/task-counts';
import { formatClockTime, formatToday, greetingFor } from '../lib/dashboard';
import type { TaskCreate } from '../types';

interface DashboardViewProps {
  /**
   * The instant the greeting and overdue maths are drawn from. Injected by tests
   * so the whole page is deterministic; in the app it is read on the client,
   * never on the server (where the clock would be the server's, not the
   * visitor's).
   */
  now?: Date;
}

function StatCard({
  label,
  value,
  icon: Icon,
  testId,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  testId: string;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-rule bg-paper-2 p-4">
      <span className="flex items-center gap-2 text-meta text-muted">
        <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
        {label}
      </span>
      <span className="font-mono text-2xl font-medium tabular-nums text-ink" data-testid={testId}>
        {value}
      </span>
    </div>
  );
}

/**
 * The dashboard: a greeting with today's date, a completion figure, four stat
 * cards and a panel for the latest agent action — all computed from the shared
 * tasks source and the real browser chat session. Nothing here invents a number
 * the backend cannot back (no goals, team or activity counts), per the spec's
 * honesty rules.
 */
export function DashboardView({ now: injectedNow }: DashboardViewProps) {
  const { tasks, loading, user, error, dismissError, fetchTasks, createTask } = useTasks();

  const clientNow = useClientNow();
  const now = injectedNow ?? clientNow;

  const [chatOpen, setChatOpen] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const composerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (composerOpen) {
      composerRef.current?.querySelector<HTMLInputElement>('input')?.focus();
    }
  }, [composerOpen]);

  const counts = useMemo(() => countTasks(tasks), [tasks]);
  const percent = completionPercent(counts);
  const overdue = useMemo(() => (now ? countOverdue(tasks, now) : 0), [tasks, now]);

  const activity = useAgentActivity();

  const ready = !loading && now !== null;
  const stat = (value: number) => (ready ? String(value) : '—');
  const firstName = user?.name?.split(' ')[0] || 'there';
  const greeting = now ? greetingFor(now) : 'Hello';

  const handleQuickAdd = useCallback(
    async (task: TaskCreate) => {
      setComposerOpen(false);
      await createTask(task);
    },
    [createTask],
  );

  return (
    <div className="space-y-8">
      {/* Greeting + today's date */}
      <section className="space-y-1.5">
        <p className="font-mono text-micro uppercase tracking-[0.08em] text-muted">
          {now ? formatToday(now) : 'Today'}
        </p>
        <h1 className="page-header text-[length:var(--text-2xl)]">
          {greeting}, {firstName}.
        </h1>
        <p className="text-md text-ink-2">Here is where your work stands today.</p>
      </section>

      {/* Hero completion figure */}
      <section
        aria-label="Completion"
        className="space-y-4 rounded-[var(--radius-panel)] border border-rule bg-paper-2 p-5 sm:p-6"
      >
        <p className="font-mono text-micro uppercase tracking-[0.08em] text-muted">Completion</p>
        <div className="flex items-baseline gap-3">
          <span
            className="font-display text-[length:var(--text-display)] font-light leading-none tabular-nums text-ink"
            data-testid="completion-figure"
          >
            {ready ? `${percent}%` : '—'}
          </span>
          <span className="text-meta text-muted">of your tasks are done</span>
        </div>
        <div
          className="h-1.5 w-full overflow-hidden rounded-[var(--radius-pill)] bg-paper-3"
          role="progressbar"
          aria-label="Tasks completed"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={ready ? percent : 0}
        >
          <div
            className="h-full rounded-[var(--radius-pill)] bg-accent"
            style={{ width: `${ready ? percent : 0}%` }}
          />
        </div>
        <p className="font-mono text-meta text-muted" data-testid="completion-caption">
          {ready ? `${counts.done} of ${counts.total} tasks complete` : '…'}
        </p>
      </section>

      {/* Stat cards — every figure is the real ledger */}
      <section aria-label="Task totals" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Open" value={stat(counts.open)} icon={CircleDashed} testId="stat-open" />
        <StatCard label="Completed" value={stat(counts.done)} icon={CheckCircle2} testId="stat-completed" />
        <StatCard label="Overdue" value={stat(overdue)} icon={TriangleAlert} testId="stat-overdue" />
        <StatCard label="Completion" value={ready ? `${percent}%` : '—'} icon={Percent} testId="stat-completion" />
      </section>

      {/* Latest agent action + quick actions */}
      <div className="grid gap-4 lg:grid-cols-3">
        <section
          aria-label="Latest agent action"
          className="space-y-3 rounded-[var(--radius-panel)] border border-rule bg-paper-2 p-5 lg:col-span-2"
        >
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-lg font-semibold text-ink">Latest agent action</h2>
            <button type="button" onClick={() => setChatOpen(true)} className="btn-ghost">
              <MessageSquare className="h-4 w-4" strokeWidth={1.75} />
              Open chat
            </button>
          </div>

          {activity ? (
            <div className="space-y-2">
              <p className="text-md text-ink" data-testid="agent-activity-summary">
                {activity.summary}
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                {activity.tools.map(tool => (
                  <span key={tool} className="chip">
                    {tool}
                  </span>
                ))}
                <span className="font-mono text-micro text-muted">{formatClockTime(activity.at)}</span>
              </div>
            </div>
          ) : (
            <p className="max-w-prose text-md text-muted" data-testid="agent-activity-empty">
              No agent activity yet. Ask the assistant to change your tasks and its most recent
              action will show here.
            </p>
          )}
        </section>

        <section
          aria-label="Quick actions"
          className="space-y-3 rounded-[var(--radius-panel)] border border-rule bg-paper-2 p-5"
        >
          <h2 className="font-display text-lg font-semibold text-ink">Quick actions</h2>
          <div className="flex flex-col gap-3">
            <button type="button" onClick={() => setComposerOpen(true)} className="btn-primary">
              <Plus className="h-4 w-4" strokeWidth={1.75} />
              New task
            </button>
            <button type="button" onClick={() => setChatOpen(true)} className="btn-ghost">
              <Sparkles className="h-4 w-4" strokeWidth={1.75} />
              Ask the agent
            </button>
          </div>
        </section>
      </div>

      {error && (
        <div role="alert" className="alert">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <p className="flex-1 text-meta">{error}</p>
          <button onClick={dismissError} aria-label="Dismiss error" className="icon-btn">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* The shared quick-add the "New task" action opens. */}
      {composerOpen && (
        <div ref={composerRef} data-testid="quick-add">
          <TaskForm onTaskCreated={handleQuickAdd} />
        </div>
      )}

      <div className="pt-2">
        <div className="mb-6 h-px bg-rule" />
        <p className="text-xs text-muted">
          EVO TODO — tasks, with an AI assistant that edits them for you.
        </p>
      </div>

      <Chatbot onTaskMutation={fetchTasks} open={chatOpen} onOpenChange={setChatOpen} />
    </div>
  );
}
