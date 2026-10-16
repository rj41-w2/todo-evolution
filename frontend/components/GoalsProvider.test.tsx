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
  const { goals, loading, hasMore, filter, error, loadMore, setFilter, createGoal, updateGoal, deleteGoal } = useGoals();
  return (
    <>
      {loading && <p>loading</p>}
      <span data-testid="count">{goals.length}</span>
      <span data-testid="hasMore">{hasMore ? 'yes' : 'no'}</span>
      <span data-testid="filter">{filter}</span>
      {error && <span data-testid="error">{error}</span>}
      <button onClick={() => void loadMore()} disabled={!hasMore}>load more</button>
      <button onClick={() => setFilter('Active')}>filter Active</button>
      <button onClick={() => setFilter('Done')}>filter Done</button>
      <button onClick={() => setFilter('All')}>filter All</button>
      <button onClick={() => void createGoal({ title: 'NEW GOAL' })}>create</button>
      <button onClick={() => void updateGoal(goals[0], { status: 'Active' })}>promote first</button>
      <button onClick={() => void deleteGoal(goals[0])}>delete first</button>
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

describe('GoalsProvider filtering', () => {
  it('sends the mapped status to the server, and none for All', async () => {
    // The tab says "Done"; the query must say "Completed". Sending the label
    // would return nothing and the tab would look empty while the rows exist.
    const calls: string[] = [];
    vi.mocked(secureFetch).mockImplementation((path: string) => {
      calls.push(String(path));
      return Promise.resolve({
        ok: true,
        json: async () => ({ goals: [goal(1)], next_cursor: null }),
      } as never);
    });

    renderProvider();
    await waitFor(() => expect(screen.getByText('GOAL 1')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'filter Active' }));
    await waitFor(() => expect(calls.at(-1)).toContain('status=Active'));
    expect(screen.getByTestId('filter').textContent).toBe('Active');

    fireEvent.click(screen.getByRole('button', { name: 'filter Done' }));
    await waitFor(() => expect(calls.at(-1)).toContain('status=Completed'));

    fireEvent.click(screen.getByRole('button', { name: 'filter All' }));
    await waitFor(() => expect(calls.at(-1)).not.toContain('status='));
  });

  it('drops the old rows and cursor when the filter changes', async () => {
    // Page one under All offers a cursor and two rows. Switching to Active must
    // replace the result set, not append to or re-page the old one.
    vi.mocked(secureFetch).mockImplementation((path: string) => {
      const url = String(path);
      if (url.includes('status=Active')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ goals: [goal(9, { status: 'Active' })], next_cursor: null }),
        } as never);
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ goals: [goal(1), goal(2)], next_cursor: url.includes('cursor=') ? null : 'cursor-1' }),
      } as never);
    });

    renderProvider();
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('2'));

    fireEvent.click(screen.getByRole('button', { name: 'filter Active' }));

    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('1'));
    expect(screen.getByTestId('hasMore').textContent).toBe('no');
    expect(screen.getByText('GOAL 9')).toBeTruthy();
    expect(screen.queryByText('GOAL 1')).toBeNull();
  });

  it('carries the active filter on a load-more request', async () => {
    const calls: string[] = [];
    vi.mocked(secureFetch).mockImplementation((path: string) => {
      const url = String(path);
      calls.push(url);
      if (url.includes('cursor=')) {
        return Promise.resolve({ ok: true, json: async () => ({ goals: [goal(2, { status: 'Active' })], next_cursor: null }) } as never);
      }
      return Promise.resolve({ ok: true, json: async () => ({ goals: [goal(1, { status: 'Active' })], next_cursor: 'cursor-1' }) } as never);
    });

    renderProvider();
    await waitFor(() => expect(screen.getByText('GOAL 1')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'filter Active' }));
    await waitFor(() => expect(screen.getByTestId('hasMore').textContent).toBe('yes'));

    fireEvent.click(screen.getByRole('button', { name: 'load more' }));

    await waitFor(() => expect(calls.some(u => u.includes('cursor=') && u.includes('status=Active'))).toBe(true));
  });

  it('ignores a slow response that belongs to an abandoned filter', async () => {
    // Active is requested first and answers late; Done is requested second and
    // answers first. The late Active page must not overwrite the Done one.
    let resolveActive: (value: unknown) => void = () => {};
    let resolveDone: (value: unknown) => void = () => {};
    vi.mocked(secureFetch).mockImplementation((path: string) => {
      const url = String(path);
      if (url.includes('status=Active')) {
        return new Promise(resolve => {
          resolveActive = resolve;
        }) as never;
      }
      if (url.includes('status=Completed')) {
        return new Promise(resolve => {
          resolveDone = resolve;
        }) as never;
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ goals: [goal(1)], next_cursor: null }),
      } as never);
    });

    renderProvider();
    await waitFor(() => expect(screen.getByText('GOAL 1')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'filter Active' }));
    fireEvent.click(screen.getByRole('button', { name: 'filter Done' }));

    // The newer Done request answers first...
    resolveDone({ ok: true, json: async () => ({ goals: [goal(8, { title: 'DONE GOAL' })], next_cursor: null }) });
    await waitFor(() => expect(screen.getByTestId('filter').textContent).toBe('Done'));

    // ...then the abandoned Active payload lands late and must be discarded.
    resolveActive({ ok: true, json: async () => ({ goals: [goal(7, { title: 'STALE GOAL' })], next_cursor: null }) });

    await waitFor(() => expect(screen.getByText('DONE GOAL')).toBeTruthy());
    expect(screen.queryByText('STALE GOAL')).toBeNull();
  });
});

describe('GoalsProvider deletion', () => {
  it('removes the goal on success', async () => {
    vi.mocked(secureFetch).mockImplementation((_path: string, init?: RequestInit) => {
      if (init?.method === 'DELETE') {
        return Promise.resolve({ ok: true, status: 204 } as never);
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ goals: [goal(1), goal(2)], next_cursor: null }),
      } as never);
    });

    renderProvider();
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('2'));

    fireEvent.click(screen.getByRole('button', { name: 'delete first' }));

    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('1'));
    expect(screen.queryByText('GOAL 1')).toBeNull();
    expect(screen.getByText('GOAL 2')).toBeTruthy();
  });

  it('restores the goal at its original position when the delete fails', async () => {
    vi.mocked(secureFetch).mockImplementation((_path: string, init?: RequestInit) => {
      if (init?.method === 'DELETE') {
        return Promise.resolve({ ok: false, status: 500 } as never);
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ goals: [goal(1), goal(2), goal(3)], next_cursor: null }),
      } as never);
    });

    renderProvider();
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('3'));

    fireEvent.click(screen.getByRole('button', { name: 'delete first' }));

    await waitFor(() => expect(screen.getByTestId('error')).toBeTruthy());
    expect(screen.getByTestId('count').textContent).toBe('3');
    // Restored where it was — the head of the list, not appended at the end.
    expect(screen.getAllByRole('listitem').map(li => li.textContent)).toEqual([
      'GOAL 1',
      'GOAL 2',
      'GOAL 3',
    ]);
  });
});
