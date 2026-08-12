/**
 * The MySQL baseline, against a real server.
 *
 * baseline.test.ts runs against a recording stand-in, which can establish
 * ordering and bookkeeping but not the question that matters most: does MySQL
 * actually accept the DDL this project generates? The other MySQL suites create
 * their own small fixture tables, so until this existed the 61 generated
 * statements were validated only as text — a wrong column type, an unindexable
 * TEXT, or a default MySQL rejects would have reached a customer's first boot.
 *
 * Skipped without TEST_MYSQL_URL. CI sets it for MySQL 8.0 and MariaDB 10.11.
 *
 *   TEST_MYSQL_URL=mysql://root:@127.0.0.1:3306/slimbooks_test npm test
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildMysqlBaseline } from './baseline.js';
import { MySQLDatabase } from './MySQLDatabase.js';
import { tableSchemas } from './schemas/tables.schema.js';
import { isEpochMillis, utcNow } from '../utils/utcTime.util.js';
import type { MysqlSettings } from '../runtime/database.js';

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

live('buildMysqlBaseline against a real server', () => {
  const db = new MySQLDatabase();

  /**
   * Drop the tables this suite builds, so it starts from genuinely nothing.
   *
   * Scoped to the schema's own tables rather than everything in the database.
   * It used to drop every table it found, which quietly demolished the fixture
   * tables of whichever live suite happened to be running alongside it — the
   * failure surfaced as "Table 'leases' doesn't exist" in a completely
   * unrelated file, which is a miserable thing to debug.
   */
  const OWNED = new Set([
    ...tableSchemas.map(schema => schema.name),
    'password_reset_tokens',
    'email_verification_tokens',
    'migrations',
    'boot_locks'
  ]);

  const wipe = async (): Promise<void> => {
    const all = await db.getMany<{ TABLE_NAME: string }>(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'`
    );
    const tables = all.filter(table => OWNED.has(table.TABLE_NAME));

    await db.executeQuery('SET FOREIGN_KEY_CHECKS = 0');

    try {
      for (const table of tables) {
        await db.executeQuery(`DROP TABLE IF EXISTS \`${table.TABLE_NAME}\``);
      }
    } finally {
      await db.executeQuery('SET FOREIGN_KEY_CHECKS = 1');
    }
  };

  /**
   * Vitest's default hook timeout is 10s, which is not a meaningful bound for
   * these two. They drop nineteen tables and run the baseline's sixty-one DDL
   * statements against a real server that the other live suites are hitting at
   * the same time; the suite failed on hook timeout in a full run while passing
   * on its own. The number is a ceiling on a hang, not a performance assertion.
   */
  const DDL_TIMEOUT_MS = 60_000;

  beforeAll(async () => {
    await db.connect({ driver: 'mysql', settings: settingsFrom(url as string) });
    await wipe();
    await buildMysqlBaseline(db);
  }, DDL_TIMEOUT_MS);

  afterAll(async () => {
    await wipe();
    await db.disconnect();
  }, DDL_TIMEOUT_MS);

  it('creates every table the SQLite schema declares', async () => {
    for (const schema of tableSchemas) {
      expect(await db.tableExists(schema.name), schema.name).toBe(true);
    }

    expect(await db.tableExists('password_reset_tokens')).toBe(true);
    expect(await db.tableExists('email_verification_tokens')).toBe(true);
  });

  it('records the migration history without having run any of it', async () => {
    const applied = await db.getMany<{ id: string }>('SELECT id FROM migrations ORDER BY id');

    expect(applied.map(row => row.id)).toContain('013');
  });

  it('is idempotent, so a second boot is a no-op', async () => {
    // The real test of the index-existence check. MySQL has no
    // CREATE INDEX IF NOT EXISTS, so a second run fails outright without it.
    await expect(buildMysqlBaseline(db)).resolves.toBeUndefined();
  });

  it('builds every table with InnoDB', async () => {
    // MyISAM ignores transactions silently, which is the one failure mode the
    // recurring-invoice processor cannot tolerate.
    const rows = await db.getMany<{ TABLE_NAME: string; ENGINE: string }>(
      `SELECT TABLE_NAME, ENGINE FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'`
    );

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.filter(row => row.ENGINE !== 'InnoDB')).toEqual([]);
  });

  it('accepts a client, an invoice and a payment through their foreign keys', async () => {
    const client = await db.executeQuery(
      'INSERT INTO clients (name, email, zipCode) VALUES (?, ?, ?)',
      ['Acme', 'a@b.c', '90210']
    );

    const invoice = await db.executeQuery(
      `INSERT INTO invoices (invoice_number, client_id, amount, total_amount, status, due_date)
       VALUES (?, ?, ?, ?, ?, ?)`,
      ['INV-001', client.lastInsertRowid, 100.5, 110.5, 'sent', '2026-09-01']
    );

    await db.executeQuery(
      'INSERT INTO payments (invoice_id, client_name, amount, method, date) VALUES (?, ?, ?, ?, ?)',
      [invoice.lastInsertRowid, 'Acme', 110.5, 'bank_transfer', '2026-09-02']
    );

    expect(
      await db.getOne<{ total_amount: number }>('SELECT total_amount FROM invoices WHERE id = ?', [
        invoice.lastInsertRowid
      ])
    ).toMatchObject({ total_amount: 110.5 });
  });

  it('accepts a setting keyed on the reserved word', async () => {
    await db.executeQuery('INSERT INTO settings (`key`, value, category) VALUES (?, ?, ?)', [
      'company.name',
      '"Acme"',
      'company'
    ]);

    expect(
      await db.getOne<{ value: string }>('SELECT value FROM settings WHERE `key` = ?', [
        'company.name'
      ])
    ).toMatchObject({ value: '"Acme"' });
  });

  it('stores a long unindexed text without truncating it', async () => {
    // The mapping makes indexed text VARCHAR(255) and leaves the rest TEXT. A
    // column narrowed by mistake would truncate silently under a permissive
    // sql_mode — a mangled line_items JSON, discovered much later.
    const long = 'x'.repeat(5000);

    await db.executeQuery('INSERT INTO clients (name, notes) VALUES (?, ?)', ['Long', long]);

    const row = await db.getOne<{ notes: string }>('SELECT notes FROM clients WHERE name = ?', [
      'Long'
    ]);

    expect(row?.notes).toHaveLength(5000);
  });

  it('round-trips a BLOB through stored_objects', async () => {
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff]);

    await db.executeQuery(
      'INSERT INTO stored_objects (`key`, content_type, size, data) VALUES (?, ?, ?, ?)',
      ['logos/a.png', 'image/png', bytes.length, bytes]
    );

    const row = await db.getOne<{ data: Buffer }>('SELECT data FROM stored_objects');

    expect(Buffer.from(row!.data)).toEqual(bytes);
  });

  it('fills created_at from the expression default', async () => {
    // The reason for the 8.0.13 floor: a TEXT column can take a default only in
    // expression form. Below that floor the DDL would not have parsed at all.
    await db.executeQuery('INSERT INTO clients (name) VALUES (?)', ['Stamped']);

    const row = await db.getOne<{ created_at: number }>(
      'SELECT created_at FROM clients WHERE name = ?',
      ['Stamped']
    );

    expect(isEpochMillis(Number(row?.created_at))).toBe(true);
  });

  it('agrees with the timestamp the application writes', async () => {
    // Rows get their created_at from whichever wrote them — the default here,
    // insertRecord in most services. Both land in the same column, so two
    // clocks there would order rows wrongly.
    await db.executeQuery('INSERT INTO clients (name) VALUES (?)', ['Compared']);
    await db.executeQuery('INSERT INTO clients (name, created_at) VALUES (?, ?)', [
      'Written',
      utcNow()
    ]);

    const rows = await db.getMany<{ name: string; created_at: number }>(
      'SELECT name, created_at FROM clients WHERE name IN (?, ?)',
      ['Compared', 'Written']
    );

    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(isEpochMillis(Number(row.created_at))).toBe(true);
      // Within a second of each other, so the default and utcNow() are reading
      // the same clock rather than merely producing the same type.
      expect(Math.abs(Number(row.created_at) - utcNow())).toBeLessThan(5000);
    }
  });

  /**
   * invoices.client_id is NOT NULL and carries a foreign key, so every invoice
   * below needs a real parent. Omitting it does not fail the same way on both
   * backends — SQLite rejects the insert outright, while MySQL under a
   * non-strict sql_mode substitutes 0 and then fails the foreign key instead.
   */
  const insertClient = async (name: string): Promise<number> =>
    (await db.executeQuery('INSERT INTO clients (name) VALUES (?)', [name])).lastInsertRowid;

  it('enforces the unique constraint on invoice_number', async () => {
    const client = await insertClient('Unique');

    await db.executeQuery(
      'INSERT INTO invoices (invoice_number, client_id, amount, total_amount) VALUES (?, ?, ?, ?)',
      ['INV-UNIQUE', client, 1, 1]
    );

    await expect(
      db.executeQuery(
        'INSERT INTO invoices (invoice_number, client_id, amount, total_amount) VALUES (?, ?, ?, ?)',
        ['INV-UNIQUE', client, 2, 2]
      )
    ).rejects.toThrow();
  });

  it('permits several NULLs where the partial unique index was dropped', async () => {
    // idx_invoices_recurring_period is UNIQUE on (recurring_template_id,
    // recurring_period_date), and its SQLite form carries
    // "WHERE recurring_template_id IS NOT NULL". MySQL has no partial index and
    // needs none, because its unique indexes already permit multiple NULL rows.
    // If that reasoning were wrong, the second manual invoice ever created would
    // be rejected.
    const client = await insertClient('Manual');

    for (const number of ['MAN-1', 'MAN-2', 'MAN-3']) {
      await db.executeQuery(
        'INSERT INTO invoices (invoice_number, client_id, amount, total_amount) VALUES (?, ?, ?, ?)',
        [number, client, 1, 1]
      );
    }

    const manual = await db.getMany(
      'SELECT id FROM invoices WHERE recurring_template_id IS NULL AND invoice_number LIKE ?',
      ['MAN-%']
    );

    expect(manual).toHaveLength(3);
  });

  it('soft-delete filtering behaves the same as on SQLite', async () => {
    await db.executeQuery('INSERT INTO clients (name, deleted_at) VALUES (?, ?)', [
      'Deleted',
      Date.parse('2026-01-01T00:00:00Z')
    ]);

    const live = await db.getMany<{ name: string }>(
      'SELECT name FROM clients WHERE deleted_at IS NULL AND name = ?',
      ['Deleted']
    );

    expect(live).toEqual([]);
  });
});
