/**
 * ExpenseService tests — the read and reporting surface beyond
 * create/update/list, which ExpenseService.test.ts already covers.
 *
 * The statistics query is the fiddly one: it reuses a single parameter array
 * across three statements whose WHERE clauses are assembled differently, so a
 * placeholder that stops lining up with its bound value is the failure to
 * watch for.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { createDatabaseMock, flattenSql } from './databaseMock.test-helper.js';

const db = createDatabaseMock();
vi.mock('../core/DatabaseService.js', () => ({ databaseService: db }));

const { expenseService } = await import('./ExpenseService.js');

/** A schema matching the live table, used only to parse generated SQL. */
const sqlite = new Database(':memory:');
sqlite.exec(`
  CREATE TABLE expenses (
    id INTEGER PRIMARY KEY, date TEXT, vendor TEXT, category TEXT, amount REAL,
    description TEXT, receipt_url TEXT, status TEXT, is_billable INTEGER,
    client_id INTEGER, project TEXT, notes TEXT, deleted_at TEXT,
    created_at TEXT, updated_at TEXT
  );
`);

/** Every statement the stats call builds, checked for placeholder/param agreement. */
const expectParamsLineUp = (sql: string, params: unknown[]) => {
  const statement = sqlite.prepare(sql);
  expect(statement.source.split('?').length - 1).toBe(params.length);
};

beforeEach(() => db.reset());

describe('getExpenseStats', () => {
  it('reports zeroes on an empty ledger rather than undefined', async () => {
    db.getOne.mockReturnValue(undefined);
    db.getMany.mockReturnValue([]);

    await expect(expenseService.getExpenseStats()).resolves.toEqual({
      total: 0, totalAmount: 0, billableAmount: 0, nonBillableAmount: 0,
      byCategory: {}, monthlyTrend: []
    });
  });

  it('splits the total into billable and non-billable', async () => {
    db.getOne.mockReturnValue({
      total: 4, totalAmount: 400, billableAmount: 250, nonBillableAmount: 150
    });
    db.getMany.mockReturnValue([]);

    const stats = await expenseService.getExpenseStats();

    expect(stats.billableAmount + stats.nonBillableAmount).toBe(stats.totalAmount);
  });

  it('builds the category breakdown', async () => {
    db.getOne.mockReturnValue({ total: 3, totalAmount: 300 });
    db.getMany.mockImplementation((sql: string) =>
      /GROUP BY category/.test(sql)
        ? [{ category: 'Office', count: 2, amount: 200 }, { category: 'Travel', count: 1, amount: 100 }]
        : []
    );

    const stats = await expenseService.getExpenseStats();

    expect(stats.byCategory).toEqual({
      Office: { count: 2, amount: 200 },
      Travel: { count: 1, amount: 100 }
    });
  });

  it('skips a row with no category rather than keying on null', async () => {
    db.getOne.mockReturnValue({ total: 1 });
    db.getMany.mockImplementation((sql: string) =>
      /GROUP BY category/.test(sql) ? [{ category: null, count: 1, amount: 50 }] : []
    );

    const stats = await expenseService.getExpenseStats();

    expect(stats.byCategory).toEqual({});
  });

  it('binds one value per placeholder in every statement, unfiltered', async () => {
    await expenseService.getExpenseStats();

    expectParamsLineUp(db.getOne.mock.calls[0][0] as string, db.getOne.mock.calls[0][1] as unknown[]);
    for (const [sql, params] of db.getMany.mock.calls) {
      expectParamsLineUp(sql as string, params as unknown[]);
    }
  });

  it('binds one value per placeholder with both date bounds', async () => {
    await expenseService.getExpenseStats({ date_from: '2026-01-01', date_to: '2026-12-31' });

    expectParamsLineUp(db.getOne.mock.calls[0][0] as string, db.getOne.mock.calls[0][1] as unknown[]);
    for (const [sql, params] of db.getMany.mock.calls) {
      expectParamsLineUp(sql as string, params as unknown[]);
    }
  });

  it('binds one value per placeholder with only a lower bound', async () => {
    await expenseService.getExpenseStats({ date_from: '2026-01-01' });

    expectParamsLineUp(db.getOne.mock.calls[0][0] as string, db.getOne.mock.calls[0][1] as unknown[]);
    for (const [sql, params] of db.getMany.mock.calls) {
      expectParamsLineUp(sql as string, params as unknown[]);
    }
  });

  it('binds one value per placeholder with only an upper bound', async () => {
    await expenseService.getExpenseStats({ date_to: '2026-12-31' });

    expectParamsLineUp(db.getOne.mock.calls[0][0] as string, db.getOne.mock.calls[0][1] as unknown[]);
    for (const [sql, params] of db.getMany.mock.calls) {
      expectParamsLineUp(sql as string, params as unknown[]);
    }
  });

  it('reports the whole ledger when unfiltered', async () => {
    await expenseService.getExpenseStats();

    expect(flattenSql(db.getOne.mock.calls[0][0] as string)).not.toMatch(/WHERE/);
    expect(db.getOne.mock.calls[0][1]).toEqual([]);
  });

  it('keeps the category breakdown inside the date filter', async () => {
    await expenseService.getExpenseStats({ date_from: '2026-01-01', date_to: '2026-12-31' });

    const categorySql = flattenSql(db.getMany.mock.calls[0][0] as string);
    expect(categorySql).toMatch(/date >= \? AND date <= \?/);
    expect(categorySql).toMatch(/category IS NOT NULL/);
  });

  it('caps the trend at twelve months', async () => {
    await expenseService.getExpenseStats();

    const trendSql = flattenSql(db.getMany.mock.calls[1][0] as string);
    expect(trendSql).toMatch(/date >= date\('now', '-12 months'\)/);
    expect(trendSql).toMatch(/LIMIT 12/);
  });
});

