import { authClient } from "./auth-client";
import { API_BASE_URL } from "./config";

/**
 * The backend verifies a Better Auth EdDSA JWT on every protected request. The
 * browser used to fetch a fresh token over the network for *every* call
 * (browser → Next.js → Postgres), which alone measured ~2.5s per request with
 * a warm database — on top of every single task create/update/delete and each
 * initial list read (docs/performance.md).
 *
 * The JWT's own expiry is 15 minutes (Better Auth jwt plugin default), so the
 * cache here is a conservative 10 minutes, and a 401 anywhere clears it and
 * tries once more before giving up. A 401 means the request never executed on
 * the backend, so that refresh retry cannot duplicate an applied action.
 */
const TOKEN_TTL_MS = 10 * 60 * 1000;
let cachedToken: { token: string; expiresAt: number } | null = null;

/** Drop the memoized JWT. Used on sign-out so a stale token cannot outlive the session. */
export function clearTokenCache(): void {
  cachedToken = null;
}

async function getToken(): Promise<string | undefined> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.token;
  }
  cachedToken = null;
  const tokenResult = await authClient.token();
  const token = tokenResult?.data?.token;
  if (token) {
    cachedToken = { token, expiresAt: Date.now() + TOKEN_TTL_MS };
  }
  return token;
}

/**
 * Custom secure fetch wrapper that automatically injects the current Better Auth
 * JWT session token as an Authorization Bearer header into the backend FastAPI
 * request. Memoizes the token between calls and refreshes it once on a 401.
 */
export async function secureFetch(path: string, options: RequestInit = {}) {
  const send = async (token: string | undefined) => {
    const headers = new Headers(options.headers || {});

    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }

    // Automatically default Content-Type to JSON if sending a payload
    if (options.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    return fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
    });
  };

  let response = await send(await getToken().catch(() => undefined));

  if (response.status === 401) {
    // The token may have been rotated or expired server-side. `authClient.token()`
    // mints from the live session, so a blind cache-refresh covers rotation.
    // Retry exactly once: the first request provably did nothing. If even the
    // fresh mint fails, the 401 Response is returned as-is rather than thrown —
    // every caller already turns responses into a user-visible failure.
    clearTokenCache();
    response = await send(await getToken().catch(() => undefined));
  }

  return response;
}
