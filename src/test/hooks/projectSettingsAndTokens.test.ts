/**
 * useProjectSettings, useTokenRefresh and useIsMobile tests.
 *
 * `useProjectSettings` feeds the settings screens, which destructure four
 * nested sections on mount — so it must always resolve to a fully populated
 * object, never null, even when the read fails. `useTokenRefresh` is the guard
 * callers put in front of an API call: returning true when the session is
 * actually dead would send the request anyway and surface a bare 401.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const { getProjectSettings } = vi.hoisted(() => ({ getProjectSettings: vi.fn() }));
const { logout } = vi.hoisted(() => ({ logout: vi.fn() }));
const { toastError, toastSuccess } = vi.hoisted(() => ({
  toastError: vi.fn(),
  toastSuccess: vi.fn()
}));
const { isTokenExpired, refreshToken, getTokenInfo, getTimeUntilExpiry } = vi.hoisted(() => ({
  isTokenExpired: vi.fn(),
  refreshToken: vi.fn(),
  getTokenInfo: vi.fn(),
  getTimeUntilExpiry: vi.fn()
}));

vi.mock('@/services/sqlite.svc', () => ({ sqliteService: { getProjectSettings } }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ logout }) }));
vi.mock('sonner', () => ({ toast: { error: toastError, success: toastSuccess } }));
vi.mock('@/services/tokenManager.svc', () => ({
  TokenManagerService: {
    getInstance: () => ({ isTokenExpired, refreshToken, getTokenInfo, getTimeUntilExpiry })
  }
}));

import { useProjectSettings } from '@/hooks/useProjectSettings';
import { useTokenRefresh } from '@/hooks/useTokenRefresh';
import { useIsMobile } from '@/hooks/useMobile';

const storedSettings = (over: Record<string, unknown> = {}) => ({
  google_oauth: { enabled: true, client_id: 'gid', configured: true },
  stripe: { enabled: false, publishable_key: '', configured: false },
  email: {
    enabled: true, smtp_host: 'smtp.example.com', smtp_port: 2525,
    smtp_user: 'billing@example.com', email_from: 'billing@example.com', configured: true
  },
  security: {
    require_email_verification: false,
    max_failed_login_attempts: 3,
    account_lockout_duration: 60000
  },
  ...over
});

/** Renders the hook and lets its initial load settle. */
const renderSettings = async () => {
  const view = renderHook(() => useProjectSettings());
  await act(async () => { await Promise.resolve(); });
  return view;
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  getProjectSettings.mockResolvedValue(storedSettings());
});

afterEach(() => vi.restoreAllMocks());

describe('useProjectSettings', () => {
  it('starts in a loading state with nothing to show', () => {
    const { result } = renderHook(() => useProjectSettings());

    expect(result.current.isLoading).toBe(true);
    expect(result.current.settings).toBeNull();
  });

  it('exposes the stored settings once loaded', async () => {
    const { result } = await renderSettings();

    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.settings).toMatchObject({
      google_oauth: { enabled: true, client_id: 'gid' },
      email: { smtp_host: 'smtp.example.com', smtp_port: 2525 }
    });
  });

  it('always resolves to all four sections', async () => {
    // The settings screens destructure these on mount; a missing one crashes.
    const { result } = await renderSettings();

    expect(Object.keys(result.current.settings ?? {}).sort())
      .toEqual(['email', 'google_oauth', 'security', 'stripe']);
  });

  it('coerces missing fields rather than passing undefined to the form', async () => {
    getProjectSettings.mockResolvedValue({});

    const { result } = await renderSettings();

    expect(result.current.settings).toMatchObject({
      google_oauth: { enabled: false, client_id: '', configured: false },
      email: { smtp_port: 587 }
    });
  });

  it('defaults an unusable smtp port to 587', async () => {
    getProjectSettings.mockResolvedValue(storedSettings({
      email: { smtp_port: 'not-a-port' }
    }));

    const { result } = await renderSettings();

    expect(result.current.settings?.email.smtp_port).toBe(587);
  });

  it('defaults email verification to required', async () => {
    // Defaulting this to false would silently weaken a new install.
    getProjectSettings.mockResolvedValue(storedSettings({ security: {} }));

    const { result } = await renderSettings();

    expect(result.current.settings?.security.require_email_verification).toBe(true);
  });

  it('preserves an explicit false for email verification', async () => {
    const { result } = await renderSettings();

    expect(result.current.settings?.security.require_email_verification).toBe(false);
  });

  it('reports the error but still supplies usable defaults', async () => {
    // A settings screen with null settings is a blank page.
    getProjectSettings.mockRejectedValue(new Error('backend unavailable'));

    const { result } = await renderSettings();

    expect(result.current.error).toBe('backend unavailable');
    expect(result.current.settings).not.toBeNull();
    expect(result.current.settings?.email.smtp_port).toBe(587);
  });

  it('finishes loading even when the read fails', async () => {
    getProjectSettings.mockRejectedValue(new Error('offline'));

    const { result } = await renderSettings();

    expect(result.current.isLoading).toBe(false);
  });

  it('treats a non-object response as a failure', async () => {
    getProjectSettings.mockResolvedValue(null);

    const { result } = await renderSettings();

    expect(result.current.error).toMatch(/invalid project settings/i);
    expect(result.current.settings).not.toBeNull();
  });

  it('refreshes on demand', async () => {
    const { result } = await renderSettings();
    getProjectSettings.mockResolvedValue(storedSettings({
      stripe: { enabled: true, publishable_key: 'pk_test_x', configured: true }
    }));

    await act(async () => { await result.current.refreshSettings(); });

    expect(result.current.settings?.stripe.enabled).toBe(true);
  });

  it('clears a previous error after a successful refresh', async () => {
    getProjectSettings.mockRejectedValue(new Error('offline'));
    const { result } = await renderSettings();
    expect(result.current.error).toBeTruthy();

    getProjectSettings.mockResolvedValue(storedSettings());
    await act(async () => { await result.current.refreshSettings(); });

    expect(result.current.error).toBeNull();
  });

  it('keeps the last good settings when a refresh fails', async () => {
    // Blanking the form because a refresh failed would lose what is on screen.
    const { result } = await renderSettings();
    const before = result.current.settings;

    getProjectSettings.mockRejectedValue(new Error('offline'));
    await act(async () => { await result.current.refreshSettings(); });

    expect(result.current.settings).toEqual(before);
    expect(result.current.error).toBe('offline');
  });
});

