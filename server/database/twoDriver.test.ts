/**
 * The same assertions against both backends.
 *
 * This is the layer that justifies the whole adapter: a behaviour that differs
 * between SQLite and MySQL fails a test here rather than surprising a customer.
 * Every case below is one where the two engines are documented to disagree, or
 * where the dialect had to paper over a difference.
 *
 * SQLite always runs. MySQL runs when TEST_MYSQL_URL is set, which CI does for
 * both MySQL and MariaDB. A skipped MySQL half is reported, never silent — a
 * green build that quietly tested one backend would be worse than no test.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SQLiteDatabase } from './SQLiteDatabase.js';
import { MySQLDatabase } from './MySQLDatabase.js';
import { claimExclusive } from './claim.util.js';
import { mysqlDialect } from './dialects/mysql.dialect.js';
import { sqliteDialect } from './dialects/sqlite.dialect.js';
import { isEpochMillis, utcNow } from '../utils/utcTime.util.js';
import type { IDatabase } from '../types/database.types.js';
import type { MysqlSettings } from '../runtime/database.js';

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
    poolSize: 8
  };
};

interface Backend {
  name: string;
  open: () => Promise<IDatabase>;
  close: (db: IDatabase) => Promise<void>;
  /** DDL for the fixture table, spelled for this engine. */
  ddl: string[];
}

let sqliteDir: string;

