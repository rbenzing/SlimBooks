/**
 * useTheme tests.
 *
 * The theme is held in module-level state so it survives navigation, which
 * makes the ordering rules the interesting part: a theme the user just picked
 * must not be overwritten by a slower database load, and concurrent mounts must
 * not each issue their own load. The dark class on <html> is what actually
 * renders, so it is asserted directly rather than inferred from state.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const { getToken } = vi.hoisted(() => ({ getToken: vi.fn(() => 'token') }));
const { getAllSettings, setMultipleSettings, initialize } = vi.hoisted(() => ({
  getAllSettings: vi.fn(),
  setMultipleSettings: vi.fn(),
  initialize: vi.fn(async () => {})
}));

vi.mock('@/utils/api', () => ({ getToken }));
vi.mock('@/utils/logger.util', () => ({ log: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock('@/services/sqlite.svc', () => ({
  sqliteService: { getAllSettings, setMultipleSettings, initialize, isReady: () => true }
}));

/** Fresh module instance, so the module-level theme state starts clean. */
const loadHook = async () => {
  vi.resetModules();
  const mod = await import('@/hooks/useTheme.hook');
  return mod.useTheme;
};

/** Drives the matchMedia dark-mode query. */
const setSystemPrefersDark = (prefersDark: boolean) => {
  const listeners = new Set<() => void>();
  vi.stubGlobal('matchMedia', vi.fn(() => ({
    matches: prefersDark,
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn)
  })));
  return listeners;
};

const isDarkApplied = () => document.documentElement.classList.contains('dark');

/**
 * The shared test setup replaces localStorage with bare vi.fn() stubs that do
 * not actually store anything, so a stored value has to be stubbed directly.
 */
