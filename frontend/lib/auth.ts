import { betterAuth } from "better-auth";
import { jwt } from "better-auth/plugins";
import { Pool } from "pg";

const globalForAuth = globalThis as typeof globalThis & {
  postgresPool?: Pool,
  auth?: ReturnType<typeof buildAuth>,
};

function buildAuth() {
  const pool = globalForAuth.postgresPool = globalForAuth.postgresPool ?? new Pool({
    connectionString: requireEnv("DATABASE_URL"),
  });

  return betterAuth({
    database: pool,
    secret: requireEnv("BETTER_AUTH_SECRET"),
    // Session caching: a short-lived signed cookie holds the session so the
    // server can verify it without hitting the database every time. 5 minutes
    // keeps every dashboard load cheap while keeping revocation/name-change
    // staleness to an accepted small window (Better Auth invalidates the cookie
    // automatically on expiry or revocation).
    session: {
      cookieCache: {
        enabled: true,
        maxAge: 5 * 60,
      },
    },
    emailAndPassword: {
      enabled: true,
    },
    trustedOrigins: [
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      process.env.BETTER_AUTH_URL,
      process.env.NEXT_PUBLIC_APP_URL
    ].filter(Boolean) as string[],
    plugins: [
      jwt(),
    ],
  });
}

/**
 * The whole Better Auth instance is cached, not just its pool: `route.ts` calls
 * `getAuth()` on every auth request, and rebuilding `betterAuth(...)` each time
 * showed up as ~0.8–1s of constant overhead on top of the (already cached-part)
 * get-session — it builds plugin schemas, cookie parsers and the JWKS context
 * from scratch per hit. Caching the instance is also what Better Auth's Next.js
 * docs advise for server handlers. Config is read from env at container start;
 * a config change is a restart anyway.
 */
export function getAuth(): ReturnType<typeof buildAuth> {
  globalForAuth.auth = globalForAuth.auth ?? buildAuth();
  return globalForAuth.auth;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be configured`);
  return value;
}
