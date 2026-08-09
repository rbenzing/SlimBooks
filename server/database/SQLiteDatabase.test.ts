/**
 * SQLiteDatabase async-conversion tests.
 *
 * The whole point of converting the data layer to promises before MySQL exists
 * is that SQLite's behaviour must not change. These tests pin the behaviour
 * that the conversion could plausibly break: that a rolled-back transaction
 * leaves nothing behind, and that a throwing callback rolls back rather than
 * leaking an open transaction onto the connection.
 *
 * The rollback cases matter most. better-sqlite3's `.transaction()` helper used
 * to handle this; the conversion replaces it with explicit BEGIN/COMMIT/ROLLBACK
 * because that helper forbids async callbacks.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SQLiteDatabase } from './SQLiteDatabase.js';

let db: SQLiteDatabase;

beforeEach(async () => {
  db = new SQLiteDatabase();
  await db.connect({ driver: 'sqlite', path: ':memory:', options: { fileMustExist: false, timeout: 5000 } });
  await db.executeQuery('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)');
});

afterEach(async () => {
  await db.disconnect();
});

describe('query methods', () => {
  it('inserts and reads a row back', async () => {
    const result = await db.executeQuery('INSERT INTO t (name) VALUES (?)', ['a']);

    expect(result.changes).toBe(1);
    expect(result.lastInsertRowid).toBe(1);

    const row = await db.getOne<{ name: string }>('SELECT name FROM t WHERE id = ?', [1]);
    expect(row?.name).toBe('a');
  });

  it('returns null for a row that does not exist', async () => {
    expect(await db.getOne('SELECT * FROM t WHERE id = ?', [99])).toBeNull();
  });

  it('returns an empty array rather than null for no matches', async () => {
    expect(await db.getMany('SELECT * FROM t')).toEqual([]);
  });

  it('reports whether a table exists', async () => {
    expect(await db.tableExists('t')).toBe(true);
    expect(await db.tableExists('nope')).toBe(false);
  });
});

describe('transactions', () => {
  it('commits every statement in a successful transaction', async () => {
    await db.transaction(async () => {
      await db.executeQuery('INSERT INTO t (name) VALUES (?)', ['a']);
      await db.executeQuery('INSERT INTO t (name) VALUES (?)', ['b']);
    });

    expect(await db.getMany('SELECT * FROM t')).toHaveLength(2);
  });

  it('rolls back every statement when the callback throws', async () => {
    await expect(
      db.transaction(async () => {
        await db.executeQuery('INSERT INTO t (name) VALUES (?)', ['a']);
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');

    expect(await db.getMany('SELECT * FROM t')).toHaveLength(0);
  });

  it('leaves no transaction open after a rollback, so the next one can start', async () => {
    await expect(db.transaction(async () => { throw new Error('boom'); })).rejects.toThrow();

    // Would fail with "cannot start a transaction within a transaction" if the
    // failed attempt had leaked an open transaction onto the connection.
    await db.transaction(async () => {
      await db.executeQuery('INSERT INTO t (name) VALUES (?)', ['ok']);
    });

    expect(await db.getMany('SELECT * FROM t')).toHaveLength(1);
  });

  it('returns the callback value', async () => {
    const value = await db.transaction(async () => 42);

    expect(value).toBe(42);
  });

  it('rolls back a failure partway through, not just the failing statement', async () => {
    await expect(
      db.transaction(async () => {
        await db.executeQuery('INSERT INTO t (id, name) VALUES (1, ?)', ['a']);
        await db.executeQuery('INSERT INTO t (id, name) VALUES (1, ?)', ['duplicate']);
      })
    ).rejects.toThrow();

    expect(await db.getMany('SELECT * FROM t')).toHaveLength(0);
  });
});
