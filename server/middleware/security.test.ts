/**
 * Security middleware tests.
 *
 * These are the settings that decide what an unauthenticated stranger can do:
 * how many times they may guess a password, which origins may call the API,
 * which headers the browser enforces, and how much of a server error they get
 * to read back. A default that quietly loosens is the failure to catch.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import type { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import {
  createGeneralRateLimit,
  createLoginRateLimit,
  createSecurityHeaders,
  createCorsOptions,
  validateRequest,
  validationRules,
  sanitizeSQL,
  errorHandler,
  requestLogger
} from './security.js';

interface Captured {
  statusCode: number | null;
  body: Record<string, unknown> | null;
}

const makeRes = () => {
  const captured: Captured = { statusCode: null, body: null };
  const res = {
    statusCode: 200,
    status(code: number) { captured.statusCode = code; return res; },
    json(payload: unknown) { captured.body = payload as Record<string, unknown>; return res; },
    send(data: unknown) { return data as never; }
  } as unknown as Response;
  return { res, captured };
};

const makeReq = (over: Record<string, unknown> = {}) =>
  ({ method: 'GET', path: '/api/invoices', headers: {}, ...over }) as unknown as Request;

const env = { ...process.env };

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  process.env = { ...env };
  vi.restoreAllMocks();
});

describe('rate limiting', () => {
  /**
   * Drives a limiter for real: the same caller hits it `times` times and we
   * report what the last call did. Exercising the middleware rather than
   * reading its config is the only way to know the limit actually engages.
   */
  const hit = async (
    limiter: ReturnType<typeof createGeneralRateLimit>,
    times: number,
    over: Record<string, unknown> = {},
    /** Status the route replies with when the limiter lets the call through. */
    downstreamStatus = 200
  ) => {
    let captured: Captured = { statusCode: null, body: null };
    let passed = 0;

    for (let i = 0; i < times; i += 1) {
      const state: Captured = { statusCode: null, body: null };
      let settle: () => void = () => {};
      const done = new Promise<void>(resolve => { settle = resolve; });

      // express-rate-limit writes RateLimit-* headers and, when configured to
      // skip successful requests, waits on the response's 'finish' event — so
      // the mock needs both a header surface and an EventEmitter.
      const emitter = new EventEmitter();
      const res = Object.assign(emitter, {
        statusCode: 200,
        headersSent: false,
        setHeader() { return res; },
        getHeader() { return undefined; },
        removeHeader() { return res; },
        status(code: number) { (res as { statusCode: number }).statusCode = code; state.statusCode = code; return res; },
        json(payload: unknown) { state.body = payload as Record<string, unknown>; emitter.emit('finish'); settle(); return res; },
        send(payload: unknown) { state.body = payload as Record<string, unknown>; emitter.emit('finish'); settle(); return res; },
        end() { emitter.emit('finish'); settle(); return res; }
      }) as unknown as Response;

      const req = makeReq({ ip: '203.0.113.9', ...over });
      limiter(req, res, (() => {
        passed += 1;
        (res as { statusCode: number }).statusCode = downstreamStatus;
        emitter.emit('finish');
        settle();
      }) as NextFunction);

      // The limiter is stateful, so the calls have to be sequential.
      await done;
      captured = state;
    }

    return { captured, passed };
  };

  it('lets traffic through below the limit', async () => {
    const { passed, captured } = await hit(createGeneralRateLimit(60_000, 3), 3);

    expect(passed).toBe(3);
    expect(captured.statusCode).toBeNull();
  });

  it('answers 429 with a retry hint once the general limit is exceeded', async () => {
    const { captured } = await hit(createGeneralRateLimit(60_000, 2), 3);

    expect(captured.statusCode).toBe(429);
    expect(captured.body).toMatchObject({ success: false, retryAfter: 60 });
  });

  it('answers 429 with a login-specific message after repeated failures', async () => {
    const { captured } = await hit(
      createLoginRateLimit(900_000, 1), 2, { path: '/api/auth/login' }, 401
    );

    expect(captured.statusCode).toBe(429);
    expect(String(captured.body?.error)).toMatch(/login attempts/i);
  });

  it('does not count successful logins against the limit', async () => {
    // Otherwise a shared office IP locks out everyone who logs in normally.
    const { passed, captured } = await hit(
      createLoginRateLimit(900_000, 1), 5, { path: '/api/auth/login' }, 200
    );

    expect(passed).toBe(5);
    expect(captured.statusCode).toBeNull();
  });

  it('exempts health checks so monitoring cannot lock itself out', async () => {
    // A rate-limited health endpoint makes an overloaded server look dead.
    const limiter = createGeneralRateLimit(60_000, 1);
    const { passed, captured } = await hit(limiter, 5, { path: '/api/health' });

    expect(passed).toBe(5);
    expect(captured.statusCode).toBeNull();
  });

  it('does not exempt an ordinary endpoint', async () => {
    const { captured } = await hit(createGeneralRateLimit(60_000, 1), 3, { path: '/api/invoices' });

    expect(captured.statusCode).toBe(429);
  });

  it('limits each caller separately', async () => {
    const limiter = createGeneralRateLimit(60_000, 1);
    await hit(limiter, 2, { ip: '203.0.113.1' });

    const other = await hit(limiter, 1, { ip: '198.51.100.7' });

    expect(other.passed).toBe(1);
    expect(other.captured.statusCode).toBeNull();
  });
});

