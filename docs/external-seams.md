# External Seams — Sync Contracts

This document defines formal contracts for database tables **owned by external systems** but referenced by the backend via foreign keys. Any change to these tables requires cross-team coordination.

---

## 1. `user` Table (Better Auth)

**Owner:** Frontend (Better Auth CLI)  
**Backend Role:** Read-only reference via FK (`tasks.user_id`, `conversations.user_id`, `messages.user_id`)  
**Migration Responsibility:** `npx auth@latest migrate` in `frontend/` — **never** managed by backend Alembic

### Schema Assumptions (Backend Contract)

| Column | Type | Backend Assumption |
|--------|------|-------------------|
| `id` | `String` (UUID v4) | Primary key; non-null; stable for row lifetime |
| `email` | `String` | Not directly used by backend; present for auth |
| `emailVerified` | `Boolean` | Not used by backend |
| `createdAt` | `DateTime` | Not used by backend |
| `updatedAt` | `DateTime` | Not used by backend |

**Minimal stub in backend metadata** (`src/backend/repositories/user_stub.py`):
```python
Table("user", Base.metadata, Column("id", String, primary_key=True))
```
Only `id` is declared — sufficient for FK resolution. Do not add columns.

### Foreign Key Behavior

```sql
-- All three backend tables declare:
FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE
```

- `ON DELETE CASCADE`: When a user is deleted in Better Auth, all their tasks, conversations, and messages are automatically deleted.
- **No orphan cleanup needed** — cascade handles it at DB level.
- **No soft-delete** — Better Auth hard-deletes users; backend rows cascade.

### Startup Assumptions

1. **`user` table exists** before backend starts — enforced by `docker-compose.yml` ordering (`auth-migrate` before `backend`).
2. **`user.id` is a non-empty string** — backend inserts `user_id` as-is; no validation beyond FK.
3. **No concurrent schema changes** — Better Auth migrations run independently; backend assumes column stability.

### Change Notification Protocol

| Change Type | Action Required |
|-------------|-----------------|
| Add column to `user` | **No backend impact** — stub ignores unknown columns |
| Rename/remove `id` | **BREAKING** — coordinate with backend team; update stub + all FKs |
| Change `id` type | **BREAKING** — backend `user_id` columns are `String`; type mismatch = insert failure |
| Add FK from `user` to backend tables | **Not allowed** — backend owns its tables; Better Auth must not reference them |

**Communication channel:** GitHub issue tagged `external-seam` + Slack `#backend-frontend-sync`.

### Verification

- **Alembic `include_object()`** excludes `user` from autogenerate (see `migrations/env.py`).
- **Startup check** (optional): `src/backend/startup_checks.py` — verifies `user.id` column exists and is queryable.
- **Integration test**: `tests/test_external_seams.py` — asserts FK resolution works against real DB.

---

## Adding New External Seams

If backend ever references another external table:

1. Create a stub in `repositories/{table}_stub.py` with docs.
2. Add to `migrations/env.py` `BETTER_AUTH_TABLES` (or new exclusion set).
3. Add entry here with same sections: Owner, Schema Assumptions, FK Behavior, Change Protocol.
4. Add startup check + integration test.

---

**Last Updated:** 2026-10-14  
**Owner:** Backend Team  
**Review Cadence:** Per major Better Auth version upgrade