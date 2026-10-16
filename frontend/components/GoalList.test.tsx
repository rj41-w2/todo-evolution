import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import GoalList from './GoalList';
import type { Goal } from '../types';

function goal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: 'g1',
    title: 'Run a half marathon',
    description: null,
    target_date: null,
    status: 'Draft',
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function renderList(props: Partial<React.ComponentProps<typeof GoalList>> = {}) {
  return render(
    <GoalList
      goals={[]}
      hasMore={false}
      loadingMore={false}
      onLoadMore={vi.fn().mockResolvedValue(undefined)}
      onUpdateGoal={vi.fn().mockResolvedValue(undefined)}
      {...props}
    />,
  );
}

describe('GoalList', () => {
  it('shows an empty state when there is nothing to show', () => {
    renderList();
    expect(screen.getByText('No goals yet.')).toBeTruthy();
  });

  it('renders the status badge and formats a date-only target', () => {
    renderList({ goals: [goal({ status: 'Active', target_date: '2026-04-15' })] });
    expect(screen.getByText('Active')).toBeTruthy();
    expect(screen.getByText('Apr 15, 2026')).toBeTruthy();
  });

  it('offers a load-more control only while a cursor remains', () => {
    const onLoadMore = vi.fn().mockResolvedValue(undefined);
    const { rerender } = renderList({ goals: [goal()], hasMore: true, onLoadMore });

    fireEvent.click(screen.getByRole('button', { name: /load more/i }));
    expect(onLoadMore).toHaveBeenCalledTimes(1);

    rerender(
      <GoalList
        goals={[goal()]}
        hasMore={false}
        loadingMore={false}
        onLoadMore={onLoadMore}
        onUpdateGoal={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: /load more/i })).toBeNull();
  });

  it('edits a goal in place and hands the patch to the shared source', async () => {
    const onUpdateGoal = vi.fn().mockResolvedValue(undefined);
    renderList({ goals: [goal({ title: 'BEFORE' })], onUpdateGoal });

    fireEvent.click(screen.getByRole('button', { name: 'Edit BEFORE' }));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'AFTER' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(onUpdateGoal).toHaveBeenCalledTimes(1));
    const [edited, patch] = onUpdateGoal.mock.calls[0];
    expect(edited.title).toBe('BEFORE');
    expect(patch.title).toBe('AFTER');
  });
});
