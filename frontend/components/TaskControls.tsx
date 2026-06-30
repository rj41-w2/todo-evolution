import React from 'react';
import { Search, Filter, ArrowUpDown } from 'lucide-react';
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
    <div className="glass p-4 rounded-2xl flex flex-col md:flex-row gap-4 mb-8 w-full max-w-7xl mx-auto">
      <div className="flex-1 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-foreground/40" />
        <input
          type="text"
          placeholder="Search tasks..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-foreground/[0.03] dark:bg-white/5 border border-black/5 dark:border-white/10 rounded-xl pl-10 pr-4 py-2 text-sm focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition-all placeholder:text-foreground/40"
        />
      </div>
      
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 bg-foreground/[0.03] dark:bg-white/5 border border-black/5 dark:border-white/10 rounded-xl px-3 py-2 text-sm">
          <Filter className="h-4 w-4 text-foreground/40" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as Status | 'All')}
            className="bg-transparent border-none focus:ring-0 p-0 text-foreground cursor-pointer text-sm"
          >
            <option value="All" className="bg-background">All Status</option>
            <option value="Pending" className="bg-background">Pending</option>
            <option value="Completed" className="bg-background">Completed</option>
          </select>
        </div>

        <div className="flex items-center gap-2 bg-foreground/[0.03] dark:bg-white/5 border border-black/5 dark:border-white/10 rounded-xl px-3 py-2 text-sm">
          <Filter className="h-4 w-4 text-foreground/40" />
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value as Priority | 'All')}
            className="bg-transparent border-none focus:ring-0 p-0 text-foreground cursor-pointer text-sm"
          >
            <option value="All" className="bg-background">All Priorities</option>
            <option value="High" className="bg-background">High</option>
            <option value="Medium" className="bg-background">Medium</option>
            <option value="Low" className="bg-background">Low</option>
          </select>
        </div>

        <div className="flex items-center gap-2 bg-foreground/[0.03] dark:bg-white/5 border border-black/5 dark:border-white/10 rounded-xl px-3 py-2 text-sm">
          <ArrowUpDown className="h-4 w-4 text-foreground/40" />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="bg-transparent border-none focus:ring-0 p-0 text-foreground cursor-pointer text-sm"
          >
            <option value="created_at" className="bg-background">Sort: Newest</option>
            <option value="due_date" className="bg-background">Sort: Due Date</option>
            <option value="priority" className="bg-background">Sort: Priority</option>
            <option value="alphabetical" className="bg-background">Sort: A-Z</option>
          </select>
        </div>
      </div>
    </div>
  );
}
