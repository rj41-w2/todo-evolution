import { describe, expect, test, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
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

  test('offers no edit control when the view has nothing to edit with', () => {
    render(<TaskRow task={task} onToggleStatus={vi.fn()} onDeleteTask={vi.fn()} />)

    expect(screen.queryByRole('button', { name: 'Edit Write the report' })).not.toBeInTheDocument()
  })
})

describe('TaskRow — editing a row in place', () => {
  test('opens an editor prefilled with the row and reports the edited fields', () => {
    const onUpdateTask = vi.fn(async () => {})
    render(
      <TaskRow task={task} onToggleStatus={vi.fn()} onDeleteTask={vi.fn()} onUpdateTask={onUpdateTask} />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Edit Write the report' }))

    const form = screen.getByRole('form', { name: 'Edit task: Write the report' })
    expect(within(form).getByLabelText('Title')).toHaveValue('Write the report')
    expect(within(form).getByLabelText('Description')).toHaveValue('Draft and review')
    expect(within(form).getByLabelText('Priority')).toHaveValue('High')
    expect(within(form).getByLabelText('Tags')).toHaveValue('work, writing')
    expect(within(form).getByLabelText('Due date')).toHaveValue('2026-01-09')

    fireEvent.change(within(form).getByLabelText('Title'), { target: { value: 'Write the memo' } })
    fireEvent.change(within(form).getByLabelText('Description'), { target: { value: 'Shorter' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Save' }))

    expect(onUpdateTask).toHaveBeenCalledWith(task, {
      title: 'Write the memo',
      description: 'Shorter',
      priority: 'High',
      tags: ['work', 'writing'],
      due_date: '2026-01-09T00:00:00',
    })

    // the editor yields straight back to the row, which the shared source has
    // already updated optimistically
    expect(screen.queryByRole('form', { name: 'Edit task: Write the report' })).not.toBeInTheDocument()
  })

  test('a cleared description and due date are sent as null so the API removes them', () => {
    const onUpdateTask = vi.fn(async () => {})
    render(
      <TaskRow task={task} onToggleStatus={vi.fn()} onDeleteTask={vi.fn()} onUpdateTask={onUpdateTask} />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Edit Write the report' }))
    const form = screen.getByRole('form', { name: 'Edit task: Write the report' })
    fireEvent.change(within(form).getByLabelText('Description'), { target: { value: '' } })
    fireEvent.change(within(form).getByLabelText('Due date'), { target: { value: '' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Save' }))

    expect(onUpdateTask).toHaveBeenCalledWith(
      task,
      expect.objectContaining({ description: null, due_date: null }),
    )
  })

  test('the editor is keyboard operable and Escape leaves the row untouched', () => {
    const onUpdateTask = vi.fn(async () => {})
    render(
      <TaskRow task={task} onToggleStatus={vi.fn()} onDeleteTask={vi.fn()} onUpdateTask={onUpdateTask} />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Edit Write the report' }))
    const form = screen.getByRole('form', { name: 'Edit task: Write the report' })
    fireEvent.change(within(form).getByLabelText('Title'), { target: { value: 'Abandoned' } })
    fireEvent.keyDown(within(form).getByLabelText('Title'), { key: 'Escape' })

    expect(screen.queryByRole('form', { name: 'Edit task: Write the report' })).not.toBeInTheDocument()
    expect(onUpdateTask).not.toHaveBeenCalled()
    expect(screen.getByText('Write the report')).toBeInTheDocument()
  })

  test('an empty title cannot be saved', () => {
    const onUpdateTask = vi.fn(async () => {})
    render(
      <TaskRow task={task} onToggleStatus={vi.fn()} onDeleteTask={vi.fn()} onUpdateTask={onUpdateTask} />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Edit Write the report' }))
    const form = screen.getByRole('form', { name: 'Edit task: Write the report' })
    fireEvent.change(within(form).getByLabelText('Title'), { target: { value: '   ' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Save' }))

    expect(onUpdateTask).not.toHaveBeenCalled()
  })
})
