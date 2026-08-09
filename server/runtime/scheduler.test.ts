/**
 * Scheduler tests.
 *
 * Recurring invoice generation ran from an OS crontab hitting an unauthenticated
 * endpoint, which neither IIS nor Hostinger can provide. Moving it in-process
 * needs a lease so two instances do not both work, and the lease must expire so
 * a SIGKILLed process does not hold its claim forever.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import type { IDatabase } from '../types/database.types.js';
import { acquireLease, releaseLease } from './scheduler.js';
import { sqliteDialect } from '../database/dialects/sqlite.dialect.js';

/** Minimal IDatabase surface backed by an in-memory SQLite database. */
const createTestDb = (): IDatabase => {
  const raw = new Database(':memory:');

  raw.exec(`
    CREATE TABLE scheduler_leases (
      job_name TEXT PRIMARY KEY,
      owner TEXT NOT NULL,
      acquired_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
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

const T0 = '2026-08-08T10:00:00.000Z';
const T_LATER = '2026-08-08T10:00:30.000Z';
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
