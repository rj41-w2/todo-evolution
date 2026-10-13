import { describe, expect, test, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import TaskList from './TaskList'
import type { Task } from '../types'

const openTask: Task = {
  id: 'task-open',
  title: 'Write the report',
  description: null,
  status: 'Pending',
  priority: 'High',
  tags: ['work'],
  created_at: '2026-01-01T00:00:00.000Z',
  due_date: null,
}

const doneTask: Task = {
  id: 'task-done',
  title: 'Send the invoice',
  description: 'Already sent',
  status: 'Completed',
  priority: 'Low',
  tags: [],
  created_at: '2026-01-02T00:00:00.000Z',
  due_date: null,
}

function renderList(tasks: Task[]) {
  return render(
    <TaskList
      tasks={tasks}
      hasAnyTasks={tasks.length > 0}
      onToggleStatus={vi.fn()}
      onDeleteTask={vi.fn()}
    />
  )
}

describe('TaskList', () => {
  test('splits tasks into Open and Done groups with counts', () => {
    renderList([openTask, doneTask])

    const openGroup = screen.getByRole('heading', { name: 'Open' }).closest('section')!
    const doneGroup = screen.getByRole('heading', { name: 'Done' }).closest('section')!

    expect(within(openGroup).getByText('Write the report')).toBeInTheDocument()
    expect(within(openGroup).queryByText('Send the invoice')).not.toBeInTheDocument()
    expect(within(openGroup).getByText('1')).toBeInTheDocument()

    expect(within(doneGroup).getByText('Send the invoice')).toBeInTheDocument()
    expect(within(doneGroup).queryByText('Write the report')).not.toBeInTheDocument()
  })

  test('shows the empty state when there are no tasks at all', () => {
    renderList([])

    expect(screen.getByText('No tasks yet.')).toBeInTheDocument()
  })

  test('reports the clicked task when its status control is used', () => {
    const onToggleStatus = vi.fn()
    render(
      <TaskList
        tasks={[openTask, doneTask]}
        hasAnyTasks
        onToggleStatus={onToggleStatus}
        onDeleteTask={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Mark as complete' }))

    expect(onToggleStatus).toHaveBeenCalledWith(openTask)
  })
})
