/**
 * useSettings tests.
 *
 * Every settings tab is built on this hook. It keeps a module-level cache so
 * several tabs mounting at once issue one load, which makes the cache the
 * interesting surface: a stale entry served after a save makes a saved setting
 * look like it never persisted, and a failed load that is not cached sends the
 * app into a retry loop against a backend that is already struggling.
 *
 * `saveSettings` rethrows so the calling form can keep the user on the page;
 * swallowing it would show a success toast for a save that did not happen.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const { getSetting, setSetting, isReady, initialize } = vi.hoisted(() => ({
  getSetting: vi.fn(),
  setSetting: vi.fn(),
  isReady: vi.fn(() => true),
  initialize: vi.fn(async () => {})
}));
const { getToken } = vi.hoisted(() => ({ getToken: vi.fn(() => 'test-token') }));

vi.mock('@/services/sqlite.svc', () => ({
  sqliteService: { getSetting, setSetting, isReady, initialize }
}));
vi.mock('@/utils/api', () => ({ getToken }));
vi.mock('@/utils/logger.util', () => ({
  log: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn()
}));

import { useSettings, clearAllSettingsCache, invalidateSettingsCache } from '@/hooks/useSettings.hook';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

interface Prefs extends Record<string, unknown> {
  theme: string;
  perPage: number;
}

const defaults: Prefs = { theme: 'light', perPage: 25 };

/** A distinct key per test, so one test's cache cannot answer for another. */
let keySeq = 0;
const freshKey = () => `probe_settings_${keySeq += 1}`;

/**
 * The load path awaits a dynamic `import()`, which resolves on a macrotask
 * rather than a microtask. Draining microtasks alone leaves a concurrently
 * mounted instance still waiting on its import, which would make a dedup
 * assertion pass for the wrong reason.
 */
const settle = async () => {
  await act(async () => {
    for (let i = 0; i < 5; i += 1) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  });
};

/**
 * The key has to be generated once, not inside the render callback — a new key
 * on every render would give each render its own cache entry.
 */
const renderSettings = async (options: Record<string, unknown> = {}) => {
  const settingsKey = freshKey();
  const view = renderHook(() => useSettings<Prefs>({
    settingsKey,
    defaultSettings: defaults,
    ...options
  }));

  // Wait for the load rather than assuming a fixed number of ticks: how many
  // it takes varies with what the previous test left pending.
  for (let i = 0; i < 10 && !view.result.current.isLoaded; i += 1) {
    await settle();
  }
  return view;
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  clearAllSettingsCache();
  isReady.mockReturnValue(true);
  getSetting.mockResolvedValue(null);
  setSetting.mockResolvedValue(undefined);
  getToken.mockReturnValue('test-token');
  fetchMock.mockResolvedValue({
    ok: true, status: 200, json: async () => ({ success: true, value: null })
  } as Response);
});

afterEach(() => vi.restoreAllMocks());

describe('loading', () => {
  it('starts on the defaults while loading', () => {
    const settingsKey = freshKey();
    const { result } = renderHook(() => useSettings<Prefs>({
      settingsKey, defaultSettings: defaults
    }));

    expect(result.current.settings).toEqual(defaults);
    expect(result.current.isLoading).toBe(true);
    expect(result.current.isLoaded).toBe(false);
  });

  it('replaces the defaults with what was stored', async () => {
    getSetting.mockResolvedValue({ theme: 'dark', perPage: 50 });

    const { result } = await renderSettings();

    expect(result.current.settings).toEqual({ theme: 'dark', perPage: 50 });
    expect(result.current.isLoaded).toBe(true);
    expect(result.current.isLoading).toBe(false);
  });

  it('keeps the defaults when nothing is stored', async () => {
    getSetting.mockResolvedValue(null);

    const { result } = await renderSettings();

    expect(result.current.settings).toEqual(defaults);
    expect(result.current.isLoaded).toBe(true);
  });

  it('connects first when the database is not ready', async () => {
    isReady.mockReturnValue(false);

    await renderSettings();

    expect(initialize).toHaveBeenCalled();
  });

  it('applies a load transform', async () => {
    getSetting.mockResolvedValue({ theme: 'DARK', perPage: '50' });

    const { result } = await renderSettings({
      transformLoad: (data: unknown) => ({
        theme: String((data as Prefs).theme).toLowerCase(),
        perPage: Number((data as Prefs).perPage)
      })
    });

    expect(result.current.settings).toEqual({ theme: 'dark', perPage: 50 });
  });

  it('reports a failed load and falls back to the defaults', async () => {
    // A settings tab rendered from undefined would crash on first access.
    getSetting.mockRejectedValue(new Error('database locked'));

    const { result } = await renderSettings();

    expect(result.current.error).toMatch(/failed to load settings/i);
    expect(result.current.settings).toEqual(defaults);
    expect(result.current.isLoading).toBe(false);
  });

  it('does not retry a failed load on remount', async () => {
    // Caching the failure is what stops a retry loop against a sick backend.
    getSetting.mockRejectedValue(new Error('database locked'));
    const key = freshKey();

    const first = renderHook(() => useSettings<Prefs>({ settingsKey: key, defaultSettings: defaults }));
    await settle();
    first.unmount();
    const afterFirst = getSetting.mock.calls.length;

    renderHook(() => useSettings<Prefs>({ settingsKey: key, defaultSettings: defaults }));
    await settle();

    expect(getSetting.mock.calls.length).toBe(afterFirst);
  });
});

