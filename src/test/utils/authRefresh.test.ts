/**
 * 401 refresh-and-retry tests for the shared fetch layer.
 *
 * `authenticatedFetch` threw on any non-2xx, so an expired access token surfaced
 * as a failed request even though a valid refresh token was sitting in storage
 * and `tokenManager` knew how to use it. Sessions died mid-request.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type * as AuthUtil from '@/utils/api/auth.util';

const store = new Map<string, string>();

vi.mock('@/utils/api/auth.util', async () => {
  const actual = await vi.importActual<typeof AuthUtil>('@/utils/api/auth.util');
  return {
    ...actual,
    getToken: () => store.get('auth_token') ?? null,
    getRefreshToken: () => store.get('refresh_token') ?? null,
    getTokenPersistence: () => 'persistent',
    setToken: (t: string) => { store.set('auth_token', t); },
    setRefreshToken: (t: string) => { store.set('refresh_token', t); },
    clearAuthTokens: () => { store.delete('auth_token'); store.delete('refresh_token'); }
  };
});

import { authenticatedFetch, ApiError } from '@/utils/api/http.util';
import { getToken } from '@/utils/api/auth.util';

const jsonResponse = (status: number, body: unknown): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json' },
    json: async () => body
  }) as unknown as Response;

const authHeaderOf = (call: unknown[]): string | undefined => {
  const init = call[1] as RequestInit | undefined;
  return (init?.headers as Record<string, string> | undefined)?.Authorization;
};

const urlOf = (call: unknown[]): string => String(call[0]);

beforeEach(() => {
  store.clear();
  store.set('auth_token', 'expired-token');
  store.set('refresh_token', 'good-refresh-token');
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('authenticatedFetch 401 handling', () => {
  it('refreshes and retries once, transparently returning the retried response', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(401, { error: 'Invalid or expired token' }))
      .mockResolvedValueOnce(jsonResponse(200, { success: true, data: { token: 'fresh-token' } }))
      .mockResolvedValueOnce(jsonResponse(200, { success: true, data: [1, 2] }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await authenticatedFetch('/api/invoices');

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true, data: [1, 2] });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('stores the refreshed token and retries with it', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(401, { error: 'expired' }))
      .mockResolvedValueOnce(jsonResponse(200, { success: true, data: { token: 'fresh-token' } }))
      .mockResolvedValueOnce(jsonResponse(200, { success: true }));
    vi.stubGlobal('fetch', fetchMock);

    await authenticatedFetch('/api/invoices');

    expect(getToken()).toBe('fresh-token');
    expect(authHeaderOf(fetchMock.mock.calls[2])).toBe('Bearer fresh-token');
  });

  it('gives up and clears tokens when the refresh itself fails', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(401, { error: 'expired' }))
      .mockResolvedValueOnce(jsonResponse(401, { error: 'refresh rejected' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(authenticatedFetch('/api/invoices')).rejects.toBeInstanceOf(ApiError);
    expect(getToken()).toBeNull();
  });

  it('retries at most once — a second 401 is surfaced', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(401, { error: 'expired' }))
      .mockResolvedValueOnce(jsonResponse(200, { success: true, data: { token: 'fresh-token' } }))
      .mockResolvedValueOnce(jsonResponse(401, { error: 'still unauthorised' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(authenticatedFetch('/api/invoices')).rejects.toBeInstanceOf(ApiError);
    // original + refresh + one retry, then stop
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('does not try to refresh when there is no refresh token', async () => {
    store.delete('refresh_token');
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(401, { error: 'expired' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(authenticatedFetch('/api/invoices')).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not attempt to refresh a failing refresh or login call', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(401, { error: 'nope' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(authenticatedFetch('/api/auth/login', { method: 'POST' })).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('leaves non-401 failures alone', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(500, { error: 'server exploded' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(authenticatedFetch('/api/invoices')).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('shares a single refresh across concurrent 401s', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (String(url).includes('/api/auth/refresh')) {
        return jsonResponse(200, { success: true, data: { token: 'fresh-token' } });
      }
      return authHeaderOf([url, fetchMock.mock.calls.at(-1)?.[1]]) === 'Bearer fresh-token'
        ? jsonResponse(200, { success: true })
        : jsonResponse(401, { error: 'expired' });
    });
    vi.stubGlobal('fetch', fetchMock);

    await Promise.allSettled([
      authenticatedFetch('/api/invoices'),
      authenticatedFetch('/api/clients'),
      authenticatedFetch('/api/expenses')
    ]);

    const refreshCalls = fetchMock.mock.calls.filter(c => urlOf(c).includes('/api/auth/refresh'));
    expect(refreshCalls).toHaveLength(1);
  });
});
