# 🤝 Contributing to EVO-TODO

Thank you for your interest in contributing to **EVO-TODO**! As a multi-phase software engineering showcase, keeping the codebase clean, organized, and decoupled is highly essential.

This guide outlines our standard collaboration workflows, branch conventions, and coding standards.

---

## 🛠 Project Environment Setup

Before starting work, please review the instructions inside:
*   [GEMINI.md (Root)](./GEMINI.md) - Project architecture and roadmap overview.
*   [src/backend/GEMINI.md](./src/backend/GEMINI.md) - FastAPI & database setup.
*   [frontend/GEMINI.md](./frontend/GEMINI.md) - Next.js & Styling guidelines.

Ensure you copy the environment files and configure them before running:
*   `src/backend/.env.example` -> `src/backend/.env`
*   `frontend/.env.example` -> `frontend/.env.local`

---

## 🌿 Git Workflow & Branch Naming Conventions

We utilize a structured git workflow. Please construct branches using these naming rules:

*   `feature/` : For adding new features or capabilities (e.g. `feature/due-date-picker`).
*   `bugfix/`  : For fixing issues or errors (e.g. `bugfix/api-cors-error`).
*   `refactor/`: For restructuring existing code without modifying functional behavior (e.g. `refactor/api-endpoints`).
*   `docs/`    : For documentation updates (e.g. `docs/update-contributing`).

### Collaboration Steps
1.  **Fork the Repository:** Fork this repository to your own GitHub account.
2.  **Clone your Fork:** Clone the repository locally.
    ```bash
    git clone https://github.com/YOUR_USERNAME/todo-evolution.git
    cd todo-evolution
    ```
3.  **Create your Branch:** Create a branch off `main` for your changes.
    ```bash
    git checkout -b feature/your-feature-name
    ```
4.  **Make local commits:** Write clear, concise, and descriptive commit messages (e.g., `feat(frontend): Integrate dynamic API URL from environment config`).
5.  **Perform Lint Checks:**
    *   Backend: Ensure code follows PEP 8 styling.
    *   Frontend: Run `npm run lint` under `frontend/` before pushing.
6.  **Push to GitHub:** Push your changes to your fork.
    ```bash
    git push origin feature/your-feature-name
    ```
7.  **Submit a Pull Request (PR):** Open a PR from your branch on your fork to the upstream `main` branch of this repository. Provide a summary of changes, screenshot demonstrations (for UI edits), and manual/automated testing results.

---

## 📜 Coding Guidelines & Principles

To maintain separation of concerns and evolutionary progression:

1.  **Do not break CLI (Phase I):**
    *   Phase I code (`src/main.py`, `src/manager.py`, `src/models.py`) must continue to function perfectly as an in-memory CLI app.
    *   Keep Phase II FastAPI backend additions strictly isolated under `src/backend/`.
2.  **API Client & Env Configurations:**
    *   Never hardcode local hostnames or port configurations inside frontend components.
    *   Always utilize `API_BASE_URL` imported from `frontend/lib/config.ts` so endpoints dynamically load base configurations from `.env.local` parameters.
3.  **Database Security:**
    *   Never check in real database credentials or `.env` files.
    *   Keep schemas and types in exact synchronicity (`src/backend/models.py` schema adjustments should immediately be updated inside `frontend/types/index.ts`).

---

We look forward to reviewing your contributions! Happy Coding! 🚀
