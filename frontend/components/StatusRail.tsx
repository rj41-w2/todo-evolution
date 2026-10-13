'use client';

import { completionPercent, countTasks } from '../lib/task-counts';
import { useTasks } from './TasksProvider';

/**
 * The right status rail. Counts come from the same shared tasks source the
 * pages use, so they move the moment a task is added, completed or deleted
 * anywhere in the app — no reload, nothing hardcoded.
 */
export function StatusRail({ className = '' }: { className?: string }) {
  const { tasks, loading } = useTasks();
  const counts = countTasks(tasks);
  const percent = completionPercent(counts);

  return (
    <aside
      aria-label="Task status"
      className={`w-[260px] shrink-0 sticky top-6 h-fit flex-col gap-5 rounded-[var(--radius-panel)] border border-rule bg-card shadow-card p-5 ${className}`}
    >
      <div className="space-y-1">
        <h2 className="font-display text-sm font-semibold text-ink">Status</h2>
        <p className="text-micro text-muted">Live from your tasks</p>
      </div>

      <div className="flex items-baseline gap-2">
        <span className="font-mono text-3xl font-medium text-ink tabular-nums">
          {loading ? '—' : counts.total}
        </span>
        <span className="text-meta text-muted">tasks</span>
      </div>

      <div
        className="h-1.5 w-full overflow-hidden rounded-[var(--radius-pill)] bg-paper-3"
        role="progressbar"
        aria-label="Tasks completed"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={loading ? 0 : percent}
      >
        <div
          className="h-full rounded-[var(--radius-pill)] bg-accent"
          style={{ width: `${loading ? 0 : percent}%` }}
        />
      </div>

      <dl className="space-y-2.5">
        <div className="flex items-center justify-between">
          <dt className="text-sm text-ink-2">Open</dt>
          <dd className="font-mono text-sm text-ink tabular-nums">{loading ? '—' : counts.open}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-sm text-ink-2">Done</dt>
          <dd className="font-mono text-sm text-ink tabular-nums">{loading ? '—' : counts.done}</dd>
        </div>
      </dl>
    </aside>
  );
}
