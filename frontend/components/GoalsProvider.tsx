'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { authClient } from '../lib/auth-client';
import { secureFetch } from '../lib/api';
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
  user: AuthUser | null;
  /** The last request failure, ready to show the user. */
  error: string | null;
  dismissError: () => void;
  loadMore: () => Promise<void>;
  createGoal: (goal: GoalCreate) => Promise<void>;
  updateGoal: (goal: Goal, patch: GoalUpdate) => Promise<void>;
}

const GoalsContext = createContext<GoalsContextValue | null>(null);

/**
 * The goals source (issue #17).
 *
 * Deliberately separate from `TasksProvider`: a goal is not a task, and the
 * backend keeps them apart. Mounted by the goals page, since nothing else on
 * the shell reads goals.
 *
 * Paging keeps the server's cursor verbatim. The list is never re-sorted here —
 * the backend's `created_at DESC, id DESC` order *is* the order on screen, and
 * a client-side sort would disagree with the cursor and start skipping and
 * repeating rows.
 */
export function GoalsProvider({ children }: { children: React.ReactNode }) {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Resolved once by the init effect so a refresh does not dial `get-session`
  // again — the same reason `TasksProvider` records it.
  const userIdRef = useRef<string | null>(null);

  const dismissError = useCallback(() => setError(null), []);

  const fetchFirstPage = useCallback(async () => {
    const userId = userIdRef.current;
    if (!userId) return;

    try {
      const res = await secureFetch(`/api/${userId}/goals?limit=${PAGE_SIZE}`);
      if (!res.ok) throw new Error(`goals request answered ${res.status}`);
      const data: GoalListResponse = await res.json();
      setGoals(data.goals);
      setCursor(data.next_cursor);
    } catch (err) {
      console.error('Failed to fetch goals:', err);
      setError('Could not load your goals — please refresh and try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initApp = async () => {
      const session = await authClient.getSession();
      if (session?.data?.user) {
        userIdRef.current = session.data.user.id;
        setUser(session.data.user);
        await fetchFirstPage();
      } else {
        setLoading(false);
      }
    };
    initApp();
  }, [fetchFirstPage]);

  const loadMore = useCallback(async () => {
    const userId = userIdRef.current;
    if (!userId || !cursor || loadingMore) return;

    setLoadingMore(true);
    setError(null);
    try {
      const res = await secureFetch(
        `/api/${userId}/goals?limit=${PAGE_SIZE}&cursor=${encodeURIComponent(cursor)}`,
      );
      if (!res.ok) throw new Error(`goals request answered ${res.status}`);
      const data: GoalListResponse = await res.json();
      // Guard against a cursor that overlaps a page already shown: a goal shown
      // twice reads as a duplicate the user created.
      setGoals(prev => {
        const seen = new Set(prev.map(g => g.id));
        return [...prev, ...data.goals.filter(g => !seen.has(g.id))];
      });
      setCursor(data.next_cursor);
    } catch (err) {
      console.error('Failed to load more goals:', err);
      setError('Could not load more goals — please try again.');
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, loadingMore]);

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
        // belongs at the head of a `created_at DESC` list.
        const saved: Goal = await res.json();
        setGoals(prev => [saved, ...prev]);
      } catch (err) {
        console.error('Failed to create goal:', err);
        setError('Could not add that goal. Nothing was saved — please try again.');
      }
    },
    [],
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
        setGoals(prev => prev.map(g => (g.id === goal.id ? saved : g)));
      } catch (err) {
        console.error('Failed to update goal:', err);
        // `goal` is the row exactly as it was before the edit.
        setGoals(prev => prev.map(g => (g.id === goal.id ? goal : g)));
        setError('Could not save those changes. The goal was put back — please try again.');
      }
    },
    [],
  );

  const value = useMemo<GoalsContextValue>(
    () => ({
      goals,
      loading,
      loadingMore,
      hasMore: cursor !== null,
      user,
      error,
      dismissError,
      loadMore,
      createGoal,
      updateGoal,
    }),
    [goals, loading, loadingMore, cursor, user, error, dismissError, loadMore, createGoal, updateGoal],
  );

  return <GoalsContext.Provider value={value}>{children}</GoalsContext.Provider>;
}

export function useGoals(): GoalsContextValue {
  const context = useContext(GoalsContext);
  if (!context) throw new Error('useGoals must be used within a GoalsProvider');
  return context;
}
