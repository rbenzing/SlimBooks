// Shared in-memory stand-in for `databaseService`, so service logic can be
// tested without a real SQLite file.
//
// Services are thin over SQL, so the valuable assertions are the ones about the
// statements they build: which columns an INSERT names, which fields an UPDATE
// whitelist lets through, and which guards run before either. Both of those
// have shipped bugs in this codebase.

import { vi } from 'vitest';

export interface DbCall {
  sql: string;
  params: unknown[];
}

export interface DatabaseMock {
  getOne: ReturnType<typeof vi.fn>;
  getMany: ReturnType<typeof vi.fn>;
  executeQuery: ReturnType<typeof vi.fn>;
  exists: ReturnType<typeof vi.fn>;
  updateRecord: ReturnType<typeof vi.fn>;
  getNextSequence: ReturnType<typeof vi.fn>;
  deleteById: ReturnType<typeof vi.fn>;
  executeTransaction: ReturnType<typeof vi.fn>;
  withTransaction: ReturnType<typeof vi.fn>;
  tableExists: ReturnType<typeof vi.fn>;
  deleteWithSetting: ReturnType<typeof vi.fn>;
  /** Every executeQuery call, normalised for assertions. */
  queries: DbCall[];
  reset: () => void;
}

export const createDatabaseMock = (): DatabaseMock => {
  const queries: DbCall[] = [];

  const mock: DatabaseMock = {
    getOne: vi.fn(() => undefined),
    getMany: vi.fn(() => []),
    executeQuery: vi.fn((sql: string, params: unknown[] = []) => {
      queries.push({ sql, params });
      return { changes: 1, lastInsertRowid: 1 };
    }),
    exists: vi.fn(() => false),
    updateRecord: vi.fn(() => true),
    getNextSequence: vi.fn(() => 1),
    deleteById: vi.fn(() => true),
    executeTransaction: vi.fn((fn: () => unknown) => fn()),
    // Runs the callback inline. The real implementation wraps it in a SQLite
    // transaction; for assertions on the statements issued, running it straight
    // through is equivalent and keeps the queries array in call order.
    withTransaction: vi.fn((fn: () => unknown) => fn()),
    tableExists: vi.fn(() => true),
    deleteWithSetting: vi.fn(() => true),
    queries,
    reset: () => {
      queries.length = 0;
      for (const value of Object.values(mock)) {
        if (typeof value === 'function' && 'mockClear' in value) {
          (value as ReturnType<typeof vi.fn>).mockClear();
        }
      }
      mock.getOne.mockImplementation(() => undefined);
      mock.getMany.mockImplementation(() => []);
      mock.exists.mockImplementation(() => false);
      mock.getNextSequence.mockImplementation(() => 1);
      mock.updateRecord.mockImplementation(() => true);
      mock.executeQuery.mockImplementation((sql: string, params: unknown[] = []) => {
        queries.push({ sql, params });
        return { changes: 1, lastInsertRowid: 1 };
      });
    }
  };

  return mock;
};

/** Collapses whitespace so multi-line SQL can be matched with plain substrings. */
export const flattenSql = (sql: string): string => sql.replace(/\s+/g, ' ').trim();

/** The column names listed in an `INSERT INTO x (...)` statement. */
export const insertColumnsOf = (sql: string): string[] => {
  const match = /INSERT INTO \w+ \(([^)]+)\)/i.exec(flattenSql(sql));
  const columnList = match?.[1];
  return columnList ? columnList.split(',').map(c => c.trim()) : [];
};
