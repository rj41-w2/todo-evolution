import React from 'react';
import { Search } from 'lucide-react';
import { Priority, Status } from '../types';

interface TaskControlsProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  statusFilter: Status | 'All';
  setStatusFilter: (status: Status | 'All') => void;
  priorityFilter: Priority | 'All';
  setPriorityFilter: (priority: Priority | 'All') => void;
  sortBy: 'created_at' | 'due_date' | 'priority' | 'alphabetical';
  setSortBy: (sort: 'created_at' | 'due_date' | 'priority' | 'alphabetical') => void;
}

export default function TaskControls({
  searchQuery, setSearchQuery,
  statusFilter, setStatusFilter,
  priorityFilter, setPriorityFilter,
  sortBy, setSortBy
}: TaskControlsProps) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center" role="search" aria-label="Filter tasks">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted pointer-events-none" />
        <input
          type="search"
          placeholder="Search tasks"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          aria-label="Search tasks"
          className="input pl-10"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as Status | 'All')}
          aria-label="Filter by status"
          className="input select-input flex-1 sm:flex-none min-w-[130px]"
        >
          <option value="All" className="bg-paper text-ink">All status</option>
          <option value="Pending" className="bg-paper text-ink">Open</option>
          <option value="Completed" className="bg-paper text-ink">Done</option>
        </select>

        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value as Priority | 'All')}
          aria-label="Filter by priority"
          className="input select-input flex-1 sm:flex-none min-w-[130px]"
        >
          <option value="All" className="bg-paper text-ink">All priority</option>
          <option value="High" className="bg-paper text-ink">High</option>
          <option value="Medium" className="bg-paper text-ink">Medium</option>
          <option value="Low" className="bg-paper text-ink">Low</option>
        </select>

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as any)}
          aria-label="Sort tasks"
          className="input select-input flex-1 sm:flex-none min-w-[130px]"
        >
          <option value="created_at" className="bg-paper text-ink">Newest</option>
          <option value="due_date" className="bg-paper text-ink">Due date</option>
          <option value="priority" className="bg-paper text-ink">Priority</option>
          <option value="alphabetical" className="bg-paper text-ink">A–Z</option>
        </select>
      </div>
    </div>
  );
}