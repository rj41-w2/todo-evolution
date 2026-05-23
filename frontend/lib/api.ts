import { authClient } from "./auth-client";
import { API_BASE_URL } from "./config";

/**
 * Custom secure fetch wrapper that automatically fetches the current Better Auth JWT session token
 * and injects it as an Authorization Bearer header into the backend FastAPI request.
 */
export async function secureFetch(path: string, options: RequestInit = {}) {
  // Retrieve the JWT token using the Better Auth JWT client plugin.
  const tokenResult = await authClient.token();
  const token = tokenResult?.data?.token;

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
}
