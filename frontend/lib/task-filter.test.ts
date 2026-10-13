import { describe, expect, test } from 'vitest'
import { TASK_FILTERS, countByFilter, filterTasks } from './task-filter'
import type { Task } from '../types'

function task(id: string, status: Task['status']): Task {
  return {
    id,
    title: id,
    description: null,
    status,
    priority: 'Medium',
    tags: [],
    created_at: '2026-01-01T00:00:00.000Z',
    due_date: null,
  }
}

const tasks = [task('open-1', 'Pending'), task('done-1', 'Completed'), task('open-2', 'Pending')]

describe('task filter tabs', () => {
  test('offers exactly the two statuses the backend models, plus All', () => {
    expect(TASK_FILTERS).toEqual(['All', 'Pending', 'Completed'])
  })

  test('All returns every task untouched', () => {
    expect(filterTasks(tasks, 'All')).toEqual(tasks)
  })

  test('Pending keeps only not-completed tasks', () => {
    expect(filterTasks(tasks, 'Pending').map(t => t.id)).toEqual(['open-1', 'open-2'])
  })

  test('Completed keeps only completed tasks', () => {
    expect(filterTasks(tasks, 'Completed').map(t => t.id)).toEqual(['done-1'])
  })

  test('counts every tab from the real tasks, so the tabs agree with the ledger', () => {
    expect(countByFilter(tasks)).toEqual({ All: 3, Pending: 2, Completed: 1 })
  })

  test('counts are zero for an empty ledger', () => {
    expect(countByFilter([])).toEqual({ All: 0, Pending: 0, Completed: 0 })
  })
})
