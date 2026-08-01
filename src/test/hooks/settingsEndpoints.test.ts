/**
 * Settings endpoint wiring tests.
 *
 * Every settings tab reported saving successfully while storing nothing, or
 * showed defaults over values that were saved. Each case was the same shape of
 * mistake — a hook pointed at an endpoint whose request or response it did not
 * match — and none of it was visible from the UI, because a settings screen
 * that silently discards your input looks exactly like one that works.
 *
 * The four ways it went wrong:
 *
 *  - reading `/api/settings/` (every setting, keyed by namespaced name) and
 *    then looking for bare field names, so nothing was ever found;
 *  - reading `/api/settings/general` and `/api/settings/appearance`, which
 *    answer with a whole category keyed as `general.x`, and looking for `x`;
 *  - POSTing to `/api/settings/appearance`, which only accepts PUT, so the
 *    request fell through to the SPA catch-all and a page of HTML read as a
 *    successful save;
 *  - writing field names the server's allow-list silently drops.
 *
 * So these tests assert the wiring itself: which URL, which method, which
 * field names. They are unglamorous and they are the ones that would have
 * caught all of it.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/utils/api', () => ({ getToken: () => 'test-token' }));
vi.mock('@/services/sqlite.svc', () => ({
  sqliteService: {
    isReady: () => true,
    initialize: vi.fn(),
    getSetting: vi.fn(async () => null),
    setSetting: vi.fn()
  }
}));

import {
  useEmailSettings,
  useGeneralSettings,
  useAppearanceSettings,
  useNotificationSettings,
  clearAllSettingsCache
} from '@/hooks/useSettings.hook';

const fetchMock = vi.fn();

/** Answers as the API does, with a JSON content type. */
const answers = (body: unknown) => {
  fetchMock.mockResolvedValue({
    ok: true,
    headers: { get: () => 'application/json' },
    json: async () => body
  });
};

/** Lets the load settle; it resolves on a macrotask, not a microtask. */
const settle = async () => {
  for (let i = 0; i < 5; i += 1) {
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  }
};

const loadCall = () => fetchMock.mock.calls[0];
const saveCall = () => fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
const savedBody = () => JSON.parse(String((saveCall()[1] as RequestInit).body));

