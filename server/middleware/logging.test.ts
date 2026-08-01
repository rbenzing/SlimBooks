/**
 * Logging middleware tests.
 *
 * Logging must never change what the application does: `requestLogger` and
 * `performanceMonitor` wrap `res.send` and hook `finish`, so a mistake here
 * silently drops response bodies or swallows requests. The monitors also decide
 * when an operator gets woken up, so their thresholds are worth pinning.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import type { Request, Response, NextFunction } from 'express';

const { loggingConfig } = vi.hoisted(() => ({
  loggingConfig: { enableRequestLogging: true, level: 'info' as string }
}));

vi.mock('../config/index.js', () => ({ loggingConfig }));

const {
  requestLogger, securityLogger, dbLogger, performanceMonitor,
  userActivityLogger, endpointTracker, errorRateMonitor, healthLogger
} = await import('./logging.js');

/** A response that behaves enough like Express's to drive the middleware. */
const makeRes = (statusCode = 200) => {
  const emitter = new EventEmitter();
  const sent: unknown[] = [];
  const res = Object.assign(emitter, {
    statusCode,
    send(data: unknown) { sent.push(data); return res; }
  }) as unknown as Response & { finish: () => void };
  (res as unknown as { finish: () => void }).finish = () => emitter.emit('finish');
  return { res, sent, emitter };
};

const makeReq = (over: Record<string, unknown> = {}) =>
  ({
    method: 'GET',
    url: '/api/invoices',
    path: '/api/invoices',
    ip: '203.0.113.9',
    connection: { remoteAddress: '203.0.113.9' },
    get: () => undefined,
    ...over
  }) as unknown as Request;

let logged: string[];
let warned: string[];