describe('security headers', () => {
  it('produces a usable middleware', () => {
    expect(typeof createSecurityHeaders()).toBe('function');
  });

  it('sets the headers a browser enforces', async () => {
    const applied: Record<string, string> = {};
    const res = {
      setHeader: (name: string, value: string) => { applied[name.toLowerCase()] = String(value); },
      getHeader: () => undefined,
      removeHeader: () => {}
    } as unknown as Response;

    await new Promise<void>(resolve => {
      createSecurityHeaders()(makeReq(), res, (() => resolve()) as NextFunction);
    });

    expect(applied['content-security-policy']).toBeTruthy();
    expect(applied['strict-transport-security']).toBeTruthy();
  });

  it('forbids inline script and plugin content in the policy', async () => {
    // 'unsafe-inline' on scriptSrc would undo most of the XSS protection.
    const applied: Record<string, string> = {};
    const res = {
      setHeader: (name: string, value: string) => { applied[name.toLowerCase()] = String(value); },
      getHeader: () => undefined,
      removeHeader: () => {}
    } as unknown as Response;

    await new Promise<void>(resolve => {
      createSecurityHeaders()(makeReq(), res, (() => resolve()) as NextFunction);
    });

    const csp = applied['content-security-policy'];
    expect(csp).toMatch(/script-src 'self'/);
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(csp).toMatch(/object-src 'none'/);
    expect(csp).toMatch(/frame-src 'none'/);
  });

  it('asks browsers to remember HTTPS for a year', async () => {
    const applied: Record<string, string> = {};
    const res = {
      setHeader: (name: string, value: string) => { applied[name.toLowerCase()] = String(value); },
      getHeader: () => undefined,
      removeHeader: () => {}
    } as unknown as Response;

    await new Promise<void>(resolve => {
      createSecurityHeaders()(makeReq(), res, (() => resolve()) as NextFunction);
    });

    expect(applied['strict-transport-security']).toMatch(/max-age=31536000/);
    expect(applied['strict-transport-security']).toMatch(/includeSubDomains/);
  });
});

describe('CORS options', () => {
  it('never defaults to allowing every origin', () => {
    // `origin: '*'` with credentials would expose the API to any site.
    const options = createCorsOptions();

    expect(options.origin).not.toBe('*');
    expect(options.origin).not.toBe(true);
  });

  it('allows only the methods the API implements', () => {
    const options = createCorsOptions();

    expect(options.methods).toEqual(['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']);
    expect(options.methods).not.toContain('TRACE');
    expect(options.methods).not.toContain('PATCH');
  });

  it('allows only the headers the client actually sends', () => {
    expect(createCorsOptions().allowedHeaders).toEqual(['Content-Type', 'Authorization']);
  });

  it('honours an explicit origin and credential setting', () => {
    const options = createCorsOptions('https://books.example.com', false);

    expect(options.origin).toBe('https://books.example.com');
    expect(options.credentials).toBe(false);
  });

  it('caps the preflight cache at a day', () => {
    expect(createCorsOptions().maxAge).toBe(86400);
  });
});

