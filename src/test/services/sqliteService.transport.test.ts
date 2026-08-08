/**
 * sqliteService transport-layer tests.
 *
 * sqliteService.test.ts pins which field of each JSON envelope the service
 * reads. This file covers the layer underneath: connection start-up, request
 * construction, error translation, the settings cache, and file import/export.
 *
 * The failures worth catching are silent ones — an API error reported as an
 * empty list, a stale cached setting served after a save, or a token missing
 * from a request that then 401s for no visible reason.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { fetchMock, getToken } = vi.hoisted(() => {
  const fetchMock = vi.fn();
  fetchMock.mockResolvedValue({
    ok: true, status: 200, statusText: 'OK', json: async () => ({ success: true })
  });
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
  return { fetchMock, getToken: vi.fn(() => 'test-token') };
});

vi.mock('@/utils/api', () => ({ getToken, API_BASE: '/api' }));
vi.mock('@/utils/api/auth.util', () => ({ getToken }));

import { sqliteService } from '@/services/sqlite.svc';

const jsonResponse = (body: unknown, ok = true, status = 200, statusText = 'OK') =>
  ({ ok, status, statusText, json: async () => body }) as unknown as Response;

const lastCall = () => fetchMock.mock.calls.at(-1) as [string, RequestInit];
const lastUrl = () => String(lastCall()[0]);
const lastInit = () => lastCall()[1];
const headersOf = () => (lastInit().headers ?? {}) as Record<string, string>;

beforeEach(() => {
  fetchMock.mockReset();
  getToken.mockReturnValue('test-token');
  fetchMock.mockResolvedValue(jsonResponse({ success: true }));
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe('request construction', () => {
  it('sends the bearer token on every call', async () => {
    // A dropped token turns into an unexplained 401 at the screen.
    await sqliteService.getClients();

    expect(headersOf()).toMatchObject({ Authorization: 'Bearer test-token' });
  });

  it('omits the header entirely when there is no token', async () => {
    getToken.mockReturnValue(null as unknown as string);

    await sqliteService.getClients();

    expect(headersOf()).not.toHaveProperty('Authorization');
  });

  it('declares a JSON content type', async () => {
    await sqliteService.getClients();

    expect(headersOf()).toMatchObject({ 'Content-Type': 'application/json' });
  });

  it('turns GET parameters into a query string rather than a body', async () => {
    await sqliteService.getExpenses('2026-01-01', '2026-12-31');

    expect(lastUrl()).toMatch(/\/expenses\?date_from=2026-01-01&date_to=2026-12-31$/);
    expect(lastInit().body).toBeUndefined();
  });

  it('adds no query string when a range is not supplied', async () => {
    await sqliteService.getExpenses();

    expect(lastUrl()).toMatch(/\/expenses$/);
  });

  it('sends a write payload as a JSON body', async () => {
    await sqliteService.setSetting('theme', 'dark', 'general');

    expect(lastInit().method).toBe('POST');
    expect(JSON.parse(lastInit().body as string))
      .toEqual({ key: 'theme', value: 'dark', category: 'general' });
  });

  it('defaults a saved setting to the general category', async () => {
    await sqliteService.setSetting('theme', 'dark');

    expect(JSON.parse(lastInit().body as string)).toMatchObject({ category: 'general' });
  });
});

describe('error translation', () => {
  it('raises on an HTTP error instead of returning an empty list', async () => {
    // Returning [] here would render an empty screen as if the user had no data.
    fetchMock.mockResolvedValue(jsonResponse({}, false, 500, 'Internal Server Error'));

    await expect(sqliteService.getClients()).rejects.toThrow(/HTTP 500/);
  });

  it('raises the API error message when the envelope reports failure', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: false, error: 'Client not found' }));

    await expect(sqliteService.getClients()).rejects.toThrow('Client not found');
  });

  it('raises a generic message when a failure carries no detail', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: false }));

    await expect(sqliteService.getClients()).rejects.toThrow(/API call failed/);
  });

  it('reports a dropped connection as a connection failure', async () => {
    // Connection monitoring keys off this wording.
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(sqliteService.getClients()).rejects.toThrow(/Network connection failed/);
  });

  it('passes an unrelated error through unchanged', async () => {
    fetchMock.mockRejectedValue(new Error('aborted by user'));

    await expect(sqliteService.getClients()).rejects.toThrow('aborted by user');
  });

  it('reports a settings read failure rather than silently returning nothing', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: false, error: 'settings table missing' }));

    await expect(sqliteService.getAllSettings('billing')).rejects.toThrow(/settings table missing/);
  });

  it('reports a bulk settings save failure', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: false, error: 'read-only database' }));

    await expect(sqliteService.setMultipleSettings({ theme: { value: 'dark' } }))
      .rejects.toThrow(/read-only database/);
  });
});

describe('settings cache', () => {
  it('serves a repeated read from cache instead of refetching', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true, value: 'dark' }));

    await sqliteService.getSetting('cache_probe_theme');
    const afterFirst = fetchMock.mock.calls.length;
    await sqliteService.getSetting('cache_probe_theme');

    expect(fetchMock.mock.calls.length).toBe(afterFirst);
  });

  it('refetches after the same key is written', async () => {
    // Serving the old value after a save is what makes a setting look unsaved.
    fetchMock.mockResolvedValue(jsonResponse({ success: true, value: 'dark' }));
    await sqliteService.getSetting('cache_probe_invalidate');

    await sqliteService.setSetting('cache_probe_invalidate', 'light');
    fetchMock.mockResolvedValue(jsonResponse({ success: true, value: 'light' }));

    await expect(sqliteService.getSetting('cache_probe_invalidate')).resolves.toBe('light');
  });

  it('invalidates every key touched by a bulk save', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true, value: 'dark' }));
    await sqliteService.getSetting('cache_probe_bulk_a');
    await sqliteService.getSetting('cache_probe_bulk_b');

    await sqliteService.setMultipleSettings({
      cache_probe_bulk_a: { value: 'light' },
      cache_probe_bulk_b: { value: 'light' }
    });
    fetchMock.mockResolvedValue(jsonResponse({ success: true, value: 'light' }));

    await expect(sqliteService.getSetting('cache_probe_bulk_a')).resolves.toBe('light');
    await expect(sqliteService.getSetting('cache_probe_bulk_b')).resolves.toBe('light');
  });

  it('does not let the cache for one key answer for another', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true, value: 'first' }));
    await sqliteService.getSetting('cache_probe_one');

    fetchMock.mockResolvedValue(jsonResponse({ success: true, value: 'second' }));

    await expect(sqliteService.getSetting('cache_probe_two')).resolves.toBe('second');
  });
});

describe('settings routing', () => {
  it('reads company settings from the section route', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true, value: { name: 'Acme' } }));

    await sqliteService.getSetting('company_settings');

    expect(lastUrl()).toMatch(/\/settings\/company$/);
  });

  it('reads an unmapped key from the generic route', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true, value: 'dark' }));

    await sqliteService.getSetting('route_probe_unmapped');

    expect(lastUrl()).toMatch(/\/settings\/route_probe_unmapped$/);
  });

  it('reads a section category without a query string', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true, settings: {} }));

    await sqliteService.getAllSettings('appearance');

    expect(lastUrl()).toMatch(/\/settings\/appearance$/);
  });

  it('reads any other category through the query parameter', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true, settings: {} }));

    await sqliteService.getAllSettings('billing');

    expect(lastUrl()).toMatch(/\/settings\?category=billing$/);
  });

  it('reads every setting when no category is named', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true, settings: {} }));

    await sqliteService.getAllSettings();

    expect(lastUrl()).toMatch(/\/settings$/);
  });

  it('writes all settings through one bulk call', async () => {
    await sqliteService.setMultipleSettings({
      theme: { value: 'dark' },
      currency: { value: 'USD', category: 'format' }
    });

    expect(lastInit().method).toBe('PUT');
    expect(JSON.parse(lastInit().body as string).settings).toMatchObject({
      theme: { value: 'dark' },
      currency: { value: 'USD', category: 'format' }
    });
  });
});

describe('empty payloads', () => {
  it('returns an empty list rather than undefined when a list is missing', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true }));

    await expect(sqliteService.getClients()).resolves.toEqual([]);
    await expect(sqliteService.getUsers()).resolves.toEqual([]);
    await expect(sqliteService.getTemplates()).resolves.toEqual([]);
    await expect(sqliteService.getInvoices()).resolves.toEqual([]);
    await expect(sqliteService.getExpenses()).resolves.toEqual([]);
    await expect(sqliteService.getPayments()).resolves.toEqual([]);
  });

  it('returns an empty map rather than undefined for settings', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true }));

    await expect(sqliteService.getAllSettings()).resolves.toEqual({});
  });
});

describe('exportToFile', () => {
  it('authorises the download', async () => {
    fetchMock.mockResolvedValue({
      ok: true, status: 200, statusText: 'OK', blob: async () => new Blob(['db'])
    } as unknown as Response);

    await sqliteService.exportToFile();

    expect(lastUrl()).toMatch(/\/db\/export$/);
    expect(headersOf()).toMatchObject({ Authorization: 'Bearer test-token' });
  });

  it('returns the downloaded blob', async () => {
    const blob = new Blob(['sqlite-bytes']);
    fetchMock.mockResolvedValue({
      ok: true, status: 200, statusText: 'OK', blob: async () => blob
    } as unknown as Response);

    await expect(sqliteService.exportToFile()).resolves.toBe(blob);
  });

  it('raises rather than handing back an error page as a backup file', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, false, 500, 'Internal Server Error'));

    await expect(sqliteService.exportToFile()).rejects.toThrow(/Export failed/);
  });
});

describe('importFromFile', () => {
  const aFile = () => new File(['sqlite-bytes'], 'backup.db');

  it('posts the file as multipart form data', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true }));

    await sqliteService.importFromFile(aFile());

    const importCall = fetchMock.mock.calls.find(call => /\/db\/import$/.test(String(call[0])));
    expect(importCall).toBeTruthy();
    expect((importCall?.[1] as RequestInit).method).toBe('POST');
    expect((importCall?.[1] as RequestInit).body).toBeInstanceOf(FormData);
  });

  it('does not force a JSON content type on the upload', async () => {
    // Setting it by hand strips the multipart boundary and the upload fails.
    fetchMock.mockResolvedValue(jsonResponse({ success: true }));

    await sqliteService.importFromFile(aFile());

    const importCall = fetchMock.mock.calls.find(call => /\/db\/import$/.test(String(call[0])));
    const headers = ((importCall?.[1] as RequestInit).headers ?? {}) as Record<string, string>;
    expect(headers).not.toHaveProperty('Content-Type');
  });

  it('reconnects to the backend after a successful import', async () => {
    // The old connection points at a database that has just been replaced.
    fetchMock.mockResolvedValue(jsonResponse({ success: true }));

    await sqliteService.importFromFile(aFile());

    expect(fetchMock.mock.calls.some(call => /\/health$/.test(String(call[0])))).toBe(true);
    expect(sqliteService.isReady()).toBe(true);
  });

  it('surfaces the server explanation when the import is rejected', async () => {
    fetchMock.mockResolvedValue({
      ok: false, status: 400, statusText: 'Bad Request', text: async () => 'not a database file'
    } as unknown as Response);

    await expect(sqliteService.importFromFile(aFile()))
      .rejects.toThrow(/not a database file/);
  });
});
