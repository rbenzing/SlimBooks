import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { claimExclusive } from './claim.util.js';
import { sqliteDialect } from './dialects/sqlite.dialect.js';
import type { IDatabase } from '../types/database.types.js';

let raw: Database.Database;
let db: IDatabase;

const adapt = (database: Database.Database): IDatabase =>
  ({
    dialect: sqliteDialect,
    executeQuery: async (query: string, params: unknown[] = []) => {
      const info = database.prepare(query).run(...(params as never[]));
      return { changes: info.changes, lastInsertRowid: Number(info.lastInsertRowid) };
    },
    getOne: async <T>(query: string, params: unknown[] = []) =>
      (database.prepare(query).get(...(params as never[])) ?? null) as T | null
  }) as unknown as IDatabase;

beforeEach(() => {
  raw = new Database(':memory:');
  raw.exec(`
    CREATE TABLE leases (
      job_name TEXT PRIMARY KEY,
      owner TEXT NOT NULL,
      expires_at TEXT NOT NULL
    )
  `);
  db = adapt(raw);
});

afterEach(() => {
  raw.close();
});

/**
 * Fixture timestamps are zero-padded because both engines compare these columns
 * as text: 'T5' sorts after 'T10', which silently inverts every expiry check.
 * Real values are ISO-8601, which is sortable by construction.
 */
const claim = (owner: string, expiresAt: string, now: string, alsoOwner = true) =>
  claimExclusive(db, {
    table: 'leases',
    keyColumn: 'job_name',
    keyValue: 'recurring',
    ownerColumn: 'owner',
    owner,
    values: { owner, expires_at: expiresAt },
    takeoverCondition: alsoOwner ? 'expires_at <= ? OR owner = ?' : 'expires_at <= ?',
    takeoverParams: alsoOwner ? [now, owner] : [now]
  });

const ownerOf = (): string | undefined =>
  (raw.prepare('SELECT owner FROM leases WHERE job_name = ?').get('recurring') as
    | { owner: string }
    | undefined)?.owner;

describe('claimExclusive', () => {
  it('grants the claim when no row exists', async () => {
    expect(await claim('A', 'T09', 'T00')).toBe(true);
    expect(ownerOf()).toBe('A');
  });

  it('refuses a claim someone else holds and has not let lapse', async () => {
    await claim('A', 'T09', 'T00');

    expect(await claim('B', 'T09', 'T00')).toBe(false);
    expect(ownerOf()).toBe('A');
  });

  it('grants the claim once the existing one has lapsed', async () => {
    await claim('A', 'T05', 'T00');

    expect(await claim('B', 'T20', 'T10')).toBe(true);
    expect(ownerOf()).toBe('B');
  });

  it('lets the holder renew before expiry', async () => {
    await claim('A', 'T09', 'T00');

    expect(await claim('A', 'T19', 'T01')).toBe(true);
    expect(ownerOf()).toBe('A');
  });

  it('tells the holder it still holds the claim after a byte-identical rewrite', async () => {
    // MySQL counts rows CHANGED, not matched — "if you set a column to the
    // value it currently has, MySQL notices this and does not update it" — so a
    // renewal with identical values reports zero rows there and one row on
    // SQLite. Without the confirming read the holder would be told it had lost
    // its own lease, on one backend only.
    await claim('A', 'T09', 'T00');

    expect(await claim('A', 'T09', 'T00')).toBe(true);
    expect(ownerOf()).toBe('A');
  });

  it('grants to exactly one of many simultaneous claimants', async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, index) => claim(`owner-${index}`, 'T09', 'T00'))
    );

    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it('refuses a lapsed-only takeover to a non-holder before expiry', async () => {
    // The boot lock has no "or I already own it" branch; only expiry releases it.
    await claim('A', 'T09', 'T00', false);

    expect(await claim('B', 'T19', 'T01', false)).toBe(false);
  });

  it('rejects a spec whose values omit the owner column', () => {
    // Without the owner written, step 3 would compare against a stale identity
    // and hand the claim to whoever asked last.
    expect(
      claimExclusive(db, {
        table: 'leases',
        keyColumn: 'job_name',
        keyValue: 'recurring',
        ownerColumn: 'owner',
        owner: 'A',
        values: { expires_at: 'T9' },
        takeoverCondition: 'expires_at <= ?',
        takeoverParams: ['T0']
      })
    ).rejects.toThrow(/owner column/);
  });
});