describe('validateRequest', () => {
  it('passes a request with no validation errors', () => {
    const req = makeReq();
    const { res, captured } = makeRes();
    const next = vi.fn();

    validateRequest(req, res, next as unknown as NextFunction);

    expect(next).toHaveBeenCalled();
    expect(captured.statusCode).toBeNull();
  });
});

describe('SQL validation rules', () => {
  /** Runs a validation chain against a body and reports whether it rejected. */
  const rejects = async (rule: typeof validationRules.sql, sql: string) => {
    const req = { body: { sql }, headers: {}, cookies: {}, params: {}, query: {} } as unknown as Request;
    await rule.run(req);
    return !validationResult(req).isEmpty();
  };

  it('blocks destructive statements on read-only endpoints', async () => {
    for (const statement of [
      'DROP TABLE invoices',
      'DELETE FROM clients',
      'TRUNCATE payments',
      'ALTER TABLE users ADD COLUMN x TEXT',
      'CREATE TABLE evil (id INT)',
      'UPDATE users SET role = "admin"',
      'INSERT INTO users VALUES (1)'
    ]) {
      await expect(rejects(validationRules.sql, statement)).resolves.toBe(true);
    }
  });

  it('blocks them regardless of casing or spacing', async () => {
    await expect(rejects(validationRules.sql, 'drop    table invoices')).resolves.toBe(true);
    await expect(rejects(validationRules.sql, 'Delete\tFrom clients')).resolves.toBe(true);
  });

  it('allows an ordinary read', async () => {
    await expect(rejects(validationRules.sql, 'SELECT * FROM invoices WHERE id = ?')).resolves.toBe(false);
  });

  it('still blocks the irreversible statements on write endpoints', async () => {
    for (const statement of [
      'DROP TABLE invoices',
      'DROP DATABASE slimbooks',
      'TRUNCATE payments',
      'CREATE TABLE evil (id INT)'
    ]) {
      await expect(rejects(validationRules.sqlWrite, statement)).resolves.toBe(true);
    }
  });

  it('permits ordinary writes on write endpoints', async () => {
    await expect(rejects(validationRules.sqlWrite, 'UPDATE invoices SET status = ?')).resolves.toBe(false);
    await expect(rejects(validationRules.sqlWrite, 'INSERT INTO invoices VALUES (?)')).resolves.toBe(false);
  });

  it('rejects a settings key that is not a plain identifier', async () => {
    const check = async (key: string) => {
      const req = { body: { key }, headers: {}, cookies: {}, params: {}, query: {} } as unknown as Request;
      await validationRules.settingsKey.run(req);
      return !validationResult(req).isEmpty();
    };

    await expect(check('general.theme')).resolves.toBe(false);
    await expect(check('data/../../etc/passwd')).resolves.toBe(true);
    await expect(check('key with spaces')).resolves.toBe(true);
    await expect(check('')).resolves.toBe(true);
  });
});

describe('fileSize', () => {
  it('passes a request with no upload', () => {
    const next = vi.fn();
    const { res, captured } = makeRes();

    validationRules.fileSize()(makeReq(), res, next as unknown as NextFunction);

    expect(next).toHaveBeenCalled();
    expect(captured.statusCode).toBeNull();
  });

  it('passes an upload within the limit', () => {
    const next = vi.fn();
    const { res } = makeRes();

    validationRules.fileSize(1024)(
      makeReq({ file: { size: 512 } }), res, next as unknown as NextFunction
    );

    expect(next).toHaveBeenCalled();
  });

  it('rejects an oversized upload and says the limit', () => {
    const next = vi.fn();
    const { res, captured } = makeRes();

    validationRules.fileSize(2 * 1024 * 1024)(
      makeReq({ file: { size: 3 * 1024 * 1024 } }), res, next as unknown as NextFunction
    );

    expect(captured.statusCode).toBe(400);
    expect(String(captured.body?.error)).toMatch(/2MB/);
    expect(next).not.toHaveBeenCalled();
  });

  it('defaults to a ten megabyte cap', () => {
    const next = vi.fn();
    const { res, captured } = makeRes();

    validationRules.fileSize()(
      makeReq({ file: { size: 11 * 1024 * 1024 } }), res, next as unknown as NextFunction
    );

    expect(captured.statusCode).toBe(400);
    expect(String(captured.body?.error)).toMatch(/10MB/);
  });
});

