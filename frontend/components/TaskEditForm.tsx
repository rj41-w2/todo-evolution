'use client';

import React, { useState } from 'react';
import { Tag, Calendar, Check } from 'lucide-react';
import { Priority, Task, TaskUpdate } from '../types';

interface TaskEditFormProps {
  task: Task;
  /** Hands the edit to the shared source, which updates optimistically and rolls back on failure. */
  onSave: (task: Task, patch: TaskUpdate) => Promise<void>;
  /** Leaves editing without touching the task — used by Cancel and Escape. */
  onClose: () => void;
}

/** `2026-01-09T00:00:00.000Z` → `2026-01-09`, which is what a date input wants. */
function toDateInputValue(iso: string | null) {
  return iso ? iso.slice(0, 10) : '';
}

/**
 * The in-place editor for one ledger row. It swaps into the row it belongs to
 * rather than opening a dialog, so an edit keeps the ledger's density and
 * locality. Every field is tab-reachable and the form submits on Enter and
 * leaves on Escape.
 *
 * It sends every editable field, with `null` for a cleared description or due
 * date — the API only touches the keys it receives, so `null` is how a field
 * gets removed.
 */
export default function TaskEditForm({ task, onSave, onClose }: TaskEditFormProps) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? '');
  const [priority, setPriority] = useState<Priority>(task.priority);
  const [tags, setTags] = useState(task.tags.join(', '));
  const [dueDate, setDueDate] = useState(toDateInputValue(task.due_date));

  const trimmedTitle = title.trim();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!trimmedTitle) return;

    const patch: TaskUpdate = {
      title: trimmedTitle,
      description: description.trim() || null,
      priority,
      tags: tags.split(',').map(t => t.trim()).filter(t => t !== ''),
      due_date: dueDate ? `${dueDate}T00:00:00` : null,
    };

    // Hand the edit over and step aside at once: the row shows the new values
    // optimistically, and the shared error alert covers a failed save.
    onClose();
    void onSave(task, patch);
  };

  return (
    <form
      aria-label={`Edit task: ${task.title}`}
      onSubmit={handleSubmit}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
      className="space-y-2"
    >
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        aria-label="Title"
        autoFocus
        required
        className="w-full bg-transparent text-md font-medium text-ink placeholder:text-muted focus:outline-none"
      />

      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        aria-label="Description"
        placeholder="Add a description…"
        rows={2}
        className="w-full bg-transparent text-sm text-ink-2 placeholder:text-muted focus:outline-none resize-none"
      />

      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 pt-3 border-t border-rule">
        <label className="flex items-center gap-2 text-meta text-muted cursor-pointer">
          <span className="font-mono text-micro uppercase tracking-[0.08em]">Priority</span>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as Priority)}
            aria-label="Priority"
            className="select-input bg-transparent border-none p-0 text-meta text-ink cursor-pointer focus:outline-none"
          >
            <option value="Low" className="bg-paper text-ink">Low</option>
            <option value="Medium" className="bg-paper text-ink">Medium</option>
            <option value="High" className="bg-paper text-ink">High</option>
          </select>
        </label>

        <label className="flex items-center gap-2 text-meta text-muted">
          <Tag className="h-4 w-4" />
          <input
            type="text"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            aria-label="Tags"
            placeholder="Tags"
            className="bg-transparent border-none p-0 text-meta w-28 text-ink placeholder:text-muted focus:outline-none"
          />
        </label>

        <label className="flex items-center gap-2 text-meta text-muted">
          <Calendar className="h-4 w-4" />
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            aria-label="Due date"
            className="bg-transparent border-none p-0 text-meta text-ink cursor-pointer focus:outline-none"
          />
        </label>

        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={onClose} className="btn-ghost">
            Cancel
          </button>
          <button type="submit" disabled={!trimmedTitle} className="btn-primary">
            <Check className="h-4 w-4" />
            Save
          </button>
        </div>
      </div>
    </form>
  );
}
