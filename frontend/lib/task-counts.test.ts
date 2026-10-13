import { describe, expect, test } from 'vitest'
import { completionPercent, countOverdue, countTasks } from './task-counts'
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

describe('completionPercent', () => {
  test('is the rounded share of done tasks', () => {
    expect(completionPercent({ total: 4, open: 1, done: 3 })).toBe(75)
    expect(completionPercent({ total: 3, open: 2, done: 1 })).toBe(33)
    expect(completionPercent({ total: 3, open: 1, done: 2 })).toBe(67)
  })

  test('an empty ledger is 0%, never NaN', () => {
    expect(completionPercent({ total: 0, open: 0, done: 0 })).toBe(0)
  })
})

describe('countOverdue — due in the past and not done', () => {
  function due(id: string, status: Task['status'], dueDate: string | null): Task {
    return { ...task(id, status), due_date: dueDate }
  }
  const now = new Date(2026, 9, 14, 12, 0) // Wed 14 Oct 2026, midday

  test('an open task whose due date has passed is overdue', () => {
    expect(countOverdue([due('a', 'Pending', new Date(2026, 9, 13, 9, 0).toISOString())], now)).toBe(1)
  })

  test('a completed task is never overdue', () => {
    expect(countOverdue([due('a', 'Completed', new Date(2026, 9, 13, 9, 0).toISOString())], now)).toBe(0)
  })

  test('a due date in the future and a task with no due date are not overdue', () => {
    const tasks = [
      due('a', 'Pending', new Date(2026, 9, 15, 9, 0).toISOString()),
      due('b', 'Pending', null),
    ]
    expect(countOverdue(tasks, now)).toBe(0)
  })

  test('counts only the overdue rows in a mixed ledger', () => {
    const tasks = [
      due('a', 'Pending', new Date(2026, 9, 1, 0, 0).toISOString()),
      due('b', 'Completed', new Date(2026, 9, 1, 0, 0).toISOString()),
      due('c', 'Pending', new Date(2026, 9, 20, 0, 0).toISOString()),
      due('d', 'Pending', null),
      due('e', 'Pending', new Date(2026, 9, 13, 0, 0).toISOString()),
    ]
    expect(countOverdue(tasks, now)).toBe(2)
  })
})
