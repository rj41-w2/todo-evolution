import { betterAuth } from "better-auth";
import { jwt } from "better-auth/plugins";
import { Pool } from "pg";

const globalForAuth = globalThis as typeof globalThis & { postgresPool?: Pool };
export function getAuth() {
  const pool = globalForAuth.postgresPool ?? new Pool({
    connectionString: requireEnv("DATABASE_URL"),
  });

  if (process.env.NODE_ENV !== 'production') {
    globalForAuth.postgresPool = pool;
  }

  return betterAuth({
    database: pool,
    secret: requireEnv("BETTER_AUTH_SECRET"),
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

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be configured`);
  return value;
}
