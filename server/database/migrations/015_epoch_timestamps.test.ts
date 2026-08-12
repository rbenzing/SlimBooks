/**
 * Migration 015 against a real database, on both engines.
 *
 * This is the migration that touches every customer's data, so nothing here is
 * asserted against generated SQL. Each case builds a table holding the text
 * shapes a pre-2.2 install actually contains, runs the migration, and checks
 * the values, the column type, the constraints and the indexes that came out.
 *
 * SQLite always runs. MySQL runs when TEST_MYSQL_URL is set. A skipped MySQL
 * half is reported rather than silent.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SQLiteDatabase } from '../SQLiteDatabase.js';
import { MySQLDatabase } from '../MySQLDatabase.js';
import { retypeColumns } from '../retype.util.js';
import type { IDatabase } from '../../types/database.types.js';
import type { MysqlSettings } from '../../runtime/database.js';

const url = process.env.TEST_MYSQL_URL;

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

interface Backend {
  name: string;
  open: () => Promise<IDatabase>;
  close: (db: IDatabase) => Promise<void>;
  /** A retype_parent/retype_child pair in the pre-2.2 text shape. */
  ddl: string[];
  integerType: string;
}

let sqliteDir: string;

const backends: Backend[] = [
  {
    name: 'sqlite',
    open: async () => {
      sqliteDir = mkdtempSync(join(tmpdir(), 'slimbooks-015-'));
      const db = new SQLiteDatabase();
      await db.connect({
        driver: 'sqlite',
        path: join(sqliteDir, 'legacy.db'),
        options: { timeout: 5000 }
      });
      return db;
    },
    close: async db => {
      await db.disconnect();
      rmSync(sqliteDir, { recursive: true, force: true });
    },
    ddl: [
      `CREATE TABLE retype_parent (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        deleted_at TEXT
      )`,
      `CREATE TABLE retype_child (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        parent_id INTEGER,
        FOREIGN KEY (parent_id) REFERENCES retype_parent (id) ON DELETE CASCADE
      )`,
      'CREATE INDEX idx_parent_created ON retype_parent (created_at)'
    ],
    integerType: 'INTEGER'
  }
];

