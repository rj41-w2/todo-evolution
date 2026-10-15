import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import Chatbot from './Chatbot';

const getSession = vi.fn();
vi.mock('../lib/auth-client', () => ({
  authClient: { getSession: () => getSession() }
}));

const secureFetch = vi.fn();
vi.mock('../lib/api', () => ({ secureFetch: (...args: unknown[]) => secureFetch(...args) }));

vi.mock('../lib/agent-activity', () => ({
  deriveLatestAgentAction: () => null,
  describeToolCall: () => '',
  publishAgentActivity: () => undefined
}));

const USER = { id: 'user-1' };

function chatReply(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    json: async () => ({
      conversation_id: 'conv-1',
      response: 'Done.',
      outcome: 'completed',
      tool_calls: [],
      ...overrides
    })
  };
}

function renderChatbot() {
  return render(
    <Chatbot onTaskMutation={() => undefined} open={true} onOpenChange={() => undefined} />
  );
}

describe('a turn that did not fully succeed says so', () => {
  beforeEach(() => {
    getSession.mockReset();
    secureFetch.mockReset();
    getSession.mockResolvedValue({ data: { user: USER } });
    // Default: the conversation list and a clean turn.
    secureFetch.mockImplementation((path: string) => {
      if (path.includes('/conversations')) {
        return Promise.resolve({ ok: true, json: async () => ({ conversations: [] }) });
      }
      return Promise.resolve(chatReply());
    });
    localStorage.clear();
  });

  // `@testing-library/user-event` is not a dependency here, so this drives
  // the DOM directly. fireEvent is wrapped in act by React Testing Library.
  async function send(message: string) {
    const input = await screen.findByPlaceholderText(/ask/i);
    fireEvent.change(input, { target: { value: message } });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));
  }

  it('shows nothing when the turn completed', async () => {
    renderChatbot();
    await send('anything');

    await waitFor(() => {
      expect(screen.getByText('Done.')).toBeInTheDocument();
    });
    // design.md asks for silent success: a completed turn carries no status.
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('marks a partial turn and names the tools that failed', async () => {
    secureFetch.mockImplementation((path: string) => {
      if (path.includes('/conversations')) {
        return Promise.resolve({ ok: true, json: async () => ({ conversations: [] }) });
      }
      return Promise.resolve(
        chatReply({
          outcome: 'partial',
          tool_calls: [
            { tool: 'add_task', parameters: {}, result: {}, ok: true },
            { tool: 'delete_task', parameters: {}, result: null, ok: false }
          ]
        })
      );
    });

    renderChatbot();
    await send('delete a task that does not exist');

    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent(/partly done/i);
    // The whole point of the field: the user can see *what* did not happen.
    expect(status).toHaveTextContent('delete_task');
  });

  it('marks a failed turn as having changed nothing', async () => {
    secureFetch.mockImplementation((path: string) => {
      if (path.includes('/conversations')) {
        return Promise.resolve({ ok: true, json: async () => ({ conversations: [] }) });
      }
      return Promise.resolve(chatReply({ outcome: 'failed', response: '' }));
    });

    renderChatbot();
    await send('something the model cannot answer');

    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent(/nothing was changed/i);
  });

  it('does not invent a failure for a turn that predates the outcome field', async () => {
    // A response with no `outcome` at all — an older backend, or a turn read
    // back from history, where the database does not store it. Absence must
    // read as "nothing to report", not as a failure.
    const legacy = chatReply();
    delete (await legacy.json() as Record<string, unknown>).outcome;

    secureFetch.mockImplementation((path: string) => {
      if (path.includes('/conversations')) {
        return Promise.resolve({ ok: true, json: async () => ({ conversations: [] }) });
      }
      return Promise.resolve(legacy);
    });

    renderChatbot();
    await send('hello');

    await waitFor(() => {
      expect(screen.getByText('Done.')).toBeInTheDocument();
    });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});