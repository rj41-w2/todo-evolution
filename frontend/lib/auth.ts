import { betterAuth } from "better-auth";
import { jwt } from "better-auth/plugins";
import { Pool } from "pg";

const pool = (globalThis as any).postgresPool ?? new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

if (process.env.NODE_ENV !== 'production') {
  (globalThis as any).postgresPool = pool;
}

export const auth = betterAuth({
  database: pool,
  secret: process.env.BETTER_AUTH_SECRET || "fallback_auth_secret_key_12984712",
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