if (url !== undefined && url.length > 0) {
  backends.push({
    name: 'mysql',
    open: async () => {
      const db = new MySQLDatabase();
      await db.connect({ driver: 'mysql', settings: settingsFrom(url) });
      return db;
    },
    close: db => db.disconnect(),
    ddl: [
      `CREATE TABLE retype_parent (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(190) NOT NULL,
        created_at VARCHAR(64) NOT NULL,
        deleted_at VARCHAR(64)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE retype_child (
        id INT AUTO_INCREMENT PRIMARY KEY,
        parent_id INT,
        FOREIGN KEY (parent_id) REFERENCES retype_parent (id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      'CREATE INDEX idx_parent_created ON retype_parent (created_at)'
    ],
    integerType: 'BIGINT'
  });
}

describe('migration 015 coverage', () => {
  it('reports which backends are under test', () => {
    console.log(`migration 015 suite covering: ${backends.map(b => b.name).join(', ')}`);

    expect(backends.map(b => b.name)).toContain('sqlite');
  });

  it('includes MySQL whenever a server was configured', () => {
    if (url === undefined || url.length === 0) return;

    expect(backends.map(b => b.name)).toContain('mysql');
  });
});

describe.each(backends)('migration 015 on $name', backend => {
  let db: IDatabase;

  /** The three text shapes a pre-2.2 database holds, and their instants. */
  const LEGACY: ReadonlyArray<[string, string, number]> = [
    ['iso', '2026-08-12T13:54:13Z', Date.parse('2026-08-12T13:54:13Z')],
    ['millis', '2026-08-12T01:00:00.241Z', Date.parse('2026-08-12T01:00:00Z')],
    ['spaced', '2026-08-12 23:00:00', Date.parse('2026-08-12T23:00:00Z')]
  ];

  const retype = () =>
    retypeColumns(db, 'retype_parent', [
      {
        column: 'created_at',
        definition: `${backend.integerType} NOT NULL`,
        conversion: db.dialect.epochFromStored(
          db.dialect.name === 'sqlite' ? 'created_at' : '`created_at`'
        )
      },
      {
        column: 'deleted_at',
        definition: backend.integerType,
        conversion: db.dialect.epochFromStored(
          db.dialect.name === 'sqlite' ? 'deleted_at' : '`deleted_at`'
        )
      }
    ]);

  const rows = () =>
    db.getMany<{ name: string; created_at: number; deleted_at: number | null }>(
      'SELECT name, created_at, deleted_at FROM retype_parent ORDER BY name'
    );

  beforeAll(async () => {
    db = await backend.open();
  });

  afterAll(async () => {
    await db.executeQuery('DROP TABLE IF EXISTS retype_child');
    await db.executeQuery('DROP TABLE IF EXISTS retype_parent');
    await backend.close(db);
  });

  beforeEach(async () => {
    await db.executeQuery('DROP TABLE IF EXISTS retype_child');
    await db.executeQuery('DROP TABLE IF EXISTS retype_parent');
    for (const statement of backend.ddl) await db.executeQuery(statement);

    for (const [name, stored] of LEGACY) {
      await db.executeQuery('INSERT INTO retype_parent (name, created_at) VALUES (?, ?)', [name, stored]);
    }
    await db.executeQuery('INSERT INTO retype_child (parent_id) VALUES (?)', [1]);
  });

  it('converts every text shape to the right instant', async () => {
    await retype();

    const byName = new Map((await rows()).map(row => [row.name, row.created_at]));

    for (const [name, , expected] of LEGACY) {
      expect(Number(byName.get(name))).toBe(expected);
    }
  });

  it('leaves NULLs null rather than turning them into 1970', async () => {
    await retype();

    for (const row of await rows()) {
      expect(row.deleted_at).toBeNull();
    }
  });

  it('orders correctly afterwards, which is the point of the change', async () => {
    // Before: `spaced` holds "2026-08-12 23:00:00" and `millis` holds
    // "2026-08-12T01:00:00.241Z". A space sorts below `T`, so the 23:00 row
    // came back as the earlier one.
    const before = await db.getMany<{ name: string }>(
      'SELECT name FROM retype_parent ORDER BY created_at'
    );
    expect(before.map(row => row.name)).toEqual(['spaced', 'millis', 'iso']);

    await retype();

    const after = await db.getMany<{ name: string }>(
      'SELECT name FROM retype_parent ORDER BY created_at'
    );
    expect(after.map(row => row.name)).toEqual(['millis', 'iso', 'spaced']);
  });

  it('keeps the foreign key, and the row that depends on it', async () => {
    await retype();

    const retype_child = await db.getOne<{ parent_id: number }>('SELECT parent_id FROM retype_child');
    expect(retype_child?.parent_id).toBe(1);

    // The cascade still fires, so the constraint is real and not just declared.
    await db.executeQuery('DELETE FROM retype_parent WHERE id = ?', [1]);
    expect(await db.getOne('SELECT * FROM retype_child')).toBeNull();
  });

  it('keeps the index, which a rebuild silently drops', async () => {
    await retype();

    const found =
      db.dialect.name === 'sqlite'
        ? await db.getMany(
            "SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?",
            ['idx_parent_created']
          )
        : await db.getMany(
            `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'retype_parent' AND INDEX_NAME = ?`,
            ['idx_parent_created']
          );

    expect(found).toHaveLength(1);
  });

  it('keeps NOT NULL, which MODIFY drops when it is not restated', async () => {
    await retype();

    await expect(
      db.executeQuery('INSERT INTO retype_parent (name, created_at) VALUES (?, ?)', ['null', null])
    ).rejects.toThrow();
  });

  it('is idempotent', async () => {
    await retype();
    const first = await rows();

    // The second run must not re-apply the conversion. On SQLite that would be
    // destructive rather than merely wasteful: unixepoch() of a bare number is
    // NULL, because it reads it as a Julian day.
    await expect(retype()).resolves.toBe(false);
    expect(await rows()).toEqual(first);
  });

  it('resumes correctly after a crash between the update and the retype', async () => {
    // MySQL DDL is not transactional, so this is its real failure mode: the
    // values are converted but the column is still text. SQLite cannot reach
    // this state — its rebuild is one transaction — but the assertion holds
    // either way, which is why it is not skipped there.
    const quoted = db.dialect.name === 'sqlite' ? 'created_at' : '`created_at`';
    await db.executeQuery(
      `UPDATE retype_parent SET created_at = ${db.dialect.epochFromStored(quoted)}`
    );

    await retype();

    const byName = new Map((await rows()).map(row => [row.name, row.created_at]));
    for (const [name, , expected] of LEGACY) {
      expect(Number(byName.get(name))).toBe(expected);
    }
  });

  it('agrees with what the application writes afterwards', async () => {
    await retype();

    const now = Date.now();
    await db.executeQuery('INSERT INTO retype_parent (name, created_at) VALUES (?, ?)', ['fresh', now]);

    const row = await db.getOne<{ created_at: number }>(
      'SELECT created_at FROM retype_parent WHERE name = ?',
      ['fresh']
    );
    expect(Number(row?.created_at)).toBe(now);
  });
});
