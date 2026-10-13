import { describe, expect, test, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import TaskRow from './TaskRow'
import type { Task } from '../types'

const task: Task = {
  id: 'task-1',
  title: 'Write the report',
  description: 'Draft and review',
  status: 'Pending',
  priority: 'High',
  tags: ['work', 'writing'],
  created_at: '2026-01-01T00:00:00.000Z',
  due_date: '2026-01-09T00:00:00.000Z',
}

describe('TaskRow — dense ledger row', () => {
  test('carries the status pill, title, description, priority, tags and due date', () => {
    render(<TaskRow task={task} onToggleStatus={vi.fn()} onDeleteTask={vi.fn()} />)

    expect(screen.getByText('Write the report')).toBeInTheDocument()
    expect(screen.getByText('Draft and review')).toBeInTheDocument()
    expect(screen.getByText('Pending')).toBeInTheDocument()
    expect(screen.getByText('High')).toBeInTheDocument()
    expect(screen.getByText('work')).toBeInTheDocument()
    expect(screen.getByText('writing')).toBeInTheDocument()
    expect(screen.getByText(/Due/)).toBeInTheDocument()
  })

  test('a completed row reads Completed, not Pending', () => {
    render(<TaskRow task={{ ...task, status: 'Completed' }} onToggleStatus={vi.fn()} onDeleteTask={vi.fn()} />)

    expect(screen.getByText('Completed')).toBeInTheDocument()
    expect(screen.queryByText('Pending')).not.toBeInTheDocument()
  })

  test('reports the task when its completion control is used', () => {
    const onToggleStatus = vi.fn()
    render(<TaskRow task={task} onToggleStatus={onToggleStatus} onDeleteTask={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Mark as complete' }))

    expect(onToggleStatus).toHaveBeenCalledWith(task)
  })

  test('reports the task id when its delete control is used', () => {
    const onDeleteTask = vi.fn()
    render(<TaskRow task={task} onToggleStatus={vi.fn()} onDeleteTask={onDeleteTask} />)

    fireEvent.click(screen.getByRole('button', { name: 'Delete Write the report' }))

    expect(onDeleteTask).toHaveBeenCalledWith('task-1')
  })
})
