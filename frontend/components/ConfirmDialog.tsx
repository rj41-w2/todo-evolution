'use client';

import React, { useId, useRef } from 'react';
import { useFocusTrap } from '../lib/use-focus-trap';

interface ConfirmDialogProps {
  /** Whether the dialog is on screen. Rendering is a no-op while false. */
  open: boolean;
  /** The dialog's accessible name, also shown as its heading. */
  title: string;
  /** Optional supporting sentence. */
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** True while the confirmed action is in flight; disables both actions. */
  pending?: boolean;
  /** Fires only when the user confirms, and never while `pending`. */
  onConfirm: () => void;
  /** Fires on Cancel, the backdrop, or Escape, and never while `pending`. */
  onCancel: () => void;
}

/**
 * A small, accessible in-app confirmation dialog (issue #18).
 *
 * Modelled on `SidebarDrawer`: a labelled `role="dialog"`, `aria-modal`, focus
 * trapped inside while open (Escape closes it) and returned to whatever was
 * focused before on close. `window.confirm()` is deliberately not used — it
 * cannot be styled, is not keyboard-consistent across browsers, and blocks the
 * whole page.
 *
 * While `pending` the actions are disabled, so a confirmation cannot be sent
 * twice and the dialog cannot be dismissed into an ambiguous state.
 */
export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  pending = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useFocusTrap(panelRef, open, onCancel);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Dismiss dialog"
        tabIndex={-1}
        onClick={onCancel}
        className="absolute inset-0 bg-ink/40 cursor-default"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative w-full max-w-sm space-y-4 rounded-card border border-rule bg-paper p-5 shadow-float"
      >
        <div className="space-y-1">
          <h2 id={titleId} className="font-display text-lg font-semibold text-ink">
            {title}
          </h2>
          {description && <p className="text-meta text-muted">{description}</p>}
        </div>

        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onCancel} disabled={pending}>
            {cancelLabel}
          </button>
          <button type="button" className="btn-danger" onClick={onConfirm} disabled={pending}>
            {pending ? 'Deleting…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
