/**
 * The last-administrator guard, against real engines.
 *
 * The unit tests assert the SQL's shape. This asserts that SQLite, MySQL and
 * MariaDB each accept it and give the same answer — which is a different
 * question, and the one this project keeps getting wrong by assuming.
 *
 * MySQL rejects the bare form of this subquery outright (error 1093), so
 * "it passed on MariaDB" is not evidence. Run it against MySQL:
 *
 *   TEST_MYSQL_URL=mysql://root:root@127.0.0.1:3307/slimbooks_test npx vitest run server/services/userInvariantLive.test.ts
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { MySQLDatabase } from '../database/MySQLDatabase.js';
import { deleteUserSql, guardedUpdateSql } from '../utils/adminInvariant.util.js';
import type { MysqlSettings } from '../runtime/database.js';

/** Live DDL against a shared server needs longer than vitest's 10s default. */
const DDL_TIMEOUT_MS = 60_000;

/**
 * A stand-in for `databaseService` that forwards to whichever engine the
 * enclosing suite is running against.
 *
 * `UserService.updateUser` decides for itself whether to attach the guard, and
 * that decision is exactly what shipped broken — it read the *type* of the
 * requested role, so `{ role: 123 }` produced an UPDATE with no predicate and
 * demoted the only administrator, live, returning 200. Every live test here
 * called the SQL builders directly, so the decision never ran against an
 * engine and nothing caught it. These tests drive the service.
 */
const engine = vi.hoisted(() => ({
  getOne: vi.fn(),
  executeQuery: vi.fn()
}));

vi.mock('../core/DatabaseService.js', () => ({ databaseService: engine }));

const { userService } = await import('./UserService.js');

/** What better-sqlite3 will accept as a bound value. */
type Bindable = number | string | bigint | Buffer | null;

/**
 * This suite's own table, deliberately not `users`.
 *
 * `baselineLive.test.ts` drops every table in `tableSchemas` — `users` among
 * them — in the same `slimbooks_test` database, and `vitest.config.ts` sets no
 * `fileParallelism: false`, so test files run in parallel. Operating on `users`
 * here would race that suite and fail in a way that looks like the guard is
 * broken when it is not.
 */
const PROBE_TABLE = 'invariant_probe';

/**
 * `UserService` names `users` in its own SQL, so driving it against the probe
 * table means renaming the table on the way through. `live_admins` survives —
 * `_` is a word character, so the boundary does not match inside it.
 */
const onProbe = (sql: string): string => sql.replace(/\busers\b/g, PROBE_TABLE);

/** Every column `UserService`'s public projection selects, plus the guard's. */
const SQLITE_DDL = `
  CREATE TABLE ${PROBE_TABLE} (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT,
    username TEXT,
    role TEXT,
    email_verified INTEGER,
    last_login INTEGER,
    failed_login_attempts INTEGER,
    account_locked_until INTEGER,
    created_at INTEGER,
    updated_at INTEGER,
    deleted_at INTEGER
  ) STRICT
`;

const MYSQL_DDL = `
  CREATE TABLE ${PROBE_TABLE} (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NULL,
    username VARCHAR(255) NULL,
    role VARCHAR(50),
    email_verified TINYINT NULL,
    last_login BIGINT NULL,
    failed_login_attempts INT NULL,
    account_locked_until BIGINT NULL,
    created_at BIGINT NULL,
    updated_at BIGINT NULL,
    deleted_at BIGINT NULL
  ) ENGINE=InnoDB
`;

/**
 * Role values a caller can put on the wire that are not strings.
 *
 * `PUT /api/users/1 {"userData":{"role":123}}` answered 200 and left the
 * install with no administrator. Each of these is a role change away from
 * `admin` and must carry the guard.
 */
const HOSTILE_ROLES = [123, null, ''];

