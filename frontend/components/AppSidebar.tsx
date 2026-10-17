'use client';

import Link from 'next/link';
import { ThemeToggle } from './ThemeToggle';
import { SidebarNav } from './SidebarNav';
import { useTasks } from './TasksProvider';
import { useWorkspaceName } from '../lib/workspace';

/**
 * The sidebar contents: wordmark, the workspace label chosen at first run,
 * grouped nav, and the signed-in identity with theme + sign-out. Rendered both
 * in the static sidebar and inside the mobile drawer, so the identity and theme
 * live in the shell rather than on a page. Sign-out is the same shared control
 * the settings page uses. The drawer can move its theme control into its
 * header beside the close button.
 */
export function AppSidebar({
  onNavigate,
  className = '',
  showThemeToggle = true,
}: {
  onNavigate?: () => void;
  className?: string;
  showThemeToggle?: boolean;
}) {
  const { user } = useTasks();
  const workspaceName = useWorkspaceName();

  return (
    <div className={`flex-col gap-6 ${className}`}>
      <div className="px-2 py-1">
        <Link href="/" className="wordmark block" onClick={onNavigate}>
          EVO<span className="wordmark--accent">TODO</span>
        </Link>
        {workspaceName && (
          <p className="mt-0.5 truncate text-meta text-muted" title={workspaceName}>
            {workspaceName}
          </p>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <SidebarNav onNavigate={onNavigate} />
      </div>

      <div className="space-y-3 px-2 pb-2">
        {user && (
          <div className="flex items-center gap-2.5 rounded-[var(--radius-input)] bg-paper-2 p-2.5">
            <div className="w-8 h-8 rounded-[var(--radius-input)] bg-accent-soft text-accent-strong flex items-center justify-center font-semibold text-xs uppercase shrink-0">
              {user.name?.charAt(0) || 'U'}
            </div>
            <span className="min-w-0 truncate text-sm text-ink" title={user.name || undefined}>
              {user.name || 'User'}
            </span>
          </div>

        )}

        {showThemeToggle && (
          <div className="flex items-center gap-2">
            <ThemeToggle />
          </div>
        )}
      </div>
    </div>
  );
}
