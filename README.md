# EVO-TODO

A full-stack, AI-powered task management platform built as an evolutionary software engineering project. It progresses from a Python CLI to a production-grade web application with authentication, a chatbot powered by Google Gemini via the Model Context Protocol (MCP), and Docker containerization.

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                     Frontend (Next.js)                     │
│  Next.js 16 App Router · React 19 · TypeScript · Tailwind │
│  Better Auth (email/password + JWT) · Framer Motion       │
└────────────────────────┬─────────────────────────────────┘
                         │  /api/backend/* (rewrite)
                         ▼
┌──────────────────────────────────────────────────────────┐
│                  Backend (FastAPI)                         │
│  SQLAlchemy ORM · JWT verification · OpenAI SDK           │
│  MCP stdio subprocess · Gemini 2.5 Flash                  │
└────────────────────────┬─────────────────────────────────┘
                         │  psycopg2
                         ▼
┌──────────────────────────────────────────────────────────┐
│                    Database (PostgreSQL)                   │
│                      Neon (serverless)                     │
└──────────────────────────────────────────────────────────┘
```

## Features

- **Full CRUD** -- Create, read, update, and delete tasks via REST API
- **Authentication** -- Email/password signup and login with Better Auth and EdDSA JWTs
- **Multi-tenant** -- All API routes enforce per-user data isolation
- **AI Chatbot** -- Natural language task management through Gemini 2.5 Flash, using MCP tool calls to perform actions
- **Warm-light design system** -- A single token layer (`frontend/app/tokens.css`) behind a floating-sidebar shell; warm light is the default and dark mode is retained and switchable (light / dark / system)
- **Dockerized** -- Multi-stage builds for both services, orchestrated with Docker Compose

## Tech Stack

| Layer      | Technology                                                        |
| ---------- | ----------------------------------------------------------------- |
| Frontend   | Next.js 16, React 19, TypeScript, Tailwind CSS v4, Framer Motion |
| Auth       | Better Auth (email/password, EdDSA JWT)                           |
| Backend    | FastAPI, Pydantic, SQLAlchemy                                     |
| AI         | Google Gemini 2.5 Flash (OpenAI-compat endpoint), MCP v1         |
| Database   | PostgreSQL (Neon)                                                 |
| Containers | Docker, Docker Compose                                            |
| CI         | GitHub Actions (Python tests, frontend lint + typecheck)          |

## Project Structure

```
todo-evolution/
├── src/
│   ├── main.py            # Phase I CLI entry point
│   ├── manager.py          # TaskManager logic
│   ├── models.py           # Phase I data models
│   └── backend/
│       ├── main.py         # FastAPI application
│       ├── models.py       # SQLAlchemy + Pydantic models
│       ├── database.py     # Engine & session config
│       ├── mcp_server.py   # MCP tool definitions (stdio)
│       └── requirements.txt
├── frontend/
│   ├── app/                # Next.js App Router pages
│   ├── components/         # React UI components
│   ├── lib/                # Auth helpers, API client
│   ├── types/              # Shared TypeScript types
│   ├── proxy.ts            # Auth redirect middleware
│   ├── Dockerfile
│   └── next.config.ts      # Backend rewrite rules
├── tests/
│   └── test_manager.py
├── docker-compose.yml
├── .github/workflows/ci.yml
├── TODO.md                 # Original roadmap & notes
└── README.md
```

## Design System

The design contract lives in [`design.md`](design.md); the values live in
`frontend/app/tokens.css`. Both are the single source of truth -- pages consume
tokens, never raw colours.

- **Warm canvas.** Light is the default (`#EBE7E2` canvas, `#FFFAF4` card, warm
  tan hairlines) with a single violet accent reserved for the wordmark slice,
  primary CTAs, the completion toggle and focus rings.
- **Dark is retained.** `tokens.css` overrides every colour and elevation token
  under `.dark`; only lightness and chroma move between modes, never hue. The
  shell toggle and the settings Light / Dark / System choice drive the same
  `next-themes` state.
- **Type.** DM Sans only, weights 300-600, across the display, body and mono
  registers.
- **Layout.** A 240 px floating sidebar (a drawer below `lg`), a raised main
  content card and a right status rail on every signed-in page; login, register
  and first-run use a centred focused column.

The contract's rules are enforced by tests in `frontend/app/`:
`tokens.test.ts` (WCAG AA contrast in both modes and no raw colour literals
outside the token layer) and `focus-ring.test.ts` (no control may suppress the
global `:focus-visible` ring). `heading-utility.test.ts` pins the Tailwind v4
`text-[length:var(--...)]` requirement.

## Getting Started

### Prerequisites

- Python 3.10+
- Node.js 20+
- PostgreSQL (or a Neon database)
- A Google Gemini API key

### Environment Variables

Create a `.env` file in the project root (for Docker) or in `src/backend/` and `frontend/` individually:

| Variable              | Description                                    |
| --------------------- | ---------------------------------------------- |
| `DATABASE_URL`        | PostgreSQL connection string                   |
| `BETTER_AUTH_SECRET`  | Secret key for Better Auth session signing     |
| `GEMINI_API_KEY`      | Google Gemini API key for the chatbot          |
| `BETTER_AUTH_URL`     | Base URL for Better Auth (default: localhost)  |

### Docker (recommended)

```bash
docker compose up --build
```

- Frontend: `http://localhost:3000`
- Backend API: `http://localhost:8000`

Compose runs three services: a one-shot `auth-migrate` (Better Auth tables), then `backend` (Alembic + uvicorn), then `frontend`. It works against an empty database.

### Local Development

**Backend:**

```bash
cd src/backend
pip install -r requirements.txt
alembic upgrade head        # creates tasks/conversations/messages (run after the auth migrate below)
uvicorn main:app --reload
```

**Frontend:**

```bash
cd frontend
npm install
npx auth@latest migrate                        # creates user/session/account/verification/jwks
npm run dev
```

> Run the Better Auth migrate **before** `alembic upgrade head` — the app tables have foreign keys to `"user"."id"`.

### Phase I (CLI)

```bash
cd src
python main.py
```

## Testing

```bash
python -m unittest discover -s tests -v
```

CI also runs the frontend checks, in order:

```bash
cd frontend
npm run lint
npx tsc --noEmit
npm test          # vitest
```

`npm run build` is not part of CI; the Docker frontend image runs it.

## Roadmap

- [x] Phase I -- In-memory CLI
- [x] Phase II -- Decoupled full-stack (FastAPI + Next.js + PostgreSQL)
- [x] Phase III -- AI chatbot with MCP and Gemini
- [x] Phase IV -- Docker containerization
- [ ] Phase V -- Kubernetes/Helm deployment, mobile client, global scale

See [TODO.md](TODO.md) for the original roadmap details.

## License

Educational project.
