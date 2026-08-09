/**
 * DatabaseService is the seam every service reaches the database through, so
 * anything a service needs to know about the backend has to be reachable from
 * here. Services build SQL that differs between SQLite and MySQL; they get the
 * spelling from `databaseService.dialect` rather than importing a singleton,
 * which is what lets a test hand them a different one.
 */

import { describe, it, expect } from 'vitest';
import { DatabaseService, databaseService } from './DatabaseService.js';
import { mysqlDialect } from '../database/dialects/mysql.dialect.js';
import type { IDatabase } from '../types/database.types.js';

describe('DatabaseService', () => {
  it('exposes the dialect of the database it wraps', () => {
    expect(databaseService.dialect.name).toBe('sqlite');
  });

  it('reports the dialect of an injected database, not the default one', () => {
    // The property that makes the two-driver test matrix possible: a service
    // under test can be pointed at a MySQL-shaped backend without a server.
    const fake = { dialect: mysqlDialect } as unknown as IDatabase;

    expect(new DatabaseService(fake).dialect.name).toBe('mysql');
  });
});

describe('updateRecord', () => {
  const recorder = () => {
    const statements: string[] = [];

    const db = {
      dialect: mysqlDialect,
      executeQuery: async (sql: string) => {
        statements.push(sql);
        return { changes: 1, lastInsertRowid: 1 };
      }
    } as unknown as IDatabase;

    return { service: new DatabaseService(db), statements };
  };

  it('always writes updated_at itself rather than leaving it to a trigger', async () => {
    // SQLite has an AFTER UPDATE trigger maintaining expenses.updated_at.
    // MySQL forbids a trigger that modifies "a table that is already being used
    // by the statement that invoked" it, so that trigger cannot exist there and
    // the two backends only agree if the application writes the column.
    const { service, statements } = recorder();

    await service.updateRecord('expenses', 1, { amount: 50 });

    expect(statements[0]).toMatch(/`updated_at` = \?/);
  });

  it('writes updated_at even when the caller supplies its own value', async () => {
    const { service, statements } = recorder();

    await service.updateRecord('clients', 1, { name: 'Acme' });

    expect(statements[0]).toMatch(/`updated_at` = \?/);
  });

  it('quotes every identifier, since a column may be a reserved word', async () => {
    const { service, statements } = recorder();

    await service.updateRecord('settings', 1, { key: 'a.b', value: 'x' });

    expect(statements[0]).toContain('`key` = ?');
  });
});
