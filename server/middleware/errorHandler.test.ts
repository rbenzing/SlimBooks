/**
 * Error-handling middleware tests.
 *
 * Every API failure is shaped here, so this decides the status code clients
 * branch on and — importantly — whether internal details leak to the caller.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import {
  AppError,
  DatabaseError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  RateLimitError,
  errorHandler,
  asyncHandler,
  notFoundHandler
} from './errorHandler.js';

interface Captured {
  status: number | null;
  body: Record<string, unknown> | null;
}

const makeRes = () => {
  const captured: Captured = { status: null, body: null };
  const res = {
    status(code: number) { captured.status = code; return res; },
    json(payload: unknown) { captured.body = payload as Record<string, unknown>; return res; }
  } as unknown as Response;
  return { res, captured };
};

const req = {
  method: 'GET',
  originalUrl: '/api/test',
  ip: '127.0.0.1',
  headers: {},
  get: () => undefined
} as unknown as Request;
const next = (() => {}) as NextFunction;

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('error classes', () => {
  it('carries a status code and a timestamp', () => {
    const error = new AppError('boom', 418);
    expect(error.statusCode).toBe(418);
    expect(error.message).toBe('boom');
    expect(error.isOperational).toBe(true);
    expect(error.timestamp).toBeTruthy();
  });

  it('defaults to a 500', () => {
    expect(new AppError('boom').statusCode).toBe(500);
  });

  it('maps each subclass to the right status', () => {
    expect(new ValidationError('bad').statusCode).toBe(400);
    expect(new AuthenticationError('who').statusCode).toBe(401);
    expect(new AuthorizationError('nope').statusCode).toBe(403);
    expect(new NotFoundError('Invoice').statusCode).toBe(404);
    expect(new RateLimitError('slow down').statusCode).toBe(429);
    expect(new DatabaseError('db').statusCode).toBe(500);
  });

  it('names the missing resource in a NotFoundError', () => {
    expect(new NotFoundError('Invoice').message).toMatch(/invoice/i);
  });

  it('is a real Error, so instanceof and stack still work', () => {
    const error = new ValidationError('bad');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(AppError);
    expect(error.stack).toBeTruthy();
  });
});

describe('errorHandler', () => {
  it('renders an AppError with its own status and type', () => {
    const { res, captured } = makeRes();

    errorHandler(new ValidationError('Amount must be positive'), req, res, next);

    expect(captured.status).toBe(400);
    expect(captured.body).toMatchObject({
      success: false,
      error: 'Amount must be positive',
      type: 'VALIDATION_ERROR'
    });
  });

  it('reports a 404 for a NotFoundError', () => {
    const { res, captured } = makeRes();

    errorHandler(new NotFoundError('Invoice'), req, res, next);

    expect(captured.status).toBe(404);
  });

  it('translates a JWT error into a 401', () => {
    const { res, captured } = makeRes();
    const jwtError = Object.assign(new Error('bad signature'), { name: 'JsonWebTokenError' });

    errorHandler(jwtError, req, res, next);

    expect(captured.status).toBe(401);
    expect(captured.body).toMatchObject({ type: 'JWT_ERROR' });
  });

  it('distinguishes an expired token from an invalid one', () => {
    const { res, captured } = makeRes();
    const expired = Object.assign(new Error('jwt expired'), { name: 'TokenExpiredError' });

    errorHandler(expired, req, res, next);

    expect(captured.status).toBe(401);
    expect(captured.body).toMatchObject({ type: 'JWT_EXPIRED_ERROR' });
  });

  it('reports an oversized upload as a 400', () => {
    const { res, captured } = makeRes();
    const multerError = Object.assign(new Error('too big'), { code: 'LIMIT_FILE_SIZE' });

    errorHandler(multerError, req, res, next);

    expect(captured.status).toBe(400);
    expect(captured.body).toMatchObject({ type: 'FILE_SIZE_ERROR' });
  });

  it('reports malformed JSON as a 400', () => {
    const { res, captured } = makeRes();
    const parseError = Object.assign(new Error('bad json'), { type: 'entity.parse.failed' });

    errorHandler(parseError, req, res, next);

    expect(captured.status).toBe(400);
    expect(captured.body).toMatchObject({ type: 'PARSE_ERROR' });
  });

  it('handles a SQLite error without leaking the statement', () => {
    const { res, captured } = makeRes();
    const sqliteError = Object.assign(new Error('UNIQUE constraint failed: clients.email'), {
      code: 'SQLITE_CONSTRAINT_UNIQUE'
    });

    errorHandler(sqliteError, req, res, next);

    expect(captured.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(captured.body)).not.toMatch(/SELECT |INSERT INTO|UPDATE /i);
  });

  it('falls back to a 500 for an unrecognised error', () => {
    const { res, captured } = makeRes();

    errorHandler(new Error('something odd'), req, res, next);

    expect(captured.status).toBe(500);
    expect(captured.body).toMatchObject({ success: false });
  });

  it('always answers with success:false', () => {
    for (const error of [new ValidationError('a'), new Error('b'), new NotFoundError('c')]) {
      const { res, captured } = makeRes();
      errorHandler(error, req, res, next);
      expect(captured.body).toMatchObject({ success: false });
    }
  });
});

describe('asyncHandler', () => {
  it('passes a rejected promise to next() instead of crashing the process', async () => {
    const failing = asyncHandler(async () => { throw new ValidationError('async boom'); });
    const spy = vi.fn();

    await failing(req, makeRes().res, spy as unknown as NextFunction);

    expect(spy).toHaveBeenCalledWith(expect.any(ValidationError));
  });

  it('leaves next() alone when the handler resolves', async () => {
    const succeeding = asyncHandler(async () => undefined);
    const spy = vi.fn();

    await succeeding(req, makeRes().res, spy as unknown as NextFunction);

    expect(spy).not.toHaveBeenCalled();
  });
});

describe('notFoundHandler', () => {
  it('raises a 404 for an unmatched route', () => {
    const spy = vi.fn();
    const { res } = makeRes();

    notFoundHandler(req, res, spy as unknown as NextFunction);

    const [error] = spy.mock.calls[0] ?? [];
    expect(error).toBeInstanceOf(Error);
    expect((error as AppError).statusCode ?? 404).toBe(404);
  });
});
