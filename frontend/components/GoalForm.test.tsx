import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import GoalForm from './GoalForm';

/**
 * The create form's contract (issue #17): a new goal defaults to `Draft`, the
 * target date is sent as a calendar day, and the fields clear on submit.
 */
describe('GoalForm', () => {
  it('defaults the status to Draft', () => {
    render(<GoalForm onGoalCreated={vi.fn()} />);
    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('Draft');
  });

  it('offers exactly the four agreed statuses', () => {
    render(<GoalForm onGoalCreated={vi.fn()} />);
    const options = Array.from((screen.getByRole('combobox') as HTMLSelectElement).options).map(o => o.value);
    expect(options).toEqual(['Draft', 'Active', 'Paused', 'Completed']);
  });

  it('submits a trimmed title and a date-only target', async () => {
    const onGoalCreated = vi.fn().mockResolvedValue(undefined);
    render(<GoalForm onGoalCreated={onGoalCreated} />);

    fireEvent.change(screen.getByLabelText('Goal title'), { target: { value: '  Run a half marathon  ' } });
    fireEvent.change(screen.getByLabelText('Target date'), { target: { value: '2026-04-15' } });
    fireEvent.click(screen.getByRole('button', { name: /add goal/i }));

    await waitFor(() => expect(onGoalCreated).toHaveBeenCalledTimes(1));
    expect(onGoalCreated).toHaveBeenCalledWith({
      title: 'Run a half marathon',
      description: undefined,
      status: 'Draft',
      target_date: '2026-04-15',
    });
  });

  it('will not submit a blank title', () => {
    const onGoalCreated = vi.fn().mockResolvedValue(undefined);
    render(<GoalForm onGoalCreated={onGoalCreated} />);

    fireEvent.change(screen.getByLabelText('Goal title'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: /add goal/i }));

    expect(onGoalCreated).not.toHaveBeenCalled();
  });
});