describe('the shared cache', () => {
  /**
   * Mounts several instances in ONE commit. Separate renderHook() calls each
   * wrap their own act(), and overlapping acts stop the later instances from
   * loading at all — which would make a dedup assertion pass vacuously.
   */
  const renderTogether = async (keys: string[]) => {
    const view = renderHook(() => keys.map(settingsKey =>
      useSettings<Prefs>({ settingsKey, defaultSettings: defaults })
    ));
    await settle();
    return view;
  };

  it('loads once for several components sharing a key', async () => {
    const key = freshKey();
    getSetting.mockResolvedValue({ theme: 'dark', perPage: 50 });

    const { result } = await renderTogether([key, key, key]);

    expect(getSetting).toHaveBeenCalledTimes(1);
    // Every instance still ends up with the loaded values, not the defaults.
    for (const instance of result.current) {
      expect(instance.settings).toEqual({ theme: 'dark', perPage: 50 });
    }
  });

  it('serves a later mount from cache without another read', async () => {
    const key = freshKey();
    getSetting.mockResolvedValue({ theme: 'dark', perPage: 50 });
    renderHook(() => useSettings<Prefs>({ settingsKey: key, defaultSettings: defaults }));
    await settle();

    const later = renderHook(() => useSettings<Prefs>({ settingsKey: key, defaultSettings: defaults }));
    await settle();

    expect(getSetting).toHaveBeenCalledTimes(1);
    expect(later.result.current.settings).toEqual({ theme: 'dark', perPage: 50 });
  });

  it('keeps separate keys apart', async () => {
    // One key's cached value must never be served for another. Mounted in
    // sequence, which is how the settings tabs mount in the app.
    getSetting.mockImplementation(async (key: string) =>
      key.endsWith('a') ? { theme: 'dark', perPage: 50 } : { theme: 'light', perPage: 10 }
    );
    const keyA = `${freshKey()}a`;
    const keyB = `${freshKey()}b`;

    const first = renderHook(() => useSettings<Prefs>({ settingsKey: keyA, defaultSettings: defaults }));
    await settle();
    const second = renderHook(() => useSettings<Prefs>({ settingsKey: keyB, defaultSettings: defaults }));
    await settle();

    expect(getSetting).toHaveBeenCalledTimes(2);
    expect(first.result.current.settings).toEqual({ theme: 'dark', perPage: 50 });
    expect(second.result.current.settings).toEqual({ theme: 'light', perPage: 10 });
  });

  it('reloads after the cache is invalidated', async () => {
    const key = freshKey();
    getSetting.mockResolvedValue({ theme: 'dark', perPage: 50 });
    renderHook(() => useSettings<Prefs>({ settingsKey: key, defaultSettings: defaults }));
    await settle();

    invalidateSettingsCache(key, 'general');
    renderHook(() => useSettings<Prefs>({ settingsKey: key, defaultSettings: defaults }));
    await settle();

    expect(getSetting).toHaveBeenCalledTimes(2);
  });

  it('reloads everything after the whole cache is cleared', async () => {
    const key = freshKey();
    getSetting.mockResolvedValue({ theme: 'dark', perPage: 50 });
    renderHook(() => useSettings<Prefs>({ settingsKey: key, defaultSettings: defaults }));
    await settle();

    clearAllSettingsCache();
    renderHook(() => useSettings<Prefs>({ settingsKey: key, defaultSettings: defaults }));
    await settle();

    expect(getSetting).toHaveBeenCalledTimes(2);
  });
});

