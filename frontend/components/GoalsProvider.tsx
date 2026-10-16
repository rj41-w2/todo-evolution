'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { authClient } from '../lib/auth-client';
import { secureFetch } from '../lib/api';
import { GoalFilter, goalMatchesFilter, goalStatusForFilter } from '../lib/goals';
import type { AuthUser, Goal, GoalCreate, GoalListResponse, GoalUpdate } from '../types';

/** One page per request. The backend caps this, so the number is a hint. */
const PAGE_SIZE = 20;

interface GoalsContextValue {
  goals: Goal[];
  /** True until the first page has resolved. */
  loading: boolean;
  /** True while appending another cursor page. */
  loadingMore: boolean;
  /** Whether a `next_cursor` is still outstanding. */
  hasMore: boolean;
  /** The active lifecycle filter; `All` sends no status. */
  filter: GoalFilter;
  setFilter: (filter: GoalFilter) => void;
  user: AuthUser | null;
  /** The last request failure, ready to show the user. */
  error: string | null;
  dismissError: () => void;
  loadMore: () => Promise<void>;
  createGoal: (goal: GoalCreate) => Promise<void>;
  updateGoal: (goal: Goal, patch: GoalUpdate) => Promise<void>;
  deleteGoal: (goal: Goal) => Promise<void>;
}

const GoalsContext = createContext<GoalsContextValue | null>(null);

/** The result-set URL for a filter; `All` omits `status` rather than sending one. */
function listUrl(userId: string, filter: GoalFilter, cursor: string | null): string {
  const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
  const status = goalStatusForFilter(filter);
  if (status) params.set('status', status);
  if (cursor) params.set('cursor', cursor);
  return `/api/${userId}/goals?${params.toString()}`;
}

/**
 * The goals source (issue #17, filtering and deletion added by #18).
 *
 * Deliberately separate from `TasksProvider`: a goal is not a task, and the
 * backend keeps them apart. Mounted by the goals page, since nothing else on
 * the shell reads goals.
 *
 * Paging keeps the server's cursor verbatim. The list is never re-sorted here —
 * the backend's `created_at DESC, id DESC` order *is* the order on screen, and
 * a client-side sort would disagree with the cursor and start skipping and
 * repeating rows.
 *
 * Filtering is server-side. The client never filters the rows it already holds,
 * because that would only ever describe the pages loaded so far — the tab would
 * lie about anything past the first cursor page. A filter change instead throws
 * the rows and cursor away and asks for the first matching page.
 */
