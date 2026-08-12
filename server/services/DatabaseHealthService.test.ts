/**
 * DatabaseHealthService tests.
 *
 * This service answers "is the database alright?", so its own failure modes
 * matter more than usual: a health check that swallows an error and reports
 * healthy is worse than no health check. The other property worth pinning is
 * that table names reaching an interpolated statement are validated first —
 * these are the only queries in the codebase that cannot use a placeholder.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createDatabaseMock, flattenSql } from './databaseMock.test-helper.js';

const db = createDatabaseMock();
vi.mock('../core/DatabaseService.js', () => ({ databaseService: db }));

const { databaseHealthService: health } = await import('./DatabaseHealthService.js');

/** Tables the schema actually creates. */
const REAL_TABLES = [
  'users', 'clients', 'invoices', 'invoice_items', 'payments', 'expenses',
  'invoice_design_templates', 'recurring_invoice_templates', 'settings',
  'project_settings', 'reports', 'counters'
];

beforeEach(() => {
  db.reset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('performHealthCheck', () => {
  it('reports healthy when the connectivity probe answers', async () => {
    db.getOne.mockReturnValue({ test: 1 });

    const result = await health.performHealthCheck();

    expect(result).toMatchObject({ status: 'healthy', connectivity: true });
    expect(result.timestamp).toBeTruthy();
  });

  it('probes with a query that touches no table', async () => {
    db.getOne.mockReturnValue({ test: 1 });

    await health.performHealthCheck();

    expect(flattenSql(db.getOne.mock.calls[0][0] as string)).toBe('SELECT 1 as test');
  });

  it('raises rather than reporting healthy when the probe returns nothing', async () => {
    // Reporting healthy here would hide a database that is not answering.
    db.getOne.mockReturnValue(undefined);

    await expect(health.performHealthCheck()).rejects.toThrow(/health check failed/i);
  });

  it('raises when the probe returns the wrong answer', async () => {
    db.getOne.mockReturnValue({ test: 0 });

    await expect(health.performHealthCheck()).rejects.toThrow(/health check failed/i);
  });

  it('raises when the query itself throws', async () => {
    db.getOne.mockImplementation(() => { throw new Error('database is locked'); });

    await expect(health.performHealthCheck()).rejects.toThrow(/database is locked/);
  });
});

describe('checkDatabaseHealth', () => {
  it('answers true only when the database is reachable', async () => {
    db.getOne.mockReturnValue({ test: 1 });

    await expect(health.checkDatabaseHealth()).resolves.toBe(true);
  });

  it('answers false instead of throwing at a route boundary', async () => {
    db.getOne.mockImplementation(() => { throw new Error('locked'); });

    await expect(health.checkDatabaseHealth()).resolves.toBe(false);
  });
});

describe('isValidTableName', () => {
  it('accepts every table the schema creates', () => {
    for (const table of REAL_TABLES) {
      expect(health.isValidTableName(table)).toBe(true);
    }
  });

  it('rejects anything that could break out of an interpolated statement', () => {
    // These names reach the SQL text directly, so the pattern is the only guard.
    for (const name of [
      'users; DROP TABLE users',
      'users--',
      "users' OR '1'='1",
      'users invoices',
      'users)',
      '1users',
      'user.table',
      ''
    ]) {
      expect(health.isValidTableName(name)).toBe(false);
    }
  });

  it('rejects a non-string', () => {
    expect(health.isValidTableName(null as never)).toBe(false);
    expect(health.isValidTableName(123 as never)).toBe(false);
  });
});

describe('getTableCount', () => {
  it('counts rows in a valid table', async () => {
    db.getOne.mockReturnValue({ count: 12 });

    expect(await health.getTableCount('clients')).toBe(12);
    expect(flattenSql(db.getOne.mock.calls[0][0] as string))
      .toBe('SELECT COUNT(*) as count FROM clients');
  });

  it('refuses to build a statement from an unvalidated name', async () => {
    expect(await health.getTableCount('users; DROP TABLE users')).toBe(0);
    expect(db.getOne).not.toHaveBeenCalled();
  });

  it('reports zero for a table that does not exist rather than throwing', async () => {
    db.getOne.mockImplementation(() => { throw new Error('no such table'); });

    expect(await health.getTableCount('missing_table')).toBe(0);
  });

  it('reports zero when the count comes back empty', async () => {
    db.getOne.mockReturnValue(undefined);

    expect(await health.getTableCount('clients')).toBe(0);
  });
});

describe('getDatabaseStatistics', () => {
  it('counts only tables the schema actually creates', async () => {
    // Counting a table that does not exist silently reports zero forever.
    db.getOne.mockReturnValue({ count: 5 });

    await health.getDatabaseStatistics();

    const counted = db.getOne.mock.calls
      .map(call => /FROM (\w+)/.exec(flattenSql(call[0] as string))?.[1])
      .filter(Boolean) as string[];

    expect(counted.length).toBeGreaterThan(0);
    for (const table of counted) {
      expect(REAL_TABLES).toContain(table);
    }
  });

  it('reports a non-zero template count when templates exist', async () => {
    db.getOne.mockReturnValue({ count: 3 });

    const stats = await health.getDatabaseStatistics();

    expect(stats.templates).toBeGreaterThan(0);
  });

  it('returns a count for every entity the report lists', async () => {
    db.getOne.mockReturnValue({ count: 2 });

    const stats = await health.getDatabaseStatistics();

    expect(Object.keys(stats).sort())
      .toEqual(['clients', 'expenses', 'invoices', 'payments', 'templates', 'users']);
    for (const value of Object.values(stats)) {
      expect(typeof value).toBe('number');
    }
  });

  it('reports zeroes on a fresh database rather than failing', async () => {
    db.getOne.mockReturnValue(undefined);

    const stats = await health.getDatabaseStatistics();

    expect(stats).toMatchObject({ clients: 0, invoices: 0, users: 0 });
  });
});

describe('getDatabaseSchema', () => {
  it('lists user tables and skips SQLite internals', async () => {
    db.getMany.mockImplementation((sql: string) =>
      /sqlite_master/.test(sql)
        ? [{ name: 'clients', type: 'table' }, { name: 'invoices', type: 'table' }]
        : [{ cid: 0, name: 'id', type: 'INTEGER', notnull: 1, dflt_value: null, pk: 1 }]
    );

    const schema = await health.getDatabaseSchema();

    expect(flattenSql(db.getMany.mock.calls[0][0] as string)).toMatch(/name NOT LIKE 'sqlite_%'/);
    expect(schema.tables).toEqual(['clients', 'invoices']);
    expect(schema.tableCount).toBe(2);
  });

  it('describes the columns of each table', async () => {
    db.getMany.mockImplementation((sql: string) =>
      /sqlite_master/.test(sql)
        ? [{ name: 'clients', type: 'table' }]
        : [
            { cid: 0, name: 'id', type: 'INTEGER', notnull: 1, dflt_value: null, pk: 1 },
            { cid: 1, name: 'name', type: 'TEXT', notnull: 1, dflt_value: null, pk: 0 }
          ]
    );

    const schema = await health.getDatabaseSchema();

    expect(schema.tableInfo.clients).toMatchObject({
      columns: 2,
      columnNames: ['id', 'name']
    });
  });

  it('reports an empty schema rather than failing on a fresh database', async () => {
    db.getMany.mockReturnValue([]);

    await expect(health.getDatabaseSchema()).resolves.toMatchObject({
      tables: [], tableCount: 0, tableInfo: {}
    });
  });

  it('raises when the schema cannot be read at all', async () => {
    db.getMany.mockImplementation(() => { throw new Error('file is not a database'); });

    await expect(health.getDatabaseSchema()).rejects.toThrow(/failed to retrieve database schema/i);
  });
});

describe('getTableColumns', () => {
  it('reads column details for a valid table', async () => {
    db.getMany.mockReturnValue([{ cid: 0, name: 'id', type: 'INTEGER', notnull: 1, dflt_value: null, pk: 1 }]);

    expect(await health.getTableColumns('clients')).toHaveLength(1);
    expect(flattenSql(db.getMany.mock.calls[0][0] as string)).toBe('PRAGMA table_info(clients)');
  });

  it('refuses to build a PRAGMA from an unvalidated name', async () => {
    expect(await health.getTableColumns('clients); DROP TABLE clients--')).toEqual([]);
    expect(db.getMany).not.toHaveBeenCalled();
  });

  it('returns an empty list for a table that does not exist', async () => {
    db.getMany.mockImplementation(() => { throw new Error('no such table'); });

    expect(await health.getTableColumns('missing')).toEqual([]);
  });
});

describe('tableExists', () => {
  /**
   * This used to query sqlite_master directly, which has no meaning on MySQL —
   * an unguarded SQLite-ism that survived the portability sweep. It delegates to
   * IDatabase.tableExists now, which answers for whichever backend is active,
   * so these assert the delegation rather than a particular statement.
   */
  it('answers true for a table the backend reports', async () => {
    db.tableExists.mockResolvedValue(true);

    expect(await health.tableExists('clients')).toBe(true);
    expect(db.tableExists).toHaveBeenCalledWith('clients');
  });

  it('answers false for a table that is absent', async () => {
    db.tableExists.mockResolvedValue(false);

    expect(await health.tableExists('missing')).toBe(false);
  });

  it('asks the backend rather than naming a SQLite catalogue table', async () => {
    // sqlite_master does not exist on MySQL, so a direct query would throw
    // there and be swallowed by the catch — reporting every table as absent.
    db.tableExists.mockResolvedValue(true);

    await health.tableExists('clients');

    expect(db.getOne).not.toHaveBeenCalled();
  });

  it('answers false for an invalid name without querying', async () => {
    expect(await health.tableExists('bad name')).toBe(false);
    expect(db.tableExists).not.toHaveBeenCalled();
  });

  it('answers false rather than throwing on a query error', async () => {
    db.tableExists.mockImplementation(() => { throw new Error('locked'); });

    expect(await health.tableExists('clients')).toBe(false);
  });
});

describe('getDatabaseMetadata', () => {
  it('derives the file size from page count and page size', async () => {
    db.getOne.mockImplementation((sql: string) => {
      if (/page_count/.test(sql)) return { page_count: 2048 };
      if (/page_size/.test(sql)) return { page_size: 4096 };
      if (/user_version/.test(sql)) return { user_version: 3 };
      return { application_id: 7 };
    });

    const meta = await health.getDatabaseMetadata();

    expect(meta.estimatedSizeBytes).toBe(2048 * 4096);
    expect(meta.estimatedSizeMB).toBe(8);
    expect(meta).toMatchObject({ pageCount: 2048, pageSize: 4096, userVersion: 3, applicationId: 7 });
  });

  it('rounds the size to two decimals', async () => {
    db.getOne.mockImplementation((sql: string) => {
      if (/page_count/.test(sql)) return { page_count: 300 };
      if (/page_size/.test(sql)) return { page_size: 4096 };
      return { user_version: 0, application_id: 0 };
    });

    const meta = await health.getDatabaseMetadata();

    expect(meta.estimatedSizeMB).toBe(1.17);
  });

  it('reports zeroes rather than NaN when the pragmas return nothing', async () => {
    db.getOne.mockReturnValue(undefined);

    const meta = await health.getDatabaseMetadata();

    expect(meta).toEqual({
      pageCount: 0, pageSize: 0, estimatedSizeBytes: 0,
      estimatedSizeMB: 0, userVersion: 0, applicationId: 0
    });
    expect(Number.isNaN(meta.estimatedSizeMB)).toBe(false);
  });

  it('degrades to zeroes instead of throwing', async () => {
    db.getOne.mockImplementation(() => { throw new Error('locked'); });

    await expect(health.getDatabaseMetadata()).resolves.toMatchObject({ estimatedSizeBytes: 0 });
  });
});

describe('checkDatabaseIntegrity', () => {
  it('reports ok when the integrity check passes', async () => {
    db.getOne.mockReturnValue({ integrity_check: 'ok' });

    await expect(health.checkDatabaseIntegrity()).resolves.toMatchObject({ status: 'ok', result: 'ok' });
  });

  it('accepts the answer in any casing', async () => {
    db.getOne.mockReturnValue({ integrity_check: 'OK' });

    await expect(health.checkDatabaseIntegrity()).resolves.toMatchObject({ status: 'ok' });
  });

  it('reports the corruption message when the check fails', async () => {
    db.getOne.mockReturnValue({ integrity_check: 'row 12 missing from index idx_clients_email' });

    const result = await health.checkDatabaseIntegrity();

    expect(result.status).toBe('error');
    expect(result.result).toMatch(/row 12 missing/);
  });

  it('reports error rather than throwing when the check cannot run', async () => {
    db.getOne.mockImplementation(() => { throw new Error('file is not a database'); });

    await expect(health.checkDatabaseIntegrity())
      .resolves.toMatchObject({ status: 'error', result: 'file is not a database' });
  });
});

describe('getConnectionInfo', () => {
  it('reports the pragmas that affect durability', async () => {
    db.getOne.mockImplementation((sql: string) => {
      if (/journal_mode/.test(sql)) return { journal_mode: 'wal' };
      if (/synchronous/.test(sql)) return { synchronous: 1 };
      return { foreign_keys: 1 };
    });

    await expect(health.getConnectionInfo()).resolves.toMatchObject({
      journalMode: 'wal', synchronous: '1', foreignKeysEnabled: true
    });
  });

  it('reports foreign keys off when the pragma says so', async () => {
    db.getOne.mockImplementation((sql: string) =>
      /foreign_keys/.test(sql) ? { foreign_keys: 0 } : { journal_mode: 'wal', synchronous: 1 }
    );

    await expect(health.getConnectionInfo()).resolves.toMatchObject({ foreignKeysEnabled: false });
  });

  it('degrades to unknown instead of throwing', async () => {
    db.getOne.mockImplementation(() => { throw new Error('locked'); });

    await expect(health.getConnectionInfo()).resolves.toMatchObject({
      journalMode: 'unknown', synchronous: 'unknown', foreignKeysEnabled: false
    });
  });
});

describe('reports', () => {
  it('assembles the comprehensive report from every section', async () => {
    db.getOne.mockReturnValue({ test: 1, count: 4, page_count: 1, page_size: 4096 });
    db.getMany.mockReturnValue([]);

    const report = await health.getComprehensiveHealthReport();

    expect(Object.keys(report).sort())
      .toEqual(['health', 'metadata', 'reportTimestamp', 'schema', 'statistics']);
    expect(report.health.status).toBe('healthy');
  });

  it('raises rather than returning a half-built report', async () => {
    db.getOne.mockImplementation(() => { throw new Error('locked'); });

    await expect(health.getComprehensiveHealthReport()).rejects.toThrow(/failed to generate health report/i);
  });

  it('reports connected with counts for the route health payload', async () => {
    db.getOne.mockReturnValue({ test: 1, count: 6 });

    await expect(health.getDetailedHealthData()).resolves.toEqual({
      status: 'ok',
      database: {
        status: 'connected',
        counts: { users: 6, clients: 6, invoices: 6, expenses: 6 }
      }
    });
  });

  it('reports disconnected with zeroes rather than throwing', async () => {
    db.getOne.mockImplementation(() => { throw new Error('locked'); });

    await expect(health.getDetailedHealthData()).resolves.toEqual({
      status: 'error',
      database: {
        status: 'disconnected',
        counts: { users: 0, clients: 0, invoices: 0, expenses: 0 }
      }
    });
  });
});
