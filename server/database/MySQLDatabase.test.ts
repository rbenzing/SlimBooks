/**
 * Integration tests against a real MySQL or MariaDB server.
 *
 * Skipped when TEST_MYSQL_URL is unset, so a machine without a database still
 * runs the whole suite. CI sets it against both engines, which is what makes
 * the two-backend claim real rather than mocked.
 *
 *   docker run --rm -d --name slimbooks-mysql \
 *     -e MYSQL_ROOT_PASSWORD=root -e MYSQL_DATABASE=slimbooks_test \
 *     -p 3307:3306 mysql:8
 *   TEST_MYSQL_URL=mysql://root:root@127.0.0.1:3307/slimbooks_test npm test
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MySQLDatabase } from './MySQLDatabase.js';
import type { MysqlSettings } from '../runtime/database.js';

const url = process.env.TEST_MYSQL_URL;
const suite = url === undefined || url.length === 0 ? describe.skip : describe;

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

suite('MySQLDatabase', () => {
  const db = new MySQLDatabase();

  beforeAll(async () => {
    await db.connect({ driver: 'mysql', settings: settingsFrom(url as string) });
  });

  afterAll(async () => {
    await db.executeQuery('DROP TABLE IF EXISTS widgets');
    await db.disconnect();
  });

  beforeEach(async () => {
    await db.executeQuery('DROP TABLE IF EXISTS widgets');
    await db.executeQuery(`
      CREATE TABLE widgets (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(64) UNIQUE,
        qty INT,
        note TEXT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  });

  it('carries the mysql dialect', () => {
    expect(db.dialect.name).toBe('mysql');
  });

  it('reports the inserted id and affected rows', async () => {
    const result = await db.executeQuery('INSERT INTO widgets (name, qty) VALUES (?, ?)', ['a', 1]);

    expect(result.lastInsertRowid).toBeGreaterThan(0);
    expect(result.changes).toBe(1);
  });

  it('returns null rather than undefined for a missing row', async () => {
    // Callers test `=== null` and `?? fallback`; undefined would pass the first
    // and behave differently in the second.
    expect(await db.getOne('SELECT * FROM widgets WHERE name = ?', ['nope'])).toBeNull();
  });

  it('rolls a transaction back as a unit', async () => {
    // The property the recurring-invoice processor rests on: an interrupted run
    // must leave neither the invoice nor the advanced schedule behind.
    await expect(
      db.transaction(async () => {
        await db.executeQuery('INSERT INTO widgets (name, qty) VALUES (?, ?)', ['tx', 1]);
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');

    expect(await db.getOne('SELECT * FROM widgets WHERE name = ?', ['tx'])).toBeNull();
  });

  it('commits a transaction that returns normally', async () => {
    const returned = await db.transaction(async () => {
      await db.executeQuery('INSERT INTO widgets (name, qty) VALUES (?, ?)', ['ok', 5]);
      return 'result';
    });

    expect(returned).toBe('result');
    expect(await db.getOne<{ qty: number }>('SELECT qty FROM widgets WHERE name = ?', ['ok']))
      .toMatchObject({ qty: 5 });
  });

  it('keeps a transaction on one connection even though the pool has many', async () => {
    // Without connection pinning the INSERT and the COMMIT can land on different
    // pooled connections: the write autocommits and the rollback rolls back
    // nothing. The failure is invisible under low concurrency, which is exactly
    // when someone tests it by hand — so this reads its own uncommitted write,
    // which only succeeds on the connection holding the transaction.
    await db.transaction(async () => {
      await db.executeQuery('INSERT INTO widgets (name, qty) VALUES (?, ?)', ['pinned', 7]);

      const seen = await db.getOne<{ qty: number }>(
        'SELECT qty FROM widgets WHERE name = ?',
        ['pinned']
      );

      expect(seen?.qty).toBe(7);
    });

    expect(await db.getOne<{ qty: number }>('SELECT qty FROM widgets WHERE name = ?', ['pinned']))
      .toMatchObject({ qty: 7 });
  });

  it('does not leak the transaction connection to work that follows', async () => {
    // A connection released while still pinned would make every later query on
    // that borrowed handle silently transactional.
    await db.transaction(async () => {
      await db.executeQuery('INSERT INTO widgets (name, qty) VALUES (?, ?)', ['first', 1]);
    });

    await db.executeQuery('INSERT INTO widgets (name, qty) VALUES (?, ?)', ['after', 2]);

    expect(await db.getMany('SELECT name FROM widgets')).toHaveLength(2);
  });

  it('joins an outer transaction rather than opening a second one', async () => {
    // Matches SQLite, where BEGIN inside BEGIN is an error. The recurring
    // processor nests a transactional helper inside a transactional caller.
    await expect(
      db.transaction(async () => {
        await db.transaction(async () => {
          await db.executeQuery('INSERT INTO widgets (name, qty) VALUES (?, ?)', ['nested', 1]);
        });

        throw new Error('outer fails');
      })
    ).rejects.toThrow('outer fails');

    // The inner "commit" must not have made the row durable.
    expect(await db.getOne('SELECT * FROM widgets WHERE name = ?', ['nested'])).toBeNull();
  });

  it('reports table existence from the current schema only', async () => {
    expect(await db.tableExists('widgets')).toBe(true);
    expect(await db.tableExists('no_such_table')).toBe(false);
  });

  it('paginates and counts against the same filter', async () => {
    for (const name of ['a', 'b', 'c']) {
      await db.executeQuery('INSERT INTO widgets (name, qty) VALUES (?, ?)', [name, 1]);
    }

    const page = await db.getWithPagination('SELECT * FROM widgets WHERE qty = ?', [1], {
      limit: 2,
      offset: 0
    });

    expect(page.data).toHaveLength(2);
    expect(page.total).toBe(3);
  });

  it('returns timestamps as strings, not Date objects', async () => {
    // The columns are TEXT on both backends. Left to itself mysql2 hands back a
    // Date for DATE/DATETIME columns, and the two backends would return
    // different JavaScript types for the same row.
    const row = await db.getOne<{ stamp: string }>(
      "SELECT DATE_FORMAT(UTC_TIMESTAMP(),'%Y-%m-%d %H:%i:%s') as stamp"
    );

    expect(typeof row?.stamp).toBe('string');
    expect(row?.stamp).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  it('refuses a SQLite configuration rather than half-connecting', () => {
    const other = new MySQLDatabase();

    expect(other.connect({ driver: 'sqlite', path: ':memory:' })).rejects.toThrow(/sqlite/);
  });

  it('reports SQLite-only operations as unavailable rather than silently doing nothing', async () => {
    // A silent no-op would let the admin UI report a successful backup that
    // produced no file.
    expect(() => db.backup('/tmp/x.db')).toThrow(/mysqldump|db:export/);
    expect(() => db.vacuum()).toThrow(/InnoDB/);
    expect(() => db.pragma('journal_mode')).toThrow(/PRAGMA/);
  });
});
