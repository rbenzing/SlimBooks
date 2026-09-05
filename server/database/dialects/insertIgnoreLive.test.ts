/**
 * `dialect.insertIgnore`'s constraint-conflict behaviour, against real engines.
 *
 * `mysql.dialect.test.ts` and `sqlite.dialect.test.ts` only assert the
 * generated SQL string — proof the statement is well-formed, not proof a
 * database accepts it or behaves as assumed on a genuine key collision.
 * `setupController.completeSetup` relies on a losing `insertIgnore` reporting
 * zero changed rows rather than throwing, on both engines, to settle a race
 * between two concurrent setup submissions without ever creating two admins.
 * This is the proof.
 *
 *   TEST_MYSQL_URL=mysql://root:root@127.0.0.1:3307/slimbooks_test npx vitest run server/database/dialects/insertIgnoreLive.test.ts
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { MySQLDatabase } from '../MySQLDatabase.js';
import { sqliteDialect } from './sqlite.dialect.js';
import { mysqlDialect } from './mysql.dialect.js';
import type { MysqlSettings } from '../../runtime/database.js';

const DDL_TIMEOUT_MS = 60_000;

/**
 * Not `settings` — `baselineLive.test.ts` drops every table in `tableSchemas`
 * in the same `slimbooks_test` database, and test files run in parallel.
 */
const PROBE_TABLE = 'insert_ignore_probe';
const CLAIM_COLUMNS = ['claim_key', 'value'];

describe('insertIgnore on SQLite', () => {
  const db = new Database(':memory:');

  beforeAll(() => {
    db.exec(`CREATE TABLE ${PROBE_TABLE} (claim_key TEXT UNIQUE NOT NULL, value TEXT)`);
  });

  afterAll(() => {
    db.close();
  });

  beforeEach(() => {
    db.exec(`DELETE FROM ${PROBE_TABLE}`);
  });

  it('inserts a new claim and reports one row changed', () => {
    const sql = sqliteDialect.insertIgnore(PROBE_TABLE, CLAIM_COLUMNS);
    const result = db.prepare(sql).run('setup.admin_created', 'true');

    expect(result.changes).toBe(1);
  });

  it('reports zero rows changed on a colliding claim, without throwing', () => {
    const sql = sqliteDialect.insertIgnore(PROBE_TABLE, CLAIM_COLUMNS);
    db.prepare(sql).run('setup.admin_created', 'true');

    const second = db.prepare(sql).run('setup.admin_created', 'true');
    expect(second.changes).toBe(0);
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

live('insertIgnore on a real MySQL-family server', () => {
  const db = new MySQLDatabase();

  beforeAll(async () => {
    await db.connect({ driver: 'mysql', settings: settingsFrom(url as string) });
    await db.executeQuery(`DROP TABLE IF EXISTS ${PROBE_TABLE}`);
    await db.executeQuery(
      `CREATE TABLE ${PROBE_TABLE} (claim_key VARCHAR(255) UNIQUE NOT NULL, value VARCHAR(255)) ENGINE=InnoDB`
    );
  }, DDL_TIMEOUT_MS);

  afterAll(async () => {
    await db.executeQuery(`DROP TABLE IF EXISTS ${PROBE_TABLE}`);
    await db.disconnect();
  }, DDL_TIMEOUT_MS);

  beforeEach(async () => {
    await db.executeQuery(`DELETE FROM ${PROBE_TABLE}`);
  });

  it('inserts a new claim and reports one row changed', async () => {
    const sql = mysqlDialect.insertIgnore(PROBE_TABLE, CLAIM_COLUMNS);
    const result = await db.executeQuery(sql, ['setup.admin_created', 'true']);

    expect(result.changes).toBe(1);
  });

  it('reports zero rows changed on a colliding claim, without throwing', async () => {
    const sql = mysqlDialect.insertIgnore(PROBE_TABLE, CLAIM_COLUMNS);
    await db.executeQuery(sql, ['setup.admin_created', 'true']);

    await expect(db.executeQuery(sql, ['setup.admin_created', 'true'])).resolves.toMatchObject({ changes: 0 });
  });

  it('survives two concurrent colliding claims: exactly one wins', async () => {
    const sql = mysqlDialect.insertIgnore(PROBE_TABLE, CLAIM_COLUMNS);

    const results = await Promise.all([
      db.executeQuery(sql, ['setup.admin_created', 'true']),
      db.executeQuery(sql, ['setup.admin_created', 'true'])
    ]);

    const totalChanges = results.reduce((sum, r) => sum + r.changes, 0);
    expect(totalChanges).toBe(1);
  });
});
