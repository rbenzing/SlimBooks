/**
 * HTTP transport and pagination-maths tests.
 *
 * `authenticatedFetch` is the single door every API call goes through, so its
 * 401 handling is the most consequential branch in the frontend: replay the
 * request once after a successful refresh, and clear the tokens when the
 * refresh fails so the app doesn't sit there retrying with a dead credential.
 *
 * The pagination maths decides which slice of a list the user sees. Off-by-one
 * errors here hide records without any visible symptom.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { getToken, clearAuthTokens } = vi.hoisted(() => ({
  getToken: vi.fn(() => 'access-token'),
  clearAuthTokens: vi.fn()
}));
const { refreshAccessToken, isAuthEndpoint } = vi.hoisted(() => ({
  refreshAccessToken: vi.fn(),
  isAuthEndpoint: vi.fn(() => false)
}));

vi.mock('@/utils/api/auth.util', () => ({ getToken, clearAuthTokens }));
vi.mock('@/utils/api/refresh.util', () => ({ refreshAccessToken, isAuthEndpoint }));

import {
  authenticatedFetch,
  apiGet,
  apiPost,
  apiPut,
  apiPatch,
  apiDelete,
  handleApiError,
  ApiError
} from '@/utils/api/http.util';
import {
  getPaginationInfo,
  generatePageNumbers,
  getPaginationSettingsAsync,
  savePaginationSettings
} from '@/utils/pagination.util';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

const jsonOk = (body: unknown = { success: true }) => ({
  ok: true,
  status: 200,
  statusText: 'OK',
  headers: { get: () => 'application/json' },
  json: async () => body,
  text: async () => JSON.stringify(body)
}) as unknown as Response;

const failure = (status: number, body: unknown = {}) => ({
  ok: false,
  status,
  statusText: status === 401 ? 'Unauthorized' : 'Error',
  headers: { get: () => 'application/json' },
  json: async () => body,
  text: async () => ''
}) as unknown as Response;

const lastInit = () => (fetchMock.mock.calls.at(-1) as [string, RequestInit])[1];
const headersOf = () => (lastInit().headers ?? {}) as Record<string, string>;

beforeEach(() => {
  vi.clearAllMocks();
  getToken.mockReturnValue('access-token');
  isAuthEndpoint.mockReturnValue(false);
  refreshAccessToken.mockResolvedValue(false);
  fetchMock.mockResolvedValue(jsonOk());
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe('authenticatedFetch', () => {
  it('sends the bearer token', async () => {
    await authenticatedFetch('/api/invoices');

    expect(headersOf()).toMatchObject({ Authorization: 'Bearer access-token' });
  });

  it('omits the header when signed out', async () => {
    getToken.mockReturnValue(null as unknown as string);

    await authenticatedFetch('/api/invoices');

    expect(headersOf()).not.toHaveProperty('Authorization');
  });

  it('resolves a relative path against the app origin', async () => {
    await authenticatedFetch('/api/invoices');

    expect(String(fetchMock.mock.calls[0][0])).toBe(`${window.location.origin}/api/invoices`);
  });

  it('leaves an absolute url alone', async () => {
    await authenticatedFetch('https://other.test/api/x');

    expect(String(fetchMock.mock.calls[0][0])).toBe('https://other.test/api/x');
  });

  it('lets the caller override a header', async () => {
    await authenticatedFetch('/api/x', { headers: { 'Content-Type': 'text/csv' } });

    expect(headersOf()).toMatchObject({ 'Content-Type': 'text/csv' });
  });

  it('replays the request once after a successful refresh', async () => {
    // The point of the refresh: the user never sees the expiry.
    fetchMock.mockResolvedValueOnce(failure(401)).mockResolvedValueOnce(jsonOk());
    refreshAccessToken.mockResolvedValue(true);

    await expect(authenticatedFetch('/api/invoices')).resolves.toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('sends the new token on the replay, not the stale one', async () => {
    fetchMock.mockResolvedValueOnce(failure(401)).mockResolvedValueOnce(jsonOk());
    refreshAccessToken.mockImplementation(async () => {
      getToken.mockReturnValue('fresh-token');
      return true;
    });

    await authenticatedFetch('/api/invoices');

    expect(headersOf()).toMatchObject({ Authorization: 'Bearer fresh-token' });
  });

  it('does not replay more than once', async () => {
    // A second 401 means the refresh did not help; retrying would loop.
    fetchMock.mockResolvedValue(failure(401));
    refreshAccessToken.mockResolvedValue(true);

    await expect(authenticatedFetch('/api/invoices')).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('clears the tokens when the refresh fails', async () => {
    // Leaving a dead token behind makes every later call fail silently.
    fetchMock.mockResolvedValue(failure(401));
    refreshAccessToken.mockResolvedValue(false);

    await expect(authenticatedFetch('/api/invoices')).rejects.toThrow();
    expect(clearAuthTokens).toHaveBeenCalled();
  });

  it('never refreshes on an auth endpoint', async () => {
    // A failing login must not trigger a refresh of its own.
    isAuthEndpoint.mockReturnValue(true);
    fetchMock.mockResolvedValue(failure(401));

    await expect(authenticatedFetch('/api/auth/login')).rejects.toThrow();
    expect(refreshAccessToken).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not refresh on a non-401 failure', async () => {
    fetchMock.mockResolvedValue(failure(500));

    await expect(authenticatedFetch('/api/invoices')).rejects.toThrow();
    expect(refreshAccessToken).not.toHaveBeenCalled();
  });

  it('raises an ApiError carrying the status', async () => {
    fetchMock.mockResolvedValue(failure(404, { message: 'Invoice not found' }));

    await expect(authenticatedFetch('/api/invoices/9')).rejects.toMatchObject({
      name: 'ApiError',
      status: 404,
      message: 'Invoice not found'
    });
  });

  it('prefers the server message, then the error field, then the status', async () => {
    fetchMock.mockResolvedValue(failure(400, { error: 'Amount must be positive' }));
    await expect(authenticatedFetch('/api/x')).rejects.toThrow('Amount must be positive');

    fetchMock.mockResolvedValue({
      ok: false, status: 502, statusText: 'Bad Gateway',
      headers: { get: () => 'text/html' },
      json: async () => { throw new Error('not json'); }
    } as unknown as Response);
    await expect(authenticatedFetch('/api/x')).rejects.toThrow(/HTTP 502/);
  });

  it('reports a dropped connection in plain language', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(authenticatedFetch('/api/x')).rejects.toThrow(/unable to connect/i);
  });

  it('wraps an unexpected throw rather than leaking it', async () => {
    fetchMock.mockRejectedValue(new Error('something odd'));

    await expect(authenticatedFetch('/api/x')).rejects.toMatchObject({
      name: 'ApiError', message: 'something odd'
    });
  });

  it('wraps a non-Error throw', async () => {
    fetchMock.mockRejectedValue('just a string');

    await expect(authenticatedFetch('/api/x')).rejects.toThrow(/unknown error/i);
  });
});

describe('apiRequest verbs', () => {
  it('parses a JSON response', async () => {
    fetchMock.mockResolvedValue(jsonOk({ success: true, data: [1, 2] }));

    await expect(apiGet('/api/invoices')).resolves.toEqual({ success: true, data: [1, 2] });
  });

  it('returns text when the response is not JSON', async () => {
    fetchMock.mockResolvedValue({
      ok: true, status: 200,
      headers: { get: () => 'text/csv' },
      text: async () => 'id,name\n1,Acme'
    } as unknown as Response);

    await expect(apiGet('/api/export')).resolves.toBe('id,name\n1,Acme');
  });

  it('returns text when there is no content type at all', async () => {
    fetchMock.mockResolvedValue({
      ok: true, status: 200,
      headers: { get: () => null },
      text: async () => 'plain'
    } as unknown as Response);

    await expect(apiGet('/api/x')).resolves.toBe('plain');
  });

  it('sends each verb with its body', async () => {
    await apiPost('/api/invoices', { amount: 100 });
    expect(lastInit().method).toBe('POST');
    expect(JSON.parse(lastInit().body as string)).toEqual({ amount: 100 });

    await apiPut('/api/invoices/1', { amount: 200 });
    expect(lastInit().method).toBe('PUT');
    expect(JSON.parse(lastInit().body as string)).toEqual({ amount: 200 });

    await apiPatch('/api/invoices/1', { status: 'paid' });
    expect(lastInit().method).toBe('PATCH');
    expect(JSON.parse(lastInit().body as string)).toEqual({ status: 'paid' });
  });

  it('sends GET and DELETE without a body', async () => {
    await apiGet('/api/invoices');
    expect(lastInit().method).toBe('GET');
    expect(lastInit().body).toBeUndefined();

    await apiDelete('/api/invoices/1');
    expect(lastInit().method).toBe('DELETE');
    expect(lastInit().body).toBeUndefined();
  });
});

describe('handleApiError', () => {
  it('returns the message from an ApiError', () => {
    expect(handleApiError(new ApiError('Invoice not found', 404))).toBe('Invoice not found');
  });

  it('returns the message from any Error', () => {
    expect(handleApiError(new Error('boom'))).toBe('boom');
  });

  it('describes a non-Error throw', () => {
    expect(handleApiError('just a string')).toBe('An unexpected error occurred');
    expect(handleApiError(null)).toBe('An unexpected error occurred');
  });
});

describe('getPaginationInfo', () => {
  it('describes the first page', () => {
    expect(getPaginationInfo(1, 10, 25)).toEqual({
      startIndex: 0, endIndex: 10, totalPages: 3, displayStart: 1, displayEnd: 10
    });
  });

  it('describes a middle page', () => {
    expect(getPaginationInfo(2, 10, 25)).toMatchObject({
      startIndex: 10, displayStart: 11, displayEnd: 20
    });
  });

  it('stops the last page at the real record count', () => {
    // Showing "21-30 of 25" is the visible symptom of getting this wrong.
    expect(getPaginationInfo(3, 10, 25)).toMatchObject({
      displayStart: 21, displayEnd: 25
    });
  });

  it('rounds a partial page up', () => {
    expect(getPaginationInfo(1, 10, 21).totalPages).toBe(3);
    expect(getPaginationInfo(1, 10, 20).totalPages).toBe(2);
  });

  it('reports no pages for an empty list', () => {
    expect(getPaginationInfo(1, 10, 0)).toMatchObject({ totalPages: 0, displayEnd: 0 });
  });

  it('covers every record across all pages', () => {
    const total = 47;
    const perPage = 10;
    const seen = new Set<number>();

    for (let page = 1; page <= Math.ceil(total / perPage); page += 1) {
      const { displayStart, displayEnd } = getPaginationInfo(page, perPage, total);
      for (let i = displayStart; i <= displayEnd; i += 1) seen.add(i);
    }

    expect(seen.size).toBe(total);
  });
});

describe('generatePageNumbers', () => {
  it('lists every page when they all fit', () => {
    expect(generatePageNumbers(1, 3, 5)).toEqual([1, 2, 3]);
  });

  it('returns nothing for an empty list', () => {
    expect(generatePageNumbers(1, 0, 5)).toEqual([]);
  });

  it('never returns more than the configured window', () => {
    for (const page of [1, 5, 25, 50]) {
      expect(generatePageNumbers(page, 50, 5).length).toBeLessThanOrEqual(5);
    }
  });

  it('always includes the current page', () => {
    for (const page of [1, 2, 25, 49, 50]) {
      expect(generatePageNumbers(page, 50, 5)).toContain(page);
    }
  });

  it('centres the window around the current page', () => {
    expect(generatePageNumbers(25, 50, 5)).toEqual([23, 24, 25, 26, 27]);
  });

  it('clamps the window at the start', () => {
    expect(generatePageNumbers(1, 50, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it('clamps the window at the end', () => {
    // Sliding past the last page would render dead links.
    expect(generatePageNumbers(50, 50, 5)).toEqual([46, 47, 48, 49, 50]);
  });

  it('returns a contiguous ascending run', () => {
    const pages = generatePageNumbers(25, 50, 7);

    for (let i = 1; i < pages.length; i += 1) {
      expect(pages[i]).toBe(pages[i - 1] + 1);
    }
  });

  it('never names a page that does not exist', () => {
    for (const page of [1, 10, 20]) {
      for (const value of generatePageNumbers(page, 20, 5)) {
        expect(value).toBeGreaterThanOrEqual(1);
        expect(value).toBeLessThanOrEqual(20);
      }
    }
  });
});

describe('pagination settings', () => {
  const { getSetting, setSetting, isReady } = vi.hoisted(() => ({
    getSetting: vi.fn(),
    setSetting: vi.fn(),
    isReady: vi.fn(() => true)
  }));

  vi.mock('@/services/sqlite.svc', () => ({
    sqliteService: { getSetting, setSetting, isReady }
  }));

  beforeEach(() => {
    isReady.mockReturnValue(true);
    getSetting.mockResolvedValue(null);
    setSetting.mockResolvedValue(undefined);
  });

  it('returns stored settings', async () => {
    getSetting.mockResolvedValue({ defaultItemsPerPage: 50, maxPageNumbers: 7 });

    await expect(getPaginationSettingsAsync())
      .resolves.toMatchObject({ defaultItemsPerPage: 50, maxPageNumbers: 7 });
  });

  it('fills gaps in a partial payload with defaults', async () => {
    // A missing page-size list would leave the size selector empty.
    getSetting.mockResolvedValue({ defaultItemsPerPage: 50 });

    const settings = await getPaginationSettingsAsync();

    expect(settings.defaultItemsPerPage).toBe(50);
    expect(settings.availablePageSizes.length).toBeGreaterThan(0);
    expect(settings.maxPageNumbers).toBeGreaterThan(0);
  });

  it('preserves a stored false rather than treating it as absent', async () => {
    getSetting.mockResolvedValue({ showPageNumbers: false, showItemsPerPageSelector: false });

    const settings = await getPaginationSettingsAsync();

    expect(settings.showPageNumbers).toBe(false);
    expect(settings.showItemsPerPageSelector).toBe(false);
  });

  it('falls back to defaults when nothing is stored', async () => {
    getSetting.mockResolvedValue(null);

    await expect(getPaginationSettingsAsync())
      .resolves.toMatchObject({ defaultItemsPerPage: expect.any(Number) });
  });

  it('falls back to defaults before the database is ready', async () => {
    isReady.mockReturnValue(false);

    await expect(getPaginationSettingsAsync()).resolves.toBeTruthy();
    expect(getSetting).not.toHaveBeenCalled();
  });

  it('falls back rather than throwing when the read fails', async () => {
    getSetting.mockRejectedValue(new Error('database locked'));

    await expect(getPaginationSettingsAsync()).resolves.toBeTruthy();
  });

  it('saves under the general category', async () => {
    const settings = {
      defaultItemsPerPage: 25,
      availablePageSizes: [10, 25],
      maxItemsPerPage: 100,
      showItemsPerPageSelector: true,
      showPageNumbers: true,
      maxPageNumbers: 5
    };

    await savePaginationSettings(settings);

    expect(setSetting).toHaveBeenCalledWith('pagination_settings', settings, 'general');
  });

  it('does not throw when the save fails', async () => {
    setSetting.mockRejectedValue(new Error('read-only database'));

    await expect(savePaginationSettings({} as never)).resolves.toBeUndefined();
  });
});
