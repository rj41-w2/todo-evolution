import { beforeEach, describe, expect, test, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import TasksPage from './(app)/tasks/page'
import { TasksProvider } from '../components/TasksProvider'
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

// A known-good ledger: two open, one done. The page must never invent numbers.
const ledger: Task[] = [
  { id: 'a', title: 'Write report', description: null, status: 'Pending', priority: 'High', tags: [], created_at: '2026-01-03T00:00:00.000Z', due_date: null },
  { id: 'b', title: 'Book venue', description: null, status: 'Pending', priority: 'Low', tags: [], created_at: '2026-01-02T00:00:00.000Z', due_date: null },
  { id: 'c', title: 'Send invoice', description: null, status: 'Completed', priority: 'Medium', tags: [], created_at: '2026-01-01T00:00:00.000Z', due_date: null },
]

function page() {
  return render(
    <TasksProvider>
      <TasksPage />
    </TasksProvider>,
  )
}

beforeEach(() => {
  mockFetch.mockReset()
  mockFetch.mockImplementation(async (_path, options) => {
    const method = options?.method ?? 'GET'
    if (method === 'GET') return { ok: true, json: async () => ledger } as unknown as Response
    if (method === 'DELETE') return { ok: true } as unknown as Response
    if (method === 'POST') return { ok: true, json: async () => ({ ...ledger[0], id: 'server-new', title: 'New task' }) } as unknown as Response
    if (method === 'PUT') return { ok: true, json: async () => ledger[0] } as unknown as Response
    throw new Error(`unexpected ${method}`)
  })
})

describe('tasks page', () => {
  test('the header total matches the number of tasks the API returned', async () => {
    page()

    await waitFor(() => expect(screen.getByText('3 tasks')).toBeInTheDocument())
  })

  test('opens on All and lists both open and done tasks', async () => {
    page()

    await waitFor(() => expect(screen.getByText('Write report')).toBeInTheDocument())
    expect(screen.getByRole('tab', { name: /All/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Send invoice')).toBeInTheDocument()
  })

  test('tabs carry live counts that agree with the ledger', async () => {
    page()

    await waitFor(() => expect(screen.getByRole('tab', { name: /All/ })).toHaveTextContent('3'))
    expect(screen.getByRole('tab', { name: /Pending/ })).toHaveTextContent('2')
    expect(screen.getByRole('tab', { name: /Completed/ })).toHaveTextContent('1')
  })

  test('picking a tab filters the list to that status', async () => {
    page()
    await waitFor(() => expect(screen.getByText('Write report')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('tab', { name: /Completed/ }))

    expect(screen.getByText('Send invoice')).toBeInTheDocument()
    expect(screen.queryByText('Write report')).not.toBeInTheDocument()
    expect(screen.queryByText('Book venue')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: /Pending/ }))
    expect(screen.getByText('Write report')).toBeInTheDocument()
    expect(screen.queryByText('Send invoice')).not.toBeInTheDocument()
  })

  test('a task added from the quick-add appears immediately', async () => {
    mockFetch.mockImplementation(async (_path, options) => {
      const method = options?.method ?? 'GET'
      if (method === 'GET') return { ok: true, json: async () => [] } as unknown as Response
      // never settles: only the optimistic row can be showing
      if (method === 'POST') return new Promise<Response>(() => {})
      throw new Error(`unexpected ${method}`)
    })

    page()
    await waitFor(() => expect(screen.getByText('No tasks yet.')).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText('Task title'), { target: { value: 'New task' } })
    fireEvent.submit(screen.getByRole('button', { name: /Add task/ }).closest('form')!)

    expect(screen.getByText('New task')).toBeInTheDocument()
  })

  test('surfaces a mutation failure to the user instead of hiding it', async () => {
    mockFetch.mockImplementation(async (_path, options) => {
      const method = options?.method ?? 'GET'
      if (method === 'GET') return { ok: true, json: async () => ledger } as unknown as Response
      return { ok: false, json: async () => ({}) } as unknown as Response
    })

    page()
    await waitFor(() => expect(screen.getByText('Write report')).toBeInTheDocument())

    fireEvent.click(screen.getAllByRole('button', { name: 'Mark as complete' })[0])

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).not.toBe('')
  })

  test('the tabs are the only status filter — no control the backend cannot honour', async () => {
    page()
    await waitFor(() => expect(screen.getByText('Write report')).toBeInTheDocument())

    const tabs = within(screen.getByRole('tablist')).getAllByRole('tab')
    expect(tabs.map(t => t.textContent?.replace(/\d+/g, '').trim())).toEqual([
      'All',
      'Pending',
      'Completed',
    ])
    // The tabs replace the old status dropdown; nothing offers a status the
    // backend does not model.
    expect(screen.queryByRole('combobox', { name: /status/i })).not.toBeInTheDocument()
  })
})
