/**
 * Scheduler tests.
 *
 * Recurring invoice generation ran from an OS crontab hitting an unauthenticated
 * endpoint, which neither IIS nor Hostinger can provide. Moving it in-process
 * needs a lease so two instances do not both work, and the lease must expire so
 * a SIGKILLed process does not hold its claim forever.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import type { IDatabase } from '../types/database.types.js';
import { acquireLease, releaseLease, createScheduler } from './scheduler.js';
import { sqliteDialect } from '../database/dialects/sqlite.dialect.js';

/** Minimal IDatabase surface backed by an in-memory SQLite database. */
const createTestDb = (): IDatabase => {
  const raw = new Database(':memory:');

  raw.exec(`
    CREATE TABLE scheduler_leases (
      job_name TEXT PRIMARY KEY,
      owner TEXT NOT NULL,
      acquired_at TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    )
  `);

  return {
    // The real dialect: acquireLease builds its statement from it, so a stub
    // would test a statement no backend ever runs.
    dialect: sqliteDialect,
    executeQuery: async (query: string, params: unknown[] = []) => {
      const info = raw.prepare(query).run(...(params as never[]));
      return { changes: info.changes, lastInsertRowid: Number(info.lastInsertRowid) };
    },
    getOne: async <T>(query: string, params: unknown[] = []) =>
      (raw.prepare(query).get(...(params as never[])) ?? null) as T | null,
    getMany: async <T>(query: string, params: unknown[] = []) =>
      raw.prepare(query).all(...(params as never[])) as T[]
  } as unknown as IDatabase;
};

let db: IDatabase;

const T0 = Date.parse('2026-08-08T10:00:00.000Z');
const T_LATER = Date.parse('2026-08-08T10:00:30.000Z');
const T_AFTER_EXPIRY = '2026-08-08T11:00:01.000Z';

beforeEach(() => {
  db = createTestDb();
});

describe('acquireLease', () => {
  it('grants an unheld lease', async () => {
    expect(await acquireLease(db, 'recurring', 'owner-a', 3_600_000, T0)).toBe(true);
  });

  it('refuses a lease another owner already holds', async () => {
    await acquireLease(db, 'recurring', 'owner-a', 3_600_000, T0);

    expect(await acquireLease(db, 'recurring', 'owner-b', 3_600_000, T_LATER)).toBe(false);
  });

  it('reclaims a lease whose holder died without releasing it', async () => {
    await acquireLease(db, 'recurring', 'owner-a', 3_600_000, T0);

    expect(await acquireLease(db, 'recurring', 'owner-b', 3_600_000, T_AFTER_EXPIRY)).toBe(true);
  });

  it('lets the same owner renew its own lease', async () => {
    await acquireLease(db, 'recurring', 'owner-a', 3_600_000, T0);

    expect(await acquireLease(db, 'recurring', 'owner-a', 3_600_000, T_LATER)).toBe(true);
  });

  it('keeps leases for different jobs independent', async () => {
    await acquireLease(db, 'recurring', 'owner-a', 3_600_000, T0);

    expect(await acquireLease(db, 'backup', 'owner-b', 3_600_000, T0)).toBe(true);
  });
});

describe('releaseLease', () => {
  it('frees the lease for another owner immediately', async () => {
    await acquireLease(db, 'recurring', 'owner-a', 3_600_000, T0);
    await releaseLease(db, 'recurring', 'owner-a');

    expect(await acquireLease(db, 'recurring', 'owner-b', 3_600_000, T_LATER)).toBe(true);
  });

  it('ignores a release from an owner that does not hold the lease', async () => {
    await acquireLease(db, 'recurring', 'owner-a', 3_600_000, T0);
    await releaseLease(db, 'recurring', 'owner-b');

    expect(await acquireLease(db, 'recurring', 'owner-c', 3_600_000, T_LATER)).toBe(false);
  });
});

/**
 * The tick loop.
 *
 * A scheduled job failing is ordinary. The scheduler taking the server down
 * with it is not — and that is what happened: the lease calls sat outside the
 * try, nothing awaited the promise setInterval discarded, and a database blip
 * during acquireLease became an unhandled rejection that terminated the
 * process. stop() awaits that same promise, so a rejecting stop() is the
 * observable form of the crash.
 */
describe('createScheduler tick loop', () => {
  const OPTIONS = { intervalMs: 60_000, leaseTtlMs: 3_600_000, initialDelayMs: 1_000 };

  /** A database that fails every call, standing in for a connection blip. */
  const brokenDb = (): IDatabase => ({
    dialect: sqliteDialect,
    executeQuery: () => Promise.reject(new Error('connection lost')),
    getOne: () => Promise.reject(new Error('connection lost')),
    getMany: () => Promise.reject(new Error('connection lost'))
  } as unknown as IDatabase);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  /** Start, fire the initial tick, and wait for the run it kicked off. */
  const runOneTick = async (scheduler: ReturnType<typeof createScheduler>): Promise<void> => {
    scheduler.start();
    await vi.advanceTimersByTimeAsync(OPTIONS.initialDelayMs);
    await scheduler.stop();
  };

  it('survives a database failure while acquiring a lease', async () => {
    const scheduler = createScheduler(brokenDb(), [{ name: 'recurring', run: async () => {} }], OPTIONS);

    await expect(runOneTick(scheduler)).resolves.toBeUndefined();
  });

  it('runs later jobs after an earlier one throws', async () => {
    const ran: string[] = [];
    const scheduler = createScheduler(db, [
      { name: 'first', run: async () => { ran.push('first'); throw new Error('job blew up'); } },
      { name: 'second', run: async () => { ran.push('second'); } }
    ], OPTIONS);

    await runOneTick(scheduler);

    expect(ran).toEqual(['first', 'second']);
  });

  it('releases the lease of a job that threw', async () => {
    const scheduler = createScheduler(db, [
      { name: 'recurring', run: async () => { throw new Error('job blew up'); } }
    ], OPTIONS);

    await runOneTick(scheduler);

    // A lease still held here would lock the job out until its TTL lapsed.
    expect(await acquireLease(db, 'recurring', 'someone-else', 3_600_000, T_LATER)).toBe(true);
  });
});
