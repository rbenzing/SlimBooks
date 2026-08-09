/**
 * Boot-sequence integration test.
 *
 * The async conversion's whole premise is that SQLite behaviour is unchanged.
 * The riskiest place for that to be false is the boot sequence, where ordering
 * is load-bearing: tables must exist before migrations alter them, migrations
 * must run in order, and seeds must come last. Converting sequential awaits to
 * anything concurrent would break all three, and a unit test on any single
 * piece would not notice.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initializeDatabase, db } from './index.js';

let dataDir: string;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'slimbooks-boot-'));
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(async () => {
  await db.disconnect();
  rmSync(dataDir, { recursive: true, force: true });
});

/**
 * initializeDatabase takes the runtime rather than bare paths, because which
 * backend to open is part of what the runtime resolves.
 */
const sqliteRuntime = () => {
  const dbFile = join(dataDir, 'test.db');

  return {
    paths: { dataDir, dbFile },
    database: { driver: 'sqlite' as const, file: dbFile, timeoutMs: 5000 }
  };
};

describe('initializeDatabase', () => {
  it('builds a usable database from nothing', async () => {
    await initializeDatabase(sqliteRuntime(), false);

    expect(await db.tableExists('invoices')).toBe(true);
    expect(await db.tableExists('clients')).toBe(true);
    expect(await db.tableExists('payments')).toBe(true);
  });

  it('records every migration as applied', async () => {
    await initializeDatabase(sqliteRuntime(), false);

    const applied = await db.getMany<{ id: string }>('SELECT id FROM migrations ORDER BY id');

    expect(applied.map(row => row.id)).toContain('012');
  });

  it('creates the tables migrations add, not just those in the schema file', async () => {
    await initializeDatabase(sqliteRuntime(), false);

    expect(await db.tableExists('scheduler_leases')).toBe(true);
    expect(await db.tableExists('stripe_events')).toBe(true);
  });

  it('applies the column migration 011 adds', async () => {
    await initializeDatabase(sqliteRuntime(), false);

    const columns = await db.getMany<{ name: string }>('PRAGMA table_info(invoices)');

    expect(columns.map(c => c.name)).toContain('recurring_period_date');
  });

  it('is idempotent, so a restart re-runs it safely', async () => {
    await initializeDatabase(sqliteRuntime(), false);
    await expect(initializeDatabase(sqliteRuntime(), false)).resolves.toBeUndefined();
  });

  it('releases the boot lock, so the next start is not blocked', async () => {
    await initializeDatabase(sqliteRuntime(), false);

    const held = await db.getMany('SELECT * FROM boot_locks');
    expect(held).toHaveLength(0);
  });
});

describe('schema drift', () => {
  /**
   * On a fresh database the migrations must have nothing left to do.
   *
   * tables.schema.ts is supposed to describe the fully-migrated shape, so
   * createTables() alone should produce a database no migration wants to alter.
   * When that stops being true, new installs and upgraded installs silently
   * diverge — which is how the live invoices table once ended up missing 19
   * columns the schema declared.
   *
   * It is also the exact assumption the MySQL baseline will rest on: a MySQL
   * database is built from tables.schema.ts and its migration history recorded
   * as already applied. If a migration would have changed something, that
   * database is wrong from the moment it is created.
   */
  /**
   * Structural snapshot: one normalised statement per entry, sorted.
   *
   * Whitespace is collapsed because the comparison is about structure, not
   * formatting — an index declared across three lines in the schema file and on
   * one line in a migration is the same index, and a test that failed on that
   * would be noise. `migrations` and `boot_locks` are excluded: the runner and
   * the boot lock create them, not the schema.
   */
  const snapshot = async (): Promise<string[]> => {
    const rows = await db.getMany<{ name: string; sql: string | null }>(
      "SELECT name, sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY type, name"
    );

    return rows
      .filter(row => row.name !== 'migrations' && row.name !== 'boot_locks')
      .map(row => (row.sql ?? '').replace(/\s+/g, ' ').trim())
      .sort();
  };

  it('leaves a freshly created schema untouched', async () => {
    const { createTables } = await import('./schemas/tables.schema.js');
    const { runMigrations } = await import('./migrations/index.js');

    await db.connect({
      driver: 'sqlite',
      path: join(dataDir, 'drift.db'),
      options: { fileMustExist: false, timeout: 5000 }
    });
    await createTables(db);

    const before = await snapshot();
    await runMigrations(db);
    const after = await snapshot();

    // Reported as a set difference rather than a string diff, so a failure names
    // the exact objects that drifted instead of printing two walls of DDL.
    const added = after.filter(sql => !before.includes(sql));
    const removed = before.filter(sql => !after.includes(sql));

    expect({ added, removed }).toEqual({ added: [], removed: [] });
  });
});
