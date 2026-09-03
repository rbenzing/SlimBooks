/**
 * The MySQL baseline actually repairing data, not just recording history.
 *
 * baseline.ts used to record every migration as applied without running any
 * of it — correct for 001-015, SQLite schema archaeology with nothing to do
 * against a database built from tables.schema.ts. Migration 016 is different:
 * it repairs existing ROWS (a NULL or empty-string invoices.issue_date, which
 * silently drops the invoice from every date-windowed report). An install
 * that already has that defect must have it fixed on boot, not have the fix
 * recorded as done without ever running. This proves that against a real
 * MySQL/MariaDB server, on the exact code path buildMysqlBaseline takes on
 * every process start with DB_DRIVER=mysql.
 *
 * Skipped without TEST_MYSQL_URL. Uses its own scratch database (via
 * mysqlScratch.test-helper), fully dropped and rebuilt before each test,
 * rather than baselineLive's shared one: this suite deliberately un-records
 * migration 016 to simulate an install that predates it, and needs the real
 * `invoices`/`clients`/`migrations` tables under their production names —
 * see the helper's header for why a differently-named fixture table will not
 * do here.
 *
 *   TEST_MYSQL_URL=mysql://root:@127.0.0.1:3306/slimbooks_test npm test
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { buildMysqlBaseline } from './baseline.js';
import { MySQLDatabase } from './MySQLDatabase.js';
import { scratchSettingsFrom } from './mysqlScratch.test-helper.js';
import type { MysqlSettings } from '../runtime/database.js';

const url = process.env.TEST_MYSQL_URL;
const live = url === undefined || url.length === 0 ? describe.skip : describe;

/**
 * Vitest's default hook timeout is 10s, which is not a meaningful bound here:
 * each test drops and rebuilds a full schema (61 DDL statements) against a
 * real server the other live suites are hitting at the same time. See
 * baseline.test.ts / baselineLive.test.ts, which document the same thing.
 */
const DDL_TIMEOUT_MS = 60_000;

live('buildMysqlBaseline repairs data on an existing install', () => {
  const db = new MySQLDatabase();
  let settings: MysqlSettings;

  beforeAll(() => {
    settings = scratchSettingsFrom(url as string, 'baselinerepair');
  });

  /** Full reset so every test starts from genuinely nothing, not whatever a
   * previous run — or a previous test in this file — left behind. */
  const resetDatabase = async (): Promise<void> => {
    const bootstrap = new MySQLDatabase();
    await bootstrap.connect({
      driver: 'mysql',
      settings: { ...settings, database: 'information_schema' }
    });

    try {
      await bootstrap.executeQuery(`DROP DATABASE IF EXISTS \`${settings.database}\``);
      await bootstrap.executeQuery(`CREATE DATABASE \`${settings.database}\``);
    } finally {
      await bootstrap.disconnect();
    }
  };

  beforeEach(async () => {
    if (db.isConnected()) await db.disconnect();
    await resetDatabase();
    await db.connect({ driver: 'mysql', settings });
  }, DDL_TIMEOUT_MS);

  afterAll(async () => {
    if (db.isConnected()) await db.disconnect();
  }, DDL_TIMEOUT_MS);

  it('is a harmless no-op on a fresh install: nothing to repair, 016 still recorded', async () => {
    await expect(buildMysqlBaseline(db)).resolves.toBeUndefined();

    expect(await db.getMany('SELECT id FROM invoices')).toEqual([]);

    const applied = await db.getMany<{ id: string }>(
      'SELECT id FROM migrations WHERE id = ?',
      ['016']
    );
    expect(applied).toHaveLength(1);
  }, DDL_TIMEOUT_MS);

  it(
    'repairs a NULL and an empty-string issue_date left by a pre-016 install, ' +
      'then a second boot changes nothing further',
    async () => {
      // First boot: a fresh install. Builds the schema and records 001-016 —
      // 016 genuinely runs here too, but there is nothing yet to repair.
      await buildMysqlBaseline(db);

      // Simulate an install that already existed before 016 was registered:
      // migration history has everything BUT 016, and a couple of invoices
      // carry the exact defect 016 exists to fix.
      await db.executeQuery('DELETE FROM migrations WHERE id = ?', ['016']);

      const client = await db.executeQuery('INSERT INTO clients (name) VALUES (?)', [
        'Repair Co'
      ]);
      const clientId = client.lastInsertRowid;

      const nullRow = await db.executeQuery(
        'INSERT INTO invoices (invoice_number, client_id, issue_date) VALUES (?, ?, ?)',
        ['REPAIR-NULL', clientId, null]
      );
      const emptyRow = await db.executeQuery(
        'INSERT INTO invoices (invoice_number, client_id, issue_date) VALUES (?, ?, ?)',
        ['REPAIR-EMPTY', clientId, '']
      );

      const issueDateOf = async (id: number): Promise<string | null> => {
        const row = await db.getOne<{ issue_date: string | null }>(
          'SELECT issue_date FROM invoices WHERE id = ?',
          [id]
        );
        return row?.issue_date ?? null;
      };

      // Sanity: the defect is really present before the boot that should fix it.
      expect(await issueDateOf(nullRow.lastInsertRowid)).toBeNull();
      expect(await issueDateOf(emptyRow.lastInsertRowid)).toBe('');

      // Second boot: this is the exact call initializeDatabase makes for
      // driver === 'mysql'. It must find 016 unapplied and actually run it.
      await buildMysqlBaseline(db);

      const repairedNull = await issueDateOf(nullRow.lastInsertRowid);
      const repairedEmpty = await issueDateOf(emptyRow.lastInsertRowid);

      expect(repairedNull).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(repairedEmpty).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      const history = await db.getMany<{ id: string }>(
        'SELECT id FROM migrations WHERE id = ?',
        ['016']
      );
      expect(history).toHaveLength(1);

      // Third boot: 016 is now recorded, so it must not run again. Touching
      // nothing further is what proves the recording actually took, not just
      // that the repair happens to be idempotent.
      await buildMysqlBaseline(db);

      expect(await issueDateOf(nullRow.lastInsertRowid)).toBe(repairedNull);
      expect(await issueDateOf(emptyRow.lastInsertRowid)).toBe(repairedEmpty);
    },
    DDL_TIMEOUT_MS
  );
});
