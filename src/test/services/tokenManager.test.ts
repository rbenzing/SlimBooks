/**
 * TokenManagerService tests.
 *
 * This decides when a user is silently kept signed in, when they are warned,
 * and when they are thrown out. Two failures matter: throwing out someone who
 * is actively typing, and leaving a session alive after the token has expired.
 * The activity listeners must also be removed on stop — a monitor that keeps
 * listening after logout holds the whole service graph alive.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { getToken, getRefreshToken, getTokenPayload, isAuthenticated } = vi.hoisted(() => ({
  getToken: vi.fn(),
  getRefreshToken: vi.fn(),
  getTokenPayload: vi.fn(),
  isAuthenticated: vi.fn()
}));
const { refreshAccessToken } = vi.hoisted(() => ({ refreshAccessToken: vi.fn() }));

vi.mock('@/utils/api/auth.util', () => ({
  getToken, getRefreshToken, getTokenPayload, isAuthenticated
}));
vi.mock('@/utils/api/refresh.util', () => ({ refreshAccessToken }));
vi.mock('@/utils/logger.util', () => ({ log: vi.fn(), warn: vi.fn() }));

import { TokenManagerService } from '@/services/tokenManager.svc';

const MINUTE = 60 * 1000;

/** Makes getToken/getTokenPayload describe a token expiring in `ms`. */
const tokenExpiringIn = (ms: number) => {
  getToken.mockReturnValue('a.b.c');
  getTokenPayload.mockReturnValue({ exp: Math.floor((Date.now() + ms) / 1000) });
};

let manager: TokenManagerService;

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  isAuthenticated.mockReturnValue(true);
  getRefreshToken.mockReturnValue('refresh-token');
  refreshAccessToken.mockResolvedValue(true);
  manager = new TokenManagerService();
});

