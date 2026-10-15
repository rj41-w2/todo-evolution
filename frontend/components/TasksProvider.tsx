'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authClient } from '../lib/auth-client';
import { secureFetch } from '../lib/api';
import type { AuthUser, Task, TaskCreate, TaskUpdate, Status, TaskListResponse } from '../types';

interface TasksContextValue {
  tasks: Task[];
  loading: boolean;
  user: AuthUser | null;
  /** The last mutation failure, already rolled back, ready to show the user. */
  error: string | null;
  dismissError: () => void;
  fetchTasks: () => Promise<void>;
  createTask: (taskData: TaskCreate) => Promise<void>;
  updateTask: (task: Task, patch: TaskUpdate) => Promise<void>;
  toggleTaskStatus: (task: Task) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
}

const TasksContext = createContext<TasksContextValue | null>(null);

/**
 * One shared tasks source for every signed-in page.
 *
 * The shell mounts it once, so the right-rail counts and any page reading the
 * same hook see the same array: a task added, completed or deleted anywhere
 * updates the rail without a manual reload. Mutations keep the app's
 * optimistic-update-with-rollback pattern.
 */
export function TasksProvider({ children }: { children: React.ReactNode }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dismissError = useCallback(() => setError(null), []);

  const fetchTasks = useCallback(async () => {
    const session = await authClient.getSession();
    const userId = session?.data?.user?.id;
    if (!userId) return;

    try {
      const res = await secureFetch(`/api/${userId}/tasks`);
      if (res.ok) {
        const data: TaskListResponse = await res.json();
        // Issue #7: the route answers with an envelope now. It also orders and
        // bounds the read — the backend's order is the order on screen, since
        // nothing here sorts.
        setTasks(data.tasks);
      }
    } catch (error) {
      console.error('Failed to fetch tasks:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initApp = async () => {
      const session = await authClient.getSession();
      if (session?.data?.user) {
        setUser(session.data.user);
        await fetchTasks();
      } else {
        setLoading(false);
      }
    };
    initApp();
  }, [fetchTasks]);

  const createTask = useCallback(
    async (taskData: TaskCreate) => {
      if (!user?.id) return;

      const tempId = typeof window !== 'undefined' && window.crypto?.randomUUID
        ? window.crypto.randomUUID()
        : `temp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const tempTask: Task = {
        id: tempId,
        title: taskData.title,
        description: taskData.description || null,
        status: taskData.status || 'Pending',
        priority: taskData.priority || 'Medium',
        tags: taskData.tags || [],
        created_at: new Date().toISOString(),
        due_date: taskData.due_date || null,
      };

      // 1. Optimistic update
      setError(null);
      setTasks(prevTasks => [tempTask, ...prevTasks]);

      try {
        const res = await secureFetch(`/api/${user.id}/tasks`, {
          method: 'POST',
          body: JSON.stringify(taskData),
        });

        if (res.ok) {
          const savedTask = await res.json();
          // 2. Success: replace the temporary task with the backend task
          setTasks(prevTasks => prevTasks.map(t => (t.id === tempId ? savedTask : t)));
        } else {
          throw new Error('Failed to create task');
        }
      } catch (error) {
        console.error('Failed to create task:', error);
        // 3. Rollback on failure, and say so — the optimistic row is gone, so
        //    silence would look like the task was never added.
        setTasks(prevTasks => prevTasks.filter(t => t.id !== tempId));
        setError('Could not add that task. Nothing was saved — please try again.');
      }
    },
    [user],
  );

  const updateTask = useCallback(
    async (task: Task, patch: TaskUpdate) => {
      if (!user?.id) return;

      // Drop the keys the caller left alone, so the API's `exclude_unset` only
      // touches the fields the user actually edited.
      const changes = Object.fromEntries(
        Object.entries(patch).filter(([, value]) => value !== undefined),
      ) as TaskUpdate;
      if (Object.keys(changes).length === 0) return;

      // 1. Optimistic update
      setError(null);
      setTasks(prevTasks => prevTasks.map(t => (t.id === task.id ? { ...t, ...changes } : t)));

      try {
        const res = await secureFetch(`/api/${user.id}/tasks/${task.id}`, {
          method: 'PUT',
          body: JSON.stringify(changes),
        });

        if (res.ok) {
          const updatedTask = await res.json();
          // 2. Success: replace the local task with the edited task
          setTasks(prevTasks => prevTasks.map(t => (t.id === task.id ? updatedTask : t)));
        } else {
          throw new Error('Failed to update task');
        }
      } catch (error) {
        console.error('Failed to update task:', error);
        // 3. Rollback: `task` is the row exactly as it was before the edit.
        setTasks(prevTasks => prevTasks.map(t => (t.id === task.id ? task : t)));
        setError('Could not save those changes. The task was put back — please try again.');
      }
    },
    [user],
  );

  const toggleTaskStatus = useCallback(
    async (task: Task) => {
      if (!user?.id) return;
      const newStatus: Status = task.status === 'Pending' ? 'Completed' : 'Pending';

      // 1. Optimistic update
      setError(null);
      setTasks(prevTasks => prevTasks.map(t => (t.id === task.id ? { ...t, status: newStatus } : t)));

      try {
        const res = await secureFetch(`/api/${user.id}/tasks/${task.id}`, {
          method: 'PUT',
          body: JSON.stringify({ status: newStatus }),
        });

        if (res.ok) {
          const updatedTask = await res.json();
          // 2. Success: replace the local task with the updated task
          setTasks(prevTasks => prevTasks.map(t => (t.id === task.id ? updatedTask : t)));
        } else {
          throw new Error('Failed to update task');
        }
      } catch (error) {
        console.error('Failed to update task:', error);
        // 3. Rollback on failure
        setTasks(prevTasks => prevTasks.map(t => (t.id === task.id ? { ...t, status: task.status } : t)));
        setError('Could not update that task. Its status was put back — please try again.');
      }
    },
    [user],
  );

  const deleteTask = useCallback(
    async (id: string) => {
      if (!user?.id) return;
      // Capture the row and its position before removing it, so a failed
      // request can roll back to exactly where it was.
      const taskToDelete = tasks.find(t => t.id === id);
      const taskIndex = tasks.findIndex(t => t.id === id);
      if (!taskToDelete || taskIndex === -1) return;

      // 1. Optimistic update
      setError(null);
      setTasks(prevTasks => prevTasks.filter(t => t.id !== id));

      try {
        const res = await secureFetch(`/api/${user.id}/tasks/${id}`, { method: 'DELETE' });
        if (!res.ok) {
          throw new Error('Failed to delete task');
        }
      } catch (error) {
        console.error('Failed to delete task:', error);
        // 3. Rollback on failure (restore the original position)
        setTasks(prevTasks => {
          if (prevTasks.some(t => t.id === id)) return prevTasks;
          const restored = [...prevTasks];
          restored.splice(taskIndex, 0, taskToDelete);
          return restored;
        });
        setError('Could not delete that task. It was put back — please try again.');
      }
    },
    [user, tasks],
  );

  const value = useMemo<TasksContextValue>(
    () => ({ tasks, loading, user, error, dismissError, fetchTasks, createTask, updateTask, toggleTaskStatus, deleteTask }),
    [tasks, loading, user, error, dismissError, fetchTasks, createTask, updateTask, toggleTaskStatus, deleteTask],
  );

  return <TasksContext.Provider value={value}>{children}</TasksContext.Provider>;
}

export function useTasks(): TasksContextValue {
  const context = useContext(TasksContext);
  if (!context) throw new Error('useTasks must be used within a TasksProvider');
  return context;
}
