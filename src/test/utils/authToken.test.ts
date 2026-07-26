/**
 * Consolidated auth token storage tests
 * Verifies src/utils/api/auth.util.ts is the single owner of token persistence.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  clearAuthTokens,
  getRefreshToken,
  getToken,
  getTokenPayload,
  getTokenPersistence,
  isAuthenticated,
  isTokenExpired,
  setAuthTokens,
  setRefreshToken,
  setToken,
  TokenPersistence
} from '@/utils/api/auth.util';

/**
 * src/test/setup.ts replaces global.localStorage with vi.fn() stubs that never
 * actually store anything, so this suite installs a real in-memory Storage.
 */
class MemoryStorage implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  /** Snapshot used to simulate a browser restart. */
  snapshot(): Record<string, string> {
    return Object.fromEntries(this.store);
  }

  restore(entries: Record<string, string>): void {
    this.store = new Map(Object.entries(entries));
  }
}

let localStorageStub: MemoryStorage;
let sessionStorageStub: MemoryStorage;

const originalLocalStorage = globalThis.localStorage;
const originalSessionStorage = globalThis.sessionStorage;

const installStorage = (local: MemoryStorage, session: MemoryStorage): void => {
  Object.defineProperty(globalThis, 'localStorage', { value: local, writable: true, configurable: true });
  Object.defineProperty(globalThis, 'sessionStorage', { value: session, writable: true, configurable: true });
  Object.defineProperty(window, 'localStorage', { value: local, writable: true, configurable: true });
  Object.defineProperty(window, 'sessionStorage', { value: session, writable: true, configurable: true });
};

/** Build an unsigned JWT-shaped token with the given expiry (seconds since epoch). */
const makeToken = (expSecondsFromNow: number, extra: Record<string, unknown> = {}): string => {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({
    exp: Math.floor(Date.now() / 1000) + expSecondsFromNow,
    userId: 1,
    ...extra
  }));
  return `${header}.${payload}.signature`;
};

/**
 * Simulate a browser reload: sessionStorage of the closed tab is discarded,
 * localStorage survives.
 */
const simulateBrowserRestart = (): void => {
  const persisted = localStorageStub.snapshot();
  localStorageStub = new MemoryStorage();
  sessionStorageStub = new MemoryStorage();
  localStorageStub.restore(persisted);
  installStorage(localStorageStub, sessionStorageStub);
};

beforeEach(() => {
  localStorageStub = new MemoryStorage();
  sessionStorageStub = new MemoryStorage();
  installStorage(localStorageStub, sessionStorageStub);
});

afterEach(() => {
  Object.defineProperty(globalThis, 'localStorage', { value: originalLocalStorage, writable: true, configurable: true });
  Object.defineProperty(globalThis, 'sessionStorage', { value: originalSessionStorage, writable: true, configurable: true });
});

