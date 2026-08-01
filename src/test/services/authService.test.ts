/**
 * AuthService (frontend) tests.
 *
 * This is the client half of sign-in: it validates before it ever calls the
 * API, then decides what counts as a successful login. The failure that matters
 * is treating a non-success response as a session — the app would then render
 * as signed in with no token behind it.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/env-config', () => ({ envConfig: { API_URL: 'http://api.test' } }));

import { AuthService } from '@/services/auth.svc';
import type { User } from '@/types';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

const jsonResponse = (body: unknown, ok = true, status = ok ? 200 : 400) =>
  ({ ok, status, json: async () => body }) as Response;

const validRegistration = {
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  password: 'Str0ng!Passw0rd',
  confirm_password: 'Str0ng!Passw0rd'
};

const aUser = { id: 1, name: 'Ada', email: 'ada@example.com', role: 'user' } as unknown as User;

/** Body of the nth fetch call, parsed. */
const bodyOf = (call = 0) => JSON.parse((fetchMock.mock.calls[call][1] as RequestInit).body as string);

let auth: AuthService;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  auth = new AuthService();
});

describe('register', () => {
  beforeEach(() => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true, data: { user: aUser } }));
  });

  it('posts to the registration endpoint', async () => {
    await auth.register(validRegistration);

    expect(fetchMock.mock.calls[0][0]).toBe('http://api.test/api/auth/register');
    expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe('POST');
  });

  it('rejects a malformed email without calling the API', async () => {
    await expect(auth.register({ ...validRegistration, email: 'not-an-email' }))
      .resolves.toMatchObject({ success: false, message: 'Invalid email address' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects mismatched passwords without calling the API', async () => {
    await expect(auth.register({ ...validRegistration, confirm_password: 'different' }))
      .resolves.toMatchObject({ success: false, message: 'Passwords do not match' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a weak password and says why', async () => {
    const result = await auth.register({
      ...validRegistration, password: 'short', confirm_password: 'short'
    });

    expect(result.success).toBe(false);
    expect(result.message).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never sends the password confirmation as the password', async () => {
    await auth.register(validRegistration);

    expect(bodyOf()).toMatchObject({
      email: 'ada@example.com',
      password: 'Str0ng!Passw0rd'
    });
  });

  it('surfaces the server message when registration is refused', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: 'Email already registered' }, false));

    await expect(auth.register(validRegistration))
      .resolves.toMatchObject({ success: false, message: 'Email already registered' });
  });

  it('falls back to a generic message when the server gives none', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, false));

    const result = await auth.register(validRegistration);

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/registration failed/i);
  });

  it('reports a network failure rather than throwing at the form', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));

    await expect(auth.register(validRegistration))
      .resolves.toMatchObject({ success: false });
  });

  it('passes the returned user through on success', async () => {
    const result = await auth.register(validRegistration);

    expect(result).toMatchObject({ success: true, user: aUser });
  });
});

