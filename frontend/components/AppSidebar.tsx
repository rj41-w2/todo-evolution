'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { authClient } from '../lib/auth-client';
import { ThemeToggle } from './ThemeToggle';
import { SidebarNav } from './SidebarNav';
import { useTasks } from './TasksProvider';

/**
 * The sidebar contents: wordmark, grouped nav, and the signed-in identity with
 * theme + sign-out. Rendered both in the static sidebar and inside the mobile
 * drawer, so the identity and theme live in the shell rather than on a page.
 */
export function AppSidebar({
  onNavigate,
  className = '',
}: {
  onNavigate?: () => void;
  className?: string;
}) {
  const { user } = useTasks();
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await authClient.signOut();
      router.push('/login');
      router.refresh();
    } catch (error) {
      console.error('Failed to sign out user:', error);
    }
  };

  return (
    <div className={`flex-col gap-6 ${className}`}>
      <Link href="/" className="wordmark block px-2 py-1" onClick={onNavigate}>
        EVO<span className="text-accent">TODO</span>
      </Link>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <SidebarNav onNavigate={onNavigate} />
      </div>

      <div className="space-y-3">
        {user && (
          <div className="flex items-center gap-2.5 rounded-[var(--radius-input)] bg-paper-2 p-2.5">
            <div className="w-8 h-8 rounded-[var(--radius-input)] bg-accent-soft text-accent-strong flex items-center justify-center font-semibold text-xs uppercase shrink-0">
              {user.name?.charAt(0) || 'U'}
            </div>
            <div className="min-w-0 leading-tight">
              <p className="text-xs font-medium text-ink truncate">{user.name}</p>
              <p className="text-micro text-muted truncate">{user.email}</p>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2">
          <ThemeToggle />
          {user && (
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-[var(--radius-input)] text-xs font-medium text-danger hover:bg-danger-soft transition-colors cursor-pointer"
            >
              <LogOut className="h-3.5 w-3.5" />
              Log out
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