beforeEach(() => {
  vi.clearAllMocks();
  clearAllSettingsCache();
  vi.stubGlobal('fetch', fetchMock);
  answers({ success: true, value: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('email settings', () => {
  it('reads the single row it owns, not every setting in the database', async () => {
    // `/api/settings/` answers with the whole settings map keyed by namespaced
    // name. Reading that left every field on the form undefined — including
    // `isEnabled`, which is what made Test Connection permanently unclickable.
    renderHook(() => useEmailSettings());
    await settle();

    expect(loadCall()[0]).toBe('/api/settings/email.email_settings');
  });

  it('saves through the generic endpoint with its key and category', async () => {
    const { result } = renderHook(() => useEmailSettings());
    await settle();

    await act(async () => { await result.current.saveSettings(); });

    expect(saveCall()[0]).toBe('/api/settings/');
    expect((saveCall()[1] as RequestInit).method).toBe('POST');
    expect(savedBody()).toMatchObject({ key: 'email_settings', category: 'email' });
  });

  it('round-trips a stored configuration back onto the form', async () => {
    answers({
      success: true,
      value: {
        smtp_host: 'smtp.gmail.com', smtp_port: 587, smtp_user: 'a@b.co',
        smtp_password: 'pw', smtp_security: 'tls', from_email: 'a@b.co',
        from_name: 'Slimbooks', isEnabled: true, provider: 'gmail'
      }
    });

    const { result } = renderHook(() => useEmailSettings());
    await settle();

    expect(result.current.settings).toMatchObject({
      smtp_host: 'smtp.gmail.com',
      isEnabled: true
    });
  });

  it('reads the older boolean security flag as STARTTLS', async () => {
    answers({ success: true, value: { smtp_host: 'x', smtp_secure: true } });

    const { result } = renderHook(() => useEmailSettings());
    await settle();

    expect(result.current.settings.smtp_security).toBe('tls');
  });
});

describe('general settings', () => {
  it('reads its own row rather than the whole general category', async () => {
    renderHook(() => useGeneralSettings());
    await settle();

    expect(loadCall()[0]).toBe('/api/settings/general.general_settings');
  });

  it('saves through the generic endpoint', async () => {
    const { result } = renderHook(() => useGeneralSettings());
    await settle();

    await act(async () => { await result.current.saveSettings(); });

    expect(saveCall()[0]).toBe('/api/settings/');
    expect(savedBody()).toMatchObject({ key: 'general_settings', category: 'general' });
  });
});

describe('appearance settings', () => {
  it('saves with PUT, which is the only method that endpoint accepts', async () => {
    // A POST here matched no route and fell through to the SPA catch-all — a
    // 200 carrying index.html, which read as a successful save.
    const { result } = renderHook(() => useAppearanceSettings());
    await settle();

    await act(async () => { await result.current.saveSettings(); });

    expect(saveCall()[0]).toBe('/api/settings/appearance');
    expect((saveCall()[1] as RequestInit).method).toBe('PUT');
  });

  it('sends the field names the server allow-list accepts', async () => {
    // A name outside the list is dropped without complaint.
    const { result } = renderHook(() => useAppearanceSettings());
    await settle();

    await act(async () => { await result.current.saveSettings(); });

    expect(Object.keys(savedBody().settings).sort())
      .toEqual(['invoice_template', 'pdf_format', 'show_stat_cards', 'theme']);
  });

  it('strips the category prefix the endpoint answers with', async () => {
    answers({
      success: true,
      settings: {
        'appearance.theme': 'dark',
        'appearance.show_stat_cards': false,
        'appearance.invoice_template': 'classic-white'
      }
    });

    const { result } = renderHook(() => useAppearanceSettings());
    await settle();

    expect(result.current.settings).toMatchObject({
      theme: 'dark',
      show_stat_cards: false,
      invoice_template: 'classic-white'
    });
  });

  it('treats a stored false as false, not as absent', async () => {
    // `show_stat_cards` hides a row of cards. Falling back to the default on a
    // stored `false` would turn the preference back on at every load.
    answers({ success: true, settings: { 'appearance.show_stat_cards': false } });

    const { result } = renderHook(() => useAppearanceSettings());
    await settle();

    expect(result.current.settings.show_stat_cards).toBe(false);
  });

  it('falls back to defaults when nothing is stored', async () => {
    answers({ success: true, settings: {} });

    const { result } = renderHook(() => useAppearanceSettings());
    await settle();

    expect(result.current.settings.show_stat_cards).toBe(true);
  });
});

describe('notification settings', () => {
  it('reads its dedicated endpoint and unwraps the nested payload', async () => {
    answers({
      success: true,
      settings: { notification_settings: { showToastNotifications: false, toastDuration: 1000 } }
    });

    const { result } = renderHook(() => useNotificationSettings());
    await settle();

    expect(loadCall()[0]).toBe('/api/settings/notification');
    expect(result.current.settings).toMatchObject({
      showToastNotifications: false,
      toastDuration: 1000
    });
  });

  it('saves through the generic endpoint', async () => {
    const { result } = renderHook(() => useNotificationSettings());
    await settle();

    await act(async () => { await result.current.saveSettings(); });

    expect(saveCall()[0]).toBe('/api/settings/');
    expect(savedBody()).toMatchObject({ key: 'notification_settings' });
  });
});

describe('a save that lands on no route', () => {
  it('is reported as a failure rather than a success', async () => {
    const { result } = renderHook(() => useAppearanceSettings());
    await settle();

    // The SPA catch-all: 200, but a page rather than a result.
    fetchMock.mockResolvedValue({
      ok: true,
      headers: { get: () => 'text/html; charset=utf-8' },
      json: async () => { throw new Error('Unexpected token <'); }
    });

    let thrown: unknown = null;
    await act(async () => {
      thrown = await result.current.saveSettings().then(() => null, error => error);
    });

    expect((thrown as Error)?.message).toMatch(/page, not a result/i);
  });
});
