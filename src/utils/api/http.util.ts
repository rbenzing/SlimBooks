import { clearAuthTokens, getToken } from './auth.util';
import { isAuthEndpoint, refreshAccessToken } from './refresh.util';
import { type ApiResponse } from '@/types';

class ApiError extends Error {
  constructor(
    message: string,
    public status?: number,
    public response?: Response
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * The API is always same-origin: one process serves both the SPA and the API,
 * on every supported host. A relative base is therefore correct everywhere, and
 * it is the only form that survives one bundle being deployed to four hosts.
 */
export const API_BASE = '/api';

const getBaseUrl = (): string =>
  typeof window !== 'undefined' ? window.location.origin : '';

/** Reads the server's error message out of a failed response body. */
const errorMessageFor = async (response: Response): Promise<string> => {
  try {
    const errorData = await response.json();
    return errorData.message || errorData.error || `HTTP ${response.status}: ${response.statusText}`;
  } catch {
    return `HTTP ${response.status}: ${response.statusText}`;
  }
};

export const authenticatedFetch = async (
  url: string,
  options: RequestInit = {}
): Promise<Response> => {
  const baseUrl = getBaseUrl();
  const fullUrl = url.startsWith('http') ? url : `${baseUrl}${url}`;

  const send = (): Promise<Response> => {
    const token = getToken();

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    return fetch(fullUrl, { ...options, headers });
  };

  try {
    let response = await send();

    // An expired access token is recoverable: swap it for a fresh one and replay
    // the request once. Auth endpoints are excluded so a failing refresh or login
    // cannot trigger a refresh of its own.
    if (response.status === 401 && !isAuthEndpoint(url)) {
      const refreshed = await refreshAccessToken();

      if (refreshed) {
        response = await send();
      } else {
        // Nothing left to authenticate with — don't leave a dead token behind.
        clearAuthTokens();
      }
    }

    if (!response.ok) {
      throw new ApiError(await errorMessageFor(response), response.status, response);
    }

    return response;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new ApiError('Network error: Unable to connect to server');
    }

    throw new ApiError(error instanceof Error ? error.message : 'Unknown error occurred');
  }
};

export const apiRequest = async <T = ApiResponse>(
  url: string,
  options: RequestInit = {}
): Promise<T> => {
  const response = await authenticatedFetch(url, options);

  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    return await response.json();
  }

  return await response.text() as unknown as T;
};

export const apiGet = async <T = ApiResponse>(url: string): Promise<T> => {
  return apiRequest<T>(url, { method: 'GET' });
};

export const apiPost = async <T = ApiResponse>(
  url: string,
  data: unknown
): Promise<T> => {
  return apiRequest<T>(url, {
    method: 'POST',
    body: JSON.stringify(data),
  });
};

export const apiPut = async <T = ApiResponse>(
  url: string,
  data: unknown
): Promise<T> => {
  return apiRequest<T>(url, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
};

export const apiPatch = async <T = ApiResponse>(
  url: string,
  data: unknown
): Promise<T> => {
  return apiRequest<T>(url, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
};

export const apiDelete = async <T = ApiResponse>(url: string): Promise<T> => {
  return apiRequest<T>(url, { method: 'DELETE' });
};

export { ApiError };

export const handleApiError = (error: unknown): string => {
  if (error instanceof ApiError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'An unexpected error occurred';
};