'use client';

import React, { useState } from 'react';
import { Plus, Tag, Calendar } from 'lucide-react';
import { Priority, TaskCreate } from '../types';

interface TaskFormProps {
  onTaskCreated: (task: TaskCreate) => Promise<void>;
}

export default function TaskForm({ onTaskCreated }: TaskFormProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>('Medium');
  const [tags, setTags] = useState('');
  const [dueDate, setDueDate] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const newTask: TaskCreate = {
      title: title.trim(),
      description: description.trim() || undefined,
      priority,
      tags: tags.split(',').map(t => t.trim()).filter(t => t !== ''),
      status: 'Pending',
      due_date: dueDate ? new Date(dueDate).toISOString() : undefined
    };

    // Instant feedback: clear the fields immediately!
    setTitle('');
    setDescription('');
    setTags('');
    setDueDate('');

    try {
      await onTaskCreated(newTask);
    } catch (error) {
      console.error('Failed to create task optimistically:', error);
    }
  };

  return (
    <section aria-label="Add a task">
      <form onSubmit={handleSubmit} className="bg-paper-2 border border-rule rounded-[var(--radius-card)] p-4 sm:p-5 space-y-4">
        <input
          type="text"
          placeholder="What needs to be done?"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-label="Task title"
          className="w-full bg-transparent text-lg font-medium placeholder:text-muted focus:outline-none text-ink"
          required
        />

        <textarea
          placeholder="Add a description…"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          aria-label="Task description"
          className="w-full bg-transparent text-sm text-ink-2 placeholder:text-muted focus:outline-none resize-none"
          rows={2}
        />

        <div className="flex flex-wrap items-center gap-x-5 gap-y-3 pt-2 border-t border-rule">
          <label className="flex items-center gap-2 text-sm text-muted cursor-pointer">
            <span className="font-mono text-xs">PRIORITY</span>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as Priority)}
              className="select-input bg-transparent border-none p-0 text-sm text-ink cursor-pointer focus:outline-none"
            >
              <option value="Low" className="bg-paper text-ink">Low</option>
              <option value="Medium" className="bg-paper text-ink">Medium</option>
              <option value="High" className="bg-paper text-ink">High</option>
            </select>
          </label>

          <label className="flex items-center gap-2 text-sm text-muted group">
            <Tag className="h-4 w-4" />
            <input
              type="text"
              placeholder="Tags"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              aria-label="Tags, comma separated"
              className="bg-transparent border-none p-0 text-sm w-28 placeholder:text-muted focus:outline-none"
            />
          </label>

          <label className="flex items-center gap-2 text-sm text-muted">
            <Calendar className="h-4 w-4" />
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              aria-label="Due date"
              className="bg-transparent border-none p-0 text-sm text-ink cursor-pointer focus:outline-none"
            />
          </label>

          <button
            type="submit"
            disabled={!title}
            className="btn-primary ml-auto"
          >
            <Plus className="h-4 w-4" />
            Add task
          </button>
        </div>
      </form>
    </section>
  );
}