describe('sanitizeSQL', () => {
  it('strips quotes and backslashes from string parameters', () => {
    const result = sanitizeSQL('SELECT * FROM clients WHERE name = ?', [`O'Brien "Co" \\x`]);

    expect(result.params).toEqual(['OBrien Co x']);
  });

  it('leaves non-string parameters untouched', () => {
    const result = sanitizeSQL('SELECT ?, ?, ?', [42, true, null]);

    expect(result.params).toEqual([42, true, null]);
  });

  it('returns the query unchanged', () => {
    const query = 'SELECT * FROM invoices WHERE id = ?';

    expect(sanitizeSQL(query, []).query).toBe(query);
  });

  it('handles a call with no parameters', () => {
    expect(sanitizeSQL('SELECT 1').params).toEqual([]);
  });
});

describe('errorHandler', () => {
  it('hides the message outside development', () => {
    // A stack trace or SQL fragment in a production response is a disclosure.
    process.env.NODE_ENV = 'production';
    const { res, captured } = makeRes();

    errorHandler(new Error('SELECT * FROM users failed'), makeReq(), res, vi.fn() as unknown as NextFunction);

    expect(captured.statusCode).toBe(500);
    expect(captured.body).toEqual({ success: false, error: 'Internal server error' });
    expect(JSON.stringify(captured.body)).not.toMatch(/SELECT/);
  });

  it('includes no stack outside development', () => {
    process.env.NODE_ENV = 'production';
    const { res, captured } = makeRes();

    errorHandler(new Error('boom'), makeReq(), res, vi.fn() as unknown as NextFunction);

    expect(captured.body).not.toHaveProperty('stack');
  });

  it('shows the detail in development', () => {
    process.env.NODE_ENV = 'development';
    const { res, captured } = makeRes();

    errorHandler(new Error('boom'), makeReq(), res, vi.fn() as unknown as NextFunction);

    expect(captured.body).toMatchObject({ error: 'boom' });
    expect(captured.body).toHaveProperty('stack');
  });

  it('honours a status carried on the error', () => {
    process.env.NODE_ENV = 'production';
    const { res, captured } = makeRes();
    const notFound = Object.assign(new Error('missing'), { status: 404 });

    errorHandler(notFound, makeReq(), res, vi.fn() as unknown as NextFunction);

    expect(captured.statusCode).toBe(404);
  });

  it('falls back to 500 for an error with no status', () => {
    const { res, captured } = makeRes();

    errorHandler(new Error('boom'), makeReq(), res, vi.fn() as unknown as NextFunction);

    expect(captured.statusCode).toBe(500);
  });
});

describe('requestLogger', () => {
  it('passes the request straight through', () => {
    const next = vi.fn();
    const { res } = makeRes();

    requestLogger(makeReq(), res, next as unknown as NextFunction);

    expect(next).toHaveBeenCalled();
  });

  it('still delivers the body it wrapped', () => {
    // Wrapping res.send incorrectly would silently drop every response body.
    const sent: unknown[] = [];
    const res = {
      statusCode: 200,
      send: (data: unknown) => { sent.push(data); return res; }
    } as unknown as Response;

    requestLogger(makeReq(), res, vi.fn() as unknown as NextFunction);
    res.send('{"ok":true}');

    expect(sent).toEqual(['{"ok":true}']);
  });
});