describe('login', () => {
  const credentials = { email: 'ada@example.com', password: 'Str0ng!Passw0rd' };

  it('posts to the login endpoint', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true, data: { user: aUser, token: 't' } }));

    await auth.login(credentials);

    expect(fetchMock.mock.calls[0][0]).toBe('http://api.test/api/auth/login');
  });

  it('defaults rememberMe to false rather than sending undefined', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true, data: { user: aUser, token: 't' } }));

    await auth.login(credentials);

    expect(bodyOf()).toMatchObject({ rememberMe: false });
  });

  it('forwards an explicit rememberMe', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true, data: { user: aUser, token: 't' } }));

    await auth.login({ ...credentials, rememberMe: true });

    expect(bodyOf()).toMatchObject({ rememberMe: true });
  });

  it('maps the token onto the field the auth context reads', async () => {
    // The API calls it `token`; the context expects `session_token`. A mismatch
    // here signs the user in with no token.
    fetchMock.mockResolvedValue(jsonResponse({
      success: true, data: { user: aUser, token: 'jwt-value' }
    }));

    const result = await auth.login(credentials);

    expect(result.session_token).toBe('jwt-value');
    expect(result.user).toEqual(aUser);
  });

  it('establishes the session only on a successful login', async () => {
    fetchMock.mockResolvedValue(jsonResponse({
      success: true, data: { user: aUser, token: 'jwt-value' }
    }));

    await auth.login(credentials);

    expect(auth.isAuthenticated()).toBe(true);
    expect(auth.getCurrentUser()).toEqual(aUser);
  });

  it('leaves the app signed out when the credentials are rejected', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: 'Invalid credentials' }, false));

    const result = await auth.login(credentials);

    expect(result).toMatchObject({ success: false, message: 'Invalid credentials' });
    expect(auth.isAuthenticated()).toBe(false);
  });

  it('leaves the app signed out when the response carries no token', async () => {
    // A 200 with a user but no token must not count as a session.
    fetchMock.mockResolvedValue(jsonResponse({ success: true, data: { user: aUser } }));

    await auth.login(credentials);

    expect(auth.isAuthenticated()).toBe(false);
  });

  it('passes through a response that requires email verification', async () => {
    fetchMock.mockResolvedValue(jsonResponse({
      success: true,
      data: { user: aUser, token: 't' },
      requires_email_verification: true
    }));

    await expect(auth.login(credentials))
      .resolves.toMatchObject({ requires_email_verification: true });
  });

  it('reports a network failure rather than throwing at the form', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));

    await expect(auth.login(credentials)).resolves.toMatchObject({ success: false });
    expect(auth.isAuthenticated()).toBe(false);
  });
});

describe('verifyToken', () => {
  it('sends the token as a bearer credential', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true, data: aUser }));

    await auth.verifyToken('jwt-value');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://api.test/api/auth/profile');
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer jwt-value' });
  });

  it('restores the session for a valid token', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true, data: aUser }));

    await expect(auth.verifyToken('jwt-value')).resolves.toEqual(aUser);
    expect(auth.isAuthenticated()).toBe(true);
  });

  it('refuses a rejected token', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, false, 401));

    await expect(auth.verifyToken('stale')).resolves.toBeNull();
    expect(auth.isAuthenticated()).toBe(false);
  });

  it('refuses a 200 that carries no user', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true }));

    await expect(auth.verifyToken('jwt-value')).resolves.toBeNull();
    expect(auth.isAuthenticated()).toBe(false);
  });

  it('refuses a response that reports failure', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: false, data: aUser }));

    await expect(auth.verifyToken('jwt-value')).resolves.toBeNull();
  });

  it('refuses rather than throwing when the network is down', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));

    await expect(auth.verifyToken('jwt-value')).resolves.toBeNull();
  });
});

describe('session state', () => {
  it('starts signed out', () => {
    expect(auth.isAuthenticated()).toBe(false);
    expect(auth.getCurrentUser()).toBeNull();
  });

  it('restores a session directly', () => {
    auth.setCurrentUser(aUser);

    expect(auth.isAuthenticated()).toBe(true);
    expect(auth.getCurrentUser()).toEqual(aUser);
  });

  it('clears the session on logout', () => {
    auth.setCurrentUser(aUser);

    auth.logout();

    expect(auth.isAuthenticated()).toBe(false);
    expect(auth.getCurrentUser()).toBeNull();
  });

  it('reports roles only for the signed-in user', () => {
    expect(auth.hasRole('user')).toBe(false);

    auth.setCurrentUser(aUser);

    expect(auth.hasRole('user')).toBe(true);
    expect(auth.hasRole('admin')).toBe(false);
  });

  it('recognises an administrator', () => {
    auth.setCurrentUser({ ...aUser, role: 'admin' } as User);

    expect(auth.isAdmin()).toBe(true);
  });

  it('does not treat a signed-out visitor as an administrator', () => {
    expect(auth.isAdmin()).toBe(false);
  });

  it('shares one instance across the app', () => {
    expect(AuthService.getInstance()).toBe(AuthService.getInstance());
  });
});
