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
    getOne: vi.fn(async () => undefined),
    getMany: vi.fn(async () => []),
    executeQuery: vi.fn(async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params });
      return { changes: 1, lastInsertRowid: 1 };
    }),
    exists: vi.fn(async () => false),
    updateRecord: vi.fn(async () => true),
    getNextSequence: vi.fn(async () => 1),
    deleteById: vi.fn(async () => true),
    executeTransaction: vi.fn(async (fn: () => Promise<unknown>) => await fn()),
    // Awaits the callback inline. The real implementation wraps it in a SQLite
    // transaction; for assertions on the statements issued, running it straight
    // through is equivalent and keeps the queries array in call order. It must
    // await, or statements issued inside a transaction never reach the queries
    // array and assertions about transactional writes silently pass against
    // nothing.
    withTransaction: vi.fn(async (fn: () => Promise<unknown>) => await fn()),
    tableExists: vi.fn(async () => true),
    deleteWithSetting: vi.fn(async () => true),
    queries,
    reset: () => {
      queries.length = 0;
      for (const value of Object.values(mock)) {
        if (typeof value === 'function' && 'mockClear' in value) {
          (value as ReturnType<typeof vi.fn>).mockClear();
        }
      }
      mock.getOne.mockImplementation(async () => undefined);
      mock.getMany.mockImplementation(async () => []);
      mock.exists.mockImplementation(async () => false);
      mock.getNextSequence.mockImplementation(async () => 1);
      mock.updateRecord.mockImplementation(async () => true);
      mock.executeQuery.mockImplementation(async (sql: string, params: unknown[] = []) => {
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
