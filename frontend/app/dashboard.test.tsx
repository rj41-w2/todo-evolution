import { beforeEach, describe, expect, test, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { DashboardView } from '../components/DashboardView'
import TasksPage from './(app)/tasks/page'
import { TasksProvider } from '../components/TasksProvider'
import { resetAgentActivity } from '../lib/agent-activity'
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

// A known ledger: two open (one overdue), two done (one done late). Four tasks,
// half done, one overdue — the dashboard must show exactly these, never more.
const ledger: Task[] = [
  { id: 'a', title: 'Overdue one', description: null, status: 'Pending', priority: 'High', tags: [], created_at: '2026-10-01T00:00:00.000Z', due_date: '2026-10-05T00:00:00' },
  { id: 'b', title: 'Open one', description: null, status: 'Pending', priority: 'Medium', tags: [], created_at: '2026-10-02T00:00:00.000Z', due_date: null },
  { id: 'c', title: 'Done one', description: null, status: 'Completed', priority: 'Low', tags: [], created_at: '2026-10-03T00:00:00.000Z', due_date: null },
  { id: 'd', title: 'Done late', description: null, status: 'Completed', priority: 'Low', tags: [], created_at: '2026-10-04T00:00:00.000Z', due_date: '2026-10-05T00:00:00' },
]

/** The instant the whole page is pinned to: Wed 14 Oct 2026, 09:00 local. */
const now = new Date(2026, 9, 14, 9, 0, 0)

function dashboard() {
  return render(
    <TasksProvider>
      <DashboardView now={now} />
    </TasksProvider>,
  )
}

beforeEach(() => {
  resetAgentActivity()
  localStorage.clear()
  mockFetch.mockReset()
  mockFetch.mockImplementation(async (_path, options) => {
    const method = options?.method ?? 'GET'
    if (method === 'GET') return { ok: true, json: async () => ledger } as unknown as Response
    if (method === 'POST') return { ok: true, json: async () => ({ ...ledger[1], id: 'server-new', title: 'New task' }) } as unknown as Response
    throw new Error(`unexpected ${method}`)
  })
})

describe('dashboard — greeting and date', () => {
  test('the greeting follows the visitor time of day', async () => {
    dashboard()

    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Good morning, Ada.'))
  })

  test('the page shows today', async () => {
    dashboard()

    expect(screen.getByText('Wednesday, 14 October 2026')).toBeInTheDocument()
  })

  test('with no injected clock it reads the visitor clock on the client', async () => {
    render(
      <TasksProvider>
        <DashboardView />
      </TasksProvider>,
    )

    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Good (morning|afternoon|evening), Ada\./),
    )
    expect(screen.queryByText('Today')).not.toBeInTheDocument()
  })
})

describe('dashboard — the stat cards come from the real tasks', () => {
  test('open, completed, overdue and completion all match the ledger', async () => {
    dashboard()

    await waitFor(() => expect(screen.getByTestId('stat-open')).toHaveTextContent('2'))
    expect(screen.getByTestId('stat-completed')).toHaveTextContent('2')
    expect(screen.getByTestId('stat-overdue')).toHaveTextContent('1')
    expect(screen.getByTestId('stat-completion')).toHaveTextContent('50%')
    expect(screen.getByTestId('completion-figure')).toHaveTextContent('50%')
    expect(screen.getByTestId('completion-caption')).toHaveTextContent('2 of 4 tasks complete')
  })

  test('a completed task with a past due date is not counted as overdue', async () => {
    mockFetch.mockImplementation(async () => ({ ok: true, json: async () => [ledger[3]] }) as unknown as Response)
    dashboard()

    await waitFor(() => expect(screen.getByTestId('stat-overdue')).toHaveTextContent('0'))
    expect(screen.getByTestId('stat-completed')).toHaveTextContent('1')
  })

  test('shows placeholders, not invented numbers, until the tasks arrive', () => {
    // never settles: only the pre-load placeholders can be on screen
    mockFetch.mockImplementation(() => new Promise<Response>(() => {}))
    dashboard()

    expect(screen.getByTestId('stat-open')).toHaveTextContent('—')
    expect(screen.getByTestId('stat-completion')).toHaveTextContent('—')
    expect(screen.getByTestId('completion-figure')).toHaveTextContent('—')
  })

  test('its figures agree with the tasks page for the same ledger', async () => {
    render(
      <TasksProvider>
        <DashboardView now={now} />
        <TasksPage />
      </TasksProvider>,
    )

    await waitFor(() => expect(screen.getByTestId('stat-open')).toHaveTextContent('2'))
    expect(screen.getByTestId('stat-completed')).toHaveTextContent('2')

    // the tasks page counts the same source: All 4, Pending 2, Completed 2
    const tabs = screen.getByRole('tablist')
    expect(within(tabs).getByRole('tab', { name: /All/ })).toHaveTextContent('4')
    expect(within(tabs).getByRole('tab', { name: /Pending/ })).toHaveTextContent('2')
    expect(within(tabs).getByRole('tab', { name: /Completed/ })).toHaveTextContent('2')
  })
})

describe('dashboard — quick actions and the agent panel are keyboard reachable', () => {
  test('New task opens the shared new-task flow and focuses it', async () => {
    dashboard()

    fireEvent.click(screen.getByRole('button', { name: /New task/ }))

    const quickAdd = screen.getByTestId('quick-add')
    expect(quickAdd).toBeInTheDocument()
    expect(within(quickAdd).getByLabelText('Task title')).toHaveFocus()
  })

  test('Ask the agent opens the chat surface', async () => {
    dashboard()

    fireEvent.click(screen.getByRole('button', { name: /Ask the agent/ }))

    expect(await screen.findByText('EVO AI')).toBeInTheDocument()
  })

  test('the agent panel is an honest empty state when there is no activity', () => {
    dashboard()

    expect(screen.getByTestId('agent-activity-empty')).toBeInTheDocument()
    expect(screen.queryByTestId('agent-activity-summary')).not.toBeInTheDocument()
  })

  test('the agent panel reflects the real latest chat turn and links to the chat', async () => {
    // seed the real browser session the Chatbot restores
    localStorage.setItem('evo_chat_history_user-1', JSON.stringify([
      { id: 'u1', role: 'user', content: 'add a task', created_at: '2026-10-14T09:04:00' },
      { id: 'a1', role: 'assistant', content: 'Done!', created_at: '2026-10-14T09:05:00' },
    ]))
    localStorage.setItem('evo_tool_logs_user-1', JSON.stringify({
      a1: [{ tool: 'add_task', parameters: {}, result: { title: 'Write report' } }],
    }))

    dashboard()

    await waitFor(() =>
      expect(screen.getByTestId('agent-activity-summary')).toHaveTextContent('Added task "Write report"'),
    )
    const panel = screen.getByRole('region', { name: 'Latest agent action' })
    expect(within(panel).getByText('add_task')).toBeInTheDocument()
    expect(within(panel).getByText('09:05')).toBeInTheDocument()

    fireEvent.click(within(panel).getByRole('button', { name: /Open chat/ }))

    expect(await screen.findByText('EVO AI')).toBeInTheDocument()
  })
})

describe('dashboard — honesty rules', () => {
  test('no goals or team number is fabricated to fill the layout', async () => {
    dashboard()

    await waitFor(() => expect(screen.getByTestId('stat-open')).toHaveTextContent('2'))

    expect(screen.queryByText(/goals/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/team/i)).not.toBeInTheDocument()
  })
})
