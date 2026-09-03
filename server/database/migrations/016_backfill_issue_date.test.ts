/**
 * Migration 016 against real engines.
 *
 * A NULL or empty-string `issue_date` compares false against every report
 * range, so the invoice silently disappears from the P&L, the invoice report,
 * the client report, the list and the dashboard. This migration is the
 * backfill half of the fix, so it is checked against real SQLite and real
 * MySQL/MariaDB rather than against generated SQL, as the codebase requires of
 * anything database-shaped.
 *
 * It runs on BOTH engines. It is marked `repairsData`, which is what makes the
 * MySQL boot path execute it rather than merely record it as applied the way it
 * does for the SQLite schema archaeology in 001-015. An earlier draft of this
 * comment said the opposite; that was true for about an hour, and it was the
 * defect, not the design.
 *
 * SQLite always runs. MySQL runs when TEST_MYSQL_URL is set. A skipped MySQL
 * half is reported rather than silent.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { MySQLDatabase } from '../MySQLDatabase.js';
import { sqliteDialect } from '../dialects/sqlite.dialect.js';
import { ensureScratchDatabase, scratchSettingsFrom } from '../mysqlScratch.test-helper.js';
import { up } from './016_backfill_issue_date.js';
import type { IDatabase } from '../../types/database.types.js';

const url = process.env.TEST_MYSQL_URL;

interface Backend {
  name: string;
  open: () => Promise<IDatabase>;
  close: (db: IDatabase) => Promise<void>;
  ddl: string;
}

/** Minimal IDatabase surface backed by an in-memory SQLite database. */
const adaptSqlite = (database: Database.Database): IDatabase =>
  ({
    dialect: sqliteDialect,
    executeQuery: async (query: string, params: unknown[] = []) => {
      const info = database.prepare(query).run(...(params as never[]));
      return { changes: info.changes, lastInsertRowid: Number(info.lastInsertRowid) };
    },
    getMany: async <T>(query: string, params: unknown[] = []) =>
      database.prepare(query).all(...(params as never[])) as T[],
    tableExists: async (name: string) =>
      database
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
        .get(name) !== undefined
  }) as unknown as IDatabase;

const backends: Backend[] = [
  {
    name: 'sqlite',
    open: async () => {
      const raw = new Database(':memory:');
      return adaptSqlite(raw);
    },
    close: async () => undefined,
    ddl: `
      CREATE TABLE invoices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        issue_date TEXT,
        created_at INTEGER NOT NULL
      )
    `
  }
];

if (url !== undefined && url.length > 0) {
  backends.push({
    name: 'mysql',
    open: async () => {
      // A private database, not whatever TEST_MYSQL_URL names by default —
      // this migration's up() hardcodes the table name `invoices`, so this
      // suite cannot use a differently-named fixture the way most live suites
      // do to avoid racing baselineLive.test.ts. See mysqlScratch.test-helper.
      const settings = scratchSettingsFrom(url, 'mig016');
      await ensureScratchDatabase(settings);

      const db = new MySQLDatabase();
      await db.connect({ driver: 'mysql', settings });
      return db;
    },
    close: db => db.disconnect(),
    ddl: `
      CREATE TABLE invoices (
        id INT AUTO_INCREMENT PRIMARY KEY,
        issue_date VARCHAR(32),
        created_at BIGINT NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  });
}

describe('migration 016 coverage', () => {
  it('reports which backends are under test', () => {
    console.log(`migration 016 suite covering: ${backends.map(b => b.name).join(', ')}`);

    expect(backends.map(b => b.name)).toContain('sqlite');
  });

  it('includes MySQL whenever a server was configured', () => {
    if (url === undefined || url.length === 0) return;

    expect(backends.map(b => b.name)).toContain('mysql');
  });
});

describe.each(backends)('migration 016 on $name', backend => {
  let db: IDatabase;

  /**
   * Every hook here is DDL against a real server the other live suites are
   * using at the same time; vitest's 10s default is not a meaningful bound —
   * see 015_epoch_timestamps.test.ts, which documents the same thing.
   */
  const DDL_TIMEOUT_MS = 60_000;

  beforeAll(async () => {
    db = await backend.open();
  }, DDL_TIMEOUT_MS);

  afterAll(async () => {
    await backend.close(db);
  }, DDL_TIMEOUT_MS);

  beforeEach(async () => {
    await db.executeQuery('DROP TABLE IF EXISTS invoices');
    await db.executeQuery(backend.ddl);
  }, DDL_TIMEOUT_MS);

  const insert = (issueDate: string | null, createdAt: number): Promise<unknown> =>
    db.executeQuery('INSERT INTO invoices (issue_date, created_at) VALUES (?, ?)', [
      issueDate,
      createdAt
    ]);

  const issueDateOf = async (id: number): Promise<string | null> => {
    const row = await db.getMany<{ issue_date: string | null }>(
      'SELECT issue_date FROM invoices WHERE id = ?',
      [id]
    );
    return row[0]?.issue_date ?? null;
  };

  it('backfills a NULL issue_date from the UTC day of created_at', async () => {
    await insert(null, Date.parse('2026-02-15T23:30:00.000Z'));

    await up(db);

    expect(await issueDateOf(1)).toBe('2026-02-15');
  });

  it('backfills an empty-string issue_date the same way', async () => {
    await insert('', Date.parse('2026-02-15T00:00:00.000Z'));

    await up(db);

    expect(await issueDateOf(1)).toBe('2026-02-15');
  });

  it('reads created_at in UTC, not the host timezone', async () => {
    // 23:30 UTC is still the 15th in UTC even though it has already rolled to
    // the 16th east of the date line.
    await insert(null, Date.parse('2026-02-15T23:30:00.000Z'));

    await up(db);

    expect(await issueDateOf(1)).toBe('2026-02-15');
  });

  it('leaves a real issue_date untouched', async () => {
    await insert('2026-01-01', Date.parse('2026-02-15T00:00:00.000Z'));

    await up(db);

    expect(await issueDateOf(1)).toBe('2026-01-01');
  });

  it('backfills only the offending rows in a mixed table', async () => {
    await insert(null, Date.parse('2026-02-15T00:00:00.000Z'));
    await insert('', Date.parse('2026-03-01T00:00:00.000Z'));
    await insert('2026-01-01', Date.parse('2026-04-01T00:00:00.000Z'));

    await up(db);

    expect(await issueDateOf(1)).toBe('2026-02-15');
    expect(await issueDateOf(2)).toBe('2026-03-01');
    expect(await issueDateOf(3)).toBe('2026-01-01');
  });

  it('is idempotent: a second run touches nothing further', async () => {
    await insert(null, Date.parse('2026-02-15T00:00:00.000Z'));

    await up(db);
    const first = await issueDateOf(1);

    await expect(up(db)).resolves.toBeUndefined();
    expect(await issueDateOf(1)).toBe(first);
  });

  it('does nothing on a table with no offending rows', async () => {
    await insert('2026-01-01', Date.parse('2026-02-15T00:00:00.000Z'));

    await expect(up(db)).resolves.toBeUndefined();
    expect(await issueDateOf(1)).toBe('2026-01-01');
  });

  it('does not fail a boot when the invoices table does not exist yet', async () => {
    await db.executeQuery('DROP TABLE IF EXISTS invoices');

    await expect(up(db)).resolves.toBeUndefined();
  });
});
