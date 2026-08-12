/**
 * Round-trips a dump between two real SQLite databases.
 *
 * SQLite on both sides is not the interesting direction — the point of the
 * format is SQLite to MySQL — but everything the format has to get right is
 * dialect-independent: table order, binary values, the empty-target refusal.
 * What only a real MySQL can settle is whether its column types accept the rows,
 * and Task 11's manual transfer step is where that gets checked.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SQLiteDatabase } from './SQLiteDatabase.js';
import { createTables } from './schemas/tables.schema.js';
import { exportDatabase, importDatabase, transferTables } from './transfer.util.js';
import type { IDatabase } from '../types/database.types.js';

const AT = '2026-08-09T12:00:00.000Z';

let dir: string;
let source: IDatabase;
let target: IDatabase;

const open = async (name: string): Promise<IDatabase> => {
  const db = new SQLiteDatabase();
  await db.connect({ driver: 'sqlite', path: join(dir, name), options: { timeout: 5000 } });
  await createTables(db);
  return db;
};

beforeEach(async () => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  dir = mkdtempSync(join(tmpdir(), 'slimbooks-transfer-'));
  source = await open('source.db');
  target = await open('target.db');
});

afterEach(async () => {
  await source.disconnect();
  await target.disconnect();
  rmSync(dir, { recursive: true, force: true });
});

const seed = async (): Promise<void> => {
  await source.executeQuery(
    'INSERT INTO clients (name, email, zipCode) VALUES (?, ?, ?)',
    ['Acme', 'a@b.c', '90210']
  );
  await source.executeQuery(
    'INSERT INTO invoices (invoice_number, client_id, amount, total_amount, status, due_date) VALUES (?, ?, ?, ?, ?, ?)',
    ['INV-001', 1, 100.5, 110.5, 'sent', '2026-09-01']
  );
  await source.executeQuery(
    'INSERT INTO payments (invoice_id, client_name, amount, method, date) VALUES (?, ?, ?, ?, ?)',
    [1, 'Acme', 110.5, 'bank_transfer', '2026-09-02']
  );
  await source.executeQuery(
    'INSERT INTO settings (`key`, value, category) VALUES (?, ?, ?)',
    ['company.name', '"Acme"', 'company']
  );
};

describe('exportDatabase', () => {
  it('writes tables in foreign-key order', async () => {
    const dump = await exportDatabase(source, AT);
    const names = dump.tables.map(table => table.name);

    // clients before anything that references it, or every insert fails the FK.
    expect(names.indexOf('clients')).toBeLessThan(names.indexOf('recurring_invoice_templates'));
    expect(names.indexOf('invoices')).toBeLessThan(names.indexOf('payments'));
    expect(names.indexOf('users')).toBeLessThan(names.indexOf('password_reset_tokens'));
  });

  it('records the format version and the source driver', async () => {
    const dump = await exportDatabase(source, AT);

    expect(dump).toMatchObject({ version: 1, exportedAt: AT, driver: 'sqlite' });
  });

  it('omits the tables that must not travel', async () => {
    // A carried boot_lock would block the next boot; a carried lease would
    // stall the scheduler until it expired; migrations are the target's own.
    const names = (await exportDatabase(source, AT)).tables.map(table => table.name);

    expect(names).not.toContain('migrations');
    expect(names).not.toContain('boot_locks');
    expect(names).not.toContain('scheduler_leases');
  });

  it('carries the Stripe idempotency ledger', async () => {
    // Losing it means a delivery Stripe retries after the move is processed a
    // second time — on a payment event, the payment is recorded twice.
    expect((await exportDatabase(source, AT)).tables.map(t => t.name)).toContain('stripe_events');
  });

  it('skips a table the source does not have', async () => {
    await source.executeQuery('DROP TABLE stored_objects');

    const names = (await exportDatabase(source, AT)).tables.map(table => table.name);

    expect(names).not.toContain('stored_objects');
    expect(names).toContain('clients');
  });
});

describe('round trip', () => {
  it('reproduces every row', async () => {
    await seed();

    await importDatabase(target, await exportDatabase(source, AT));

    for (const name of transferTables()) {
      const before = await source.getMany(`SELECT * FROM ${name}`);
      const after = await target.getMany(`SELECT * FROM ${name}`);

      expect(after, `table ${name}`).toEqual(before);
    }
  });

  it('returns the number of rows written', async () => {
    await seed();

    expect(await importDatabase(target, await exportDatabase(source, AT))).toBe(4);
  });

  it('carries binary objects through JSON', async () => {
    // stored_objects.data is a Buffer. JSON.stringify would render it as a
    // digit array — lossless but roughly 4x — so it is base64 with a marker.
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff]);

    await source.executeQuery(
      'INSERT INTO stored_objects (`key`, content_type, size, data) VALUES (?, ?, ?, ?)',
      ['logos/a.png', 'image/png', bytes.length, bytes]
    );

    await importDatabase(target, await exportDatabase(source, AT));

    const row = await target.getOne<{ data: Buffer }>('SELECT data FROM stored_objects');

    expect(Buffer.from(row!.data)).toEqual(bytes);
  });

  it('produces a dump that survives JSON serialisation', async () => {
    // The dump is written to a file between the two halves, so anything that
    // only round-trips in memory is not actually working.
    await seed();

    const dump = JSON.parse(JSON.stringify(await exportDatabase(source, AT)));

    await importDatabase(target, dump);

    expect(await target.getMany('SELECT * FROM clients')).toHaveLength(1);
  });

  it('preserves a row whose foreign key points at a missing parent', async () => {
    // Refusing to move a customer's books over one orphan left by a years-old
    // hard delete would be the wrong trade.
    await source.executeQuery('PRAGMA foreign_keys = OFF');
    await source.executeQuery(
      'INSERT INTO payments (invoice_id, client_name, amount, method, date) VALUES (?, ?, ?, ?, ?)',
      [999, 'Ghost', 1, 'cash', '2026-01-01']
    );

    await expect(importDatabase(target, await exportDatabase(source, AT))).resolves.toBe(1);
  });
});

describe('importDatabase refusals', () => {
  it('refuses a target that already holds books', async () => {
    await seed();
    const dump = await exportDatabase(source, AT);

    await target.executeQuery('INSERT INTO clients (name) VALUES (?)', ['existing']);

    await expect(importDatabase(target, dump)).rejects.toThrow(/already holds data/i);
  });

  it('refuses before writing anything, so a rejected import changes nothing', async () => {
    await seed();
    const dump = await exportDatabase(source, AT);

    await target.executeQuery('INSERT INTO expenses (description, amount, date) VALUES (?, ?, ?)', [
      'existing',
      1,
      '2026-01-01'
    ]);

    await expect(importDatabase(target, dump)).rejects.toThrow(/already holds data/i);
    expect(await target.getMany('SELECT * FROM clients')).toHaveLength(0);
  });

  it('tolerates rows that building the schema itself created', async () => {
    // Seeds create the administrator and the default settings, and migration
    // 003 inserts a default design template. A blanket "must be empty" rule
    // would refuse every legitimate transfer, because the documented flow is to
    // start once against the new database and then import.
    await seed();
    const dump = await exportDatabase(source, AT);

    await target.executeQuery('INSERT INTO users (name, email, username) VALUES (?, ?, ?)', [
      'Administrator',
      'admin@slimbooks.app',
      'admin'
    ]);
    await target.executeQuery('INSERT INTO settings (`key`, value) VALUES (?, ?)', ['app_name', 'x']);
    await target.executeQuery('INSERT INTO invoice_design_templates (name, content) VALUES (?, ?)', [
      'default',
      '{}'
    ]);

    await expect(importDatabase(target, dump)).resolves.toBeGreaterThan(0);
  });

  it('replaces rather than merges, so the result is exactly the dump', async () => {
    await seed();
    const dump = await exportDatabase(source, AT);

    await target.executeQuery('INSERT INTO settings (`key`, value) VALUES (?, ?)', ['stale', 'old']);

    await importDatabase(target, dump);

    const keys = (await target.getMany<{ key: string }>('SELECT `key` FROM settings')).map(
      row => row.key
    );

    expect(keys).toEqual(['company.name']);
  });

  it('refuses a dump from an incompatible format version', async () => {
    const dump = await exportDatabase(source, AT);

    await expect(importDatabase(target, { ...dump, version: 99 })).rejects.toThrow(/version/i);
  });

  it('refuses when the target is missing a table the dump carries', async () => {
    await seed();
    const dump = await exportDatabase(source, AT);

    await target.executeQuery('DROP TABLE stored_objects');

    await expect(importDatabase(target, dump)).rejects.toThrow(/no table "stored_objects"/);
  });

  it('restores foreign-key enforcement even when the load fails', async () => {
    await seed();
    const dump = await exportDatabase(source, AT);

    // A row naming a column the target does not have aborts mid-load.
    dump.tables[0]!.rows.push({ nonexistent_column: 1 });

    await expect(importDatabase(target, dump)).rejects.toThrow();

    const enforcement = await target.getOne<{ foreign_keys: number }>('PRAGMA foreign_keys');
    expect(enforcement?.foreign_keys).toBe(1);
  });
});
