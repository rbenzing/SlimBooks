/**
 * The MySQL baseline, tested against a recording stand-in rather than a server.
 *
 * What this CAN establish: the capability gate refuses the versions and engines
 * it should, the statements are issued in an order that satisfies foreign keys,
 * every migration is recorded, and a second run is a no-op.
 *
 * What it CANNOT establish: that MySQL accepts the DDL. Only a real server can
 * say that, and MySQLDatabase.test.ts is where that is checked once one is
 * available. The two are complementary and neither substitutes for the other.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { assertMysqlCapabilities, buildMysqlBaseline } from './baseline.js';
import { mysqlDialect } from './dialects/mysql.dialect.js';
import { tableSchemas } from './schemas/tables.schema.js';
import type { IDatabase } from '../types/database.types.js';

interface FakeOptions {
  version?: string;
  innodb?: string | null;
  existingIndexes?: readonly string[];
  appliedMigrations?: readonly string[];
}

interface Fake {
  db: IDatabase;
  statements: string[];
  inserts: Array<{ sql: string; params: unknown[] }>;
}

const createFake = (options: FakeOptions = {}): Fake => {
  const statements: string[] = [];
  const inserts: Array<{ sql: string; params: unknown[] }> = [];
  const applied = new Set(options.appliedMigrations ?? []);
  const existingIndexes = new Set(options.existingIndexes ?? []);

  const db = {
    dialect: mysqlDialect,

    executeQuery: async (sql: string, params: unknown[] = []) => {
      statements.push(sql);
      if (/^INSERT INTO migrations/i.test(sql)) inserts.push({ sql, params });
      return { changes: 1, lastInsertRowid: 1 };
    },

    getOne: async <T>(sql: string, params: unknown[] = []): Promise<T | null> => {
      if (sql.includes('VERSION()')) {
        return { version: options.version ?? '8.0.35' } as T;
      }

      if (sql.includes('INFORMATION_SCHEMA.ENGINES')) {
        const support = options.innodb === undefined ? 'DEFAULT' : options.innodb;
        return support === null ? null : ({ ENGINE: 'InnoDB', SUPPORT: support } as T);
      }

      if (sql.includes('INFORMATION_SCHEMA.STATISTICS')) {
        return { count: existingIndexes.has(params[1] as string) ? 1 : 0 } as T;
      }

      return null;
    },

    getMany: async <T>(sql: string, params: unknown[] = []): Promise<T[]> => {
      if (sql.includes('FROM migrations')) {
        return (applied.has(params[0] as string) ? [{ id: params[0] }] : []) as T[];
      }
      return [] as T[];
    }
  } as unknown as IDatabase;

  return { db, statements, inserts };
};

describe('assertMysqlCapabilities', () => {
  it('accepts a current MySQL', async () => {
    await expect(assertMysqlCapabilities(createFake({ version: '8.0.35' }).db)).resolves
      .toBeUndefined();
  });

  it('accepts a current MariaDB', async () => {
    await expect(
      assertMysqlCapabilities(createFake({ version: '10.11.2-MariaDB-1:10.11.2+maria~ubu2204' }).db)
    ).resolves.toBeUndefined();
  });

  it('refuses MySQL below the expression-default floor', async () => {
    // Expression defaults arrived in 8.0.13, and TEXT columns can take a default
    // ONLY in expression form — which every created_at in this schema uses.
    // Below the floor the CREATE TABLE is a bare syntax error.
    await expect(assertMysqlCapabilities(createFake({ version: '8.0.12' }).db))
      .rejects.toThrow(/8\.0\.13/);
  });

  it('accepts MySQL exactly at the floor', async () => {
    await expect(assertMysqlCapabilities(createFake({ version: '8.0.13' }).db)).resolves
      .toBeUndefined();
  });

  it('refuses MariaDB below 10.2', async () => {
    await expect(assertMysqlCapabilities(createFake({ version: '10.1.48-MariaDB' }).db))
      .rejects.toThrow(/10\.2/);
  });

  it('does not mistake MariaDB 10.x for a MySQL below 8', async () => {
    // Naive comparison against the MySQL floor would reject every MariaDB.
    await expect(assertMysqlCapabilities(createFake({ version: '10.6.12-MariaDB' }).db)).resolves
      .toBeUndefined();
  });

  it('refuses a server where InnoDB is unavailable', async () => {
    // MyISAM ignores transactions without erroring, which would let an
    // interrupted recurring-invoice run bill a customer twice.
    await expect(assertMysqlCapabilities(createFake({ innodb: 'NO' }).db))
      .rejects.toThrow(/InnoDB/);

    await expect(assertMysqlCapabilities(createFake({ innodb: null }).db))
      .rejects.toThrow(/InnoDB/);
  });
});

describe('buildMysqlBaseline', () => {
  let fake: Fake;

  beforeEach(() => {
    fake = createFake();
  });

  it('checks capabilities before issuing any DDL', async () => {
    // Building half a schema and then failing leaves an operator worse off than
    // refusing at the start.
    const rejected = createFake({ version: '5.7.44' });

    await expect(buildMysqlBaseline(rejected.db)).rejects.toThrow();
    expect(rejected.statements).toEqual([]);
  });

  it('creates every table the SQLite schema declares', async () => {
    await buildMysqlBaseline(fake.db);

    for (const schema of tableSchemas) {
      expect(fake.statements.some(sql => sql.includes(`CREATE TABLE IF NOT EXISTS \`${schema.name}\``)))
        .toBe(true);
    }
  });

  it('creates the token tables, which live outside tableSchemas', async () => {
    await buildMysqlBaseline(fake.db);

    expect(fake.statements.some(sql => sql.includes('`password_reset_tokens`'))).toBe(true);
    expect(fake.statements.some(sql => sql.includes('`email_verification_tokens`'))).toBe(true);
  });

  it('creates a referenced table before the one that references it', async () => {
    await buildMysqlBaseline(fake.db);

    const at = (name: string) =>
      fake.statements.findIndex(sql => sql.includes(`CREATE TABLE IF NOT EXISTS \`${name}\``));

    expect(at('clients')).toBeLessThan(at('recurring_invoice_templates'));
    expect(at('users')).toBeLessThan(at('password_reset_tokens'));
  });

  it('records every migration as applied without executing one', async () => {
    await buildMysqlBaseline(fake.db);

    // Pinned rather than derived from the registry: comparing the recorder's
    // output against the same list it reads from would assert nothing. This
    // way, adding a migration fails here until someone confirms the baseline
    // should be recording it as already done.
    //
    // 014 rewrites legacy timestamp values and 015 retypes those columns to
    // integers. A database created from this baseline has neither problem —
    // every timestamp column is already BIGINT and already defaults to epoch
    // milliseconds. Recording both is correct.
    expect(fake.inserts.map(insert => insert.params[0])).toEqual([
      '001', '002', '003', '004', '006', '007', '008', '009', '010', '011', '012', '013',
      '014', '015'
    ]);
  });

  it('skips an index that already exists, since MySQL has no IF NOT EXISTS there', async () => {
    const withIndex = createFake({ existingIndexes: ['idx_clients_email'] });

    await buildMysqlBaseline(withIndex.db);

    expect(withIndex.statements.some(sql => sql.includes('idx_clients_email'))).toBe(false);
    expect(withIndex.statements.some(sql => sql.includes('idx_clients_is_active'))).toBe(true);
  });

  it('does not re-record a migration already applied, so a restart is safe', async () => {
    const resumed = createFake({ appliedMigrations: ['001', '002', '003'] });

    await buildMysqlBaseline(resumed.db);

    expect(resumed.inserts.map(insert => insert.params[0])).not.toContain('001');
    expect(resumed.inserts.map(insert => insert.params[0])).toContain('012');
  });

  it('issues no PRAGMA, which is the whole reason the baseline exists', async () => {
    await buildMysqlBaseline(fake.db);

    expect(fake.statements.some(sql => /PRAGMA/i.test(sql))).toBe(false);
  });
});
