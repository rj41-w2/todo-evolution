'use client';

import React, { useCallback, useState } from 'react';
import Link from 'next/link';
import { Menu } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';
import { AppSidebar } from './AppSidebar';
import { SidebarDrawer } from './SidebarDrawer';
import { StatusRail } from './StatusRail';
import { TasksProvider } from './TasksProvider';

const SIDEBAR_CARD =
  'hidden lg:flex w-[240px] shrink-0 sticky top-6 h-[calc(100dvh-3rem)] rounded-[var(--radius-panel)] border border-rule bg-card shadow-card p-4';

/**
 * The signed-in shell: floating sidebar, main content card and right status
 * rail, all sharing one tasks source. Below `lg` the sidebar collapses into a
 * drawer opened from the top-bar trigger.
 */
export default function AppShell({ children }: { children: React.ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  return (
    <TasksProvider>
      <div className="min-h-dvh">
        <header className="lg:hidden sticky top-0 z-[var(--z-sticky)] flex h-14 items-center justify-between gap-3 border-b border-rule bg-paper px-4">
          <button
            type="button"
            className="icon-btn"
            aria-label="Open navigation menu"
            aria-haspopup="dialog"
            aria-expanded={drawerOpen}
            aria-controls="app-sidebar-drawer"
            onClick={openDrawer}
          >
            <Menu className="h-5 w-5" />
          </button>
          <Link href="/" className="wordmark">
            EVO<span className="wordmark--accent">TODO</span>
          </Link>
          <ThemeToggle />
        </header>

        <div className="mx-auto flex w-full max-w-[1500px] gap-6 p-4 sm:p-6">
          <AppSidebar className={SIDEBAR_CARD} />

          <main className="min-w-0 flex-1 rounded-[var(--radius-panel)] border border-rule bg-card shadow-card p-5 sm:p-8">
            {children}
          </main>

          <StatusRail className="hidden lg:flex" />
        </div>
      </div>

      <SidebarDrawer id="app-sidebar-drawer" open={drawerOpen} onClose={closeDrawer} />
    </TasksProvider>
  );
}
