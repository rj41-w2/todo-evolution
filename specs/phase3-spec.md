# System Specification: AI-Powered Todo Chatbot (Phase III)

This specification defines the functional, structural, and behavioral requirements for implementing the conversational AI Chatbot interface in the decoupled full-stack Todo App.

---

## 1. Architectural Overview

The AI Chatbot operates on a stateless request-response model utilizing the **OpenAI Agents SDK** for conversational execution and the **Official MCP SDK** to interface the agent with database tools.

```mermaid
graph TD
    User([User's Browser]) -->|1. Chat Message + JWT| API[FastAPI /api/{user_id}/chat]
    API -->|2. Verify Token & User ID| Auth[JWT Verification]
    API -->|3. Fetch History| DB[(Neon PostgreSQL)]
    API -->|4. Initialize Loop| SDK[OpenAI Agents SDK]
    SDK -->|5. Tool Invocation| MCP[MCP Server Tools]
    MCP -->|6. SQL Operations| DB
    SDK -->|7. Return Response| API
    API -->|8. Save Messages| DB
    API -->|9. JSON Response| User
```

---

## 2. Relational Database Schema (Neon DB)

The database schema is expanded to support conversations and messages for persistent, stateless chat histories.

### 2.1 `conversations` Table
- `id`: UUID (Primary Key, default: `uuid_generate_v4()`)
- `user_id`: String (Indexed, Foreign Key -> `users.id` cascade delete)
- `created_at`: Timestamp (default: current time)
- `updated_at`: Timestamp (default: current time)

### 2.2 `messages` Table
- `id`: UUID (Primary Key, default: `uuid_generate_v4()`)
- `user_id`: String (Indexed)
- `conversation_id`: UUID (Indexed, Foreign Key -> `conversations.id` cascade delete)
- `role`: String/Enum (`user`, `assistant`)
- `content`: Text (Message text body)
- `created_at`: Timestamp (default: current time)

---

## 3. Stateless Conversation Flow (Cycle)

The `/api/{user_id}/chat` endpoint must be **100% stateless** and follow this execution lifecycle on every request:

1. **Authorize Request:** Decode the verified JWT token and check that the decoded `user_id` matches the path parameter `{user_id}`.
2. **Fetch History:** Retrieve past messages for the given `conversation_id` from the `messages` table, ordered chronologically. If `conversation_id` is not provided, create a new record in the `conversations` table.
3. **Save User Message:** Insert the new user's chat message into the `messages` table.
4. **Compile Agent Context:** Construct the message array (past history + current message) for the OpenAI Agent.
5. **Run Agent Loop:** Execute the OpenAI Agents SDK runner. The runner interacts with the MCP Server to call the appropriate tools.
6. **Save Assistant Response:** Insert the completed response from the agent into the `messages` table under the `assistant` role.
7. **JSON Response:** Return the assistant text response, active `conversation_id`, and list of executed tool calls back to the client.

---

## 4. REST API Endpoint

| Method | Endpoint | Authorization | Description |
| :--- | :--- | :--- | :--- |
| **POST** | `/api/{user_id}/chat` | Bearer `<token>` | Process a user message and return the AI response. |

### 4.1 Request Payload (JSON)
```json
{
  "conversation_id": "optional-uuid-string",
  "message": "Add a task to call Zia Khan tonight"
}
```

### 4.2 Response Payload (JSON)
```json
{
  "conversation_id": "conversation-uuid-string",
  "response": "I've added the task 'Call Zia Khan' with a medium priority to your todo list!",
  "tool_calls": [
    {
      "tool": "add_task",
      "parameters": {
        "title": "Call Zia Khan",
        "description": "Scheduled for tonight"
      },
      "result": {
        "task_id": "task-uuid-string",
        "status": "created"
      }
    }
  ]
}
```

---

## 5. MCP Server Tools Specification

The MCP server must expose the following stateless task operations as standard tools:

### 5.1 `add_task`
- **Purpose:** Create a new todo task.
- **Parameters:**
  - `user_id` (String, required)
  - `title` (String, required)
  - `description` (String, optional)
  - `priority` (String, optional: `"Low"`, `"Medium"`, `"High"`)
  - `tags` (Array of strings, optional)
- **Returns:** JSON object containing `task_id`, `status` (`"created"`), and `title`.

### 5.2 `list_tasks`
- **Purpose:** Fetch tasks with filters.
- **Parameters:**
  - `user_id` (String, required)
  - `status` (String, optional: `"all"`, `"pending"`, `"completed"`)
  - `priority` (String, optional: `"Low"`, `"Medium"`, `"High"`)
- **Returns:** Array of JSON task objects.

### 5.3 `complete_task`
- **Purpose:** Mark a task as completed.
- **Parameters:**
  - `user_id` (String, required)
  - `task_id` (String/UUID, required)
- **Returns:** JSON object containing `task_id`, `status` (`"completed"`), and `title`.

### 5.4 `delete_task`
- **Purpose:** Delete an existing task.
- **Parameters:**
  - `user_id` (String, required)
  - `task_id` (String/UUID, required)
- **Returns:** JSON object containing `task_id`, `status` (`"deleted"`), and `title`.

### 5.5 `update_task`
- **Purpose:** Update task title, description, or priority.
- **Parameters:**
  - `user_id` (String, required)
  - `task_id` (String/UUID, required)
  - `title` (String, optional)
  - `description` (String, optional)
  - `priority` (String, optional)
- **Returns:** JSON object containing `task_id`, `status` (`"updated"`), and `title`.

---

## 6. Conversational AI Agent Instructions

The OpenAI Agent must follow these behavioral instructions:
- **Tool Mapping:**
  - When user says "Add X", "Remember to Y", "Set Y", call `add_task`.
  - When user says "Show tasks", "What's left?", "What did I do?", call `list_tasks` with appropriate status parameters.
  - When user says "I did X", "Done with Y", "Mark Y complete", call `complete_task`.
  - When user says "Delete X", "Remove task Y", call `delete_task`.
  - When user says "Change X", "Update Y", "Rename Y", call `update_task`.
- **Friendly Confirms:** Always summarize the operations executed in a polite, helpful manner.
- **Error Handling:** If a task is not found or tools return errors, translate them into a clear explanation (e.g., "I couldn't find a task with that ID. Could you please double check?").
- **Language:** Maintain professional tone. If the user writes in Urdu (Latin script or native script), respond in a friendly hybrid of Urdu/English (Hinglish/Urdu-English).
