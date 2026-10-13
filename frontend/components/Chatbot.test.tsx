import { beforeEach, describe, expect, test, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import Chatbot from './Chatbot'
import { getAgentActivitySnapshot, resetAgentActivity } from '../lib/agent-activity'
import { secureFetch } from '../lib/api'

vi.mock('../lib/auth-client', () => ({
  authClient: {
    getSession: vi.fn(async () => ({
      data: { user: { id: 'user-1', name: 'Ada Lovelace', email: 'ada@example.com' } },
    })),
  },
}))

vi.mock('../lib/api', () => ({ secureFetch: vi.fn() }))

const mockFetch = vi.mocked(secureFetch)

beforeEach(() => {
  resetAgentActivity()
  localStorage.clear()
  mockFetch.mockReset()
})

describe('Chatbot — a controlled drawer', () => {
  test('shows the launch bubble when closed and swaps it for the drawer when open', async () => {
    const { rerender } = render(<Chatbot open={false} onOpenChange={vi.fn()} onTaskMutation={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Open AI assistant' })).toBeInTheDocument()

    rerender(<Chatbot open onOpenChange={vi.fn()} onTaskMutation={vi.fn()} />)
    // the bubble animates out, then the drawer is the only surface left
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Open AI assistant' })).not.toBeInTheDocument(),
    )
    expect(screen.getByText('EVO AI')).toBeInTheDocument()
  })

  test('the bubble asks the owner to open it rather than opening itself', () => {
    const onOpenChange = vi.fn()
    render(<Chatbot open={false} onOpenChange={onOpenChange} onTaskMutation={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Open AI assistant' }))

    expect(onOpenChange).toHaveBeenCalledWith(true)
  })
})

describe('Chatbot — feeds the shared agent-activity source with the real conversation', () => {
  test('a restored browser session publishes its latest agent turn', async () => {
    localStorage.setItem('evo_chat_history_user-1', JSON.stringify([
      { id: 'u1', role: 'user', content: 'add a task', created_at: '2026-10-14T09:00:00.000Z' },
      { id: 'a1', role: 'assistant', content: 'Done', created_at: '2026-10-14T09:01:00.000Z' },
    ]))
    localStorage.setItem('evo_tool_logs_user-1', JSON.stringify({
      a1: [{ tool: 'add_task', parameters: {}, result: { title: 'Write report' } }],
    }))

    render(<Chatbot open={false} onOpenChange={vi.fn()} onTaskMutation={vi.fn()} />)

    await waitFor(() => expect(getAgentActivitySnapshot()?.summary).toBe('Added task "Write report"'))
  })

  test('a message just sent publishes the turn it produced', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        conversation_id: 'c1',
        response: 'Added it.',
        tool_calls: [{ tool: 'add_task', parameters: {}, result: { title: 'Study' } }],
      }),
    } as unknown as Response)

    // A prior turn guarantees the session has loaded before we type, so the
    // send is never dropped by the not-yet-signed-in guard.
    localStorage.setItem('evo_chat_history_user-1', JSON.stringify([
      { id: 'a0', role: 'assistant', content: 'Earlier reply', created_at: '2026-10-14T08:00:00.000Z' },
    ]))

    render(<Chatbot open onOpenChange={vi.fn()} onTaskMutation={vi.fn()} />)
    await waitFor(() => expect(getAgentActivitySnapshot()?.summary).toBe('Earlier reply'))

    fireEvent.change(screen.getByLabelText('Message the assistant'), { target: { value: 'add study task' } })
    fireEvent.submit(screen.getByLabelText('Message the assistant').closest('form')!)

    await waitFor(() => expect(getAgentActivitySnapshot()?.summary).toBe('Added task "Study"'))
  })

  test('clearing the chat empties the shared source too', async () => {
    localStorage.setItem('evo_chat_history_user-1', JSON.stringify([
      { id: 'a1', role: 'assistant', content: 'Hi there', created_at: '2026-10-14T09:00:00.000Z' },
    ]))

    render(<Chatbot open onOpenChange={vi.fn()} onTaskMutation={vi.fn()} />)
    await waitFor(() => expect(getAgentActivitySnapshot()?.summary).toBe('Hi there'))

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))

    expect(getAgentActivitySnapshot()).toBeNull()
  })
})
