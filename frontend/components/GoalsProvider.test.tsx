import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { GoalsProvider, useGoals } from './GoalsProvider';
import { secureFetch } from '../lib/api';
import { authClient } from '../lib/auth-client';
import type { Goal } from '../types';

vi.mock('../lib/api', () => ({ secureFetch: vi.fn() }));
vi.mock('../lib/auth-client', () => ({
  authClient: { getSession: vi.fn() },
}));

const USER = { id: 'u1', name: 'S', email: 's@example.test' };

function goal(n: number, overrides: Partial<Goal> = {}): Goal {
  return {
    id: `g${n}`,
    title: `GOAL ${n}`,
    description: null,
    target_date: null,
    status: 'Draft',
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

/** Reports state and exposes each action as a button. */
function Probe() {
  const { goals, loading, hasMore, error, loadMore, createGoal, updateGoal } = useGoals();
  if (loading) return <p>loading</p>;
  return (
    <>
      <span data-testid="count">{goals.length}</span>
      <span data-testid="hasMore">{hasMore ? 'yes' : 'no'}</span>
      {error && <span data-testid="error">{error}</span>}
      <button onClick={() => void loadMore()} disabled={!hasMore}>load more</button>
      <button onClick={() => void createGoal({ title: 'NEW GOAL' })}>create</button>
      <button onClick={() => void updateGoal(goals[0], { status: 'Active' })}>promote first</button>
      <ul>
        {goals.map(g => (
          <li key={g.id} data-status={g.status}>{g.title}</li>
        ))}
      </ul>
    </>
  );
}

function renderProvider() {
  return render(
    <GoalsProvider>
      <Probe />
    </GoalsProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(authClient.getSession).mockResolvedValue({ data: { user: USER } } as never);
});

describe('GoalsProvider list fetch', () => {
  it('unwraps the paged envelope and keeps the backend order verbatim', async () => {
    // The route answers {"goals": [...], "next_cursor": ...}. Storing the
    // payload itself would make every consumer read `goals.goals` and render
    // nothing, silently. And nothing here sorts: a client-side sort would
    // disagree with the cursor and start skipping rows.
    vi.mocked(secureFetch).mockResolvedValue({
      ok: true,
      json: async () => ({ goals: [goal(3), goal(1), goal(2)], next_cursor: null }),
    } as never);

    renderProvider();

    await waitFor(() => expect(screen.getByText('GOAL 3')).toBeTruthy());
    const shown = screen.getAllByRole('listitem').map(li => li.textContent);
    expect(shown).toEqual(['GOAL 3', 'GOAL 1', 'GOAL 2']);
  });

  it('renders an empty page without treating it as an error', async () => {
    vi.mocked(secureFetch).mockResolvedValue({
      ok: true,
      json: async () => ({ goals: [], next_cursor: null }),
    } as never);

    renderProvider();

    await waitFor(() => expect(screen.queryByText('loading')).toBeNull());
    expect(screen.getByTestId('count').textContent).toBe('0');
    expect(screen.queryByTestId('error')).toBeNull();
  });

  it('surfaces a failed load instead of showing an empty page', async () => {
    vi.mocked(secureFetch).mockResolvedValue({ ok: false, status: 500 } as never);

    renderProvider();

    await waitFor(() => expect(screen.getByTestId('error')).toBeTruthy());
  });

  it('appends the next cursor page and never repeats a goal', async () => {
    // The second response deliberately re-includes g1, which the first page
    // already showed. A naive concat would render it twice.
    vi.mocked(secureFetch).mockImplementation((path: string) => {
      if (String(path).includes('cursor=')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ goals: [goal(1), goal(2)], next_cursor: null }),
        } as never);
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ goals: [goal(1)], next_cursor: 'cursor-1' }),
      } as never);
    });

    renderProvider();

    await waitFor(() => expect(screen.getByText('GOAL 1')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'load more' }));

    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('2'));
    const shown = screen.getAllByRole('listitem').map(li => li.textContent);
    expect(shown).toEqual(['GOAL 1', 'GOAL 2']);
    expect(screen.getByTestId('hasMore').textContent).toBe('no');
  });
});

describe('GoalsProvider mutations', () => {
  it('prepends the authoritative goal returned by create', async () => {
    vi.mocked(secureFetch).mockImplementation((_path: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return Promise.resolve({ ok: true, json: async () => goal(9, { title: 'NEW GOAL' }) } as never);
      }
      return Promise.resolve({ ok: true, json: async () => ({ goals: [goal(1)], next_cursor: null }) } as never);
    });

    renderProvider();

    await waitFor(() => expect(screen.getByText('GOAL 1')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'create' }));

    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('2'));
    expect(screen.getAllByRole('listitem')[0].textContent).toBe('NEW GOAL');
  });

  it('keeps the server row after a successful update', async () => {
    vi.mocked(secureFetch).mockImplementation((_path: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        return Promise.resolve({ ok: true, json: async () => goal(1, { status: 'Active' }) } as never);
      }
      return Promise.resolve({ ok: true, json: async () => ({ goals: [goal(1)], next_cursor: null }) } as never);
    });

    renderProvider();

    await waitFor(() => expect(screen.getByText('GOAL 1')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'promote first' }));

    await waitFor(() =>
      expect(screen.getByRole('listitem').getAttribute('data-status')).toBe('Active'),
    );
  });

  it('rolls a failed update back and says so', async () => {
    vi.mocked(secureFetch).mockImplementation((_path: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        return Promise.resolve({ ok: false, status: 500 } as never);
      }
      return Promise.resolve({ ok: true, json: async () => ({ goals: [goal(1)], next_cursor: null }) } as never);
    });

    renderProvider();

    await waitFor(() => expect(screen.getByText('GOAL 1')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'promote first' }));

    await waitFor(() => expect(screen.getByTestId('error')).toBeTruthy());
    // The optimistic change is gone, not merely reported.
    expect(screen.getByRole('listitem').getAttribute('data-status')).toBe('Draft');
  });
});
