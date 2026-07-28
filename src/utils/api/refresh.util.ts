// Access-token refresh, shared by the fetch layer and the expiry monitor.
//
// Uses raw `fetch` rather than `authenticatedFetch`: the refresh call carries
// the refresh token, not the access token, and routing it through the wrapper
// would let a failing refresh trigger another refresh.

import {
  getRefreshToken,
  getTokenPersistence,
  setRefreshToken,
  setToken
} from './auth.util';

/** Endpoints that must never trigger a refresh-and-retry of their own. */
export const AUTH_ENDPOINTS = ['/api/auth/refresh', '/api/auth/login', '/api/auth/register'] as const;

export const isAuthEndpoint = (url: string): boolean =>
  AUTH_ENDPOINTS.some(endpoint => url.includes(endpoint));

/**
 * In-flight refresh. Concurrent 401s await the same request instead of each
 * firing their own, which would rotate the refresh token several times over.
 */
let inFlight: Promise<boolean> | null = null;

const performRefresh = async (): Promise<boolean> => {
  const refreshToken = getRefreshToken();

  if (!refreshToken) {
    return false;
  }

  try {
    const response = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${refreshToken}`
      }
    });

    if (!response.ok) {
      return false;
    }

    const result = await response.json();

    if (result?.success && result.data?.token) {
      // Rotate in place, honouring the original remember-me choice.
      const persistence = getTokenPersistence();
      setToken(result.data.token, persistence);

      if (result.data.refreshToken) {
        setRefreshToken(result.data.refreshToken, persistence);
      }

      return true;
    }

    return false;
  } catch {
    return false;
  }
};

/**
 * Exchanges the stored refresh token for a new access token.
 * Returns false when there is nothing to refresh with or the server declines.
 */
export const refreshAccessToken = async (): Promise<boolean> => {
  if (!inFlight) {
    inFlight = performRefresh().finally(() => {
      inFlight = null;
    });
  }

  return inFlight;
};
