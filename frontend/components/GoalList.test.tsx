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

  it('words the empty state honestly while a filter is active', () => {
    renderList({ goals: [], filter: 'Active' });
    expect(screen.getByText('No goals match this filter.')).toBeTruthy();
    expect(screen.queryByText('No goals yet.')).toBeNull();
  });
});

describe('GoalList delete confirmation', () => {
  it('deletes nothing until the confirmation is accepted', async () => {
    const onDeleteGoal = vi.fn().mockResolvedValue(undefined);
    renderList({ goals: [goal({ title: 'KEEP' })], onDeleteGoal });

    fireEvent.click(screen.getByRole('button', { name: 'Delete KEEP' }));
    expect(screen.getByRole('dialog')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(onDeleteGoal).not.toHaveBeenCalled();
    expect(screen.getByText('KEEP')).toBeTruthy();
  });

  it('hands the confirmed goal to the shared source', async () => {
    const onDeleteGoal = vi.fn().mockResolvedValue(undefined);
    renderList({ goals: [goal({ title: 'GONE' })], onDeleteGoal });

    fireEvent.click(screen.getByRole('button', { name: 'Delete GONE' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() =>
      expect(onDeleteGoal).toHaveBeenCalledWith(expect.objectContaining({ title: 'GONE' })),
    );
  });

  it('disables the actions while pending and never sends the delete twice', async () => {
    let resolveDelete: () => void = () => {};
    const onDeleteGoal = vi.fn(
      () =>
        new Promise<void>(resolve => {
          resolveDelete = resolve;
        }),
    );
    renderList({ goals: [goal({ title: 'GONE' })], onDeleteGoal });

    fireEvent.click(screen.getByRole('button', { name: 'Delete GONE' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    const pendingButton = await screen.findByRole('button', { name: 'Deleting…' });
    expect(pendingButton.hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Cancel' }).hasAttribute('disabled')).toBe(true);

    // A second click on the disabled control must not fire a second request.
    fireEvent.click(pendingButton);
    expect(onDeleteGoal).toHaveBeenCalledTimes(1);

    resolveDelete();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('closes on Escape without deleting', async () => {
    const onDeleteGoal = vi.fn().mockResolvedValue(undefined);
    renderList({ goals: [goal({ title: 'KEEP' })], onDeleteGoal });

    const trigger = screen.getByRole('button', { name: 'Delete KEEP' });
    trigger.focus();
    fireEvent.click(trigger);
    expect(screen.getByRole('dialog')).toBeTruthy();

    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(onDeleteGoal).not.toHaveBeenCalled();
  });

  it('moves focus into the dialog and back to the trigger on cancel', async () => {
    renderList({ goals: [goal({ title: 'KEEP' })], onDeleteGoal: vi.fn().mockResolvedValue(undefined) });

    const trigger = screen.getByRole('button', { name: 'Delete KEEP' });
    trigger.focus();
    fireEvent.click(trigger);

    // Focus lands inside the dialog (its first control is Cancel)...
    await waitFor(() => expect(document.activeElement?.textContent).toBe('Cancel'));

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    // ...and returns to the control that opened it.
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
});
