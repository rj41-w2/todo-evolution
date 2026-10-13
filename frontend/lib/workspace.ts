'use client';

import { useSyncExternalStore } from 'react';

/**
 * First-run state lives entirely in the browser — the backend has no column for
 * a workspace name or an onboarding flag, and adding one is out of scope for
 * this feature. Everything here is deliberately defensive: a visitor whose
 * storage is blocked (private mode, cookies disabled, quota) must never be
 * trapped in an onboarding redirect loop, so a storage failure reads as
 * "already onboarded".
 */

export const WORKSPACE_STORAGE_KEY = 'evo.workspace';

export interface WorkspaceState {
  /** Whether the visitor has completed or explicitly skipped first-run. */
  onboarded: boolean;
  /** The name they chose; empty when they skipped. */
  name: string;
}

/** What a visitor with nothing stored looks like — and what the server renders. */
export const EMPTY_WORKSPACE: WorkspaceState = { onboarded: false, name: '' };

/** A visitor we cannot persist anything for is treated as already through. */
const UNAVAILABLE_WORKSPACE: WorkspaceState = { onboarded: true, name: '' };

const listeners = new Set<() => void>();

let cachedRaw: string | null | undefined;
let cached: WorkspaceState = EMPTY_WORKSPACE;
/** A choice we could not write to storage, kept for this session only. */
let unpersisted: WorkspaceState | null = null;

function parse(raw: string | null): WorkspaceState {
  if (!raw) return EMPTY_WORKSPACE;
  try {
    const value = JSON.parse(raw) as Partial<WorkspaceState>;
    if (typeof value?.onboarded !== 'boolean') return EMPTY_WORKSPACE;
    return {
      onboarded: value.onboarded,
      name: typeof value.name === 'string' ? value.name : '',
    };
  } catch {
    return EMPTY_WORKSPACE;
  }
}

/** Read the current state, tolerating any storage failure. */
export function readWorkspace(): WorkspaceState {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(WORKSPACE_STORAGE_KEY);
  } catch {
    // Reading is impossible. Trust anything we recorded this session, otherwise
    // let the visitor through rather than bouncing them back to onboarding.
    return unpersisted ?? UNAVAILABLE_WORKSPACE;
  }
  if (unpersisted) return unpersisted;
  if (raw === cachedRaw) return cached;
  cachedRaw = raw;
  cached = parse(raw);
  return cached;
}

export function subscribeWorkspace(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify(): void {
  for (const listener of listeners) listener();
}

function writeWorkspace(state: WorkspaceState): void {
  try {
    window.localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(state));
    unpersisted = null;
  } catch {
    // Storage refused the write. Hold the state in memory so the gate still
    // sees the choice and does not send the visitor back round the loop.
    unpersisted = state;
  }
  cachedRaw = undefined;
  notify();
}

/** Record a workspace name and mark first-run complete. */
export function completeOnboarding(name: string): void {
  writeWorkspace({ onboarded: true, name: name.trim() });
}

/** Take the first-class "not now" path: complete first-run without a name. */
export function skipOnboarding(): void {
  writeWorkspace({ onboarded: true, name: readWorkspace().name });
}

/**
 * Forget every in-memory cache without touching storage. Used by tests (which
 * share one module instance) and to simulate a reload.
 */
export function resetWorkspaceCache(): void {
  cachedRaw = undefined;
  cached = EMPTY_WORKSPACE;
  unpersisted = null;
}

const serverWorkspace = (): null => null;

/**
 * Subscribe a component to the first-run state. Returns `null` during SSR and
 * the hydration pass, where localStorage does not exist yet, so callers must
 * treat `null` as "not known yet" rather than "not onboarded".
 */
export function useWorkspace(): WorkspaceState | null {
  return useSyncExternalStore<WorkspaceState | null>(
    subscribeWorkspace,
    readWorkspace,
    serverWorkspace,
  );
}

/** The stored workspace name, or `''` when there is none. */
export function useWorkspaceName(): string {
  return useWorkspace()?.name ?? '';
}
