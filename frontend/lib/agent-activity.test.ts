import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, test } from 'vitest'
import {
  deriveLatestAgentAction,
  describeToolCall,
  publishAgentActivity,
  resetAgentActivity,
  useAgentActivity,
} from './agent-activity'
import type { ChatMessage, ToolCall } from '../types'

function message(id: string, role: ChatMessage['role'], content: string, createdAt: string): ChatMessage {
  return { id, role, content, created_at: createdAt }
}

function toolCall(tool: string, result: Record<string, unknown>): ToolCall {
  return { tool, parameters: {}, result }
}

describe('describeToolCall — the tool names read as the actions they performed', () => {
  test('each modelled tool has a plain-language label', () => {
    expect(describeToolCall('add_task', { title: 'Write report' })).toBe('Added task "Write report"')
    expect(describeToolCall('complete_task', { title: 'Write report' })).toBe('Completed task "Write report"')
    expect(describeToolCall('delete_task', { title: 'Write report' })).toBe('Deleted task "Write report"')
    expect(describeToolCall('update_task', { title: 'Write report' })).toBe('Updated task "Write report"')
    expect(describeToolCall('list_tasks', {})).toBe('Retrieved task lists')
  })

  test('an unknown tool still names itself rather than going blank', () => {
    expect(describeToolCall('frobnicate', {})).toBe('Executed tool frobnicate')
  })
})

describe('deriveLatestAgentAction — what the panel shows comes from real turns', () => {
  test('no turns at all leaves nothing to show', () => {
    expect(deriveLatestAgentAction([], {})).toBeNull()
  })

  test('a session with only the visitor speaking has no agent action yet', () => {
    const messages = [message('u1', 'user', 'hello', '2026-10-14T09:00:00.000Z')]
    expect(deriveLatestAgentAction(messages, {})).toBeNull()
  })

  test('the latest assistant turn with tools reports the tools it ran', () => {
    const assistant = message('a1', 'assistant', 'Done!', '2026-10-14T09:01:00.000Z')
    const logs = { a1: [toolCall('add_task', { title: 'Write report' })] }

    expect(deriveLatestAgentAction([message('u1', 'user', 'add a task', '2026-10-14T09:00:30.000Z'), assistant], logs)).toEqual({
      summary: 'Added task "Write report"',
      at: '2026-10-14T09:01:00.000Z',
      tools: ['add_task'],
    })
  })

  test('a conversational turn with no tools reports the reply itself', () => {
    const assistant = message('a1', 'assistant', 'You have 3 tasks open.', '2026-10-14T09:02:00.000Z')
    expect(deriveLatestAgentAction([assistant], {})).toEqual({
      summary: 'You have 3 tasks open.',
      at: '2026-10-14T09:02:00.000Z',
      tools: [],
    })
  })

  test('several tools in one turn are all named', () => {
    const assistant = message('a1', 'assistant', 'Done', '2026-10-14T09:03:00.000Z')
    const logs = { a1: [toolCall('add_task', { title: 'A' }), toolCall('complete_task', { title: 'B' })] }
    expect(deriveLatestAgentAction([assistant], logs)?.summary).toBe('Added task "A" · Completed task "B"')
  })

  test('it tracks the most recent agent turn, not the most recent message', () => {
    const assistant = message('a1', 'assistant', 'Earlier reply', '2026-10-14T09:00:00.000Z')
    const messages = [assistant, message('u2', 'user', 'and another thing', '2026-10-14T09:04:00.000Z')]
    expect(deriveLatestAgentAction(messages, {})?.summary).toBe('Earlier reply')
  })
})

describe('the shared agent-activity source', () => {
  beforeEach(() => resetAgentActivity())

  test('starts empty and every subscriber sees a published action', () => {
    const { result } = renderHook(() => useAgentActivity())
    expect(result.current).toBeNull()

    const action = { summary: 'Added task "X"', at: '2026-10-14T09:05:00.000Z', tools: ['add_task'] }
    act(() => publishAgentActivity(action))
    expect(result.current).toEqual(action)
  })

  test('resetting clears the panel again', () => {
    const { result } = renderHook(() => useAgentActivity())
    act(() => publishAgentActivity({ summary: 'x', at: '2026-10-14T09:05:00.000Z', tools: [] }))
    act(() => resetAgentActivity())
    expect(result.current).toBeNull()
  })
})
