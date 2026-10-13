'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import TaskForm from '../../components/TaskForm';
import TaskList from '../../components/TaskList';
import TaskControls from '../../components/TaskControls';
import Chatbot from '../../components/Chatbot';
import { useTasks } from '../../components/TasksProvider';
import { Status, Priority } from '../../types';

export default function Home() {
  const { tasks, loading, user, fetchTasks, createTask, toggleTaskStatus, deleteTask } = useTasks();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<Status | 'All'>('All');
  const [priorityFilter, setPriorityFilter] = useState<Priority | 'All'>('All');
  const [sortBy, setSortBy] = useState<'created_at' | 'due_date' | 'priority' | 'alphabetical'>('created_at');

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
    <div className="space-y-8">
      {/* Page header — functional, not a hero */}
      <section className="space-y-1.5">
        <h1 className="page-header text-[length:var(--text-2xl)]">
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

      <footer className="pt-2">
        <div className="h-px bg-rule mb-6" />
        <p className="text-xs text-muted">
          EVO TODO — tasks, with an AI assistant that edits them for you.
        </p>
      </footer>

      <Chatbot onTaskMutation={fetchTasks} />
    </div>
  );
}