describe('editing', () => {
  it('accepts a replacement object', async () => {
    const { result } = await renderSettings();

    act(() => { result.current.setSettings({ theme: 'dark', perPage: 50 }); });

    expect(result.current.settings).toEqual({ theme: 'dark', perPage: 50 });
  });

  it('accepts an updater function', async () => {
    const { result } = await renderSettings();

    act(() => { result.current.setSettings(prev => ({ ...prev, theme: 'dark' })); });

    expect(result.current.settings).toEqual({ theme: 'dark', perPage: 25 });
  });

  it('restores the defaults and clears the error on reset', async () => {
    getSetting.mockRejectedValue(new Error('offline'));
    const { result } = await renderSettings();
    act(() => { result.current.setSettings({ theme: 'dark', perPage: 50 }); });

    act(() => { result.current.reset(); });

    expect(result.current.settings).toEqual(defaults);
    expect(result.current.error).toBeNull();
  });
});

describe('saving', () => {
  it('writes the current values under the configured category', async () => {
    const { result } = await renderSettings({ category: 'appearance' });
    act(() => { result.current.setSettings({ theme: 'dark', perPage: 50 }); });

    await act(async () => { await result.current.saveSettings(); });

    expect(setSetting).toHaveBeenCalledWith(
      expect.any(String), { theme: 'dark', perPage: 50 }, 'appearance'
    );
  });

  it('applies a save transform', async () => {
    const { result } = await renderSettings({
      transformSave: (data: Prefs) => ({ theme: data.theme.toUpperCase() })
    });

    await act(async () => { await result.current.saveSettings(); });

    expect(setSetting).toHaveBeenCalledWith(expect.any(String), { theme: 'LIGHT' }, 'general');
  });

  it('refuses to save before the load has finished', async () => {
    // Saving early would persist the defaults over the user's stored values.
    const settingsKey = freshKey();
    const { result } = renderHook(() => useSettings<Prefs>({
      settingsKey, defaultSettings: defaults
    }));

    await act(async () => { await result.current.saveSettings(); });

    expect(setSetting).not.toHaveBeenCalled();
  });

  it('reports saving while in flight', async () => {
    let release: () => void = () => {};
    const inFlight = new Promise<void>(resolve => { release = resolve; });
    setSetting.mockImplementation(() => inFlight);
    const { result } = await renderSettings();

    let pending: Promise<void> = Promise.resolve();
    await act(async () => {
      pending = result.current.saveSettings();
      await Promise.resolve();
    });
    expect(result.current.isSaving).toBe(true);

    await act(async () => {
      release();
      await pending;
    });
    expect(result.current.isSaving).toBe(false);
  });

  it('notifies the caller on success', async () => {
    const onSaveSuccess = vi.fn();
    const { result } = await renderSettings({ onSaveSuccess });

    await act(async () => { await result.current.saveSettings(); });

    expect(onSaveSuccess).toHaveBeenCalled();
  });

  it('rethrows so the form can keep the user on the page', async () => {
    // Swallowing this would show a success toast for a save that never landed.
    setSetting.mockRejectedValue(new Error('read-only database'));
    const { result } = await renderSettings();

    let thrown: unknown;
    await act(async () => {
      thrown = await result.current.saveSettings().then(() => null, error => error);
    });

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toMatch(/read-only database/);
  });

  it('records the failure and notifies the caller', async () => {
    const onSaveError = vi.fn();
    setSetting.mockRejectedValue(new Error('read-only database'));
    const { result } = await renderSettings({ onSaveError });
    expect(result.current.isLoaded).toBe(true);

    await act(async () => {
      await result.current.saveSettings().catch(() => {});
    });
    await settle();

    expect(String(result.current.error)).toMatch(/failed to save settings/i);
    expect(onSaveError).toHaveBeenCalled();
    expect(result.current.isSaving).toBe(false);
  });

  it('invalidates the cache so the next read is fresh', async () => {
    // Serving the pre-save value back is what makes a save look like it failed.
    const key = freshKey();
    getSetting.mockResolvedValue({ theme: 'light', perPage: 25 });
    const { result } = renderHook(() => useSettings<Prefs>({
      settingsKey: key, defaultSettings: defaults
    }));
    await settle();

    await act(async () => { await result.current.saveSettings(); });

    getSetting.mockResolvedValue({ theme: 'dark', perPage: 50 });
    const later = renderHook(() => useSettings<Prefs>({
      settingsKey: key, defaultSettings: defaults
    }));
    await settle();

    expect(later.result.current.settings).toEqual({ theme: 'dark', perPage: 50 });
  });
});