beforeEach(() => {
  vi.useFakeTimers();
  logged = [];
  warned = [];
  vi.spyOn(console, 'log').mockImplementation((...args) => { logged.push(args.join(' ')); });
  vi.spyOn(console, 'warn').mockImplementation((...args) => { warned.push(args.join(' ')); });
  loggingConfig.enableRequestLogging = true;
  loggingConfig.level = 'info';
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('requestLogger', () => {
  it('passes the request through', () => {
    const next = vi.fn();

    requestLogger(makeReq(), makeRes().res, next as unknown as NextFunction);

    expect(next).toHaveBeenCalled();
  });

  it('still delivers the response body it wrapped', () => {
    // Wrapping res.send incorrectly would silently drop every response.
    const { res, sent } = makeRes();

    requestLogger(makeReq(), res, vi.fn() as unknown as NextFunction);
    res.send('{"ok":true}');

    expect(sent).toEqual(['{"ok":true}']);
  });

  it('logs the method, url and status once the response is sent', () => {
    const { res } = makeRes(201);

    requestLogger(makeReq(), res, vi.fn() as unknown as NextFunction);
    res.send('{}');

    const line = logged.join('\n');
    expect(line).toMatch(/GET/);
    expect(line).toMatch(/\/api\/invoices/);
    expect(line).toMatch(/201/);
  });

  it('logs nothing until the response is actually sent', () => {
    requestLogger(makeReq(), makeRes().res, vi.fn() as unknown as NextFunction);

    expect(logged).toEqual([]);
  });

  it('does not wrap send at all when request logging is off', () => {
    loggingConfig.enableRequestLogging = false;
    const { res, sent } = makeRes();
    const originalSend = res.send;
    const next = vi.fn();

    requestLogger(makeReq(), res, next as unknown as NextFunction);

    expect(res.send).toBe(originalSend);
    expect(next).toHaveBeenCalled();

    res.send('body');
    expect(sent).toEqual(['body']);
    expect(logged).toEqual([]);
  });

  it('warns about a slow request', () => {
    const { res } = makeRes();

    requestLogger(makeReq(), res, vi.fn() as unknown as NextFunction);
    vi.advanceTimersByTime(1500);
    res.send('{}');

    expect(warned.join('\n')).toMatch(/slow request/i);
  });

  it('does not warn about a fast request', () => {
    const { res } = makeRes();

    requestLogger(makeReq(), res, vi.fn() as unknown as NextFunction);
    vi.advanceTimersByTime(50);
    res.send('{}');

    expect(warned).toEqual([]);
  });

  it('measures a buffer response by its byte length', () => {
    const { res } = makeRes();

    requestLogger(makeReq(), res, vi.fn() as unknown as NextFunction);
    res.send(Buffer.alloc(2048));

    expect(logged.join('\n')).toMatch(/2 KB/);
  });

  it('reports a zero-length body as 0 B', () => {
    const { res } = makeRes();

    requestLogger(makeReq(), res, vi.fn() as unknown as NextFunction);
    res.send('');

    expect(logged.join('\n')).toMatch(/0 B/);
  });

  it('falls back to a placeholder when the client sends no address', () => {
    const { res } = makeRes();
    const req = makeReq({ ip: undefined, connection: { remoteAddress: undefined } });

    requestLogger(req, res, vi.fn() as unknown as NextFunction);
    res.send('{}');

    expect(logged.join('\n')).toMatch(/unknown/);
  });
});

describe('performanceMonitor', () => {
  it('passes the request through', () => {
    const next = vi.fn();

    performanceMonitor()(makeReq(), makeRes().res, next as unknown as NextFunction);

    expect(next).toHaveBeenCalled();
  });

  it('reports the request count and average on the reporting interval', () => {
    const monitor = performanceMonitor();

    for (let i = 0; i < 3; i += 1) {
      const { res } = makeRes();
      monitor(makeReq(), res, vi.fn() as unknown as NextFunction);
      (res as unknown as { finish: () => void }).finish();
    }
    vi.advanceTimersByTime(5 * 60 * 1000);

    expect(logged.join('\n')).toMatch(/3 requests/);
  });

  it('counts a failed response as an error', () => {
    const monitor = performanceMonitor();
    const { res } = makeRes(500);

    monitor(makeReq(), res, vi.fn() as unknown as NextFunction);
    (res as unknown as { finish: () => void }).finish();
    vi.advanceTimersByTime(5 * 60 * 1000);

    expect(logged.join('\n')).toMatch(/1 errors/);
  });

  it('does not count a successful response as an error', () => {
    const monitor = performanceMonitor();
    const { res } = makeRes(200);

    monitor(makeReq(), res, vi.fn() as unknown as NextFunction);
    (res as unknown as { finish: () => void }).finish();
    vi.advanceTimersByTime(5 * 60 * 1000);

    expect(logged.join('\n')).toMatch(/0 errors/);
  });

  it('counts a slow response separately', () => {
    const monitor = performanceMonitor();
    const { res } = makeRes();

    monitor(makeReq(), res, vi.fn() as unknown as NextFunction);
    vi.advanceTimersByTime(1500);
    (res as unknown as { finish: () => void }).finish();
    vi.advanceTimersByTime(5 * 60 * 1000);

    expect(logged.join('\n')).toMatch(/1 slow/);
  });

  it('stays quiet through an idle interval', () => {
    performanceMonitor();

    vi.advanceTimersByTime(5 * 60 * 1000);

    expect(logged).toEqual([]);
  });

  it('resets its counters after reporting', () => {
    const monitor = performanceMonitor();
    const { res } = makeRes();

    monitor(makeReq(), res, vi.fn() as unknown as NextFunction);
    (res as unknown as { finish: () => void }).finish();
    vi.advanceTimersByTime(5 * 60 * 1000);
    logged.length = 0;

    vi.advanceTimersByTime(5 * 60 * 1000);

    expect(logged).toEqual([]);
  });
});

describe('errorRateMonitor', () => {
  const drive = (monitor: ReturnType<typeof errorRateMonitor>, statusCode: number, times: number) => {
    for (let i = 0; i < times; i += 1) {
      const { res } = makeRes(statusCode);
      monitor(makeReq(), res, vi.fn() as unknown as NextFunction);
      (res as unknown as { finish: () => void }).finish();
    }
  };

  it('passes the request through', () => {
    const next = vi.fn();

    errorRateMonitor()(makeReq(), makeRes().res, next as unknown as NextFunction);

    expect(next).toHaveBeenCalled();
  });

  it('stays quiet until the sample window is full', () => {
    // Alerting on the first few requests would page on every restart.
    const monitor = errorRateMonitor();

    drive(monitor, 500, 50);

    expect(warned).toEqual([]);
  });

  it('alerts once a full window exceeds the error threshold', () => {
    const monitor = errorRateMonitor();

    drive(monitor, 500, 100);

    expect(warned.join('\n')).toMatch(/high error rate/i);
  });

  it('stays quiet when a full window is healthy', () => {
    const monitor = errorRateMonitor();

    drive(monitor, 200, 100);

    expect(warned).toEqual([]);
  });

  it('stays quiet at an error rate below the threshold', () => {
    const monitor = errorRateMonitor();

    drive(monitor, 200, 95);
    drive(monitor, 500, 5);

    expect(warned).toEqual([]);
  });

  it('reports the rate it measured', () => {
    const monitor = errorRateMonitor();

    drive(monitor, 200, 50);
    drive(monitor, 500, 50);

    expect(warned.join('\n')).toMatch(/50\.0%/);
  });

  it('recovers once errors age out of the window', () => {
    // The window is a rolling 100, so recovery is gradual: warnings continue
    // until fewer than ten errors remain, then stop.
    const monitor = errorRateMonitor();
    drive(monitor, 500, 100);

    drive(monitor, 200, 100);
    warned.length = 0;
    drive(monitor, 200, 1);

    expect(warned).toEqual([]);
  });
});

describe('endpointTracker', () => {
  it('passes the request through', () => {
    const next = vi.fn();

    endpointTracker()(makeReq(), makeRes().res, next as unknown as NextFunction);

    expect(next).toHaveBeenCalled();
  });

  it('reports usage per endpoint on the reporting interval', () => {
    const tracker = endpointTracker();

    tracker(makeReq({ path: '/api/invoices' }), makeRes().res, vi.fn() as unknown as NextFunction);
    tracker(makeReq({ path: '/api/invoices' }), makeRes().res, vi.fn() as unknown as NextFunction);
    tracker(makeReq({ path: '/api/clients' }), makeRes().res, vi.fn() as unknown as NextFunction);
    vi.advanceTimersByTime(60 * 60 * 1000);

    const output = logged.join('\n');
    expect(output).toMatch(/GET \/api\/invoices: 2 requests/);
    expect(output).toMatch(/GET \/api\/clients: 1 requests/);
  });

  it('keeps the same path under different methods apart', () => {
    const tracker = endpointTracker();

    tracker(makeReq({ method: 'GET' }), makeRes().res, vi.fn() as unknown as NextFunction);
    tracker(makeReq({ method: 'POST' }), makeRes().res, vi.fn() as unknown as NextFunction);
    vi.advanceTimersByTime(60 * 60 * 1000);

    expect(logged.join('\n')).toMatch(/GET \/api\/invoices: 1/);
    expect(logged.join('\n')).toMatch(/POST \/api\/invoices: 1/);
  });

  it('prefers the route pattern over the concrete path', () => {
    // Otherwise every invoice id becomes its own endpoint in the report.
    const tracker = endpointTracker();

    tracker(
      makeReq({ path: '/api/invoices/7', route: { path: '/api/invoices/:id' } }),
      makeRes().res, vi.fn() as unknown as NextFunction
    );
    tracker(
      makeReq({ path: '/api/invoices/9', route: { path: '/api/invoices/:id' } }),
      makeRes().res, vi.fn() as unknown as NextFunction
    );
    vi.advanceTimersByTime(60 * 60 * 1000);

    expect(logged.join('\n')).toMatch(/GET \/api\/invoices\/:id: 2 requests/);
  });

  it('stays quiet through an idle interval', () => {
    endpointTracker();

    vi.advanceTimersByTime(60 * 60 * 1000);

    expect(logged).toEqual([]);
  });

  it('clears its counts after reporting', () => {
    const tracker = endpointTracker();
    tracker(makeReq(), makeRes().res, vi.fn() as unknown as NextFunction);
    vi.advanceTimersByTime(60 * 60 * 1000);
    logged.length = 0;

    vi.advanceTimersByTime(60 * 60 * 1000);

    expect(logged).toEqual([]);
  });
});

describe('event loggers', () => {
  it('marks a security event so it can be filtered out of the noise', () => {
    securityLogger('failed_login', { email: 'ada@example.com' });

    expect(logged.join('\n')).toMatch(/SECURITY: failed_login/);
  });

  it('records the acting user on an activity event', () => {
    userActivityLogger('invoice.deleted', 42, { invoiceId: 7 });

    expect(logged.join('\n')).toMatch(/USER: invoice\.deleted by user 42/);
  });

  it('logs database operations only at debug level', () => {
    loggingConfig.level = 'info';
    dbLogger('SELECT', 'invoices');
    expect(logged).toEqual([]);

    loggingConfig.level = 'debug';
    dbLogger('SELECT', 'invoices');
    expect(logged.join('\n')).toMatch(/DB: SELECT on invoices/);
  });
});

describe('healthLogger', () => {
  it('logs nothing immediately', () => {
    healthLogger();

    expect(logged).toEqual([]);
  });

  it('reports uptime and memory on its interval', () => {
    healthLogger();

    vi.advanceTimersByTime(10 * 60 * 1000);

    expect(logged.join('\n')).toMatch(/Health check: Uptime/);
    expect(logged.join('\n')).toMatch(/Memory/);
  });
});
