import { describe, expect, test } from 'vitest'
import { countTasks } from './task-counts'
import type { Task } from '../types'

function task(id: string, status: Task['status']): Task {
  return {
    id,
    title: `Task ${id}`,
    description: null,
    status,
    priority: 'Medium',
    tags: [],
    created_at: '2026-01-01T00:00:00.000Z',
    due_date: null,
  }
}

describe('countTasks', () => {
  test('counts total, open and done from the real status field', () => {
    const counts = countTasks([task('a', 'Pending'), task('b', 'Completed'), task('c', 'Pending')])

    expect(counts).toEqual({ total: 3, open: 2, done: 1 })
  })

  test('an empty ledger counts as zero without dividing by nothing', () => {
    expect(countTasks([])).toEqual({ total: 0, open: 0, done: 0 })
  })

  test('counts every task, never a filtered subset', () => {
    const many = Array.from({ length: 5 }, (_, i) => task(String(i), i % 2 === 0 ? 'Pending' : 'Completed'))
    expect(countTasks(many)).toEqual({ total: 5, open: 3, done: 2 })
  })
})
