# 🐍 EVO-TODO: Backend Developer Guide (FastAPI)

Welcome to the **EVO-TODO Backend** documentation. This service is a lightweight, high-performance REST API built using **FastAPI**, **SQLAlchemy ORM**, and connected to a serverless **PostgreSQL** database hosted on Neon DB.

---

## 🛠 Tech Stack & Dependencies

*   **FastAPI:** High-performance web framework for building APIs with Python 3.10+.
*   **SQLAlchemy:** Object-Relational Mapper (ORM) for SQL databases.
*   **Pydantic v2:** For fast, type-safe data validation and serialization.
*   **PostgreSQL (Neon DB):** Serverless SQL backend.
*   **Uvicorn:** ASGI web server implementation.
*   **Python-dotenv:** Loads database connections and secret keys from environment configurations.

---

## 📂 Backend File Architecture

The backend code is encapsulated entirely under `src/backend/`:

*   `database.py`: Establishes the database engine connection using SQLAlchemy, configures the `SessionLocal` class, and declares the `get_db()` dependency session generator.
*   `models.py`: Declares both the database tables (SQLAlchemy models) and data transfer objects/validation layers (Pydantic schemas).
*   `main.py`: Configures the API server instance, registers CORS middleware permissions, and implements CRUD endpoint routes.
*   `requirements.txt`: Manages package dependencies.
*   `.env` (Untracked): Private configuration parameters containing connection credentials.

---

## 📊 Database Schema Details

The database table name is `tasks`. Below is the structural schema definition:

| Column Name   | SQL Data Type             | Nullable | Default Value        | Notes / Enum Values                   |
| :------------ | :------------------------ | :------: | :------------------- | :------------------------------------ |
| `id`          | `UUID`                    |  False   | `uuid.uuid4`         | Primary Key (auto-generated)          |
| `title`       | `VARCHAR`                 |  False   | —                    | Task header                           |
| `description` | `TEXT`                    |   True   | `NULL`               | Detailed outline of the task          |
| `status`      | `ENUM(StatusEnum)`        |  False   | `"Pending"`          | `Pending`, `Completed`                |
| `priority`    | `ENUM(PriorityEnum)`      |  False   | `"Medium"`           | `Low`, `Medium`, `High`               |
| `tags`        | `JSON`                    |  False   | `[]` (Empty Array)   | List of custom strings (e.g. `["#work"]`)|
| `created_at`  | `TIMESTAMP`               |  False   | `datetime.utcnow`    | Instant of task creation              |
| `due_date`    | `TIMESTAMP`               |   True   | `NULL`               | Task deadline                         |

---

## 🌐 API Endpoints Reference

The service is fully RESTful and exposes JSON APIs under the `/api` prefix.

### 1. Root Handshake
*   **HTTP Method:** `GET`
*   **Path:** `/`
*   **Response:** `{"message": "Welcome to the Todo API (Phase II)"}`

### 2. Task Resource Operations

| Endpoint | Method | Request Payload | Response Model | Query Parameters | Description |
| :--- | :---: | :--- | :--- | :--- | :--- |
| `/api/tasks` | `GET` | None | `List[TaskResponse]` | `status`, `priority` | Fetch task lists with optional state and priority filtering. |
| `/api/tasks` | `POST` | `TaskCreate` | `TaskResponse` | None | Create a new task in database. |
| `/api/tasks/{task_id}` | `GET` | None | `TaskResponse` | None | Retrieve details of a single task by its UUID. |
| `/api/tasks/{task_id}` | `PUT` | `TaskUpdate` | `TaskResponse` | None | Update select fields of a task dynamically. |
| `/api/tasks/{task_id}` | `DELETE`| None | Empty `204 No Content` | None | Remove a task permanently from the database. |

---

## 🏃‍♂️ Setup & Local Execution

### 1. Environment Configurations
Create a `.env` file under `src/backend/` following `.env.example`:
```env
DATABASE_URL=postgresql://<user>:<password>@<neon_host>/neondb?sslmode=require
```

### 2. Dependency Resolution & Server Start
From the terminal, run the following commands:
```powershell
# Navigate to backend directory
# (assuming you are in the project root)
cd src/backend

# Create virtual environment if needed
python -m venv venv
.\venv\Scripts\Activate.ps1

# Install requirements
pip install -r requirements.txt

# Run server with hot-reload enabled
uvicorn main:app --reload
```

---

## 🤖 Backend Guidelines for AI Coding Assistants (Gemini)

> [!IMPORTANT]
> **Use Pydantic 2.x Best Practices:**
> When handling schemas, use `model_dump(exclude_unset=True)` instead of the old deprecated `.dict()` syntax. This maintains forward compatibility.

> [!TIP]
> **Dependency Injection:**
> Always use `db: Session = Depends(get_db)` to acquire active database sessions for routes. This ensures automatic clean-up and transaction closure.

> [!CAUTION]
> **Database Migrations:**
> Direct table generation via `Base.metadata.create_all(bind=engine)` is currently configured for dev speed. If introducing complex schema updates in Phase III, migrate to Alembic to prevent destructive actions on user database records.
