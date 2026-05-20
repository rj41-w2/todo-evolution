'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Tag, Calendar, AlertCircle } from 'lucide-react';
import { Priority, TaskCreate } from '../types';
import { API_BASE_URL } from '../lib/config';

interface TaskFormProps {
  onTaskCreated: () => void;
}

export default function TaskForm({ onTaskCreated }: TaskFormProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>('Medium');
  const [tags, setTags] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const newTask: TaskCreate = {
      title,
      description,
      priority,
      tags: tags.split(',').map(t => t.trim()).filter(t => t !== ''),
      status: 'Pending'
    };

    try {
      const res = await fetch(`${API_BASE_URL}/api/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newTask),
      });

      if (res.ok) {
        setTitle('');
        setDescription('');
        setTags('');
        onTaskCreated();
      }
    } catch (error) {
      console.error('Failed to create task:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass p-8 rounded-2xl w-full max-w-2xl mx-auto mb-12"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-2">
          <input
            type="text"
            placeholder="What needs to be done?"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full bg-transparent text-2xl font-bold placeholder:text-foreground/20 border-none focus:ring-0 p-0"
            required
          />
          <div className="h-px bg-gradient-to-r from-indigo-500/50 to-transparent w-full" />
        </div>

        <textarea
          placeholder="Add a description..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full bg-transparent text-foreground/60 placeholder:text-foreground/20 border-none focus:ring-0 p-0 resize-none"
          rows={2}
        />

        <div className="flex flex-wrap items-center gap-6 pt-4">
          <div className="flex items-center gap-2 text-foreground/40 hover:text-foreground/70 transition-colors">
            <AlertCircle className="h-4 w-4" />
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as Priority)}
              className="bg-transparent border-none focus:ring-0 text-sm p-0 cursor-pointer"
            >
              <option value="Low" className="bg-background text-foreground">Low Priority</option>
              <option value="Medium" className="bg-background text-foreground">Medium Priority</option>
              <option value="High" className="bg-background text-foreground">High Priority</option>
            </select>
          </div>

          <div className="flex items-center gap-2 text-foreground/40 group">
            <Tag className="h-4 w-4 group-focus-within:text-indigo-500 transition-colors" />
            <input
              type="text"
              placeholder="Add tags..."
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              className="bg-transparent border-none focus:ring-0 text-sm p-0 w-32 placeholder:text-foreground/20"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !title}
            className="ml-auto glow-primary bg-indigo-600 hover:bg-indigo-500 disabled:bg-foreground/10 disabled:text-foreground/30 disabled:shadow-none text-white px-6 py-2 rounded-full font-semibold flex items-center gap-2 transition-all active:scale-95"
          >
            <Plus className="h-4 w-4" />
            {loading ? 'Adding...' : 'Add Task'}
          </button>
        </div>
      </form>
    </motion.div>
  );
}
