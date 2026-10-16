import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import GoalTabs from './GoalTabs';

describe('GoalTabs', () => {
  it('offers the five lifecycle filters with All selected by default', () => {
    render(<GoalTabs value="All" onChange={vi.fn()} />);

    const tabs = screen.getAllByRole('tab').map(t => t.textContent);
    expect(tabs).toEqual(['All', 'Active', 'Done', 'Draft', 'Paused']);
    expect(screen.getByRole('tab', { name: 'All' }).getAttribute('aria-selected')).toBe('true');
  });

  it('marks only the active filter as selected', () => {
    render(<GoalTabs value="Active" onChange={vi.fn()} />);

    expect(screen.getByRole('tab', { name: 'Active' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: 'All' }).getAttribute('aria-selected')).toBe('false');
  });

  it('reports the chosen filter, Done included, and shows no counts', () => {
    const onChange = vi.fn();
    render(<GoalTabs value="All" onChange={onChange} />);

    fireEvent.click(screen.getByRole('tab', { name: 'Done' }));

    expect(onChange).toHaveBeenCalledWith('Done');
    // A per-tab number could only describe the pages loaded so far, so there is
    // none — the labels are exactly the filter words.
    expect(screen.getAllByRole('tab').every(t => /^(All|Active|Done|Draft|Paused)$/.test(t.textContent ?? ''))).toBe(true);
  });
});
