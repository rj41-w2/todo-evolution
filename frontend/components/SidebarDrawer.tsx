'use client';

import { useRef } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useFocusTrap } from '../lib/use-focus-trap';
import { AppSidebar } from './AppSidebar';
import { ThemeToggle } from './ThemeToggle';

const EASE_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1];

/**
 * The narrow-viewport form of the sidebar. It is a modal dialog: focus is
 * trapped inside, Escape closes it, the backdrop closes it, and focus returns
 * to the trigger on close. Only meaningful below the `lg` breakpoint (`lg:hidden`).
 */
export function SidebarDrawer({
  id,
  open,
  onClose,
}: {
  id?: string;
  open: boolean;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, open, onClose);

  if (!open) return null;

  return (
    <div className="lg:hidden fixed inset-0 z-[var(--z-modal)]">
      <button
        type="button"
        aria-label="Dismiss navigation"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-ink/40 cursor-default"
      />
      <motion.div
        ref={panelRef}
        id={id}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        initial={{ x: '-100%' }}
        animate={{ x: 0 }}
        transition={{ duration: 0.24, ease: EASE_OUT }}
        className="absolute left-0 top-0 h-dvh w-[280px] max-w-[85vw] bg-paper border-r border-rule p-4 flex flex-col gap-4 shadow-float"
      >
        <div className="flex items-center justify-between">
          <ThemeToggle />
          <button type="button" className="icon-btn" aria-label="Close navigation menu" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <AppSidebar onNavigate={onClose} showThemeToggle={false} className="flex min-h-0 flex-1" />
      </motion.div>
    </div>
  );
}
