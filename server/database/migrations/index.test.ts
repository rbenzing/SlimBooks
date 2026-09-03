/**
 * applyDataRepairsAndMarkMigrationsApplied, using small injected migrations.
 *
 * baseline.test.ts and baselineDataRepair.test.ts prove the real registered
 * migrations behave correctly through the MySQL baseline; this proves the
 * selection mechanism itself, in isolation, against real SQLite (not a fake
 * that would need to parse SQL) via the `list` parameter meant exactly for
 * this: substituting the real registry with fakes small enough to assert on
 * directly.
 *
 * The distinction under test is the entire point of this branch's fix: a
 * migration flagged `repairsData` must have its up() actually invoked before
 * being recorded, because it repairs existing rows and is dialect-neutral —
 * whereas an unflagged migration (schema archaeology, replayed only by
 * SQLite's own runMigrations()) must never have its up() invoked here, only
 * recorded as already applied.
 */

import { describe, it, expect, vi } from 'vitest';
import Database from 'better-sqlite3';
import { applyDataRepairsAndMarkMigrationsApplied, type Migration } from './index.js';
import { sqliteDialect } from '../dialects/sqlite.dialect.js';
import type { IDatabase } from '../../types/database.types.js';

/** Minimal IDatabase surface backed by a fresh in-memory SQLite database. */
const createDb = (): IDatabase => {
  const raw = new Database(':memory:');

  return {
    dialect: sqliteDialect,
    executeQuery: async (query: string, params: unknown[] = []) => {
      const info = raw.prepare(query).run(...(params as never[]));
      return { changes: info.changes, lastInsertRowid: Number(info.lastInsertRowid) };
    },
    getMany: async <T>(query: string, params: unknown[] = []) =>
      raw.prepare(query).all(...(params as never[])) as T[]
  } as unknown as IDatabase;
};

describe('applyDataRepairsAndMarkMigrationsApplied', () => {
  it("runs a repairsData migration's up() but not a plain one's", async () => {
    const db = createDb();
    const schemaUp = vi.fn(async () => undefined);
    const repairUp = vi.fn(async () => undefined);

    const list: Migration[] = [
      { id: 'a', name: 'schema-archaeology', up: schemaUp },
      { id: 'b', name: 'data-repair', up: repairUp, repairsData: true }
    ];

    await applyDataRepairsAndMarkMigrationsApplied(db, list);

    expect(schemaUp).not.toHaveBeenCalled();
    expect(repairUp).toHaveBeenCalledTimes(1);
  });

  it('records both a plain and a repairsData migration as applied', async () => {
    const db = createDb();
    const list: Migration[] = [
      { id: 'a', name: 'schema-archaeology', up: vi.fn(async () => undefined) },
      { id: 'b', name: 'data-repair', up: vi.fn(async () => undefined), repairsData: true }
    ];

    await applyDataRepairsAndMarkMigrationsApplied(db, list);

    const rows = await db.getMany<{ id: string }>('SELECT id FROM migrations ORDER BY id');
    expect(rows.map(row => row.id)).toEqual(['a', 'b']);
  });

  it('does not re-run or re-record a repairsData migration already applied', async () => {
    const db = createDb();
    const repairUp = vi.fn(async () => undefined);
    const list: Migration[] = [{ id: 'b', name: 'data-repair', up: repairUp, repairsData: true }];

    await applyDataRepairsAndMarkMigrationsApplied(db, list);
    repairUp.mockClear();

    await applyDataRepairsAndMarkMigrationsApplied(db, list);

    expect(repairUp).not.toHaveBeenCalled();
    const rows = await db.getMany<{ id: string }>('SELECT id FROM migrations WHERE id = ?', ['b']);
    expect(rows).toHaveLength(1);
  });

  it('does not record a repairsData migration whose up() fails', async () => {
    // If a boot were killed between running the repair and recording it, the
    // row must still read "not applied" so the next boot retries the repair
    // rather than skipping it forever having never actually run. A failed
    // up() is the same shape of problem and must leave the same trace.
    const db = createDb();
    const list: Migration[] = [
      {
        id: 'b',
        name: 'data-repair',
        up: vi.fn(async () => {
          throw new Error('repair failed');
        }),
        repairsData: true
      }
    ];

    await expect(applyDataRepairsAndMarkMigrationsApplied(db, list)).rejects.toThrow('repair failed');

    const rows = await db.getMany<{ id: string }>('SELECT id FROM migrations WHERE id = ?', ['b']);
    expect(rows).toHaveLength(0);
  });
});
