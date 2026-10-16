import { describe, it, expect, vi, beforeEach } from 'vitest';
import { secureFetch, clearTokenCache } from './api';
import { authClient } from './auth-client';

vi.mock('./auth-client', () => ({
  authClient: { token: vi.fn() },
}));

const TOKEN_A = 'aaaa.bbbb.cccc.dddd';
const TOKEN_B = 'eeee.ffff.gggg.hhhh';

/**
 * Performance guard (docs/performance.md). `secureFetch` used to dial
 * `/api/auth/token` — browser → Next.js → Postgres — for every single request.
 * With Neon in us-east-1 each of those dials measured ~2.5s, so every task
 * create/toggle/delete paid it on top of the actual write. These tests pin the
 * memoization: one mint per TTL, one refresh on a 401, and nothing on sign-out.
 */
describe('secureFetch token caching', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    clearTokenCache();
    fetchMock
      .mockReset()
      .mockResolvedValue({ ok: true, status: 200, json: async () => ({}), headers: new Headers() });
    vi.stubGlobal('fetch', fetchMock);
    vi.mocked(authClient.token).mockResolvedValue({ data: { token: TOKEN_A } } as never);
  });

  it('mints the token once and reuses it across requests', async () => {
    await secureFetch('/api/u1/tasks');
    await secureFetch('/api/u1/tasks');
    await secureFetch('/api/u1/tasks', { method: 'DELETE' });

    expect(authClient.token).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    for (const [url, init] of fetchMock.mock.calls) {
      expect(init.headers.get('Authorization')).toBe(`Bearer ${TOKEN_A}`);
      expect(String(url)).toContain('/api/backend');
    }
  });

  it('clears the cache and mints exactly one new token on a 401, retrying once', async () => {
    // The backend provably executed nothing on a 401, so this retry cannot
    // duplicate a mutation (chat turns included) — exactly once is the contract.
    const forbidden = { ok: false, status: 401, json: async () => ({ detail: '' }) };
    const accepted = { ok: true, status: 200, json: async () => ({}) };
    fetchMock.mockResolvedValueOnce(forbidden).mockResolvedValueOnce(accepted);
    vi.mocked(authClient.token)
      .mockResolvedValueOnce({ data: { token: TOKEN_A } } as never)
      .mockResolvedValueOnce({ data: { token: TOKEN_B } } as never);

    const res = await secureFetch('/api/u1/tasks', { method: 'POST', body: '{}' });

    expect(authClient.token).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(res.status).toBe(200);
    // Second attempt carries the fresh token, not the stale one.
    expect(fetchMock.mock.calls[1][1].headers.get('Authorization')).toBe(`Bearer ${TOKEN_B}`);
    // And the fresh token is now the cached one.
    fetchMock.mockClear();
    await secureFetch('/api/u1/tasks');
    expect(fetchMock.mock.calls[0][1].headers.get('Authorization')).toBe(`Bearer ${TOKEN_B}`);
    expect(authClient.token).toHaveBeenCalledTimes(2);
  });

  it('returns the 401 instead of looping when no token can be minted at all', async () => {
    const forbidden = { ok: false, status: 401, json: async () => ({ detail: '' }) };
    fetchMock.mockResolvedValue(forbidden);
    vi.mocked(authClient.token).mockRejectedValue(new Error('session gone') as never);

    const res = await secureFetch('/api/u1/tasks');

    expect(res.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(2); // initial + one retry, no more
    expect(res.ok).toBe(false);
  });

  it('forgets the token when signed out via clearTokenCache', async () => {
    await secureFetch('/api/u1/tasks');
    clearTokenCache();
    await secureFetch('/api/u1/tasks');

    expect(authClient.token).toHaveBeenCalledTimes(2);
  });
});
