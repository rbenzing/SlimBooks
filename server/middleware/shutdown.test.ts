/**
 * Shutdown sequencing.
 *
 * Two defects live in 2.6.0 development, both about the same thing — a single
 * shutdown path that other modules were allowed to pre-empt or short-circuit:
 *
 *  - PdfService registered its own SIGINT/SIGTERM handlers that closed the
 *    browser and then called process.exit(0). Closing a browser finishes long
 *    before draining HTTP connections, so that handler won the race and the
 *    real shutdown never reached its WAL checkpoint.
 *  - Every step here shared one try block, so a scheduler that failed to stop
 *    skipped the checkpoint too.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Server } from 'node:http';
import type { Database } from 'better-sqlite3';
import { registerShutdown } from './errorHandler.js';

/** The close callback the fake server was handed, so the test can await it. */
let serverClosed: (() => Promise<void>) | null = null;

const fakeServer = (): Server => ({
  close: (callback: () => Promise<void>) => { serverClosed = callback; }
} as unknown as Server);

const pragma = vi.fn();
const dbClose = vi.fn();
const fakeDb = (): Database => ({ pragma, close: dbClose } as unknown as Database);

/** Invoke the SIGTERM listener registerShutdown just added, without signalling. */
const triggerShutdown = async (): Promise<void> => {
  const listeners = process.listeners('SIGTERM');
  const handler = listeners[listeners.length - 1];

  (handler as () => void)();

  expect(serverClosed).not.toBeNull();
  await serverClosed?.();
};

let signalsBefore: number;

beforeEach(() => {
  serverClosed = null;
  signalsBefore = process.listeners('SIGTERM').length;
  vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  // registerShutdown attaches to the real process; leaving them on leaks
  // handlers into every later test in this file.
  const listeners = process.listeners('SIGTERM');
  for (const extra of listeners.slice(signalsBefore)) {
    process.off('SIGTERM', extra as () => void);
    process.off('SIGINT', extra as () => void);
  }
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('registerShutdown', () => {
  it('checkpoints the WAL even when the scheduler fails to stop', async () => {
    const scheduler = { stop: () => Promise.reject(new Error('lease stuck')) };

    registerShutdown(fakeServer(), fakeDb(), scheduler);
    await triggerShutdown();

    expect(pragma).toHaveBeenCalledWith('wal_checkpoint(TRUNCATE)');
    expect(dbClose).toHaveBeenCalled();
  });

  it('checkpoints the WAL even when a closer throws', async () => {
    const closers = [{ what: 'pdf browser', close: () => Promise.reject(new Error('browser gone')) }];

    registerShutdown(fakeServer(), fakeDb(), null, closers);
    await triggerShutdown();

    expect(pragma).toHaveBeenCalledWith('wal_checkpoint(TRUNCATE)');
  });

  it('runs registered closers, so the browser is released by this path and not its own', async () => {
    const close = vi.fn(() => Promise.resolve());

    registerShutdown(fakeServer(), fakeDb(), null, [{ what: 'pdf browser', close }]);
    await triggerShutdown();

    expect(close).toHaveBeenCalled();
  });

  it('runs closers before the database is closed', async () => {
    const order: string[] = [];
    pragma.mockImplementation(() => { order.push('checkpoint'); });

    registerShutdown(fakeServer(), fakeDb(), null, [
      { what: 'pdf browser', close: async () => { order.push('pdf'); } }
    ]);
    await triggerShutdown();

    expect(order).toEqual(['pdf', 'checkpoint']);
  });

  it('ignores a second signal once shutdown is under way', async () => {
    registerShutdown(fakeServer(), fakeDb(), null);

    const listeners = process.listeners('SIGTERM');
    const handler = listeners[listeners.length - 1] as () => void;

    handler();
    const first = serverClosed;
    serverClosed = null;
    handler();

    expect(first).not.toBeNull();
    expect(serverClosed).toBeNull();
  });
});
