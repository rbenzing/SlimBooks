/**
 * The last-administrator guard, against real engines.
 *
 * The unit tests assert the SQL's shape. This asserts that SQLite, MySQL and
 * MariaDB each accept it and give the same answer — which is a different
 * question, and the one this project keeps getting wrong by assuming.
 *
 * MySQL rejects the bare form of this subquery outright (error 1093), so
 * "it passed on MariaDB" is not evidence. Run it against MySQL:
 *
 *   TEST_MYSQL_URL=mysql://root:root@127.0.0.1:3307/slimbooks_test npx vitest run server/services/userInvariantLive.test.ts
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { MySQLDatabase } from '../database/MySQLDatabase.js';
import { deleteUserSql, guardedUpdateSql } from '../utils/adminInvariant.util.js';
import type { MysqlSettings } from '../runtime/database.js';

/** Live DDL against a shared server needs longer than vitest's 10s default. */
const DDL_TIMEOUT_MS = 60_000;

/**
 * This suite's own table, deliberately not `users`.
 *
 * `baselineLive.test.ts` drops every table in `tableSchemas` — `users` among
 * them — in the same `slimbooks_test` database, and `vitest.config.ts` sets no
 * `fileParallelism: false`, so test files run in parallel. Operating on `users`
 * here would race that suite and fail in a way that looks like the guard is
 * broken when it is not.
 */
const PROBE_TABLE = 'invariant_probe';

const SQLITE_DDL = `
  CREATE TABLE ${PROBE_TABLE} (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    role TEXT,
    deleted_at INTEGER
  ) STRICT
`;

const MYSQL_DDL = `
  CREATE TABLE ${PROBE_TABLE} (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(50),
    deleted_at BIGINT NULL
  ) ENGINE=InnoDB
`;

describe('last-administrator guard on SQLite', () => {
  const db = new Database(':memory:');

  beforeAll(() => {
    db.exec(SQLITE_DDL);
  });

  afterAll(() => {
    db.close();
  });

  beforeEach(() => {
    db.exec(`DELETE FROM ${PROBE_TABLE}`);
    db.exec(`DELETE FROM sqlite_sequence WHERE name = '${PROBE_TABLE}'`);
  });

  const addAdmin = (name: string, deletedAt: number | null = null): number =>
    Number(
      db
        .prepare(`INSERT INTO ${PROBE_TABLE} (name, role, deleted_at) VALUES (?, ?, ?)`)
        .run(name, 'admin', deletedAt).lastInsertRowid
    );

  const liveAdmins = (): number =>
    (
      db
        .prepare(`SELECT COUNT(*) AS c FROM ${PROBE_TABLE} WHERE role = 'admin' AND deleted_at IS NULL`)
        .get() as { c: number }
    ).c;

  it('refuses to delete the last administrator, and leaves the row', () => {
    const id = addAdmin('Ada');

    expect(db.prepare(deleteUserSql(PROBE_TABLE)).run(id).changes).toBe(0);
    expect(liveAdmins()).toBe(1);
  });

  it('deletes an administrator while another remains', () => {
    const id = addAdmin('Ada');
    addAdmin('Grace');

    expect(db.prepare(deleteUserSql(PROBE_TABLE)).run(id).changes).toBe(1);
    expect(liveAdmins()).toBe(1);
  });

  it('does not count a soft-deleted administrator toward the minimum', () => {
    const id = addAdmin('Ada');
    addAdmin('Grace', 1_700_000_000_000);

    expect(db.prepare(deleteUserSql(PROBE_TABLE)).run(id).changes).toBe(0);
    expect(liveAdmins()).toBe(1);
  });

  it('refuses to demote the last administrator, and leaves the role', () => {
    const id = addAdmin('Ada');
    const sql = guardedUpdateSql(['role'], true, PROBE_TABLE);

    expect(db.prepare(sql).run('user', id).changes).toBe(0);
    expect(liveAdmins()).toBe(1);
  });

  it('demotes an administrator while another remains', () => {
    const id = addAdmin('Ada');
    addAdmin('Grace');
    const sql = guardedUpdateSql(['role'], true, PROBE_TABLE);

    expect(db.prepare(sql).run('user', id).changes).toBe(1);
    expect(liveAdmins()).toBe(1);
  });
});

