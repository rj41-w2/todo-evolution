export type Priority = "Low" | "Medium" | "High";
export type Status = "Pending" | "Completed";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: Status;
  priority: Priority;
  tags: string[];
  created_at: string;
  due_date: string | null;
}

export interface TaskCreate {
  title: string;
  description?: string;
  status?: Status;
  priority?: Priority;
  tags?: string[];
  due_date?: string;
}

export interface TaskUpdate {
  title?: string;
  // `null` clears the field: the API's `TaskUpdate` is `Optional[...] = None`
  // and only updates keys that were sent (`exclude_unset`).
  description?: string | null;
  status?: Status;
  priority?: Priority;
  tags?: string[];
  due_date?: string | null;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
  /**
   * What the turn actually did, from issue #4. Absent on messages loaded from
   * the server — the history endpoint does not store it — and absent on turns
   * that fully succeeded. Renderers must treat `undefined` as "nothing to
   * report", not as a failure.
   */
  outcome?: 'completed' | 'partial' | 'failed';
  /** Tools that did not run, when the turn was partial. */
  failedTools?: string[];
}

export interface ToolCall {
  tool: string;
  parameters: Record<string, unknown>;
  result: Record<string, unknown>;
  /** Present since issue #4. Optional so older responses still type-check. */
  ok?: boolean;
}

/** One row in the conversation switcher (issue #13). */
export interface ConversationSummary {
  id: string;
  /** The thread's last message — what a user recognises a chat by. */
  preview: string | null;
  message_count: number;
  created_at: string;
  last_activity_at: string | null;
}

export interface ChatResponse {
  conversation_id: string;
  response: string;
  tool_calls: ToolCall[];
  /** What actually happened to the user's data. See docs/chat-failure-modes.md. */
  outcome?: 'completed' | 'partial' | 'failed';
}

export interface ConversationMessagesResponse {
  conversation_id: string;
  messages: ChatMessage[];
}
