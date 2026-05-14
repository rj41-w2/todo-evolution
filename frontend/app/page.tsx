'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import TaskForm from '../components/TaskForm';
import TaskList from '../components/TaskList';
import { ThemeToggle } from '../components/ThemeToggle';
import { Task } from '../types';
import { Sparkles } from 'lucide-react';

export default function Home() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch('http://127.0.0.1:8000/api/tasks');
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
    fetchTasks();
  }, [fetchTasks]);

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
          >
            <ThemeToggle />
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

          <TaskForm onTaskCreated={fetchTasks} />
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
              <TaskList tasks={tasks} onTaskUpdate={fetchTasks} />
            )}
          </AnimatePresence>
        </section>
      </main>

      {/* Footer Decoration */}
      <footer className="py-12 text-center opacity-20 pointer-events-none">
        <div className="h-px bg-gradient-to-r from-transparent via-foreground/20 to-transparent w-full max-w-xs mx-auto mb-4" />
        <p className="text-[10px] font-bold tracking-[0.2em] uppercase">Phase II Deployment • Decoupled Architecture</p>
      </footer>
    </div>
  );
}
