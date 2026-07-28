/**
 * Authentication middleware tests.
 *
 * `security.ts` used to export same-named `requireAuth`/`requireAdmin` stubs
 * that accepted any non-empty bearer token and let every caller through. They
 * were unreferenced, but a single mistaken import would have disabled auth on
 * whatever route used it. These tests pin the real behaviour: the middleware
 * exported from the barrel must reject missing, malformed and unverifiable
 * tokens, and must not treat a non-admin as an admin.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

const { getUserById, isEmailVerificationRequired } = vi.hoisted(() => ({
  getUserById: vi.fn(),
  isEmailVerificationRequired: vi.fn()
}));

vi.mock('../services/AuthService.js', () => ({
  authService: { getUserById, isEmailVerificationRequired }
}));

import { requireAuth, requireAdmin } from './index.js';

interface MockResponse {
  statusCode: number | null;
  body: unknown;
  status: (code: number) => MockResponse;
  json: (payload: unknown) => MockResponse;
}

const makeRes = (): MockResponse => {
  const res: MockResponse = {
    statusCode: null,
    body: null,
    status(code: number) { res.statusCode = code; return res; },
    json(payload: unknown) { res.body = payload; return res; }
  };
  return res;
};

const makeReq = (authorization?: string) =>
  ({ headers: authorization ? { authorization } : {} }) as unknown as Request;

beforeEach(() => {
  vi.clearAllMocks();
  isEmailVerificationRequired.mockResolvedValue(false);
});

describe('requireAuth', () => {
  it('rejects a request with no Authorization header', async () => {
    const res = makeRes();
    const next = vi.fn() as unknown as NextFunction;

    await requireAuth(makeReq(), res as unknown as Response, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it('rejects a bearer token that is not a valid JWT', async () => {
    const res = makeRes();
    const next = vi.fn() as unknown as NextFunction;

    // The removed stub accepted exactly this and called next().
    await requireAuth(makeReq('Bearer not-a-real-jwt'), res as unknown as Response, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(getUserById).not.toHaveBeenCalled();
  });

  it('rejects a structurally plausible but unsigned token', async () => {
    const res = makeRes();
    const next = vi.fn() as unknown as NextFunction;
    const forged = `${btoa('{"alg":"none"}')}.${btoa('{"userId":1}')}.`;

    await requireAuth(makeReq(`Bearer ${forged}`), res as unknown as Response, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it('never consults the user store for an unverifiable token', async () => {
    const res = makeRes();
    const next = vi.fn() as unknown as NextFunction;

    await requireAuth(makeReq('Bearer abc.def.ghi'), res as unknown as Response, next);

    expect(getUserById).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });
});

describe('requireAdmin', () => {
  it('rejects an unauthenticated request', () => {
    const res = makeRes();
    const next = vi.fn() as unknown as NextFunction;

    requireAdmin(makeReq(), res as unknown as Response, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it('rejects an authenticated non-admin', () => {
    const res = makeRes();
    const next = vi.fn() as unknown as NextFunction;
    const req = { headers: {}, user: { id: 2, role: 'user' } } as unknown as Request;

    // The removed stub called next() unconditionally here.
    requireAdmin(req, res as unknown as Response, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });

  it('admits an admin', () => {
    const res = makeRes();
    const next = vi.fn() as unknown as NextFunction;
    const req = { headers: {}, user: { id: 1, role: 'admin' } } as unknown as Request;

    requireAdmin(req, res as unknown as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBeNull();
  });
});