describe('useTokenRefresh', () => {
  it('allows the call through while the session is valid', async () => {
    isTokenExpired.mockReturnValue(false);
    const { result } = renderHook(() => useTokenRefresh());

    await expect(result.current.ensureValidToken()).resolves.toBe(true);
    expect(refreshToken).not.toHaveBeenCalled();
  });

  it('refreshes an expired session and lets the call proceed', async () => {
    isTokenExpired.mockReturnValue(true);
    refreshToken.mockResolvedValue(true);
    const { result } = renderHook(() => useTokenRefresh());

    await expect(result.current.ensureValidToken()).resolves.toBe(true);
    expect(refreshToken).toHaveBeenCalled();
    expect(logout).not.toHaveBeenCalled();
  });

  it('signs the user out when the session cannot be refreshed', async () => {
    // Returning true here would send the request and surface a bare 401.
    isTokenExpired.mockReturnValue(true);
    refreshToken.mockResolvedValue(false);
    const { result } = renderHook(() => useTokenRefresh());

    await expect(result.current.ensureValidToken()).resolves.toBe(false);
    expect(logout).toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledWith(expect.stringMatching(/session expired/i));
  });

  it('signs the user out when the check itself throws', async () => {
    isTokenExpired.mockImplementation(() => { throw new Error('storage unavailable'); });
    const { result } = renderHook(() => useTokenRefresh());

    await expect(result.current.ensureValidToken()).resolves.toBe(false);
    expect(logout).toHaveBeenCalled();
  });

  it('confirms a manual refresh', async () => {
    refreshToken.mockResolvedValue(true);
    const { result } = renderHook(() => useTokenRefresh());

    await expect(result.current.refreshToken()).resolves.toBe(true);
    expect(toastSuccess).toHaveBeenCalled();
  });

  it('reports a failed manual refresh without signing out', async () => {
    // The user asked to refresh; failing that is not grounds to end the session.
    refreshToken.mockResolvedValue(false);
    const { result } = renderHook(() => useTokenRefresh());

    await expect(result.current.refreshToken()).resolves.toBe(false);
    expect(toastError).toHaveBeenCalled();
    expect(logout).not.toHaveBeenCalled();
  });

  it('reports a thrown manual refresh as a failure', async () => {
    refreshToken.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useTokenRefresh());

    await expect(result.current.refreshToken()).resolves.toBe(false);
    expect(toastError).toHaveBeenCalled();
  });

  it('passes through the token information', () => {
    getTokenInfo.mockReturnValue({ hasToken: true, isExpired: false });
    const { result } = renderHook(() => useTokenRefresh());

    expect(result.current.getTokenInfo()).toMatchObject({ hasToken: true });
  });

  it('exposes the expiry helpers bound to the manager', () => {
    isTokenExpired.mockReturnValue(true);
    getTimeUntilExpiry.mockReturnValue(1000);
    const { result } = renderHook(() => useTokenRefresh());

    expect(result.current.isTokenExpired()).toBe(true);
    expect(result.current.getTimeUntilExpiry()).toBe(1000);
  });
});

describe('useIsMobile', () => {
  const setViewport = (width: number) => {
    Object.defineProperty(window, 'innerWidth', { writable: true, value: width });
  };

  beforeEach(() => {
    // The shared setup's matchMedia is a vi.fn() whose implementation
    // restoreAllMocks() strips, so it has to be reinstated per test.
    vi.stubGlobal('matchMedia', vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    })));
  });

  afterEach(() => vi.unstubAllGlobals());

  it('reports a narrow viewport as mobile', () => {
    setViewport(500);

    const { result } = renderHook(() => useIsMobile());

    expect(result.current).toBe(true);
  });

  it('reports a wide viewport as not mobile', () => {
    setViewport(1200);

    const { result } = renderHook(() => useIsMobile());

    expect(result.current).toBe(false);
  });

  it('treats the breakpoint itself as desktop', () => {
    setViewport(768);

    const { result } = renderHook(() => useIsMobile());

    expect(result.current).toBe(false);
  });

  it('reports a boolean even before the query resolves', () => {
    setViewport(1200);

    const { result } = renderHook(() => useIsMobile());

    expect(typeof result.current).toBe('boolean');
  });
});
