import { describe, expect, test } from 'vitest'
import type { Task } from '../types'
import { DEFAULT_MY_TASKS_FILTER, myTasksEmptyState } from './my-tasks'

function task(status: Task['status'], id: string): Task {
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

describe('my tasks view', () => {
  test("opens on the user's not-done work, because that is what the page is", () => {
    expect(DEFAULT_MY_TASKS_FILTER).toBe('Pending')
  })
})

describe('myTasksEmptyState', () => {
  test('is honest when the user has tasks and has finished them all', () => {
    const copy = myTasksEmptyState('Pending', [task('Completed', 'a')])

    expect(copy.title).toBe('All clear.')
  })

  test('says there are no tasks yet when the ledger is truly empty', () => {
    expect(myTasksEmptyState('Pending', []).title).toBe('No tasks yet.')
    expect(myTasksEmptyState('All', []).title).toBe('No tasks yet.')
  })

  test('never claims work is done when nothing has been completed', () => {
    const copy = myTasksEmptyState('Completed', [task('Pending', 'a')])

    expect(copy.title).toBe('Nothing completed yet.')
  })
})
