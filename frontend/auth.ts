/**
 * Config file for the Better Auth CLI.
 *
 * The app itself calls `getAuth()` from `lib/auth.ts` so the Postgres pool is
 * created lazily per request. The CLI instead imports a module and needs an
 * instance exported as `auth`, so this file provides exactly that.
 *
 *   npx auth@latest migrate
 *
 * The file name must stay `auth.ts` so the CLI auto-discovers it.
 *
 * Requires DATABASE_URL and BETTER_AUTH_SECRET (see .env.local).
 */
import { getAuth } from "./lib/auth";

export const auth = getAuth();
