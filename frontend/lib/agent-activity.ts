import { useSyncExternalStore } from 'react';
import type { ChatMessage, ToolCall } from '../types';

/**
 * The most recent thing the assistant did, as it actually happened in this
 * browser. There is no chat-history read endpoint on the backend, so this panel
 * is deliberately fed from the *real* client-side conversation the Chatbot holds
 * — never a fabricated entry.
 */
export interface AgentActivity {
  /** One line describing the latest agent turn. */
  summary: string;
  /** ISO timestamp of that turn. */
  at: string;
  /** The tools the turn executed (empty when the turn was conversational). */
  tools: string[];
}

/** The tool names the chatbot exposes, read as the actions they performed. */
export function describeToolCall(tool: string, result: Record<string, unknown>): string {
  const title = typeof result?.title === 'string' ? `"${result.title}"` : 'task';
  switch (tool) {
    case 'add_task': return `Added task ${title}`;
    case 'complete_task': return `Completed task ${title}`;
    case 'delete_task': return `Deleted task ${title}`;
    case 'update_task': return `Updated task ${title}`;
    case 'list_tasks': return `Retrieved task lists`;
    default: return `Executed tool ${tool}`;
  }
}

/**
 * Reads the latest agent action out of a conversation. Pure, so it can be pinned
 * by a test; the Chatbot calls it after every turn and the dashboard renders it.
 */
export function deriveLatestAgentAction(
  messages: ChatMessage[],
  toolLogs: Record<string, ToolCall[]>,
): AgentActivity | null {
  let last: ChatMessage | undefined;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === 'assistant') {
      last = messages[i];
      break;
    }
  }
  if (!last) return null;

  const toolCalls = toolLogs[last.id] ?? [];
  const summary = toolCalls.length > 0
    ? toolCalls.map(call => describeToolCall(call.tool, call.result)).join(' · ')
    : last.content;

  return { summary, at: last.created_at, tools: toolCalls.map(call => call.tool) };
}

/*
 * A tiny external store. The Chatbot (the only writer) publishes after each
 * turn; the dashboard subscribes. Module-level so the two never need to share a
 * provider — the dashboard already renders the Chatbot next to itself.
 */
let snapshot: AgentActivity | null = null;
const listeners = new Set<() => void>();

export function getAgentActivitySnapshot(): AgentActivity | null {
  return snapshot;
}

/** The server has no browser-session chat, so it renders the empty state. */
export function getAgentActivityServerSnapshot(): AgentActivity | null {
  return null;
}

export function subscribeAgentActivity(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function publishAgentActivity(activity: AgentActivity | null): void {
  snapshot = activity;
  listeners.forEach(listener => listener());
}

export function resetAgentActivity(): void {
  publishAgentActivity(null);
}

/** The latest real agent turn for this browser session, or null if there is none. */
export function useAgentActivity(): AgentActivity | null {
  return useSyncExternalStore(subscribeAgentActivity, getAgentActivitySnapshot, getAgentActivityServerSnapshot);
}