export function GoalsProvider({ children }: { children: React.ReactNode }) {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [filter, setFilter] = useState<GoalFilter>('All');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Resolved once by the init effect so a refresh does not dial `get-session`
  // again — the same reason `TasksProvider` records it.
  const userIdRef = useRef<string | null>(null);
  // Bumped whenever the result set is replaced (a new filter, or a fresh first
  // page). A response that lands after the bump belongs to an abandoned request
  // and is dropped, so a slow `All` page cannot overwrite a newer `Active` one.
  const requestIdRef = useRef(0);

  const dismissError = useCallback(() => setError(null), []);

  const fetchFirstPage = useCallback(async (activeFilter: GoalFilter) => {
    const userId = userIdRef.current;
    if (!userId) return;

    const requestId = ++requestIdRef.current;
    // A first page replaces the result set: drop the outgoing rows and cursor
    // before requesting, so nothing from the old tab lingers under the new one
    // while the new page is in flight.
    setGoals([]);
    setCursor(null);
    setLoadingMore(false);
    setLoading(true);
    setError(null);
    try {
      const res = await secureFetch(listUrl(userId, activeFilter, null));
      if (requestId !== requestIdRef.current) return;
      if (!res.ok) throw new Error(`goals request answered ${res.status}`);
      const data: GoalListResponse = await res.json();
      if (requestId !== requestIdRef.current) return;
      setGoals(data.goals);
      setCursor(data.next_cursor);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      console.error('Failed to fetch goals:', err);
      setError('Could not load your goals — please refresh and try again.');
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initApp = async () => {
      const session = await authClient.getSession();
      if (session?.data?.user) {
        userIdRef.current = session.data.user.id;
        setUser(session.data.user);
      } else {
        setLoading(false);
      }
    };
    initApp();
  }, []);

  // Fetch whenever the identity is known or the filter changes. The reset of
  // rows and cursor lives inside `fetchFirstPage`, which this effect only calls.
  useEffect(() => {
    if (!user) return;
    void fetchFirstPage(filter);
  }, [user, filter, fetchFirstPage]);

  const loadMore = useCallback(async () => {
    const userId = userIdRef.current;
    if (!userId || !cursor || loadingMore) return;

    const requestId = requestIdRef.current;
    setLoadingMore(true);
    setError(null);
    try {
      const res = await secureFetch(listUrl(userId, filter, cursor));
      if (requestId !== requestIdRef.current) return;
      if (!res.ok) throw new Error(`goals request answered ${res.status}`);
      const data: GoalListResponse = await res.json();
      if (requestId !== requestIdRef.current) return;
      // Guard against a cursor that overlaps a page already shown: a goal shown
      // twice reads as a duplicate the user created.
      setGoals(prev => {
        const seen = new Set(prev.map(g => g.id));
        return [...prev, ...data.goals.filter(g => !seen.has(g.id))];
      });
      setCursor(data.next_cursor);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      console.error('Failed to load more goals:', err);
      setError('Could not load more goals — please try again.');
    } finally {
      // A stale load-more has already been superseded by a first page; clearing
      // the flag either way cannot interrupt the newer request.
      setLoadingMore(false);
    }
  }, [cursor, loadingMore, filter]);

  const createGoal = useCallback(
    async (goalData: GoalCreate) => {
      const userId = userIdRef.current;
      if (!userId) return;

      setError(null);
      try {
        const res = await secureFetch(`/api/${userId}/goals`, {
          method: 'POST',
          body: JSON.stringify(goalData),
        });
        if (!res.ok) throw new Error(`create answered ${res.status}`);
        // The server response is authoritative. A new goal is the newest, so it
        // belongs at the head of a `created_at DESC` list — but only if it
        // belongs in the active filter, or the tab would show a row it excludes.
        const saved: Goal = await res.json();
        if (goalMatchesFilter(saved, filter)) {
          setGoals(prev => [saved, ...prev]);
        }
      } catch (err) {
        console.error('Failed to create goal:', err);
        setError('Could not add that goal. Nothing was saved — please try again.');
      }
    },
    [filter],
  );

  const updateGoal = useCallback(
    async (goal: Goal, patch: GoalUpdate) => {
      const userId = userIdRef.current;
      if (!userId) return;

      // Drop keys the caller left alone so the API's `exclude_unset` only
      // touches what the user edited.
      const changes = Object.fromEntries(
        Object.entries(patch).filter(([, value]) => value !== undefined),
      ) as GoalUpdate;
      if (Object.keys(changes).length === 0) return;

      setError(null);
      setGoals(prev => prev.map(g => (g.id === goal.id ? { ...g, ...changes } : g)));

      try {
        const res = await secureFetch(`/api/${userId}/goals/${goal.id}`, {
          method: 'PUT',
          body: JSON.stringify(changes),
        });
        if (!res.ok) throw new Error(`update answered ${res.status}`);
        const saved: Goal = await res.json();
        // A status change can move a goal out of the active filter; keeping it
        // would leave a row the tab says it excludes.
        setGoals(prev =>
          prev
            .map(g => (g.id === goal.id ? saved : g))
            .filter(g => goalMatchesFilter(g, filter)),
        );
      } catch (err) {
        console.error('Failed to update goal:', err);
        // `goal` is the row exactly as it was before the edit.
        setGoals(prev => prev.map(g => (g.id === goal.id ? goal : g)));
        setError('Could not save those changes. The goal was put back — please try again.');
      }
    },
    [filter],
  );

  const deleteGoal = useCallback(
    async (goal: Goal) => {
      const userId = userIdRef.current;
      if (!userId) return;

      // Capture the row and its position before removing it, so a failed request
      // can roll back to exactly where it was.
      const index = goals.findIndex(g => g.id === goal.id);
      const removed = index === -1 ? goal : goals[index];

      setError(null);
      setGoals(prev => prev.filter(g => g.id !== goal.id));

      try {
        const res = await secureFetch(`/api/${userId}/goals/${goal.id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error(`delete answered ${res.status}`);
      } catch (err) {
        console.error('Failed to delete goal:', err);
        setGoals(prev => {
          if (prev.some(g => g.id === goal.id) || index === -1) return prev;
          const restored = [...prev];
          restored.splice(Math.min(index, restored.length), 0, removed);
          return restored;
        });
        setError('Could not delete that goal. It was put back — please try again.');
      }
    },
    [goals],
  );

  const value = useMemo<GoalsContextValue>(
    () => ({
      goals,
      loading,
      loadingMore,
      hasMore: cursor !== null,
      filter,
      setFilter,
      user,
      error,
      dismissError,
      loadMore,
      createGoal,
      updateGoal,
      deleteGoal,
    }),
    [goals, loading, loadingMore, cursor, filter, user, error, dismissError, loadMore, createGoal, updateGoal, deleteGoal],
  );

  return <GoalsContext.Provider value={value}>{children}</GoalsContext.Provider>;
}

export function useGoals(): GoalsContextValue {
  const context = useContext(GoalsContext);
  if (!context) throw new Error('useGoals must be used within a GoalsProvider');
  return context;
}
