import { betterAuth } from "better-auth";
import { jwt } from "better-auth/plugins";
import { Pool } from "pg";

export const auth = betterAuth({
  database: new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false, // Required for secure serverless connections like Neon DB
    },
  }),
  secret: process.env.BETTER_AUTH_SECRET || "fallback_auth_secret_key_12984712",
  emailAndPassword: {
    enabled: true,
  },
  plugins: [
    jwt(),
  ],
});