describe('the API endpoint path', () => {
  const apiEndpoint = '/api/settings/appearance';

  it('reads from the endpoint and authorises the request', async () => {
    fetchMock.mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ success: true, value: { theme: 'dark', perPage: 50 } })
    } as Response);

    const { result } = await renderSettings({ apiEndpoint });

    expect(String(fetchMock.mock.calls[0][0])).toBe(apiEndpoint);
    expect((fetchMock.mock.calls[0][1] as RequestInit).headers)
      .toMatchObject({ Authorization: 'Bearer test-token' });
    expect(result.current.settings).toEqual({ theme: 'dark', perPage: 50 });
  });

  it('reads a payload delivered under settings rather than value', async () => {
    fetchMock.mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ success: true, settings: { theme: 'dark', perPage: 50 } })
    } as Response);

    const { result } = await renderSettings({ apiEndpoint });

    expect(result.current.settings).toEqual({ theme: 'dark', perPage: 50 });
  });

  it('falls back to the service when the endpoint fails', async () => {
    // A failing endpoint must not leave the tab showing defaults.
    fetchMock.mockRejectedValue(new Error('offline'));
    getSetting.mockResolvedValue({ theme: 'dark', perPage: 50 });

    const { result } = await renderSettings({ apiEndpoint });

    expect(getSetting).toHaveBeenCalled();
    expect(result.current.settings).toEqual({ theme: 'dark', perPage: 50 });
  });

  it('falls back when the endpoint answers with a failure envelope', async () => {
    fetchMock.mockResolvedValue({
      ok: true, status: 200, json: async () => ({ success: false })
    } as Response);
    getSetting.mockResolvedValue({ theme: 'dark', perPage: 50 });

    const { result } = await renderSettings({ apiEndpoint });

    expect(result.current.settings).toEqual({ theme: 'dark', perPage: 50 });
  });

  it('posts to the endpoint when saving', async () => {
    const { result } = await renderSettings({ apiEndpoint });
    fetchMock.mockResolvedValue({
      ok: true, status: 200, json: async () => ({ success: true })
    } as Response);

    await act(async () => { await result.current.saveSettings(); });

    const saveCall = fetchMock.mock.calls.at(-1) as [string, RequestInit];
    expect(saveCall[1].method).toBe('POST');
    expect(JSON.parse(saveCall[1].body as string)).toEqual(defaults);
    expect(setSetting).not.toHaveBeenCalled();
  });

  it('posts to a separate save endpoint when one is configured', async () => {
    const { result } = await renderSettings({ apiEndpoint, saveEndpoint: '/api/settings/save' });
    fetchMock.mockResolvedValue({
      ok: true, status: 200, json: async () => ({ success: true })
    } as Response);

    await act(async () => { await result.current.saveSettings(); });

    expect(String((fetchMock.mock.calls.at(-1) as [string])[0])).toBe('/api/settings/save');
  });

  it('surfaces the server message when a save is refused', async () => {
    const { result } = await renderSettings({ apiEndpoint });
    fetchMock.mockResolvedValue({
      ok: false, status: 400, json: async () => ({ error: 'Invalid currency code' })
    } as Response);

    let thrown: unknown;
    await act(async () => {
      thrown = await result.current.saveSettings().then(() => null, error => error);
    });

    expect((thrown as Error)?.message).toBe('Invalid currency code');
  });

  it('reports the status when the error body is unreadable', async () => {
    const { result } = await renderSettings({ apiEndpoint });
    fetchMock.mockResolvedValue({
      ok: false, status: 500, json: async () => { throw new Error('not json'); }
    } as unknown as Response);

    let thrown: unknown;
    await act(async () => {
      thrown = await result.current.saveSettings().then(() => null, error => error);
    });

    expect((thrown as Error)?.message).toMatch(/500/);
  });

  it('treats a failure envelope on save as a failure', async () => {
    const { result } = await renderSettings({ apiEndpoint });
    fetchMock.mockResolvedValue({
      ok: true, status: 200, json: async () => ({ success: false, error: 'Rejected' })
    } as Response);

    let thrown: unknown;
    await act(async () => {
      thrown = await result.current.saveSettings().then(() => null, error => error);
    });

    expect((thrown as Error)?.message).toBe('Rejected');
  });
});
