'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Circle, Trash2, Tag, AlertTriangle } from 'lucide-react';
import { Task, Status } from '../types';

interface TaskListProps {
  tasks: Task[];
  onTaskUpdate: () => void;
}

export default function TaskList({ tasks, onTaskUpdate }: TaskListProps) {
  const toggleStatus = async (task: Task) => {
    const newStatus: Status = task.status === 'Pending' ? 'Completed' : 'Pending';
    try {
      const res = await fetch(`http://127.0.0.1:8000/api/tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) onTaskUpdate();
    } catch (error) {
      console.error('Failed to update task:', error);
    }
  };

  const deleteTask = async (id: string) => {
    try {
      const res = await fetch(`http://127.0.0.1:8000/api/tasks/${id}`, {
        method: 'DELETE',
      });
      if (res.ok) onTaskUpdate();
    } catch (error) {
      console.error('Failed to delete task:', error);
    }
  };

  const priorityConfig = {
    High: { color: 'text-rose-500', glow: 'shadow-rose-500/20', icon: <AlertTriangle className="h-3 w-3" /> },
    Medium: { color: 'text-amber-500', glow: 'shadow-amber-500/20', icon: null },
    Low: { color: 'text-emerald-500', glow: 'shadow-emerald-500/20', icon: null },
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-7xl mx-auto px-4">
      <AnimatePresence mode="popLayout">
        {tasks.map((task, index) => (
          <motion.div
            key={task.id}
            layout
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -20 }}
            transition={{ duration: 0.3, delay: index * 0.05 }}
            className={`glass group p-6 rounded-2xl flex flex-col justify-between h-full hover:border-indigo-500/30 transition-all ${
              task.status === 'Completed' ? 'opacity-40 grayscale-[0.5]' : ''
            }`}
          >
            <div>
              <div className="flex justify-between items-start mb-4">
                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-foreground/[0.03] dark:bg-white/5 border border-foreground/[0.05] dark:border-white/5 text-[10px] font-bold uppercase tracking-widest ${priorityConfig[task.priority].color}`}>
                  {priorityConfig[task.priority].icon}
                  {task.priority}
                </div>
                <button
                  onClick={() => deleteTask(task.id)}
                  className="opacity-0 group-hover:opacity-100 p-1.5 text-foreground/20 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-all"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              <h3 className={`text-xl font-bold leading-tight mb-2 ${task.status === 'Completed' ? 'line-through text-foreground/40' : 'text-foreground'}`}>
                {task.title}
              </h3>

              <p className="text-sm text-foreground/50 line-clamp-3 mb-6">
                {task.description || 'No description provided.'}
              </p>

              <div className="flex flex-wrap gap-2 mb-6">
                {task.tags.map((tag) => (
                  <div key={tag} className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-500/10 border border-indigo-500/20 text-[10px] text-indigo-400 font-medium">
                    <Tag className="h-2.5 w-2.5" />
                    {tag}
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-4 border-t border-black/5 dark:border-white/5 flex items-center justify-between mt-auto">
              <span className="text-[10px] text-foreground/20 font-medium">
                {new Date(task.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </span>
              
              <button
                onClick={() => toggleStatus(task)}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
                  task.status === 'Completed'
                    ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                    : 'bg-foreground/[0.03] dark:bg-white/5 text-foreground/40 hover:text-foreground border border-black/5 dark:border-white/10 hover:border-indigo-500/30'
                }`}
              >
                {task.status === 'Completed' ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <Circle className="h-4 w-4" />
                )}
                {task.status === 'Completed' ? 'Completed' : 'Complete'}
              </button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
      {tasks.length === 0 && (
        <div className="col-span-full py-20 text-center opacity-20">
          <p className="text-2xl font-black italic tracking-tighter">THE VOID IS EMPTY</p>
        </div>
      )}
    </div>
  );
}
