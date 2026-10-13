import { describe, expect, test, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import TaskTabs from './TaskTabs'
import type { TaskFilterCounts } from '../lib/task-filter'

const counts: TaskFilterCounts = { All: 5, Pending: 3, Completed: 2 }

describe('TaskTabs', () => {
  test('shows the three real tabs with their live counts', () => {
    render(<TaskTabs value="All" onChange={vi.fn()} counts={counts} />)

    expect(screen.getByRole('tab', { name: /All/ })).toHaveTextContent('5')
    expect(screen.getByRole('tab', { name: /Pending/ })).toHaveTextContent('3')
    expect(screen.getByRole('tab', { name: /Completed/ })).toHaveTextContent('2')
  })

  test('marks only the active tab as selected', () => {
    render(<TaskTabs value="Pending" onChange={vi.fn()} counts={counts} />)

    expect(screen.getByRole('tab', { name: /All/ })).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByRole('tab', { name: /Pending/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: /Completed/ })).toHaveAttribute('aria-selected', 'false')
  })

  test('reports the tab the user picks', () => {
    const onChange = vi.fn()
    render(<TaskTabs value="All" onChange={onChange} counts={counts} />)

    fireEvent.click(screen.getByRole('tab', { name: /Completed/ }))

    expect(onChange).toHaveBeenCalledWith('Completed')
  })

  test('offers no tab the backend cannot honour', () => {
    render(<TaskTabs value="All" onChange={vi.fn()} counts={counts} />)

    expect(screen.getAllByRole('tab')).toHaveLength(3)
    expect(screen.queryByRole('tab', { name: /In Progress|Blocked/ })).not.toBeInTheDocument()
  })
})