const url = process.env.TEST_MYSQL_URL;
const live = url === undefined || url.length === 0 ? describe.skip : describe;

const settingsFrom = (raw: string): MysqlSettings => {
  const parsed = new URL(raw);

  return {
    driver: 'mysql',
    host: parsed.hostname,
    port: Number(parsed.port.length > 0 ? parsed.port : 3306),
    database: parsed.pathname.replace(/^\//, ''),
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    ssl: false,
    poolSize: 4
  };
};

live('last-administrator guard on a real MySQL-family server', () => {
  const db = new MySQLDatabase();

  beforeAll(async () => {
    await db.connect({ driver: 'mysql', settings: settingsFrom(url as string) });
    await db.executeQuery(`DROP TABLE IF EXISTS ${PROBE_TABLE}`);
    await db.executeQuery(MYSQL_DDL);
  }, DDL_TIMEOUT_MS);

  afterAll(async () => {
    await db.executeQuery(`DROP TABLE IF EXISTS ${PROBE_TABLE}`);
    await db.disconnect();
  }, DDL_TIMEOUT_MS);

  beforeEach(async () => {
    await db.executeQuery(`DELETE FROM ${PROBE_TABLE}`);
  });

  const addAdmin = async (name: string, deletedAt: number | null = null): Promise<number> => {
    const result = await db.executeQuery(
      `INSERT INTO ${PROBE_TABLE} (name, role, deleted_at) VALUES (?, ?, ?)`,
      [name, 'admin', deletedAt]
    );

    return result.lastInsertRowid;
  };

  const liveAdmins = async (): Promise<number> => {
    const row = await db.getOne<{ c: number }>(
      `SELECT COUNT(*) AS c FROM ${PROBE_TABLE} WHERE role = 'admin' AND deleted_at IS NULL`
    );

    return row?.c ?? 0;
  };

  it('accepts the guard at all — a bare subquery here is error 1093', async () => {
    const id = await addAdmin('Ada');

    // The assertion is that this does not throw.
    await expect(db.executeQuery(deleteUserSql(PROBE_TABLE), [id])).resolves.toBeDefined();
  });

  it('refuses to delete the last administrator, and leaves the row', async () => {
    const id = await addAdmin('Ada');
    const result = await db.executeQuery(deleteUserSql(PROBE_TABLE), [id]);

    expect(result.changes).toBe(0);
    expect(await liveAdmins()).toBe(1);
  });

  it('deletes an administrator while another remains', async () => {
    const id = await addAdmin('Ada');
    await addAdmin('Grace');
    const result = await db.executeQuery(deleteUserSql(PROBE_TABLE), [id]);

    expect(result.changes).toBe(1);
    expect(await liveAdmins()).toBe(1);
  });

  it('does not count a soft-deleted administrator toward the minimum', async () => {
    const id = await addAdmin('Ada');
    await addAdmin('Grace', 1_700_000_000_000);
    const result = await db.executeQuery(deleteUserSql(PROBE_TABLE), [id]);

    expect(result.changes).toBe(0);
    expect(await liveAdmins()).toBe(1);
  });

  it('refuses to demote the last administrator', async () => {
    const id = await addAdmin('Ada');
    const result = await db.executeQuery(guardedUpdateSql(['role'], true, PROBE_TABLE), ['user', id]);

    expect(result.changes).toBe(0);
    expect(await liveAdmins()).toBe(1);
  });

  it('survives two concurrent deletes of the last two administrators', async () => {
    // The reason this is a statement-level guard and not a count-then-delete:
    // both callers would pass a count of 2 and both would proceed.
    const first = await addAdmin('Ada');
    const second = await addAdmin('Grace');

    const results = await Promise.all([
      db.executeQuery(deleteUserSql(PROBE_TABLE), [first]),
      db.executeQuery(deleteUserSql(PROBE_TABLE), [second])
    ]);

    const deleted = results.reduce((total, result) => total + result.changes, 0);

    expect(deleted).toBe(1);
    expect(await liveAdmins()).toBe(1);
  });
});