describe('getExpenseCategories', () => {
  it('aggregates count and total per category', async () => {
    await expenseService.getExpenseCategories();

    const sql = flattenSql(db.getMany.mock.calls[0][0] as string);
    expect(sql).toMatch(/COUNT\(\*\) as count/);
    expect(sql).toMatch(/SUM\(amount\) as total/);
    expect(sql).toMatch(/GROUP BY category/);
  });

  it('leaves uncategorised rows out of the category list', async () => {
    await expenseService.getExpenseCategories();

    expect(flattenSql(db.getMany.mock.calls[0][0] as string)).toMatch(/category IS NOT NULL/);
  });

  it('returns an empty list on a fresh database', async () => {
    db.getMany.mockReturnValue([]);

    await expect(expenseService.getExpenseCategories()).resolves.toEqual([]);
  });
});

describe('getBillableExpenses', () => {
  it('returns only billable rows', async () => {
    await expenseService.getBillableExpenses();

    expect(flattenSql(db.getMany.mock.calls[0][0] as string)).toMatch(/WHERE is_billable = 1/);
    expect(db.getMany.mock.calls[0][1]).toEqual([100, 0]);
  });

  it('narrows to one client when asked', async () => {
    await expenseService.getBillableExpenses(3, { limit: 10, offset: 20 });

    const [sql, params] = db.getMany.mock.calls[0];
    expect(flattenSql(sql as string)).toMatch(/is_billable = 1 AND client_id = \?/);
    expect(params).toEqual([3, 10, 20]);
  });

  it('keeps limit and offset as the final parameters', async () => {
    await expenseService.getBillableExpenses(3, { limit: 5, offset: 15 });

    const params = db.getMany.mock.calls[0][1] as unknown[];
    expect(params.slice(-2)).toEqual([5, 15]);
  });
});

describe('searchExpenses', () => {
  it('matches description, vendor, notes and category', async () => {
    await expenseService.searchExpenses('paper');

    const [sql, params] = db.getMany.mock.calls[0];
    expect(flattenSql(sql as string))
      .toMatch(/description LIKE \? OR vendor LIKE \? OR notes LIKE \? OR category LIKE \?/);
    expect((params as unknown[]).slice(0, 4))
      .toEqual(['%paper%', '%paper%', '%paper%', '%paper%']);
  });

  it('searches the payee under vendor, never merchant', async () => {
    await expenseService.searchExpenses('acme');

    const sql = flattenSql(db.getMany.mock.calls[0][0] as string);
    expect(sql).toMatch(/vendor LIKE \?/);
    expect(sql).not.toMatch(/merchant/);
  });

  it('ranks exact matches first', async () => {
    await expenseService.searchExpenses('paper');

    expect(flattenSql(db.getMany.mock.calls[0][0] as string)).toMatch(/WHEN description = \? THEN 1/);
  });

  it('returns nothing for a blank term rather than every expense', async () => {
    await expect(expenseService.searchExpenses('')).resolves.toEqual([]);
    expect(db.getMany).not.toHaveBeenCalled();
  });
});

describe('deleteExpense', () => {
  it('deletes an expense that exists', async () => {
    db.getOne.mockReturnValue({ id: 1, amount: 100 });

    await expect(expenseService.deleteExpense(1)).resolves.toBe(1);
    expect(db.deleteById).toHaveBeenCalledWith('expenses', 1);
  });

  it('rejects an expense that does not exist', async () => {
    db.getOne.mockReturnValue(undefined);

    await expect(expenseService.deleteExpense(1)).rejects.toThrow(/not found/i);
    expect(db.deleteById).not.toHaveBeenCalled();
  });

  it('reports zero when the delete matched nothing', async () => {
    db.getOne.mockReturnValue({ id: 1 });
    db.deleteById.mockReturnValue(false);

    await expect(expenseService.deleteExpense(1)).resolves.toBe(0);
  });
});

describe('lookups', () => {
  it('pages expenses in one category', async () => {
    await expenseService.getExpensesByCategory('Office', { limit: 5, offset: 10 });

    expect(db.getMany.mock.calls[0][1]).toEqual(['Office', 5, 10]);
  });

  it('pages expenses in a date range, newest first', async () => {
    await expenseService.getExpensesByDateRange('2026-01-01', '2026-12-31', { limit: 5, offset: 10 });

    const [sql, params] = db.getMany.mock.calls[0];
    expect(flattenSql(sql as string)).toMatch(/date >= \? AND date <= \? ORDER BY date DESC/);
    expect(params).toEqual(['2026-01-01', '2026-12-31', 5, 10]);
  });

  it('rejects an incomplete date range', async () => {
    await expect(expenseService.getExpensesByDateRange('', '2026-12-31')).rejects.toThrow(/required/i);
    await expect(expenseService.getExpensesByDateRange('2026-01-01', '')).rejects.toThrow(/required/i);
  });

  it('rejects a blank category', async () => {
    await expect(expenseService.getExpensesByCategory('')).rejects.toThrow(/category/i);
  });

  it('rejects an invalid id', async () => {
    await expect(expenseService.getExpenseById(0)).rejects.toThrow(/id/i);
  });

  it('answers false for an invalid id rather than querying', async () => {
    await expect(expenseService.expenseExists(0)).resolves.toBe(false);
    expect(db.exists).not.toHaveBeenCalled();
  });
});
