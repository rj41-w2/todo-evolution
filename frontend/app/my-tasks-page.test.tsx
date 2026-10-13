import { beforeEach, describe, expect, test, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import MyTasksPage from './(app)/my-tasks/page'
import AppShell from '../components/AppShell'
import { TasksProvider } from '../components/TasksProvider'
import { secureFetch } from '../lib/api'
import type { Task } from '../types'

const nav = vi.hoisted(() => ({ pathname: '/my-tasks' }))

vi.mock('next/navigation', () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

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

// Two open, one done. The page must never invent numbers — or people.
const ledger: Task[] = [
  { id: 'a', title: 'Write report', description: null, status: 'Pending', priority: 'High', tags: [], created_at: '2026-01-03T00:00:00.000Z', due_date: null },
  { id: 'b', title: 'Book venue', description: null, status: 'Pending', priority: 'Low', tags: [], created_at: '2026-01-02T00:00:00.000Z', due_date: null },
  { id: 'c', title: 'Send invoice', description: null, status: 'Completed', priority: 'Medium', tags: [], created_at: '2026-01-01T00:00:00.000Z', due_date: null },
]

function page() {
  return render(
    <TasksProvider>
      <MyTasksPage />
    </TasksProvider>,
  )
}

beforeEach(() => {
  nav.pathname = '/my-tasks'
  mockFetch.mockReset()
  mockFetch.mockImplementation(async (_path, options) => {
    const method = options?.method ?? 'GET'
    if (method === 'GET') return { ok: true, json: async () => ledger } as unknown as Response
    if (method === 'PUT') return { ok: true, json: async () => ledger[0] } as unknown as Response
    throw new Error(`unexpected ${method}`)
  })
})

describe('my tasks page', () => {
  test("opens on the signed-in user's own not-done work", async () => {
    page()

    await waitFor(() => expect(screen.getByText('Write report')).toBeInTheDocument())
    expect(screen.getByRole('heading', { level: 1, name: 'My Tasks' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Pending/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByText('Send invoice')).not.toBeInTheDocument()
  })

  test('switching tabs works using the shared tab behaviour', async () => {
    page()
    await waitFor(() => expect(screen.getByText('Write report')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('tab', { name: /Completed/ }))
    expect(screen.getByText('Send invoice')).toBeInTheDocument()
    expect(screen.queryByText('Write report')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: /All/ }))
    expect(screen.getByText('Write report')).toBeInTheDocument()
    expect(screen.getByText('Send invoice')).toBeInTheDocument()
  })

  test('completing a task clears it from the default view at once, with no reload', async () => {
    mockFetch.mockImplementation(async (_path, options) => {
      const method = options?.method ?? 'GET'
      if (method === 'GET') return { ok: true, json: async () => ledger } as unknown as Response
      // never settles: only the shared optimistic source can be showing the change
      if (method === 'PUT') return new Promise<Response>(() => {})
      throw new Error(`unexpected ${method}`)
    })

    page()
    await waitFor(() => expect(screen.getByText('Write report')).toBeInTheDocument())

    fireEvent.click(screen.getAllByRole('button', { name: 'Mark as complete' })[0])

    await waitFor(() => expect(screen.queryByText('Write report')).not.toBeInTheDocument())

    const reads = mockFetch.mock.calls.filter(([, options]) => (options?.method ?? 'GET') === 'GET')
    expect(reads).toHaveLength(1)
  })

  test('shows a genuine empty state with a link to the tasks page, and no error', async () => {
    mockFetch.mockImplementation(async (_path, options) => {
      const method = options?.method ?? 'GET'
      if (method === 'GET') {
        return { ok: true, json: async () => [ledger[2]] } as unknown as Response
      }
      throw new Error(`unexpected ${method}`)
    })

    page()

    await waitFor(() => expect(screen.getByText('All clear.')).toBeInTheDocument())
    expect(screen.getByRole('link', { name: /tasks/i })).toHaveAttribute('href', '/tasks')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  test('invents no assignee or avatar data', async () => {
    page()
    await waitFor(() => expect(screen.getByText('Write report')).toBeInTheDocument())

    expect(screen.queryByText(/assign(?:ee|ed)/i)).not.toBeInTheDocument()
    expect(document.querySelector('img')).toBeNull()
  })
})

describe('my tasks in the shell', () => {
  test('the route exists in the shell and highlights in the sidebar', async () => {
    render(
      <AppShell>
        <MyTasksPage />
      </AppShell>,
    )

    await waitFor(() => expect(screen.getByText('Write report')).toBeInTheDocument())
    expect(screen.getByRole('link', { name: 'My Tasks' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Tasks' })).not.toHaveAttribute('aria-current')
  })
})
