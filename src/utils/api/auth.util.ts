// Single source of truth for auth token persistence (read + write).
// Nothing else in the app may touch localStorage/sessionStorage for auth keys.

import { type PasswordRequirements } from '@/types';

const TOKEN_KEY = 'auth_token';
const REFRESH_TOKEN_KEY = 'refresh_token';
const REMEMBER_ME_KEY = 'remember_me';

/**
 * Where a token is persisted. Required on every write so a caller can never
 * accidentally persist a session-only token to localStorage.
 */
export const TokenPersistence = {
  /** Survives a browser restart - the "remember me" choice. */
  Persistent: 'persistent',
  /** Discarded when the tab closes. */
  Session: 'session'
} as const;

export type TokenPersistence = typeof TokenPersistence[keyof typeof TokenPersistence];

/** Decoded (unverified) JWT payload. Verification happens server side. */
export interface JwtPayload {
  exp?: number;
  iat?: number;
  userId?: number;
  email?: string;
  type?: string;
  [claim: string]: unknown;
}

const isBrowser = (): boolean => typeof window !== 'undefined';

/** Read a key preferring localStorage ("remember me") then sessionStorage. */
const readKey = (key: string): string | null => {
  if (!isBrowser()) return null;
  return localStorage.getItem(key) ?? sessionStorage.getItem(key);
};

/**
 * Write a key to the chosen storage and remove it from the other one, so a
 * stale value can never shadow the value that was just written.
 */
const writeKey = (key: string, value: string, persistence: TokenPersistence): void => {
  if (!isBrowser()) return;
  const isPersistent = persistence === TokenPersistence.Persistent;
  const target = isPersistent ? localStorage : sessionStorage;
  const other = isPersistent ? sessionStorage : localStorage;
  other.removeItem(key);
  target.setItem(key, value);
};

/** Remove a key from both storages. */
const removeKey = (key: string): void => {
  if (!isBrowser()) return;
  localStorage.removeItem(key);
  sessionStorage.removeItem(key);
};

/** Record the remember-me choice so later writes (token refresh) can honour it. */
const recordPersistence = (persistence: TokenPersistence): void => {
  if (!isBrowser()) return;
  if (persistence === TokenPersistence.Persistent) {
    localStorage.setItem(REMEMBER_ME_KEY, 'true');
  } else {
    localStorage.removeItem(REMEMBER_ME_KEY);
  }
};

/** The persistence the current session was established with. */
export const getTokenPersistence = (): TokenPersistence => {
  if (!isBrowser()) return TokenPersistence.Session;
  return localStorage.getItem(REMEMBER_ME_KEY) === 'true'
    ? TokenPersistence.Persistent
    : TokenPersistence.Session;
};

export const getToken = (): string | null => readKey(TOKEN_KEY);

export const getRefreshToken = (): string | null => readKey(REFRESH_TOKEN_KEY);

export const setToken = (token: string, persistence: TokenPersistence): void => {
  writeKey(TOKEN_KEY, token, persistence);
  recordPersistence(persistence);
};

export const setRefreshToken = (refreshToken: string, persistence: TokenPersistence): void => {
  writeKey(REFRESH_TOKEN_KEY, refreshToken, persistence);
  recordPersistence(persistence);
};

/**
 * Store a freshly issued token pair. A missing refresh token clears any
 * previously stored one rather than leaving it behind.
 */
export const setAuthTokens = (
  token: string,
  refreshToken: string | undefined,
  persistence: TokenPersistence
): void => {
  setToken(token, persistence);
  if (refreshToken) {
    setRefreshToken(refreshToken, persistence);
  } else {
    removeKey(REFRESH_TOKEN_KEY);
  }
};

/** Remove every auth key from BOTH storages so nothing survives a sign-out. */
export const clearAuthTokens = (): void => {
  removeKey(TOKEN_KEY);
  removeKey(REFRESH_TOKEN_KEY);
  removeKey(REMEMBER_ME_KEY);
};

/** Decode a JWT payload without verifying it. Returns null for malformed input. */
export const getTokenPayload = (token: string): JwtPayload | null => {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const segment = parts[1];
    const padded = segment + '='.repeat((4 - segment.length % 4) % 4);
    return JSON.parse(atob(padded)) as JwtPayload;
  } catch {
    return null;
  }
};

/** A token with no readable expiry is treated as expired. */
export const isTokenExpired = (token: string): boolean => {
  const payload = getTokenPayload(token);
  if (!payload || typeof payload.exp !== 'number') return true;
  return payload.exp <= Date.now() / 1000;
};

export const isAuthenticated = (): boolean => {
  const token = getToken();
  return token !== null && !isTokenExpired(token);
};

export class AuthUtils {
  static isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  static validatePassword(password: string, requirements: Partial<PasswordRequirements>): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (password.length < (requirements.min_length || 8)) {
      errors.push(`Password must be at least ${requirements.min_length || 8} characters long`);
    }

    if (requirements.require_uppercase && !/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }

    if (requirements.require_lowercase && !/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }

    if (requirements.require_numbers && !/\d/.test(password)) {
      errors.push('Password must contain at least one number');
    }

    if (requirements.require_special_chars && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      errors.push('Password must contain at least one special character');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  static calculatePasswordStrength(password: string): { score: number; level: string; feedback: string[] } {
    let score = 0;
    const feedback: string[] = [];

    if (!password) {
      return { score: 0, level: 'weak', feedback: ['Enter a password'] };
    }

    // Length scoring
    if (password.length >= 8) score += 25;
    else feedback.push('Use at least 8 characters');

    if (password.length >= 12) score += 10;
    if (password.length >= 16) score += 5;

    // Character variety
    if (/[a-z]/.test(password)) score += 15;
    else feedback.push('Add lowercase letters');

    if (/[A-Z]/.test(password)) score += 15;
    else feedback.push('Add uppercase letters');

    if (/\d/.test(password)) score += 15;
    else feedback.push('Add numbers');

    if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) score += 20;
    else feedback.push('Add special characters');

    // Patterns and repetition
    if (!/(.)\1{2,}/.test(password)) score += 10;
    else feedback.push('Avoid repeating characters');

    // Determine level
    let level: string;
    if (score < 30) level = 'weak';
    else if (score < 60) level = 'fair';
    else if (score < 90) level = 'good';
    else level = 'strong';

    return { score, level, feedback };
  }

  static verifyPasswordResetToken(token: string): { email: string } | null {
    const payload = getTokenPayload(token);
    if (!payload) return null;

    // Reject expired tokens
    if (typeof payload.exp === 'number' && payload.exp <= Date.now() / 1000) {
      return null;
    }

    // Reject anything that is not a password reset token
    if (payload.type !== 'password_reset' || !payload.email) {
      return null;
    }

    return { email: payload.email };
  }
}
