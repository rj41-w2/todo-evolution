import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { TasksProvider, useTasks } from './TasksProvider';
import { secureFetch } from '../lib/api';
import { authClient } from '../lib/auth-client';

vi.mock('../lib/api', () => ({ secureFetch: vi.fn() }));
vi.mock('../lib/auth-client', () => ({
  authClient: { getSession: vi.fn() },
}));

const USER = { id: 'u1', name: 'S', email: 's@example.test' };

/**
 * Reports the count as text as well as listing the rows.
 *
 * Without it the empty-page test passes for the wrong reason: with the
 * pre-#7 code `tasks` holds the whole response object, `tasks.map` is not a
 * function, the probe throws, and a crashed render leaves zero list items —
 * which is exactly what an empty page is supposed to look like. The count
 * makes that impossible: an object renders as `undefined`, not `0`.
 */
function Probe() {
  const { tasks, loading } = useTasks();
  if (loading) return <p>loading</p>;
  return (
    <>
      <span data-testid="count">{tasks.length}</span>
      <span data-testid="isArray">{Array.isArray(tasks) ? 'yes' : 'no'}</span>
      <ul>
        {tasks.map((t) => (
          <li key={t.id}>{t.title}</li>
        ))}
      </ul>
    </>
  );
}

function task(n: number) {
  return {
    id: `t${n}`,
    title: `TASK ${n}`,
    description: null,
    status: 'PENDING' as const,
    priority: 'MEDIUM' as const,
    tags: [],
    created_at: '2026-01-01T00:00:00Z',
    due_date: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(authClient.getSession).mockResolvedValue({
    data: { user: USER },
  } as never);
});

describe('TasksProvider list fetch', () => {
  it('unwraps the paged envelope instead of storing the response object', async () => {
    // Issue #7. The route answers {"tasks": [...], "next_cursor": ...} now; it
    // answered a bare array before. Storing the whole payload makes every
    // consumer read `tasks.tasks`, and the symptom is a page that silently
    // renders zero tasks — no error, no failed request.
    vi.mocked(secureFetch).mockResolvedValue({
      ok: true,
      json: async () => ({ tasks: [task(1), task(2)], next_cursor: 'abc' }),
    } as never);

    render(
      <TasksProvider>
        <Probe />
      </TasksProvider>,
    );

    await waitFor(() => expect(screen.getByText('TASK 1')).toBeTruthy());
    expect(screen.getByText('TASK 2')).toBeTruthy();
  });

  it('renders an empty page without treating it as an error', async () => {
    vi.mocked(secureFetch).mockResolvedValue({
      ok: true,
      json: async () => ({ tasks: [], next_cursor: null }),
    } as never);

    render(
      <TasksProvider>
        <Probe />
      </TasksProvider>,
    );

    await waitFor(() => expect(screen.queryByText('loading')).toBeNull());
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    // The real assertion: an array of nothing, not a crashed render.
    expect(screen.getByTestId('count').textContent).toBe('0');
    expect(screen.getByTestId('isArray').textContent).toBe('yes');
  });

  it('shows the backend order verbatim rather than sorting it away', async () => {
    // The backend now orders newest-first and nothing here re-sorts. If someone
    // later adds a client-side sort it will disagree with the cursor the
    // backend is paging on, and paging will skip and repeat rows while the
    // list looks perfectly fine.
    vi.mocked(secureFetch).mockResolvedValue({
      ok: true,
      json: async () => ({ tasks: [task(3), task(1), task(2)], next_cursor: null }),
    } as never);

    render(
      <TasksProvider>
        <Probe />
      </TasksProvider>,
    );

    await waitFor(() => expect(screen.getByText('TASK 3')).toBeTruthy());
    const shown = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(shown).toEqual(['TASK 3', 'TASK 1', 'TASK 2']);
  });
});