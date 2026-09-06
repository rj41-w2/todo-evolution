'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import TaskForm from '../components/TaskForm';
import TaskList from '../components/TaskList';
import TaskControls from '../components/TaskControls';
import { ThemeToggle } from '../components/ThemeToggle';
import { AuthUser, Task, TaskCreate, Status, Priority } from '../types';
import { LogOut } from 'lucide-react';
import { authClient } from '../lib/auth-client';
import { secureFetch } from '../lib/api';
import Chatbot from '../components/Chatbot';

export default function Home() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(null);
  const router = useRouter();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<Status | 'All'>('All');
  const [priorityFilter, setPriorityFilter] = useState<Priority | 'All'>('All');
  const [sortBy, setSortBy] = useState<'created_at' | 'due_date' | 'priority' | 'alphabetical'>('created_at');

  const fetchTasks = useCallback(async () => {
    const session = await authClient.getSession();
    const userId = session?.data?.user?.id;
    if (!userId) return;

    try {
      const res = await secureFetch(`/api/${userId}/tasks`);
      if (res.ok) {
        const data = await res.json();
        setTasks(data);
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

  const createTask = async (taskData: TaskCreate) => {
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
      due_date: taskData.due_date || null
    };

    // 1. Optimistic update
    setTasks(prevTasks => [tempTask, ...prevTasks]);

    try {
      const res = await secureFetch(`/api/${user.id}/tasks`, {
        method: 'POST',
        body: JSON.stringify(taskData),
      });

      if (res.ok) {
        const savedTask = await res.json();
        // 2. Success: Replace temporary task with backend task
        setTasks(prevTasks =>
          prevTasks.map(t => (t.id === tempId ? savedTask : t))
        );
      } else {
        throw new Error('Failed to create task');
      }
    } catch (error) {
      console.error('Failed to create task:', error);
      // 3. Rollback on failure
      setTasks(prevTasks => prevTasks.filter(t => t.id !== tempId));
    }
  };

  const toggleTaskStatus = async (task: Task) => {
    if (!user?.id) return;
    const newStatus: Status = task.status === 'Pending' ? 'Completed' : 'Pending';

    // 1. Optimistic update
    setTasks(prevTasks =>
      prevTasks.map(t => (t.id === task.id ? { ...t, status: newStatus } : t))
    );

    try {
      const res = await secureFetch(`/api/${user.id}/tasks/${task.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: newStatus }),
      });

      if (res.ok) {
        const updatedTask = await res.json();
        // 2. Success: Replace local task with database updated task
        setTasks(prevTasks =>
          prevTasks.map(t => (t.id === task.id ? updatedTask : t))
        );
      } else {
        throw new Error('Failed to update task');
      }
    } catch (error) {
      console.error('Failed to update task:', error);
      // 3. Rollback on failure
      setTasks(prevTasks =>
        prevTasks.map(t => (t.id === task.id ? { ...t, status: task.status } : t))
      );
    }
  };

  const deleteTask = async (id: string) => {
    if (!user?.id) return;
    const taskToDelete = tasks.find(t => t.id === id);
    const taskIndex = tasks.findIndex(t => t.id === id);
    if (!taskToDelete || taskIndex === -1) return;

    // 1. Optimistic update
    setTasks(prevTasks => prevTasks.filter(t => t.id !== id));

    try {
      const res = await secureFetch(`/api/${user.id}/tasks/${id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        throw new Error('Failed to delete task');
      }
    } catch (error) {
      console.error('Failed to delete task:', error);
      // 3. Rollback on failure (Restore original position)
      setTasks(prevTasks => {
        if (prevTasks.some(t => t.id === id)) return prevTasks;
        const restored = [...prevTasks];
        restored.splice(taskIndex, 0, taskToDelete);
        return restored;
      });
    }
  };

  const handleLogout = async () => {
    try {
      await authClient.signOut();
      router.push('/login');
      router.refresh();
    } catch (error) {
      console.error('Failed to sign out user:', error);
    }
  };

  const filteredAndSortedTasks = React.useMemo(() => {
    let result = [...tasks];

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(t =>
        t.title.toLowerCase().includes(q) ||
        (t.description && t.description.toLowerCase().includes(q)) ||
        t.tags.some(tag => tag.toLowerCase().includes(q))
      );
    }

    if (statusFilter !== 'All') {
      result = result.filter(t => t.status === statusFilter);
    }

    if (priorityFilter !== 'All') {
      result = result.filter(t => t.priority === priorityFilter);
    }

    result.sort((a, b) => {
      if (sortBy === 'created_at') {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      } else if (sortBy === 'due_date') {
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
      } else if (sortBy === 'alphabetical') {
        return a.title.localeCompare(b.title);
      } else if (sortBy === 'priority') {
        const priorityWeight = { High: 3, Medium: 2, Low: 1 };
        return priorityWeight[b.priority] - priorityWeight[a.priority];
      }
      return 0;
    });

    return result;
  }, [tasks, searchQuery, statusFilter, priorityFilter, sortBy]);

  const openCount = filteredAndSortedTasks.filter(t => t.status !== 'Completed').length;
  const doneCount = filteredAndSortedTasks.length - openCount;
  const firstName = user?.name?.split(' ')[0] || 'there';

  return (
    <div className="min-h-dvh font-body">
      <header className="top-rail">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/" className="wordmark">
            EVO<span className="text-accent">TODO</span>
          </Link>

          <div className="flex items-center gap-2">
            {user && (
              <div className="hidden sm:flex items-center gap-2 pr-3 mr-1 border-r border-rule">
                <div className="w-8 h-8 rounded-[var(--radius-input)] bg-accent-soft text-accent flex items-center justify-center font-semibold text-xs uppercase shrink-0">
                  {user.name?.charAt(0) || 'U'}
                </div>
                <div className="text-left leading-tight">
                  <p className="text-xs font-medium text-ink">{user.name}</p>
                  <p className="text-[10px] text-muted truncate max-w-[140px]">{user.email}</p>
                </div>
              </div>
            )}

            <ThemeToggle />

            {user && (
              <button
                onClick={handleLogout}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-[var(--radius-input)] text-xs font-medium text-danger hover:bg-danger-soft transition-colors cursor-pointer"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span className="hidden md:inline">Log out</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-12 space-y-8">
        {/* Page header — functional, not a hero */}
        <section className="space-y-1.5">
          <h1 className="page-header text-[var(--text-2xl)]">
            Good to see you, {firstName}.
          </h1>
          <p className="font-mono text-sm text-muted">
            {loading ? '…' : `${openCount} open · ${doneCount} done`}
          </p>
        </section>

        <TaskForm onTaskCreated={createTask} />

        <TaskControls
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          priorityFilter={priorityFilter}
          setPriorityFilter={setPriorityFilter}
          sortBy={sortBy}
          setSortBy={setSortBy}
        />

        <AnimatePresence mode="wait">
          {loading ? (
            <motion.div
              key="loader"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex justify-center items-center py-16"
            >
              <div className="h-8 w-8 border-2 border-rule-2 border-t-accent rounded-full animate-spin" />
            </motion.div>
          ) : (
            <TaskList tasks={filteredAndSortedTasks} hasAnyTasks={tasks.length > 0} onToggleStatus={toggleTaskStatus} onDeleteTask={deleteTask} />
          )}
        </AnimatePresence>
      </main>

      <footer className="py-10">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <div className="h-px bg-rule mb-6" />
          <p className="text-xs text-muted">
            EVO TODO — tasks, with an AI assistant that edits them for you.
          </p>
        </div>
      </footer>

      <Chatbot onTaskMutation={fetchTasks} />
    </div>
  );
}