describe('last-administrator guard on SQLite', () => {
  const db = new Database(':memory:');

  beforeAll(() => {
    db.exec(SQLITE_DDL);
  });

  afterAll(() => {
    db.close();
  });

  beforeEach(() => {
    db.exec(`DELETE FROM ${PROBE_TABLE}`);
    db.exec(`DELETE FROM sqlite_sequence WHERE name = '${PROBE_TABLE}'`);

    vi.clearAllMocks();
    engine.getOne.mockImplementation(
      (sql: string, params: unknown[] = []) =>
        db.prepare(onProbe(sql)).get(...(params as Bindable[])) ?? null
    );
    engine.executeQuery.mockImplementation((sql: string, params: unknown[] = []) => {
      const info = db.prepare(onProbe(sql)).run(...(params as Bindable[]));
      return { changes: info.changes, lastInsertRowid: Number(info.lastInsertRowid) };
    });
  });

  const addAdmin = (name: string, deletedAt: number | null = null): number =>
    Number(
      db
        .prepare(`INSERT INTO ${PROBE_TABLE} (name, role, deleted_at) VALUES (?, ?, ?)`)
        .run(name, 'admin', deletedAt).lastInsertRowid
    );

  const liveAdmins = (): number =>
    (
      db
        .prepare(`SELECT COUNT(*) AS c FROM ${PROBE_TABLE} WHERE role = 'admin' AND deleted_at IS NULL`)
        .get() as { c: number }
    ).c;

  it('refuses to delete the last administrator, and leaves the row', () => {
    const id = addAdmin('Ada');

    expect(db.prepare(deleteUserSql(PROBE_TABLE)).run(id).changes).toBe(0);
    expect(liveAdmins()).toBe(1);
  });

  it('deletes an administrator while another remains', () => {
    const id = addAdmin('Ada');
    addAdmin('Grace');

    expect(db.prepare(deleteUserSql(PROBE_TABLE)).run(id).changes).toBe(1);
    expect(liveAdmins()).toBe(1);
  });

  it('does not count a soft-deleted administrator toward the minimum', () => {
    const id = addAdmin('Ada');
    addAdmin('Grace', 1_700_000_000_000);

    expect(db.prepare(deleteUserSql(PROBE_TABLE)).run(id).changes).toBe(0);
    expect(liveAdmins()).toBe(1);
  });

  it('refuses to demote the last administrator, and leaves the role', () => {
    const id = addAdmin('Ada');
    const sql = guardedUpdateSql(['role'], true, PROBE_TABLE);

    expect(db.prepare(sql).run('user', id).changes).toBe(0);
    expect(liveAdmins()).toBe(1);
  });

  it('demotes an administrator while another remains', () => {
    const id = addAdmin('Ada');
    addAdmin('Grace');
    const sql = guardedUpdateSql(['role'], true, PROBE_TABLE);

    expect(db.prepare(sql).run('user', id).changes).toBe(1);
    expect(liveAdmins()).toBe(1);
  });

  const roleOf = (id: number): unknown =>
    (db.prepare(`SELECT role FROM ${PROBE_TABLE} WHERE id = ?`).get(id) as { role: unknown }).role;

  it('refuses a demotion of the last administrator through the service', () => {
    const id = addAdmin('Ada');

    return expect(userService.updateUser(id, { role: 'user' })).resolves.toBe('refused');
  });

  it.each(HOSTILE_ROLES)(
    'guards a role of %p against the last administrator rather than trusting its type',
    async role => {
      const id = addAdmin('Ada');

      await expect(userService.updateUser(id, { role } as never)).resolves.toBe('refused');
      expect(engine.executeQuery.mock.calls.at(-1)?.[0]).toContain('live_admins');
      expect(roleOf(id)).toBe('admin');
      expect(liveAdmins()).toBe(1);
    }
  );

  it('lets the same role through once a second administrator exists', async () => {
    const id = addAdmin('Ada');
    addAdmin('Grace');

    await expect(userService.updateUser(id, { role: 'user' })).resolves.toBe('applied');
    expect(roleOf(id)).toBe('user');
    expect(liveAdmins()).toBe(1);
  });
});

