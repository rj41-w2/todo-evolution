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
  description?: string;
  status?: Status;
  priority?: Priority;
  tags?: string[];
  due_date?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export interface ToolCall {
  tool: string;
  parameters: Record<string, unknown>;
  result: Record<string, unknown>;
}

export interface ChatResponse {
  conversation_id: string;
  response: string;
  tool_calls: ToolCall[];
}