describe('Auth token persistence', () => {
  describe('remember-me writes', () => {
    it('should survive a simulated browser restart', () => {
      const token = makeToken(3600);
      setAuthTokens(token, 'refresh-abc', TokenPersistence.Persistent);

      expect(localStorageStub.getItem('auth_token')).toBe(token);
      expect(sessionStorageStub.getItem('auth_token')).toBeNull();

      simulateBrowserRestart();

      expect(getToken()).toBe(token);
      expect(getRefreshToken()).toBe('refresh-abc');
      expect(getTokenPersistence()).toBe(TokenPersistence.Persistent);
    });
  });

  describe('session-only writes', () => {
    it('should NOT survive a simulated browser restart', () => {
      const token = makeToken(3600);
      setAuthTokens(token, 'refresh-abc', TokenPersistence.Session);

      expect(sessionStorageStub.getItem('auth_token')).toBe(token);
      expect(localStorageStub.getItem('auth_token')).toBeNull();
      expect(getToken()).toBe(token);

      simulateBrowserRestart();

      expect(getToken()).toBeNull();
      expect(getRefreshToken()).toBeNull();
      expect(getTokenPersistence()).toBe(TokenPersistence.Session);
    });

    it('should not leave a persistent token behind when downgrading from remember-me', () => {
      setAuthTokens(makeToken(3600), 'old-refresh', TokenPersistence.Persistent);

      const sessionToken = makeToken(3600, { userId: 2 });
      setAuthTokens(sessionToken, 'new-refresh', TokenPersistence.Session);

      expect(localStorageStub.getItem('auth_token')).toBeNull();
      expect(localStorageStub.getItem('refresh_token')).toBeNull();
      expect(localStorageStub.getItem('remember_me')).toBeNull();
      expect(getToken()).toBe(sessionToken);

      simulateBrowserRestart();
      expect(getToken()).toBeNull();
    });

    it('should clear a stale refresh token when none is issued', () => {
      setAuthTokens(makeToken(3600), 'old-refresh', TokenPersistence.Persistent);
      setAuthTokens(makeToken(3600), undefined, TokenPersistence.Persistent);

      expect(getRefreshToken()).toBeNull();
    });
  });

  describe('reading tokens', () => {
    it('should prefer localStorage over sessionStorage', () => {
      localStorageStub.setItem('auth_token', 'persistent-token');
      sessionStorageStub.setItem('auth_token', 'session-token');

      expect(getToken()).toBe('persistent-token');
    });

    it('should fall back to sessionStorage when localStorage is empty', () => {
      sessionStorageStub.setItem('auth_token', 'session-token');
      sessionStorageStub.setItem('refresh_token', 'session-refresh');

      expect(getToken()).toBe('session-token');
      expect(getRefreshToken()).toBe('session-refresh');
    });

    it('should return null when neither storage holds a token', () => {
      expect(getToken()).toBeNull();
      expect(getRefreshToken()).toBeNull();
    });
  });

  describe('clearAuthTokens', () => {
    it('should remove tokens from BOTH storages', () => {
      localStorageStub.setItem('auth_token', 'persistent-token');
      localStorageStub.setItem('refresh_token', 'persistent-refresh');
      localStorageStub.setItem('remember_me', 'true');
      sessionStorageStub.setItem('auth_token', 'session-token');
      sessionStorageStub.setItem('refresh_token', 'session-refresh');

      clearAuthTokens();

      expect(localStorageStub.getItem('auth_token')).toBeNull();
      expect(localStorageStub.getItem('refresh_token')).toBeNull();
      expect(localStorageStub.getItem('remember_me')).toBeNull();
      expect(sessionStorageStub.getItem('auth_token')).toBeNull();
      expect(sessionStorageStub.getItem('refresh_token')).toBeNull();
      expect(getToken()).toBeNull();
      expect(getRefreshToken()).toBeNull();
      expect(isAuthenticated()).toBe(false);
    });
  });

  describe('setToken / setRefreshToken', () => {
    it('should record the remember-me choice so a refresh writes to the same storage', () => {
      setToken(makeToken(3600), TokenPersistence.Persistent);
      expect(getTokenPersistence()).toBe(TokenPersistence.Persistent);

      const rotated = makeToken(7200);
      setToken(rotated, getTokenPersistence());
      expect(localStorageStub.getItem('auth_token')).toBe(rotated);
      expect(sessionStorageStub.getItem('auth_token')).toBeNull();
    });

    it('should keep the refresh token alongside the access token', () => {
      setToken(makeToken(3600), TokenPersistence.Session);
      setRefreshToken('refresh-xyz', TokenPersistence.Session);

      expect(sessionStorageStub.getItem('refresh_token')).toBe('refresh-xyz');
      expect(localStorageStub.getItem('refresh_token')).toBeNull();
    });
  });

  describe('isTokenExpired', () => {
    it('should return false for a valid unexpired token', () => {
      expect(isTokenExpired(makeToken(3600))).toBe(false);
    });

    it('should return true for an expired token', () => {
      expect(isTokenExpired(makeToken(-3600))).toBe(true);
    });

    it('should handle malformed / non-JWT strings without throwing', () => {
      const malformed = [
        '',
        'not-a-jwt',
        'only.two',
        'a.b.c.d',
        'header.!!!not-base64!!!.signature',
        `header.${btoa('{ not json')}.signature`,
        `header.${btoa(JSON.stringify({ userId: 1 }))}.signature`
      ];

      malformed.forEach(token => {
        expect(() => isTokenExpired(token)).not.toThrow();
        expect(isTokenExpired(token)).toBe(true);
      });
    });
  });

  describe('getTokenPayload', () => {
    it('should decode a well-formed payload', () => {
      const payload = getTokenPayload(makeToken(3600, { email: 'user@example.com' }));

      expect(payload).not.toBeNull();
      expect(payload?.userId).toBe(1);
      expect(payload?.email).toBe('user@example.com');
    });

    it('should return null for malformed input without throwing', () => {
      expect(() => getTokenPayload('garbage')).not.toThrow();
      expect(getTokenPayload('garbage')).toBeNull();
    });
  });

  describe('isAuthenticated', () => {
    it('should be true for a stored unexpired token', () => {
      setToken(makeToken(3600), TokenPersistence.Session);
      expect(isAuthenticated()).toBe(true);
    });

    it('should be false for a stored expired token', () => {
      setToken(makeToken(-1), TokenPersistence.Session);
      expect(isAuthenticated()).toBe(false);
    });

    it('should be false when no token is stored', () => {
      expect(isAuthenticated()).toBe(false);
    });
  });
});
