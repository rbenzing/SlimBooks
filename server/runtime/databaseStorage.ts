// StorageProvider backed by the database already connected.
//
// Selected with STORAGE_DRIVER=database, for hosts whose filesystem does not
// survive a redeploy. Uploaded logos then travel with the database backup
// instead of being a separate thing to remember.

import { Readable } from 'node:stream';
import type { IDatabase } from '../types/database.types.js';
import { assertSafeKey, type StorageObjectMeta, type StorageProvider } from './storage.js';

interface StoredRow {
  data: Buffer | Uint8Array;
}

export class DatabaseStorage implements StorageProvider {
  private readonly resolveDb: () => IDatabase;
  private readonly urlPrefix: string;

  /**
   * Takes an accessor, not an instance.
   *
   * The runtime is resolved before any database connection exists, and
   * initializeDatabase later swaps in the selected driver. Capturing an
   * instance here would pin whichever object happened to exist at boot — under
   * DB_DRIVER=mysql the unconnected SQLite singleton — and every upload would
   * fail with "Database not connected".
   */
  constructor(resolveDb: () => IDatabase, urlPrefix = '/uploads') {
    this.resolveDb = resolveDb;
    this.urlPrefix = urlPrefix.replace(/\/+$/, '');
  }

  private get db(): IDatabase {
    return this.resolveDb();
  }

  async put(key: string, data: Buffer, meta?: StorageObjectMeta): Promise<void> {
    assertSafeKey(key);

    // Replace rather than insert, so an interrupted upload retried with the
    // same key succeeds — matching the disk provider, whose temp-then-rename
    // write is likewise safe to repeat.
    const sql = this.db.dialect.insertOrReplace('stored_objects', [
      'key',
      'content_type',
      'size',
      'data'
    ]);

    await this.db.executeQuery(sql, [key, meta?.contentType ?? null, data.length, data]);
  }

  async get(key: string): Promise<Readable | null> {
    assertSafeKey(key);

    const row = await this.db.getOne<StoredRow>(
      'SELECT data FROM stored_objects WHERE `key` = ?',
      [key]
    );

    if (row === null) return null;

    // Buffer.from normalises the two drivers: better-sqlite3 returns a Buffer,
    // mysql2 may return a Uint8Array view.
    return Readable.from(Buffer.from(row.data));
  }

  async delete(key: string): Promise<void> {
    assertSafeKey(key);

    // Deleting an absent object is a success, so cleanup paths stay safe to
    // re-run after an interrupted request.
    await this.db.executeQuery('DELETE FROM stored_objects WHERE `key` = ?', [key]);
  }

  async exists(key: string): Promise<boolean> {
    assertSafeKey(key);

    // Selects the key, not the object. This is called on request paths, and
    // pulling a 5 MB BLOB into memory to answer a boolean would be absurd.
    const row = await this.db.getOne<{ key: string }>(
      'SELECT `key` FROM stored_objects WHERE `key` = ?',
      [key]
    );

    return row !== null;
  }

  publicUrl(key: string): string {
    assertSafeKey(key);

    // Identical to the disk provider's, so logo URLs already saved in settings
    // keep resolving and nothing needs migrating.
    return `${this.urlPrefix}/${key}`;
  }
}
