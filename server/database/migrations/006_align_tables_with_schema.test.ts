/**
 * Migration 006 tests.
 *
 * This migration only ever ADDs columns, so it must never be able to fail a
 * boot. It could: the `payments.client_name` backfill read `payments.client_id`,
 * a column some databases never had and which migration 008 drops from the rest.
 * On those, startup died with "no such column: payments.client_id" before the
 * server ever listened.
 *
 * The shape below is a real one — a database still on migration 004, whose
 * payments table carries client_name and no client_id.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import type { IDatabase } from '../../types/database.types.js';
import { up } from './006_align_tables_with_schema.js';

let raw: Database.Database;

/** Minimal IDatabase surface backed by an in-memory SQLite database. */
const adapt = (database: Database.Database): IDatabase =>
  ({
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

const columnsOf = (table: string): string[] =>
  raw.prepare(`PRAGMA table_info(${table})`).all().map(c => (c as { name: string }).name);

beforeEach(() => {
  raw = new Database(':memory:');
  vi.spyOn(console, 'log').mockImplementation(() => undefined);

  raw.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY);
    CREATE TABLE clients (id INTEGER PRIMARY KEY, name TEXT, email TEXT, phone TEXT, address TEXT);
    CREATE TABLE invoices (id INTEGER PRIMARY KEY, client_id INTEGER, due_date TEXT, created_at TEXT);
  `);
});

describe('payments without client_id', () => {
  beforeEach(() => {
    // The real shape that broke the boot: client_name present, client_id absent.
    raw.exec('CREATE TABLE payments (id INTEGER PRIMARY KEY, invoice_id INTEGER, client_name TEXT)');
  });

  it('completes instead of failing the boot', async () => {
    await expect(up(adapt(raw))).resolves.not.toThrow();
  });

  it('still adds the columns it owns', async () => {
    await up(adapt(raw));

    expect(columnsOf('payments')).toContain('reference');
    expect(columnsOf('payments')).toContain('description');
  });

  it('does not invent a client_id it was never asked to add', async () => {
    await up(adapt(raw));

    expect(columnsOf('payments')).not.toContain('client_id');
  });
});

describe('payments with client_id', () => {
  beforeEach(() => {
    raw.exec('CREATE TABLE payments (id INTEGER PRIMARY KEY, invoice_id INTEGER, client_id INTEGER)');
    raw.prepare('INSERT INTO clients (id, name) VALUES (3, ?)').run('Acme Ltd');
    raw.prepare('INSERT INTO payments (id, invoice_id, client_id) VALUES (1, 1, 3)').run();
  });

  it('backfills client_name from the client when the source column exists', async () => {
    await up(adapt(raw));

    const row = raw.prepare('SELECT client_name FROM payments WHERE id = 1').get();
    expect((row as { client_name: string }).client_name).toBe('Acme Ltd');
  });
});

describe('re-running', () => {
  beforeEach(() => {
    raw.exec('CREATE TABLE payments (id INTEGER PRIMARY KEY, invoice_id INTEGER, client_name TEXT)');
  });

  it('is idempotent, as every migration in this project must be', async () => {
    await up(adapt(raw));

    await expect(up(adapt(raw))).resolves.not.toThrow();
    expect(columnsOf('payments')).toContain('reference');
  });
});
