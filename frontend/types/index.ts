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

/**
 * The task list route's response (issue #7).
 *
 * It was a bare array, which cannot express "there is more" — so a client
 * either fetched everything or stopped at an arbitrary point. The backend now
 * orders and bounds the read; `next_cursor` is how a client continues.
 */
export interface TaskListResponse {
  tasks: Task[];
  /** Opaque. Pass it back verbatim as `?cursor=`. null on the last page. */
  next_cursor: string | null;
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

/** Standalone personal goals (issue #17). Not connected to tasks. */
export type GoalStatus = "Draft" | "Active" | "Paused" | "Completed";

export interface Goal {
  id: string;
  title: string;
  description: string | null;
  /** A calendar date (`YYYY-MM-DD`), never a timestamp. */
  target_date: string | null;
  status: GoalStatus;
  created_at: string;
}

export interface GoalCreate {
  title: string;
  description?: string | null;
  target_date?: string | null;
  status?: GoalStatus;
}

export interface GoalUpdate {
  title?: string;
  // `null` clears the field — the backend only touches the keys it receives.
  description?: string | null;
  target_date?: string | null;
  status?: GoalStatus;
}

/** The goal list route's response, paged exactly like tasks. */
export interface GoalListResponse {
  goals: Goal[];
  /** Opaque. Pass it back verbatim as `?cursor=`. null on the last page. */
  next_cursor: string | null;
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
