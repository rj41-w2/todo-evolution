'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import TaskForm from '../components/TaskForm';
import TaskList from '../components/TaskList';
import { ThemeToggle } from '../components/ThemeToggle';
import { Task, TaskCreate, Status } from '../types';
import { Sparkles, LogOut } from 'lucide-react';
import { authClient } from '../lib/auth-client';
import { secureFetch } from '../lib/api';
import Chatbot from '../components/Chatbot';

export default function Home() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const router = useRouter();

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

  return (
    <div className="min-h-screen relative font-sans selection:bg-indigo-500/30 selection:text-indigo-200">
      {/* Cinematic Background Layer */}
      <div className="cinematic-bg" />
      <div className="fixed inset-0 -z-5 particles" />
      
      {/* Floating Ambient Glows */}
      <div className="fixed top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-500/10 dark:bg-indigo-500/10 blur-[120px] rounded-full animate-float" />
      <div className="fixed bottom-[-10%] right-[-10%] w-[30%] h-[30%] bg-blue-500/10 dark:bg-blue-500/10 blur-[100px] rounded-full animate-float" style={{ animationDelay: '-5s' }} />

      <nav className="sticky top-0 z-50 glass border-x-0 border-t-0 border-b-black/5 dark:border-b-white/5 px-6 py-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-3"
          >
            <div className="h-9 w-9 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-600/30 ring-1 ring-white/20">
              <Sparkles className="h-5 w-5 text-white" fill="currentColor" />
            </div>
            <span className="text-2xl font-black italic tracking-tighter text-foreground">
              EVO<span className="text-indigo-500">TODO</span>
            </span>
          </motion.div>
          
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-4 md:gap-6"
          >
            {user && (
              <div className="flex items-center gap-3 pr-4 border-r border-black/5 dark:border-white/5">
                <div className="h-8 w-8 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-xl flex items-center justify-center font-bold text-xs uppercase shadow-sm shrink-0">
                  {user.name?.charAt(0) || 'U'}
                </div>
                <div className="hidden sm:block text-left max-w-[120px]">
                  <p className="text-xs font-bold text-foreground leading-none truncate">{user.name}</p>
                  <p className="text-[9px] text-foreground/40 leading-none mt-1 truncate">{user.email}</p>
                </div>
              </div>
            )}

            <ThemeToggle />

            {user && (
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-rose-500 hover:text-rose-400 bg-rose-500/10 hover:bg-rose-500/15 border border-rose-500/15 hover:border-rose-500/30 px-3.5 py-2 rounded-xl transition-all cursor-pointer active:scale-95 shadow-sm"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span className="hidden md:inline">Log Out</span>
              </button>
            )}
          </motion.div>
        </div>
      </nav>

      <main className="relative z-10 py-12 px-4 space-y-20">
        {/* Hero Section with Form */}
        <section className="text-center space-y-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="space-y-4"
          >
            <h2 className="text-5xl md:text-7xl font-black tracking-tight leading-none italic uppercase">
              Master Your <br />
              <span className="text-indigo-500">Universe.</span>
            </h2>
            <p className="text-foreground/40 text-lg md:text-xl font-medium max-w-lg mx-auto">
              Precision task management for the digital frontier.
            </p>
          </motion.div>

          <TaskForm onTaskCreated={createTask} />
        </section>

        {/* Task List Section */}
        <section className="pb-24">
          <AnimatePresence mode="wait">
            {loading ? (
              <motion.div
                key="loader"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex justify-center items-center py-20"
              >
                <div className="h-10 w-10 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
              </motion.div>
            ) : (
              <TaskList tasks={tasks} onToggleStatus={toggleTaskStatus} onDeleteTask={deleteTask} />
            )}
          </AnimatePresence>
        </section>
      </main>

      {/* Footer Decoration */}
      <footer className="py-12 text-center opacity-20 pointer-events-none">
        <div className="h-px bg-gradient-to-r from-transparent via-foreground/20 to-transparent w-full max-w-xs mx-auto mb-4" />
        <p className="text-[10px] font-bold tracking-[0.2em] uppercase">Phase III Deployment • AI-Powered Chatbot</p>
      </footer>

      {/* Floating Conversational AI Chatbot Assistant */}
      <Chatbot onTaskMutation={fetchTasks} />
    </div>
  );
}
