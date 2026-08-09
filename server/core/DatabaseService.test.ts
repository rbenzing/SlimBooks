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
