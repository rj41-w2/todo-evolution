import { beforeEach, describe, expect, test, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { TasksProvider, useTasks } from './TasksProvider'
import { countTasks } from '../lib/task-counts'
import { secureFetch } from '../lib/api'
import type { Task } from '../types'

vi.mock('../lib/auth-client', () => ({
  authClient: {
    getSession: vi.fn(async () => ({
      data: { user: { id: 'user-1', name: 'Ada Lovelace', email: 'ada@example.com' } },
    })),
    signOut: vi.fn(async () => ({})),
  },
}))

vi.mock('../lib/api', () => ({ secureFetch: vi.fn() }))

const mockFetch = vi.mocked(secureFetch)

function task(id: string, title: string, status: Task['status']): Task {
  return {
    id,
    title,
    description: null,
    status,
    priority: 'Medium',
    tags: [],
    created_at: '2026-01-01T00:00:00.000Z',
    due_date: null,
  }
}

function jsonResponse(body: unknown): Response {
  return { ok: true, json: async () => body } as unknown as Response
}

beforeEach(() => {
  mockFetch.mockReset()
  mockFetch.mockImplementation(async (path, options) => {
    const method = options?.method ?? 'GET'
    const body = options?.body ? JSON.parse(options.body as string) : {}
    if (method === 'GET') return jsonResponse([task('a', 'Write report', 'Pending'), task('b', 'Send invoice', 'Completed')])
    if (method === 'POST') return jsonResponse(task('server-new', body.title, body.status ?? 'Pending'))
    if (method === 'PUT') {
      const id = String(path).split('/').pop() as string
      return jsonResponse({ ...task(id, 'Toggled', body.status) })
    }
    if (method === 'DELETE') return { ok: true } as unknown as Response
    throw new Error(`unexpected ${method} ${path}`)
  })
})

function Harness() {
  const { tasks, loading, createTask, toggleTaskStatus, deleteTask } = useTasks()
  const counts = countTasks(tasks)
  const firstOpen = tasks.find(t => t.status === 'Pending')
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="total">{counts.total}</span>
      <span data-testid="open">{counts.open}</span>
      <span data-testid="done">{counts.done}</span>
      <button onClick={() => createTask({ title: 'New task' })}>add</button>
      <button onClick={() => firstOpen && toggleTaskStatus(firstOpen)}>complete</button>
      <button onClick={() => tasks[0] && deleteTask(tasks[0].id)}>delete</button>
    </div>
  )
}

describe('TasksProvider — one shared tasks source', () => {
  test('loads the real tasks from the API and exposes live counts', async () => {
    render(<TasksProvider><Harness /></TasksProvider>)

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))
    expect(screen.getByTestId('total')).toHaveTextContent('2')
    expect(screen.getByTestId('open')).toHaveTextContent('1')
    expect(screen.getByTestId('done')).toHaveTextContent('1')
  })

  test('a task added, completed or deleted elsewhere updates the counts with no reload', async () => {
    render(<TasksProvider><Harness /></TasksProvider>)
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))

    fireEvent.click(screen.getByText('add'))
    await waitFor(() => expect(screen.getByTestId('total')).toHaveTextContent('3'))
    expect(screen.getByTestId('open')).toHaveTextContent('2')

    fireEvent.click(screen.getByText('complete'))
    await waitFor(() => expect(screen.getByTestId('done')).toHaveTextContent('2'))
    expect(screen.getByTestId('open')).toHaveTextContent('1')

    fireEvent.click(screen.getByText('delete'))
    await waitFor(() => expect(screen.getByTestId('total')).toHaveTextContent('2'))
  })
})
