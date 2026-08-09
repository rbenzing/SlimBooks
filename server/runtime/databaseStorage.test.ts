/**
 * Runs against in-memory SQLite, because the provider is dialect-neutral —
 * every statement it issues comes from the dialect or is portable ANSI SQL.
 * The MySQL-specific half is the BLOB round trip, which MySQLDatabase.test.ts
 * covers when a server is available.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import type { Readable } from 'node:stream';
import { DatabaseStorage } from './databaseStorage.js';
import { LocalDiskStorage } from './storage.js';
import { sqliteDialect } from '../database/dialects/sqlite.dialect.js';
import type { IDatabase } from '../types/database.types.js';

let raw: Database.Database;
let storage: DatabaseStorage;

const adapt = (database: Database.Database): IDatabase =>
  ({
    dialect: sqliteDialect,
    executeQuery: async (query: string, params: unknown[] = []) => {
      const info = database.prepare(query).run(...(params as never[]));
      return { changes: info.changes, lastInsertRowid: Number(info.lastInsertRowid) };
    },
    getOne: async <T>(query: string, params: unknown[] = []) =>
      (database.prepare(query).get(...(params as never[])) ?? null) as T | null
  }) as unknown as IDatabase;

const toBuffer = async (stream: Readable): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk as Buffer));
  return Buffer.concat(chunks);
};

beforeEach(() => {
  raw = new Database(':memory:');
  raw.exec(`
    CREATE TABLE stored_objects (
      \`key\` VARCHAR(255) PRIMARY KEY,
      content_type TEXT,
      size INTEGER NOT NULL,
      data BLOB NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const db = adapt(raw);
  storage = new DatabaseStorage(() => db);
});

afterEach(() => {
  raw.close();
});

describe('DatabaseStorage', () => {
  it('round-trips an object', async () => {
    await storage.put('logos/a.png', Buffer.from('hello'), { contentType: 'image/png' });

    const stream = await storage.get('logos/a.png');

    expect(stream).not.toBeNull();
    expect((await toBuffer(stream as Readable)).toString()).toBe('hello');
  });

  it('round-trips binary content unchanged', async () => {
    // A logo is not text. A driver that returned a Uint8Array view, or a
    // provider that stringified it, would corrupt every PNG silently.
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff]);

    await storage.put('logos/b.png', bytes);

    expect(await toBuffer((await storage.get('logos/b.png')) as Readable)).toEqual(bytes);
  });

  it('records the size and content type it was given', async () => {
    await storage.put('logos/a.png', Buffer.from('hello'), { contentType: 'image/png' });

    const row = raw.prepare('SELECT content_type, size FROM stored_objects').get() as {
      content_type: string;
      size: number;
    };

    expect(row).toEqual({ content_type: 'image/png', size: 5 });
  });

  it('returns null for a missing key rather than throwing', async () => {
    expect(await storage.get('logos/missing.png')).toBeNull();
  });

  it('overwrites rather than erroring on a repeated key', async () => {
    // An interrupted upload retried with the same key must succeed.
    await storage.put('logos/a.png', Buffer.from('one'));
    await storage.put('logos/a.png', Buffer.from('two'));

    expect((await toBuffer((await storage.get('logos/a.png')) as Readable)).toString()).toBe('two');
  });

  it('makes deleting an absent object a success, so cleanup is re-runnable', async () => {
    await expect(storage.delete('logos/gone.png')).resolves.toBeUndefined();
  });

  it('reports existence without loading the object', async () => {
    await storage.put('logos/a.png', Buffer.from('x'));

    expect(await storage.exists('logos/a.png')).toBe(true);
    expect(await storage.exists('logos/b.png')).toBe(false);
  });

  it('rejects an unsafe key with the same rules as the disk provider', async () => {
    // The key is still attacker-influenced here, and publicUrl puts it straight
    // into a URL, so the validation is not a filesystem concern it can skip.
    await expect(storage.put('../escape.png', Buffer.from('x'))).rejects.toThrow(/traversal/);
    await expect(storage.get('/etc/passwd')).rejects.toThrow(/relative/);
  });

  it('produces the same public URL as the disk provider, so stored settings keep working', () => {
    const disk = new LocalDiskStorage('/tmp/uploads');

    expect(storage.publicUrl('logos/a.png')).toBe(disk.publicUrl('logos/a.png'));
    expect(storage.publicUrl('logos/a.png')).toBe('/uploads/logos/a.png');
  });

  it('resolves the database at call time, not at construction', async () => {
    // The runtime builds this provider before any driver is chosen, so a
    // captured instance would pin the unconnected SQLite singleton.
    let current: IDatabase | null = null;
    const late = new DatabaseStorage(() => {
      if (current === null) throw new Error('resolved too early');
      return current;
    });

    current = adapt(raw);

    await expect(late.put('logos/late.png', Buffer.from('ok'))).resolves.toBeUndefined();
  });
});