const url = process.env.TEST_MYSQL_URL;
const live = url === undefined || url.length === 0 ? describe.skip : describe;

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

live('last-administrator guard on a real MySQL-family server', () => {
  const db = new MySQLDatabase();

  beforeAll(async () => {
    await db.connect({ driver: 'mysql', settings: settingsFrom(url as string) });
    await db.executeQuery(`DROP TABLE IF EXISTS ${PROBE_TABLE}`);
    await db.executeQuery(MYSQL_DDL);
  }, DDL_TIMEOUT_MS);

  afterAll(async () => {
    await db.executeQuery(`DROP TABLE IF EXISTS ${PROBE_TABLE}`);
    await db.disconnect();
  }, DDL_TIMEOUT_MS);

  beforeEach(async () => {
    await db.executeQuery(`DELETE FROM ${PROBE_TABLE}`);

    vi.clearAllMocks();
    engine.getOne.mockImplementation((sql: string, params: unknown[] = []) =>
      db.getOne(onProbe(sql), params as never)
    );
    engine.executeQuery.mockImplementation((sql: string, params: unknown[] = []) =>
      db.executeQuery(onProbe(sql), params as never)
    );
  });

  const addAdmin = async (name: string, deletedAt: number | null = null): Promise<number> => {
    const result = await db.executeQuery(
      `INSERT INTO ${PROBE_TABLE} (name, role, deleted_at) VALUES (?, ?, ?)`,
      [name, 'admin', deletedAt]
    );

    return result.lastInsertRowid;
  };

  const liveAdmins = async (): Promise<number> => {
    const row = await db.getOne<{ c: number }>(
      `SELECT COUNT(*) AS c FROM ${PROBE_TABLE} WHERE role = 'admin' AND deleted_at IS NULL`
    );

    return row?.c ?? 0;
  };

  it('accepts the guard at all — a bare subquery here is error 1093', async () => {
    const id = await addAdmin('Ada');

    // The assertion is that this does not throw.
    await expect(db.executeQuery(deleteUserSql(PROBE_TABLE), [id])).resolves.toBeDefined();
  });

  it('refuses to delete the last administrator, and leaves the row', async () => {
    const id = await addAdmin('Ada');
    const result = await db.executeQuery(deleteUserSql(PROBE_TABLE), [id]);

    expect(result.changes).toBe(0);
    expect(await liveAdmins()).toBe(1);
  });

  it('deletes an administrator while another remains', async () => {
    const id = await addAdmin('Ada');
    await addAdmin('Grace');
    const result = await db.executeQuery(deleteUserSql(PROBE_TABLE), [id]);

    expect(result.changes).toBe(1);
    expect(await liveAdmins()).toBe(1);
  });

  it('does not count a soft-deleted administrator toward the minimum', async () => {
    const id = await addAdmin('Ada');
    await addAdmin('Grace', 1_700_000_000_000);
    const result = await db.executeQuery(deleteUserSql(PROBE_TABLE), [id]);

    expect(result.changes).toBe(0);
    expect(await liveAdmins()).toBe(1);
  });

  it('refuses to demote the last administrator', async () => {
    const id = await addAdmin('Ada');
    const result = await db.executeQuery(guardedUpdateSql(['role'], true, PROBE_TABLE), ['user', id]);

    expect(result.changes).toBe(0);
    expect(await liveAdmins()).toBe(1);
  });

  /**
   * Rows this statement changed, counting a deadlock as none.
   *
   * The guard's subquery counts administrators, so a race over the last two
   * scans rows the other statement is locking, and InnoDB may break the tie by
   * raising ER_LOCK_DEADLOCK (1213) rather than serialising the pair. It is
   * intermittent and it happens on **both** engines — MySQL 8.4 roughly one
   * full run in five, MariaDB 10.11 more readily on the mixed race. Asserting
   * `changes === 1` therefore makes the concurrency proof itself flaky, which
   * is how it was written.
   *
   * The engine rolls a deadlocked statement back whole, so the loser changed
   * nothing and the invariant holds either way. What differs is what the
   * caller sees: a deadlock surfaces as an error, not the 409 a guard refusal
   * gives. That is the engine's answer to a collision, not the guard failing —
   * but it is the reason these assert on the invariant rather than on which of
   * the two endings occurred.
   */
  const changedRows = async (sql: string, params: Array<string | number>): Promise<number> => {
    try {
      return (await db.executeQuery(sql, params)).changes;
    } catch (error) {
      if (!/deadlock/i.test((error as Error).message)) throw error;
      return 0;
    }
  };

  it('survives two concurrent deletes of the last two administrators', async () => {
    // The reason this is a statement-level guard and not a count-then-delete:
    // both callers would pass a count of 2 and both would proceed.
    const first = await addAdmin('Ada');
    const second = await addAdmin('Grace');

    const results = await Promise.all([
      changedRows(deleteUserSql(PROBE_TABLE), [first]),
      changedRows(deleteUserSql(PROBE_TABLE), [second])
    ]);

    const deleted = results.reduce((total, changes) => total + changes, 0);

    expect(deleted).toBeLessThanOrEqual(1);
    expect(await liveAdmins()).toBe(2 - deleted);
  });

  it('survives two concurrent demotions of the last two administrators', async () => {
    // Demotion races for the same reason delete does; only delete was proved.
    const first = await addAdmin('Ada');
    const second = await addAdmin('Grace');
    const sql = guardedUpdateSql(['role'], true, PROBE_TABLE);

    const results = await Promise.all([
      changedRows(sql, ['user', first]),
      changedRows(sql, ['user', second])
    ]);

    const demoted = results.reduce((total, changes) => total + changes, 0);

    expect(demoted).toBeLessThanOrEqual(1);
    expect(await liveAdmins()).toBe(2 - demoted);
  });

  it('survives a delete racing a demotion of the last two administrators', async () => {
    // The mixed race is the one an application-level count misses most easily:
    // the two operations are guarded in different call paths and neither sees
    // the other. One predicate, one statement each, so the engine settles it.
    const first = await addAdmin('Ada');
    const second = await addAdmin('Grace');

    const [deleted, demoted] = await Promise.all([
      changedRows(deleteUserSql(PROBE_TABLE), [first]),
      changedRows(guardedUpdateSql(['role'], true, PROBE_TABLE), ['user', second])
    ]);

    // At most one may take effect, and every administrator the pair did not
    // remove is still there.
    expect(deleted + demoted).toBeLessThanOrEqual(1);
    expect(await liveAdmins()).toBe(2 - (deleted + demoted));
  });

  const roleOf = async (id: number): Promise<unknown> =>
    (await db.getOne<{ role: unknown }>(`SELECT role FROM ${PROBE_TABLE} WHERE id = ?`, [id]))?.role;

  it('refuses a demotion of the last administrator through the service', async () => {
    const id = await addAdmin('Ada');

    await expect(userService.updateUser(id, { role: 'user' })).resolves.toBe('refused');
  });

  it.each(HOSTILE_ROLES)(
    'guards a role of %p against the last administrator rather than trusting its type',
    async role => {
      const id = await addAdmin('Ada');

      await expect(userService.updateUser(id, { role } as never)).resolves.toBe('refused');
      expect(engine.executeQuery.mock.calls.at(-1)?.[0]).toContain('live_admins');
      expect(await roleOf(id)).toBe('admin');
      expect(await liveAdmins()).toBe(1);
    }
  );

  it('lets the same role through once a second administrator exists', async () => {
    const id = await addAdmin('Ada');
    await addAdmin('Grace');

    await expect(userService.updateUser(id, { role: 'user' })).resolves.toBe('applied');
    expect(await roleOf(id)).toBe('user');
    expect(await liveAdmins()).toBe(1);
  });
});
