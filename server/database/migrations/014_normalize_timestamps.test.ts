/**
 * Migration 014 against a real database.
 *
 * The point of this migration is that a customer's existing rows come out
 * comparable, so it is exercised on a database built the way a customer's was:
 * createTables() then the full migration chain, with legacy-shaped values
 * written in behind the migration's back.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SQLiteDatabase } from '../SQLiteDatabase.js';
import { createTables } from '../schemas/tables.schema.js';
import { up as normalizeTimestamps } from './014_normalize_timestamps.js';
import type { IDatabase } from '../../types/database.types.js';

/**
 * 2.1.1's stored shape, which is what this migration produced.
 *
 * Asserted with a local pattern rather than a shared helper: 015 has since
 * moved these columns to integers and the helper went with them, but 014 is
 * history and its test has to keep describing the world 014 lived in.
 *
 * The tables here come from the *current* schema, so their timestamp columns
 * are declared INTEGER. SQLite is dynamically typed outside a STRICT table, so
 * the text these tests write still stores as text and the rewrite still
 * exercises exactly as it did — which is the only reason this remains a
 * faithful test of 014 rather than a fiction.
 */
const UTC_TEXT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

let dir: string;
let db: IDatabase;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'slimbooks-014-'));
  db = new SQLiteDatabase();
  await db.connect({ driver: 'sqlite', path: join(dir, 'test.db'), options: { timeout: 5000 } });
  await createTables(db);
});

afterEach(async () => {
  await db.disconnect();
  rmSync(dir, { recursive: true, force: true });
});

/** A client row with timestamps written straight in, bypassing the services. */
const insertClient = async (name: string, created: string, updated: string): Promise<void> => {
  await db.executeQuery(
    'INSERT INTO clients (name, created_at, updated_at) VALUES (?, ?, ?)',
    [name, created, updated]
  );
};

const clientRows = () =>
  db.getMany<{ name: string; created_at: string; updated_at: string }>(
    'SELECT name, created_at, updated_at FROM clients ORDER BY name'
  );

describe('migration 014', () => {
  it('rewrites both legacy shapes into the canonical one', async () => {
    await insertClient('millis', '2026-08-12T13:54:13.241Z', '2026-08-12T13:54:13.241Z');
    await insertClient('spaced', '2026-08-12 13:54:13', '2026-08-12 13:54:13');

    await normalizeTimestamps(db);

    for (const row of await clientRows()) {
      expect(row.created_at).toMatch(UTC_TEXT);
      expect(row.created_at).toBe('2026-08-12T13:54:13Z');
    }
  });

  it('makes the two shapes compare correctly against each other', async () => {
    // The defect, stated as a query. Before the rewrite, `spaced` is stored as
    // "2026-08-12 23:00:00" and `millis` as "2026-08-12T01:00:00.241Z", and a
    // space sorts below `T` — so the 23:00 row comes back as the *earlier* one.
    await insertClient('millis', '2026-08-12T01:00:00.241Z', '2026-08-12T01:00:00.241Z');
    await insertClient('spaced', '2026-08-12 23:00:00', '2026-08-12 23:00:00');

    const before = await db.getMany<{ name: string }>(
      'SELECT name FROM clients ORDER BY created_at'
    );
    expect(before.map(row => row.name)).toEqual(['spaced', 'millis']);

    await normalizeTimestamps(db);

    const after = await db.getMany<{ name: string }>(
      'SELECT name FROM clients ORDER BY created_at'
    );
    expect(after.map(row => row.name)).toEqual(['millis', 'spaced']);
  });

  it('preserves the instant, not just the shape', async () => {
    await insertClient('one', '2026-08-12 13:54:13', '2026-08-12 13:54:13');

    await normalizeTimestamps(db);

    const [row] = await clientRows();
    expect(new Date(row!.created_at).getTime()).toBe(Date.parse('2026-08-12T13:54:13Z'));
  });

  it('narrows a calendar-day column that holds an instant', async () => {
    await db.executeQuery(
      'INSERT INTO clients (id, name) VALUES (?, ?)',
      [1, 'c']
    );
    await db.executeQuery(
      `INSERT INTO invoices (invoice_number, client_id, due_date, issue_date, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      ['INV-1', 1, '2026-09-11T18:23:00.000Z', '2026-08-12 00:00:00', '2026-08-12 00:00:00']
    );

    await normalizeTimestamps(db);

    const row = await db.getOne<{ due_date: string; issue_date: string; created_at: string }>(
      'SELECT due_date, issue_date, created_at FROM invoices'
    );

    expect(row?.due_date).toBe('2026-09-11');
    expect(row?.issue_date).toBe('2026-08-12');
    // A calendar-day column and a timestamp column in the same row get opposite
    // treatment, which is why the plan names columns instead of guessing.
    expect(row?.created_at).toBe('2026-08-12T00:00:00Z');
  });

  it('leaves NULLs alone', async () => {
    await insertClient('n', '2026-08-12 13:54:13', '2026-08-12 13:54:13');

    await normalizeTimestamps(db);

    const row = await db.getOne<{ deleted_at: string | null }>(
      'SELECT deleted_at FROM clients'
    );
    expect(row?.deleted_at).toBeNull();
  });

  it('is idempotent', async () => {
    await insertClient('a', '2026-08-12T13:54:13.241Z', '2026-08-12 13:54:13');

    await normalizeTimestamps(db);
    const first = await clientRows();

    await normalizeTimestamps(db);
    const second = await clientRows();

    expect(second).toEqual(first);
  });

  it('runs on a database whose tables are all empty', async () => {
    await expect(normalizeTimestamps(db)).resolves.toBeUndefined();
  });

  it('rewrites the reserved-word key table without quoting errors', async () => {
    // stored_objects is keyed on `key`, which is reserved in MySQL. The
    // statement built here has to survive both engines.
    await db.executeQuery(
      'INSERT INTO stored_objects (`key`, content_type, size, data, created_at) VALUES (?, ?, ?, ?, ?)',
      ['logos/a.png', 'image/png', 3, Buffer.from([1, 2, 3]), '2026-08-12 09:00:00']
    );

    await normalizeTimestamps(db);

    const row = await db.getOne<{ created_at: string }>(
      'SELECT created_at FROM stored_objects WHERE `key` = ?',
      ['logos/a.png']
    );
    expect(row?.created_at).toBe('2026-08-12T09:00:00Z');
  });
});