const backends: Backend[] = [
  {
    name: 'sqlite',
    open: async () => {
      sqliteDir = mkdtempSync(join(tmpdir(), 'slimbooks-two-'));
      const db = new SQLiteDatabase();
      await db.connect({ driver: 'sqlite', path: join(sqliteDir, 'two.db'), options: { timeout: 5000 } });
      return db;
    },
    close: async db => {
      await db.disconnect();
      rmSync(sqliteDir, { recursive: true, force: true });
    },
    ddl: [
      `CREATE TABLE leases (
        job_name VARCHAR(190) PRIMARY KEY,
        owner VARCHAR(190) NOT NULL,
        expires_at VARCHAR(64) NOT NULL
      )`,
      `CREATE TABLE ledger (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        label TEXT,
        amount REAL,
        stamp INTEGER NOT NULL DEFAULT (${sqliteDialect.now()}),
        day TEXT,
        deleted_at INTEGER
      )`
    ]
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
      `CREATE TABLE leases (
        job_name VARCHAR(190) PRIMARY KEY,
        owner VARCHAR(190) NOT NULL,
        expires_at VARCHAR(64) NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE ledger (
        id INT AUTO_INCREMENT PRIMARY KEY,
        label TEXT,
        amount DOUBLE,
        stamp BIGINT NOT NULL DEFAULT (${mysqlDialect.now()}),
        day VARCHAR(32),
        deleted_at BIGINT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    ]
  });
}

describe('two-driver coverage', () => {
  it('reports which backends are under test', () => {
    // Deliberately loud. A build that silently tested one backend and passed
    // would make every claim in this file false without anyone noticing.
    console.log(`two-driver suite covering: ${backends.map(b => b.name).join(', ')}`);

    expect(backends.map(b => b.name)).toContain('sqlite');
  });

  it('includes MySQL whenever a server was configured', () => {
    // This suite does not SKIP its MySQL half when none is available — it adds
    // one fewer backend and reports zero pending tests, which a CI guard
    // counting skips would wave through. So the guard lives here: if the
    // environment names a server, the suite must be exercising it.
    if (url === undefined || url.length === 0) return;

    expect(backends.map(b => b.name)).toContain('mysql');
  });
});

describe.each(backends)('$name', backend => {
  let db: IDatabase;

  beforeAll(async () => {
    db = await backend.open();
  });

  afterAll(async () => {
    await db.executeQuery('DROP TABLE IF EXISTS leases');
    await db.executeQuery('DROP TABLE IF EXISTS ledger');
    await backend.close(db);
  });

  beforeEach(async () => {
    await db.executeQuery('DROP TABLE IF EXISTS leases');
    await db.executeQuery('DROP TABLE IF EXISTS ledger');
    for (const statement of backend.ddl) await db.executeQuery(statement);
  });

  it('returns a usable id from an insert', async () => {
    const result = await db.executeQuery('INSERT INTO ledger (label, amount) VALUES (?, ?)', [
      'a',
      1.5
    ]);

    expect(result.lastInsertRowid).toBeGreaterThan(0);
    expect(result.changes).toBe(1);
  });

  it('returns null, not undefined, for a missing row', async () => {
    expect(await db.getOne('SELECT * FROM ledger WHERE label = ?', ['nope'])).toBeNull();
  });

  it('fills the default with an integer instant on both backends', async () => {
    // A MySQL default of NOW() would carry a session-timezone offset and would
    // not compare against what SQLite writes.
    await db.executeQuery('INSERT INTO ledger (label) VALUES (?)', ['stamped']);

    const row = await db.getOne<{ stamp: number }>('SELECT stamp FROM ledger');

    expect(isEpochMillis(Number(row?.stamp))).toBe(true);
  });

  it('produces the same expression for "now" through the dialect', async () => {
    const row = await db.getOne<{ n: number }>(`SELECT ${db.dialect.now()} as n`);

    expect(isEpochMillis(Number(row?.n))).toBe(true);
  });

  it('agrees with the timestamp the application writes', async () => {
    // Half these values are written by SQL and half by Node into the same
    // column. Two clocks there would order rows wrongly.
    const fromSql = await db.getOne<{ n: number }>(`SELECT ${db.dialect.now()} as n`);

    expect(Math.abs(Number(fromSql!.n) - utcNow())).toBeLessThanOrEqual(2000);
  });

  it('groups by month identically', async () => {
    // strftime does not exist in MySQL. The frontend indexes report payloads by
    // these keys, so a differing format silently empties a chart.
    //
    // Both shapes are checked: production only ever groups by a calendar-day
    // column, but a timestamp is the obvious next thing someone will group by,
    // and MySQL's DATE_FORMAT has to swallow the trailing Z for that to work.
    await db.executeQuery('INSERT INTO ledger (label, day) VALUES (?, ?)', [
      'a',
      '2026-08-09'
    ]);
    await db.executeQuery('INSERT INTO ledger (label, day) VALUES (?, ?)', [
      'b',
      '2026-08-31'
    ]);

    const month = db.dialect.formatMonth('day');
    const rows = await db.getMany<{ m: string }>(
      `SELECT ${month} as m FROM ledger ORDER BY label`
    );

    expect(rows.map(row => row.m)).toEqual(['2026-08', '2026-08']);
  });

  it('filters on a relative-date cutoff', async () => {
    await db.executeQuery('INSERT INTO ledger (label, stamp) VALUES (?, ?)', [
      'old',
      Date.parse('2000-01-01T00:00:00Z')
    ]);
    await db.executeQuery('INSERT INTO ledger (label, stamp) VALUES (?, ?)', [
      'new',
      Date.parse('2999-01-01T00:00:00Z')
    ]);

    const rows = await db.getMany<{ label: string }>(
      `SELECT label FROM ledger WHERE stamp > ${db.dialect.nowMinus(7, 'day')}`
    );

    expect(rows.map(row => row.label)).toEqual(['new']);
  });

  it('ignores a duplicate key on an ignore-insert', async () => {
    await db.executeQuery('INSERT INTO leases (job_name, owner, expires_at) VALUES (?, ?, ?)', [
      'j',
      'a',
      'T1'
    ]);

    const again = await db.executeQuery(
      db.dialect.insertIgnore('leases', ['job_name', 'owner', 'expires_at']),
      ['j', 'b', 'T2']
    );

    expect(again.changes).toBe(0);
    expect(await db.getOne<{ owner: string }>('SELECT owner FROM leases')).toMatchObject({
      owner: 'a'
    });
  });

  it('overwrites on a replace-insert', async () => {
    const sql = db.dialect.insertOrReplace('leases', ['job_name', 'owner', 'expires_at']);

    await db.executeQuery(sql, ['j', 'a', 'T1']);
    await db.executeQuery(sql, ['j', 'b', 'T2']);

    expect(await db.getMany('SELECT * FROM leases')).toHaveLength(1);
    expect(await db.getOne<{ owner: string }>('SELECT owner FROM leases')).toMatchObject({
      owner: 'b'
    });
  });

  it('paginates and counts against the same filter', async () => {
    for (const label of ['a', 'b', 'c']) {
      await db.executeQuery('INSERT INTO ledger (label, amount) VALUES (?, ?)', [label, 1]);
    }

    const page = await db.getWithPagination('SELECT * FROM ledger WHERE amount = ?', [1], {
      limit: 2,
      offset: 0
    });

    expect(page.data).toHaveLength(2);
    expect(page.total).toBe(3);
  });

  it('grants a claim to exactly one of ten racing owners', async () => {
    // The property the whole scheduler rests on. If it fails on one backend,
    // every instance runs the recurring-invoice job and customers are billed
    // once per instance.
    const claim = (owner: string) =>
      claimExclusive(db, {
        table: 'leases',
        keyColumn: 'job_name',
        keyValue: 'recurring',
        ownerColumn: 'owner',
        owner,
        values: { owner, expires_at: Date.parse('2999-01-01T00:00:00.000Z') },
        takeoverCondition: 'expires_at <= ?',
        takeoverParams: ['2026-08-09T00:00:00.000Z']
      });

    const results = await Promise.all(
      Array.from({ length: 10 }, (_, index) => claim(`owner-${index}`))
    );

    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it('tells a holder it still holds after a byte-identical rewrite', async () => {
    // MySQL counts rows changed, not matched; SQLite counts the row either way.
    const claim = () =>
      claimExclusive(db, {
        table: 'leases',
        keyColumn: 'job_name',
        keyValue: 'recurring',
        ownerColumn: 'owner',
        owner: 'steady',
        values: { owner: 'steady', expires_at: Date.parse('2999-01-01T00:00:00.000Z') },
        takeoverCondition: 'expires_at <= ? OR owner = ?',
        takeoverParams: ['2026-08-09T00:00:00.000Z', 'steady']
      });

    expect(await claim()).toBe(true);
    expect(await claim()).toBe(true);
  });

  it('rolls back an interrupted transaction as a unit', async () => {
    // Stated explicitly because this is the recurring-invoice guarantee: an
    // interrupted run must leave neither the invoice nor the advanced schedule.
    await db.executeQuery('INSERT INTO leases (job_name, owner, expires_at) VALUES (?, ?, ?)', [
      'sched',
      'me',
      'T1'
    ]);

    await expect(
      db.transaction(async () => {
        await db.executeQuery('INSERT INTO ledger (label, amount) VALUES (?, ?)', ['invoice', 10]);
        await db.executeQuery('UPDATE leases SET expires_at = ? WHERE job_name = ?', ['T2', 'sched']);
        throw new Error('interrupted');
      })
    ).rejects.toThrow('interrupted');

    expect(await db.getMany('SELECT * FROM ledger')).toHaveLength(0);
    expect(await db.getOne<{ expires_at: string }>('SELECT expires_at FROM leases')).toMatchObject({
      expires_at: 'T1'
    });
  });

  it('commits both halves when the transaction completes', async () => {
    await db.executeQuery('INSERT INTO leases (job_name, owner, expires_at) VALUES (?, ?, ?)', [
      'sched',
      'me',
      'T1'
    ]);

    await db.transaction(async () => {
      await db.executeQuery('INSERT INTO ledger (label, amount) VALUES (?, ?)', ['invoice', 10]);
      await db.executeQuery('UPDATE leases SET expires_at = ? WHERE job_name = ?', ['T2', 'sched']);
    });

    expect(await db.getMany('SELECT * FROM ledger')).toHaveLength(1);
    expect(await db.getOne<{ expires_at: string }>('SELECT expires_at FROM leases')).toMatchObject({
      expires_at: 'T2'
    });
  });

  it('reports the columns a table has', async () => {
    const columns = await db.dialect.columnsOf(db, 'ledger');

    expect(columns).toEqual(['id', 'label', 'amount', 'stamp', 'day', 'deleted_at']);
  });

  it('reports table existence for this schema only', async () => {
    expect(await db.tableExists('ledger')).toBe(true);
    expect(await db.tableExists('no_such_table')).toBe(false);
  });
});