afterEach(() => {
  manager.stopMonitoring();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('startMonitoring', () => {
  it('checks immediately rather than waiting a full interval', () => {
    tokenExpiringIn(-1000);
    const onExpired = vi.fn();

    manager.startMonitoring(onExpired);

    expect(onExpired).toHaveBeenCalled();
  });

  it('keeps checking on its interval', () => {
    tokenExpiringIn(60 * MINUTE);
    const onExpired = vi.fn();
    manager.startMonitoring(onExpired);

    tokenExpiringIn(-1000);
    vi.advanceTimersByTime(MINUTE);

    expect(onExpired).toHaveBeenCalled();
  });

  it('replaces an earlier monitor rather than running two', () => {
    tokenExpiringIn(60 * MINUTE);
    const first = vi.fn();
    const second = vi.fn();

    manager.startMonitoring(first);
    manager.startMonitoring(second);

    tokenExpiringIn(-1000);
    vi.advanceTimersByTime(MINUTE);

    expect(second).toHaveBeenCalled();
    expect(first).not.toHaveBeenCalled();
  });

  it('does nothing while no token is stored', () => {
    getToken.mockReturnValue(null);
    const onExpired = vi.fn();

    manager.startMonitoring(onExpired);
    vi.advanceTimersByTime(5 * MINUTE);

    expect(onExpired).not.toHaveBeenCalled();
  });

  it('does nothing for a token with no expiry claim', () => {
    getToken.mockReturnValue('a.b.c');
    getTokenPayload.mockReturnValue({});
    const onExpired = vi.fn();

    manager.startMonitoring(onExpired);

    expect(onExpired).not.toHaveBeenCalled();
  });
});

describe('expiry handling', () => {
  it('signs the user out once the token has expired', () => {
    tokenExpiringIn(-1);
    const onExpired = vi.fn();

    manager.startMonitoring(onExpired);

    expect(onExpired).toHaveBeenCalledTimes(1);
  });

  it('leaves a healthy session alone', () => {
    tokenExpiringIn(60 * MINUTE);
    const onExpired = vi.fn();
    const onWarning = vi.fn();

    manager.startMonitoring(onExpired, onWarning);

    expect(onExpired).not.toHaveBeenCalled();
    expect(onWarning).not.toHaveBeenCalled();
  });

  /**
   * Starts monitoring on a healthy token, then lets the user go idle. Monitoring
   * resets the activity clock on start, so idleness can only accrue afterwards.
   */
  const monitorThenIdle = (onWarning: () => void, onDismissed?: () => void) => {
    tokenExpiringIn(60 * MINUTE);
    manager.startMonitoring(vi.fn(), onWarning, onDismissed);
    vi.advanceTimersByTime(3 * MINUTE);
  };

  it('warns an idle user before the token expires', () => {
    const onWarning = vi.fn();
    monitorThenIdle(onWarning);

    // Expires four minutes from now; the check runs a minute later, so the
    // warning should quote the three minutes that are actually left.
    tokenExpiringIn(4 * MINUTE);
    vi.advanceTimersByTime(MINUTE);

    expect(onWarning).toHaveBeenCalledWith(3);
  });

  it('warns only once while the token stays in the warning window', () => {
    const onWarning = vi.fn();
    monitorThenIdle(onWarning);

    tokenExpiringIn(4 * MINUTE);
    vi.advanceTimersByTime(MINUTE);
    tokenExpiringIn(3 * MINUTE);
    vi.advanceTimersByTime(MINUTE);

    expect(onWarning).toHaveBeenCalledTimes(1);
  });

  it('treats a freshly started session as active, so it never warns on load', () => {
    // startMonitoring resets the activity clock; warning someone the instant
    // they open the app would be wrong.
    const onWarning = vi.fn();
    tokenExpiringIn(3 * MINUTE);

    manager.startMonitoring(vi.fn(), onWarning);

    expect(onWarning).not.toHaveBeenCalled();
    expect(refreshAccessToken).toHaveBeenCalled();
  });

  it('refreshes silently instead of warning an active user', () => {
    // Interrupting someone mid-edit with a session dialog is the failure here.
    tokenExpiringIn(3 * MINUTE);
    const onWarning = vi.fn();

    manager.registerActivity();
    manager.startMonitoring(vi.fn(), onWarning);

    expect(onWarning).not.toHaveBeenCalled();
    expect(refreshAccessToken).toHaveBeenCalled();
  });

  it('can warn again after the token leaves and re-enters the warning window', () => {
    // Otherwise a renewed session that later expires would go out silently.
    const onWarning = vi.fn();
    monitorThenIdle(onWarning);

    tokenExpiringIn(3 * MINUTE);
    vi.advanceTimersByTime(MINUTE);
    expect(onWarning).toHaveBeenCalledTimes(1);

    tokenExpiringIn(60 * MINUTE);
    vi.advanceTimersByTime(MINUTE);

    tokenExpiringIn(3 * MINUTE);
    vi.advanceTimersByTime(MINUTE);

    expect(onWarning).toHaveBeenCalledTimes(2);
  });

  it('dismisses the warning after an activity-driven refresh', async () => {
    const onDismissed = vi.fn();
    monitorThenIdle(vi.fn(), onDismissed);

    tokenExpiringIn(3 * MINUTE);
    vi.advanceTimersByTime(MINUTE);

    manager.registerActivity();
    await vi.advanceTimersByTimeAsync(1000);

    expect(onDismissed).toHaveBeenCalled();
  });
});

describe('stopMonitoring', () => {
  it('stops checking', () => {
    tokenExpiringIn(60 * MINUTE);
    const onExpired = vi.fn();
    manager.startMonitoring(onExpired);

    manager.stopMonitoring();
    tokenExpiringIn(-1000);
    vi.advanceTimersByTime(5 * MINUTE);

    expect(onExpired).not.toHaveBeenCalled();
  });

  it('removes every activity listener it added', () => {
    // Listeners surviving logout keep the whole service graph reachable.
    const added = vi.spyOn(document, 'addEventListener');
    const removed = vi.spyOn(document, 'removeEventListener');
    tokenExpiringIn(60 * MINUTE);

    manager.startMonitoring(vi.fn());
    const addedCount = added.mock.calls.length;

    manager.stopMonitoring();

    expect(addedCount).toBeGreaterThan(0);
    expect(removed.mock.calls.length).toBe(addedCount);
  });

  it('is safe to call twice', () => {
    tokenExpiringIn(60 * MINUTE);
    manager.startMonitoring(vi.fn());

    manager.stopMonitoring();

    expect(() => manager.stopMonitoring()).not.toThrow();
  });

  it('is safe to call before monitoring started', () => {
    expect(() => manager.stopMonitoring()).not.toThrow();
  });
});

describe('refreshToken', () => {
  it('refuses without a refresh token rather than calling the API', async () => {
    getRefreshToken.mockReturnValue(null);

    await expect(manager.refreshToken()).resolves.toBe(false);
    expect(refreshAccessToken).not.toHaveBeenCalled();
  });

  it('delegates to the shared refresh so a 401 and an expiry collapse into one call', async () => {
    await expect(manager.refreshToken()).resolves.toBe(true);
    expect(refreshAccessToken).toHaveBeenCalledTimes(1);
  });

  it('reports a failed refresh', async () => {
    refreshAccessToken.mockResolvedValue(false);

    await expect(manager.refreshToken()).resolves.toBe(false);
  });
});

describe('activity tracking', () => {
  it('starts out considering the user active', () => {
    expect(manager.isUserActive()).toBe(true);
  });

  it('considers the user idle after the activity threshold', () => {
    vi.advanceTimersByTime(3 * MINUTE);

    expect(manager.isUserActive()).toBe(false);
  });

  it('registering activity makes the user active again', () => {
    vi.advanceTimersByTime(3 * MINUTE);
    expect(manager.isUserActive()).toBe(false);

    manager.registerActivity();

    expect(manager.isUserActive()).toBe(true);
  });

  it('records when the last activity happened', () => {
    const before = Date.now();

    manager.registerActivity();

    expect(manager.getLastActivityTime()).toBeGreaterThanOrEqual(before);
  });

  it('treats a real DOM event as activity', () => {
    tokenExpiringIn(60 * MINUTE);
    manager.startMonitoring(vi.fn());
    vi.advanceTimersByTime(3 * MINUTE);
    expect(manager.isUserActive()).toBe(false);

    document.dispatchEvent(new Event('click'));

    expect(manager.isUserActive()).toBe(true);
  });

  it('ignores DOM events once monitoring has stopped', () => {
    tokenExpiringIn(60 * MINUTE);
    manager.startMonitoring(vi.fn());
    manager.stopMonitoring();
    vi.advanceTimersByTime(3 * MINUTE);

    document.dispatchEvent(new Event('click'));

    expect(manager.isUserActive()).toBe(false);
  });
});

describe('getTimeUntilExpiry', () => {
  it('reports the remaining milliseconds', () => {
    tokenExpiringIn(10 * MINUTE);

    expect(manager.getTimeUntilExpiry()).toBeGreaterThan(9 * MINUTE);
  });

  it('never reports a negative remainder', () => {
    tokenExpiringIn(-10 * MINUTE);

    expect(manager.getTimeUntilExpiry()).toBe(0);
  });

  it('reports null with no token', () => {
    getToken.mockReturnValue(null);

    expect(manager.getTimeUntilExpiry()).toBeNull();
  });

  it('reports null for a token with no expiry claim', () => {
    getToken.mockReturnValue('a.b.c');
    getTokenPayload.mockReturnValue({});

    expect(manager.getTimeUntilExpiry()).toBeNull();
  });
});

describe('getTokenInfo', () => {
  it('reports no token when none is stored', () => {
    getToken.mockReturnValue(null);

    expect(manager.getTokenInfo()).toEqual({ hasToken: false });
  });

  it('reports an unreadable token as expired', () => {
    getToken.mockReturnValue('garbage');
    getTokenPayload.mockReturnValue(null);

    expect(manager.getTokenInfo()).toEqual({ hasToken: true, isExpired: true });
  });

  it('describes a live token and the session state around it', () => {
    tokenExpiringIn(10 * MINUTE);
    isAuthenticated.mockReturnValue(true);

    const info = manager.getTokenInfo();

    expect(info.hasToken).toBe(true);
    expect(info.isExpired).toBe(false);
    expect(info.expiresAt).toBeInstanceOf(Date);
    expect(info.timeUntilExpiry).toBeGreaterThan(0);
    expect(info.isUserActive).toBe(true);
  });

  it('takes expiry from the auth layer, not from its own clock maths', () => {
    tokenExpiringIn(10 * MINUTE);
    isAuthenticated.mockReturnValue(false);

    expect(manager.getTokenInfo().isExpired).toBe(true);
  });
});

describe('getInstance', () => {
  it('returns the same monitor everywhere', () => {
    expect(TokenManagerService.getInstance()).toBe(TokenManagerService.getInstance());
  });
});
