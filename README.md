# EVO-TODO: The Evolutionary Task Manager

EVO-TODO is a multi-phase software engineering project designed to demonstrate the evolution of an application from a simple terminal-based script to a sophisticated, production-grade full-stack platform.

## 🚀 The Roadmap (5 Phases)

This project is structured into five distinct architectural phases. Currently, we have completed Phase I and are mid-way through Phase II.

- [x] **Phase I: The In-Memory CLI**
  - Robust Python CLI with in-memory state.
  - Features: Priority levels, tags, recurrence, and overdue tracking.
- [~] **Phase II: Decoupled Full-Stack Architecture** (Current)
  - Transition to a modern Web UI and REST API.
  - **Status:** Backend CRUD & Database integrated; Frontend core UI complete.
  - **Next Steps:** Implement advanced filtering, sorting, and due-date management in the Web UI.
- [ ] **Phase III: User Authentication & Multi-Tenancy** (Planned)
  - Secure login/signup and personalized task lists.
- [ ] **Phase IV: Advanced Analytics & Productivity Insights** (Planned)
  - Visualization of task completion trends and productivity scoring.
- [ ] **Phase V: Global Scale & Mobile Integration** (Planned)
  - Cloud-native deployment and cross-platform mobile support.

---

## 🛠 Tech Stack

### Phase I (CLI)
- **Language:** Python 3.10+
- **Key Modules:** `datetime`, `uuid`, `enum`
- **Architecture:** Clean separation between `TaskManager` logic and CLI presentation.

### Phase II (Web)
- **Frontend:** Next.js 15 (App Router), TypeScript, Tailwind CSS, Framer Motion (Animations).
- **Backend:** FastAPI (Python), SQLAlchemy ORM.
- **Database:** PostgreSQL (Hosted on Neon DB).
- **Icons:** Lucide React.

---

## 🏃‍♂️ Getting Started

### 📟 Phase I: Python CLI
1. Navigate to the `src/` directory.
2. Run the application:
   ```bash
   python main.py
   ```

### 🌐 Phase II: Full-Stack Web App

#### 1. Backend (FastAPI)
1. Navigate to `src/backend/`.
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Set up your `.env` file with your `DATABASE_URL`.
4. Run the server:
   ```bash
   uvicorn main:app --reload
   ```

#### 2. Frontend (Next.js)
1. Navigate to `frontend/`.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the development server:
   ```bash
   npm run dev
   ```
4. Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 📈 Current Progress (Phase II - 50%)
- [x] FastAPI REST Endpoints (CRUD)
- [x] Neon DB PostgreSQL Integration
- [x] Modern Cinematic UI with Next.js
- [x] Real-time Task Creation & Status Toggling
- [ ] Advanced Filtering & Sorting (Frontend)
- [ ] Due Date Picker & Reminders (Frontend)
- [ ] Toast Notifications & Error Boundaries

---

## 📄 License
This project is for educational purposes as part of an evolutionary coding journey.