const setStoredTheme = (value: string | null) => {
  vi.mocked(localStorage.getItem).mockReturnValue(value);
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.mocked(localStorage.getItem).mockReturnValue(null);
  document.documentElement.classList.remove('dark');
  getToken.mockReturnValue('token');
  getAllSettings.mockResolvedValue({ theme: 'light' });
  setMultipleSettings.mockResolvedValue(undefined);
  setSystemPrefersDark(false);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('loading the stored theme', () => {
  it('loads the theme from the database when signed in', async () => {
    getAllSettings.mockResolvedValue({ theme: 'dark' });
    const useTheme = await loadHook();

    const { result } = renderHook(() => useTheme());
    await act(async () => { await Promise.resolve(); });

    expect(result.current.theme).toBe('dark');
    expect(getAllSettings).toHaveBeenCalledWith('appearance');
  });

  it('falls back to localStorage when signed out', async () => {
    // An unauthenticated visitor still gets the theme they last chose.
    getToken.mockReturnValue(null as unknown as string);
    setStoredTheme('dark');
    const useTheme = await loadHook();

    const { result } = renderHook(() => useTheme());
    await act(async () => { await Promise.resolve(); });

    expect(result.current.theme).toBe('dark');
    expect(getAllSettings).not.toHaveBeenCalled();
  });

  it('falls back to localStorage when the database load fails', async () => {
    getAllSettings.mockRejectedValue(new Error('offline'));
    setStoredTheme('dark');
    const useTheme = await loadHook();

    const { result } = renderHook(() => useTheme());
    await act(async () => { await Promise.resolve(); });

    expect(result.current.theme).toBe('dark');
  });

  it('defaults to following the system when nothing is stored', async () => {
    getToken.mockReturnValue(null as unknown as string);
    const useTheme = await loadHook();

    const { result } = renderHook(() => useTheme());
    await act(async () => { await Promise.resolve(); });

    expect(result.current.theme).toBe('system');
  });

  it('loads once no matter how many components mount', async () => {
    // Every screen calls this hook; one load per screen would be a stampede.
    const useTheme = await loadHook();

    renderHook(() => useTheme());
    renderHook(() => useTheme());
    renderHook(() => useTheme());
    await act(async () => { await Promise.resolve(); });

    expect(getAllSettings).toHaveBeenCalledTimes(1);
  });
});

describe('applying the theme', () => {
  it('adds the dark class for the dark theme', async () => {
    getAllSettings.mockResolvedValue({ theme: 'dark' });
    const useTheme = await loadHook();

    renderHook(() => useTheme());
    await act(async () => { await Promise.resolve(); });

    expect(isDarkApplied()).toBe(true);
  });

  it('removes the dark class for the light theme', async () => {
    document.documentElement.classList.add('dark');
    getAllSettings.mockResolvedValue({ theme: 'light' });
    const useTheme = await loadHook();

    renderHook(() => useTheme());
    await act(async () => { await Promise.resolve(); });

    expect(isDarkApplied()).toBe(false);
  });

  it('follows the system preference when set to system', async () => {
    setSystemPrefersDark(true);
    getAllSettings.mockResolvedValue({ theme: 'system' });
    const useTheme = await loadHook();

    const { result } = renderHook(() => useTheme());
    await act(async () => { await Promise.resolve(); });

    expect(result.current.effectiveTheme).toBe('dark');
    expect(isDarkApplied()).toBe(true);
  });

  it('resolves system to light when the system is light', async () => {
    setSystemPrefersDark(false);
    getAllSettings.mockResolvedValue({ theme: 'system' });
    const useTheme = await loadHook();

    const { result } = renderHook(() => useTheme());
    await act(async () => { await Promise.resolve(); });

    expect(result.current.effectiveTheme).toBe('light');
  });

  it('reports an explicit theme as its own effective theme', async () => {
    setSystemPrefersDark(true);
    getAllSettings.mockResolvedValue({ theme: 'light' });
    const useTheme = await loadHook();

    const { result } = renderHook(() => useTheme());
    await act(async () => { await Promise.resolve(); });

    // The system prefers dark, but the user chose light.
    expect(result.current.effectiveTheme).toBe('light');
    expect(isDarkApplied()).toBe(false);
  });
});

describe('changing the theme', () => {
  it('applies the new theme immediately', async () => {
    const useTheme = await loadHook();
    const { result } = renderHook(() => useTheme());
    await act(async () => { await Promise.resolve(); });

    await act(async () => { await result.current.setTheme('dark'); });

    expect(result.current.theme).toBe('dark');
    expect(isDarkApplied()).toBe(true);
  });

  it('saves the choice under the appearance category', async () => {
    const useTheme = await loadHook();
    const { result } = renderHook(() => useTheme());
    await act(async () => { await Promise.resolve(); });

    await act(async () => { await result.current.setTheme('dark'); });

    expect(setMultipleSettings).toHaveBeenCalledWith({
      theme: { value: 'dark', category: 'appearance' }
    });
  });

  it('can change the theme without persisting it', async () => {
    const useTheme = await loadHook();
    const { result } = renderHook(() => useTheme());
    await act(async () => { await Promise.resolve(); });

    await act(async () => { await result.current.setTheme('dark', false); });

    expect(result.current.theme).toBe('dark');
    expect(setMultipleSettings).not.toHaveBeenCalled();
  });

  it('keeps the new theme on screen even when saving fails', async () => {
    // Reverting the UI because the write failed would look like a broken toggle.
    setMultipleSettings.mockRejectedValue(new Error('offline'));
    const useTheme = await loadHook();
    const { result } = renderHook(() => useTheme());
    await act(async () => { await Promise.resolve(); });

    await act(async () => { await result.current.setTheme('dark'); });

    expect(result.current.theme).toBe('dark');
    expect(isDarkApplied()).toBe(true);
  });

  it('does not let a later mount reload over the user choice', async () => {
    // The database still holds 'light'; the user just picked 'dark'.
    const useTheme = await loadHook();
    const { result } = renderHook(() => useTheme());
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await result.current.setTheme('dark'); });

    const second = renderHook(() => useTheme());
    await act(async () => { await Promise.resolve(); });

    expect(second.result.current.theme).toBe('dark');
  });

  it('applies the change to the document for every mounted component', async () => {
    // The module-level state and the <html> class are shared, so a second
    // mounted component renders the new theme even though its own React state
    // only catches up on its next state change.
    const useTheme = await loadHook();
    const first = renderHook(() => useTheme());
    renderHook(() => useTheme());
    await act(async () => { await Promise.resolve(); });

    await act(async () => { await first.result.current.setTheme('dark'); });

    expect(isDarkApplied()).toBe(true);
  });

  it('gives a newly mounted component the current theme', async () => {
    const useTheme = await loadHook();
    const first = renderHook(() => useTheme());
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await first.result.current.setTheme('dark'); });

    const later = renderHook(() => useTheme());
    await act(async () => { await Promise.resolve(); });

    expect(later.result.current.theme).toBe('dark');
  });
});

describe('system theme changes', () => {
  it('subscribes while following the system', async () => {
    const listeners = setSystemPrefersDark(false);
    getAllSettings.mockResolvedValue({ theme: 'system' });
    const useTheme = await loadHook();

    renderHook(() => useTheme());
    await act(async () => { await Promise.resolve(); });

    expect(listeners.size).toBeGreaterThan(0);
  });

  it('unsubscribes on unmount', async () => {
    // A listener outliving the component leaks the whole hook closure.
    const listeners = setSystemPrefersDark(false);
    getAllSettings.mockResolvedValue({ theme: 'system' });
    const useTheme = await loadHook();

    const { unmount } = renderHook(() => useTheme());
    await act(async () => { await Promise.resolve(); });
    unmount();

    expect(listeners.size).toBe(0);
  });

  it('does not subscribe when the theme is explicit', async () => {
    const listeners = setSystemPrefersDark(false);
    getAllSettings.mockResolvedValue({ theme: 'light' });
    const useTheme = await loadHook();

    renderHook(() => useTheme());
    await act(async () => { await Promise.resolve(); });

    expect(listeners.size).toBe(0);
  });
});
