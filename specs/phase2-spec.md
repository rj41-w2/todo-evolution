# System Specification: Decoupled Full-Stack Todo App (Phase II)

## 1. System Architecture
Transition the Phase I In-Memory CLI app to a modern, decoupled web architecture.
- **Frontend Layer:** Next.js (React) using the App Router.
- **Backend API Layer:** Python FastAPI.
- **Database Layer:** Neon DB (Serverless PostgreSQL).
- **Communication:** RESTful JSON APIs.

## 2. Backend Specifications (FastAPI)
- **Language/Framework:** Python 3.10+ with FastAPI.
- **ORM:** Use `SQLAlchemy` (or `SQLModel`) to interact with PostgreSQL.
- **Database Connection:** Use a `.env` file to store the `DATABASE_URL` (Neon DB connection string). Do NOT hardcode credentials.
- **API Endpoints (CRUD):**
  - `GET /api/tasks` : Retrieve all tasks (with optional query params for filtering/sorting).
  - `POST /api/tasks` : Create a new task.
  - `PUT /api/tasks/{task_id}` : Update an existing task (title, desc, status, priority, etc.).
  - `DELETE /api/tasks/{task_id}` : Delete a task.
- **CORS:** Configure CORS middleware in FastAPI to allow requests from the Next.js frontend (e.g., `http://localhost:3000`).

## 3. Database Schema (Neon DB)
Map the Phase 1 DataClass to a relational table named `tasks`:
- `id`: UUID (Primary Key)
- `title`: String (Required)
- `description`: Text (Optional)
- `status`: Boolean or Enum (`Pending`, `Completed`)
- `priority`: String (`Low`, `Medium`, `High`)
- `tags`: Array of Strings (or JSONB)
- `created_at`: Timestamp
- `due_date`: Timestamp (Optional)

## 4. Frontend Specifications (Next.js)
- **Framework:** Next.js with TypeScript and Tailwind CSS for styling.
- **UI Components:**
  - **Task Form:** Input fields for title, description, priority, and tags.
  - **Task List:** A grid or list view displaying all tasks.
  - **Task Item:** Individual card showing task details, a checkbox to mark complete, and a delete button.
- **State Management:** Use standard React Hooks (`useState`, `useEffect`) to fetch data from the FastAPI backend and update the UI interactively.
- **Error Handling:** Display Toast notifications or inline error messages if the API request fails.