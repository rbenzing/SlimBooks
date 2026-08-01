/**
 * Authentication middleware — the accept paths and the role gates.
 *
 * auth.test.ts covers rejection of missing and unverifiable tokens. This file
 * covers what happens once a token *does* verify, which is where the dangerous
 * failures live: admitting a locked account, admitting an unverified email when
 * verification is required, or letting `optionalAuth` attach a user it should
 * have refused. A gate that fails open is worse than one that fails at all.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';

const { getUserById, isEmailVerificationRequired } = vi.hoisted(() => ({
  getUserById: vi.fn(),
  isEmailVerificationRequired: vi.fn()
}));

vi.mock('../services/AuthService.js', () => ({
  authService: { getUserById, isEmailVerificationRequired }
}));

const {
  requireAuth, requireRole, requireEmailVerified,
  optionalAuth, generateToken, verifyToken, isAccountLocked
} = await import('./auth.js');
const { authConfig } = await import('../config/index.js');

interface Captured {
  statusCode: number | null;
  body: Record<string, unknown> | null;
}

const makeRes = () => {
  const captured: Captured = { statusCode: null, body: null };
  const res = {
    status(code: number) { captured.statusCode = code; return res; },
    json(payload: unknown) { captured.body = payload as Record<string, unknown>; return res; }
  } as unknown as Response;
  return { res, captured };
};

const makeReq = (over: Record<string, unknown> = {}) =>
  ({ headers: {}, ...over }) as unknown as Request;

const bearer = (userId: number) =>
  `Bearer ${jwt.sign({ userId, email: 'a@b.co', role: 'user', type: 'access' }, authConfig.jwtSecret, { expiresIn: '1h' })}`;

const activeUser = {
  id: 1, name: 'Ada', email: 'a@b.co', role: 'user',
  email_verified: 1, account_locked_until: null
};

const inFuture = () => new Date(Date.now() + 60_000).toISOString();
const inPast = () => new Date(Date.now() - 60_000).toISOString();

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  isEmailVerificationRequired.mockResolvedValue(false);
  getUserById.mockResolvedValue(activeUser);
});

describe('requireAuth accept path', () => {
  it('admits a verified token and attaches the user', async () => {
    const req = makeReq({ headers: { authorization: bearer(1) } });
    const { res } = makeRes();
    const next = vi.fn();

    await requireAuth(req, res, next as unknown as NextFunction);

    expect(next).toHaveBeenCalled();
    expect(req.user).toMatchObject({ id: 1, email: 'a@b.co' });
  });

  it('looks the user up by the id inside the token, not one supplied by the caller', async () => {
    const req = makeReq({ headers: { authorization: bearer(42) }, body: { userId: 999 } });
    const { res } = makeRes();

    await requireAuth(req, res, vi.fn() as unknown as NextFunction);

    expect(getUserById).toHaveBeenCalledWith(42);
  });

  it('rejects a token for a user who no longer exists', async () => {
    // A deleted account must not keep working until its token expires.
    getUserById.mockResolvedValue(null);
    const req = makeReq({ headers: { authorization: bearer(1) } });
    const { res, captured } = makeRes();
    const next = vi.fn();

    await requireAuth(req, res, next as unknown as NextFunction);

    expect(captured.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('refuses a locked account with 423 rather than 401', async () => {
    getUserById.mockResolvedValue({ ...activeUser, account_locked_until: inFuture() });
    const req = makeReq({ headers: { authorization: bearer(1) } });
    const { res, captured } = makeRes();
    const next = vi.fn();

    await requireAuth(req, res, next as unknown as NextFunction);

    expect(captured.statusCode).toBe(423);
    expect(next).not.toHaveBeenCalled();
    expect(req.user).toBeUndefined();
  });

  it('admits an account whose lockout has expired', async () => {
    getUserById.mockResolvedValue({ ...activeUser, account_locked_until: inPast() });
    const req = makeReq({ headers: { authorization: bearer(1) } });
    const { res } = makeRes();
    const next = vi.fn();

    await requireAuth(req, res, next as unknown as NextFunction);

    expect(next).toHaveBeenCalled();
  });

  it('refuses an unverified email when verification is required', async () => {
    isEmailVerificationRequired.mockResolvedValue(true);
    getUserById.mockResolvedValue({ ...activeUser, email_verified: 0 });
    const req = makeReq({ headers: { authorization: bearer(1) } });
    const { res, captured } = makeRes();
    const next = vi.fn();

    await requireAuth(req, res, next as unknown as NextFunction);

    expect(captured.statusCode).toBe(403);
    expect(captured.body).toMatchObject({ requires_email_verification: true });
    expect(next).not.toHaveBeenCalled();
  });

  it('admits an unverified email when verification is not required', async () => {
    isEmailVerificationRequired.mockResolvedValue(false);
    getUserById.mockResolvedValue({ ...activeUser, email_verified: 0 });
    const req = makeReq({ headers: { authorization: bearer(1) } });
    const { res } = makeRes();
    const next = vi.fn();

    await requireAuth(req, res, next as unknown as NextFunction);

    expect(next).toHaveBeenCalled();
  });

  it('still authenticates when the verification setting cannot be read', async () => {
    // The setting lookup failing must not lock every user out.
    isEmailVerificationRequired.mockRejectedValue(new Error('settings unavailable'));
    const req = makeReq({ headers: { authorization: bearer(1) } });
    const { res } = makeRes();
    const next = vi.fn();

    await requireAuth(req, res, next as unknown as NextFunction);

    expect(next).toHaveBeenCalled();
  });

  it('answers 500 without admitting the request when the user store fails', async () => {
    getUserById.mockRejectedValue(new Error('database locked'));
    const req = makeReq({ headers: { authorization: bearer(1) } });
    const { res, captured } = makeRes();
    const next = vi.fn();

    await requireAuth(req, res, next as unknown as NextFunction);

    expect(next).not.toHaveBeenCalled();
    expect(captured.statusCode).toBeGreaterThanOrEqual(400);
  });

  it('rejects an expired token', async () => {
    const expired = jwt.sign(
      { userId: 1, email: 'a@b.co', role: 'user', type: 'access' },
      authConfig.jwtSecret,
      { expiresIn: '-1s' }
    );
    const req = makeReq({ headers: { authorization: `Bearer ${expired}` } });
    const { res, captured } = makeRes();
    const next = vi.fn();

    await requireAuth(req, res, next as unknown as NextFunction);

    expect(captured.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a token signed with a different secret', async () => {
    const forged = jwt.sign({ userId: 1, role: 'admin' }, 'not-the-secret');
    const req = makeReq({ headers: { authorization: `Bearer ${forged}` } });
    const { res, captured } = makeRes();
    const next = vi.fn();

    await requireAuth(req, res, next as unknown as NextFunction);

    expect(captured.statusCode).toBe(401);
    expect(getUserById).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });
});

describe('requireRole', () => {
  const runRole = (roles: Parameters<typeof requireRole>[0], user?: Record<string, unknown>) => {
    const req = makeReq(user ? { user } : {});
    const { res, captured } = makeRes();
    const next = vi.fn();
    requireRole(roles)(req, res, next as unknown as NextFunction);
    return { captured, next };
  };

  it('rejects an unauthenticated request', () => {
    const { captured, next } = runRole('admin');

    expect(captured.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('admits a user holding the single required role', () => {
    const { next } = runRole('admin', { role: 'admin' });

    expect(next).toHaveBeenCalled();
  });

  it('rejects a user without the required role', () => {
    const { captured, next } = runRole('admin', { role: 'user' });

    expect(captured.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('accepts any role from a list', () => {
    expect(runRole(['admin', 'user'], { role: 'user' }).next).toHaveBeenCalled();
    expect(runRole(['admin', 'user'], { role: 'admin' }).next).toHaveBeenCalled();
  });

  it('rejects a role outside the list', () => {
    const { captured } = runRole(['admin'], { role: 'user' });

    expect(captured.statusCode).toBe(403);
  });

  it('names the required roles in the refusal', () => {
    const { captured } = runRole(['admin', 'user'], { role: 'guest' as never });

    expect(String(captured.body?.error)).toMatch(/admin or user/);
  });
});

describe('requireEmailVerified', () => {
  const run = (user?: Record<string, unknown>) => {
    const req = makeReq(user ? { user } : {});
    const { res, captured } = makeRes();
    const next = vi.fn();
    requireEmailVerified(req, res, next as unknown as NextFunction);
    return { captured, next };
  };

  it('rejects an unauthenticated request', () => {
    expect(run().captured.statusCode).toBe(401);
  });

  it('admits a verified user', () => {
    expect(run({ email_verified: 1 }).next).toHaveBeenCalled();
  });

  it('rejects an unverified user', () => {
    const { captured, next } = run({ email_verified: 0 });

    expect(captured.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('optionalAuth', () => {
  it('continues without a user when no token is supplied', async () => {
    const req = makeReq();
    const { res } = makeRes();
    const next = vi.fn();

    await optionalAuth(req, res, next as unknown as NextFunction);

    expect(next).toHaveBeenCalled();
    expect(req.user).toBeUndefined();
    expect(getUserById).not.toHaveBeenCalled();
  });

  it('attaches the user when the token verifies', async () => {
    const req = makeReq({ headers: { authorization: bearer(1) } });
    const { res } = makeRes();
    const next = vi.fn();

    await optionalAuth(req, res, next as unknown as NextFunction);

    expect(req.user).toMatchObject({ id: 1 });
    expect(next).toHaveBeenCalled();
  });

  it('continues without a user when the token is bad, rather than failing the request', async () => {
    const req = makeReq({ headers: { authorization: 'Bearer garbage' } });
    const { res } = makeRes();
    const next = vi.fn();

    await optionalAuth(req, res, next as unknown as NextFunction);

    expect(req.user).toBeUndefined();
    expect(next).toHaveBeenCalled();
  });

  it('refuses to attach a locked account', async () => {
    // Optional auth is still auth: a locked user must not be recognised.
    getUserById.mockResolvedValue({ ...activeUser, account_locked_until: inFuture() });
    const req = makeReq({ headers: { authorization: bearer(1) } });
    const { res } = makeRes();
    const next = vi.fn();

    await optionalAuth(req, res, next as unknown as NextFunction);

    expect(req.user).toBeUndefined();
    expect(next).toHaveBeenCalled();
  });

  it('attaches a user whose lockout has expired', async () => {
    getUserById.mockResolvedValue({ ...activeUser, account_locked_until: inPast() });
    const req = makeReq({ headers: { authorization: bearer(1) } });
    const { res } = makeRes();

    await optionalAuth(req, res, vi.fn() as unknown as NextFunction);

    expect(req.user).toMatchObject({ id: 1 });
  });

  it('continues when the user store fails', async () => {
    getUserById.mockRejectedValue(new Error('database locked'));
    const req = makeReq({ headers: { authorization: bearer(1) } });
    const { res } = makeRes();
    const next = vi.fn();

    await optionalAuth(req, res, next as unknown as NextFunction);

    expect(next).toHaveBeenCalled();
    expect(req.user).toBeUndefined();
  });
});

describe('generateToken / verifyToken', () => {
  it('round-trips the identity claims', () => {
    const token = generateToken({ id: 5, email: 'ada@example.com', role: 'admin' });

    expect(verifyToken(token)).toMatchObject({
      userId: 5, email: 'ada@example.com', role: 'admin', type: 'access'
    });
  });

  it('marks the token as an access token, not a refresh token', () => {
    // A refresh token accepted as an access token would bypass expiry limits.
    expect(verifyToken(generateToken({ id: 5, email: 'a@b.co', role: 'user' })).type)
      .toBe('access');
  });

  it('issues a token that expires', () => {
    const decoded = jwt.decode(generateToken({ id: 5, email: 'a@b.co', role: 'user' })) as { exp: number; iat: number };

    expect(decoded.exp).toBeGreaterThan(decoded.iat);
  });

  it('refuses a token signed with another secret', () => {
    const forged = jwt.sign({ userId: 5, role: 'admin' }, 'not-the-secret');

    expect(() => verifyToken(forged)).toThrow();
  });

  it('refuses a tampered payload', () => {
    const token = generateToken({ id: 5, email: 'a@b.co', role: 'user' });
    const [header, , signature] = token.split('.');
    const tampered = Buffer.from(JSON.stringify({ userId: 5, role: 'admin' })).toString('base64url');

    expect(() => verifyToken(`${header}.${tampered}.${signature}`)).toThrow();
  });
});

describe('isAccountLocked', () => {
  it('reports a lock that has not expired', () => {
    expect(isAccountLocked({ account_locked_until: inFuture() } as never)).toBe(true);
  });

  it('reports an expired lock as clear', () => {
    expect(isAccountLocked({ account_locked_until: inPast() } as never)).toBe(false);
  });

  it('reports an unlocked account as clear', () => {
    expect(isAccountLocked({ account_locked_until: null } as never)).toBe(false);
  });
});
