/**
 * ExpenseService tests.
 *
 * The two statements worth pinning are the INSERT column list and the UPDATE
 * allowed-fields whitelist: a field missing from either is silently dropped
 * with no error. That is exactly how `status` and `vendor` went missing.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createDatabaseMock, insertColumnsOf, flattenSql } from './databaseMock.test-helper.js';

const db = createDatabaseMock();
vi.mock('../core/DatabaseService.js', () => ({ databaseService: db }));

const { expenseService } = await import('./ExpenseService.js');

const validExpense = {
  amount: 125.5,
  description: 'Printer paper',
  category: 'Office',
  date: '2026-07-01',
  vendor: 'Acme Supplies',
  is_billable: undefined,
  client_id: undefined
};

beforeEach(() => db.reset());

describe('createExpense', () => {
  it('persists every field the expenses table supports', async () => {
    await expenseService.createExpense(validExpense);

    const columns = insertColumnsOf(db.queries[0].sql);
    for (const column of ['amount', 'description', 'category', 'date', 'vendor', 'status', 'notes', 'receipt_url', 'is_billable', 'client_id', 'project']) {
      expect(columns).toContain(column);
    }
  });

  it('binds exactly one parameter per column', async () => {
    await expenseService.createExpense(validExpense);

    const { sql, params } = db.queries[0];
    expect(params).toHaveLength(insertColumnsOf(sql).length);
  });

  it('defaults status to pending', async () => {
    await expenseService.createExpense(validExpense);

    const { sql, params } = db.queries[0];
    expect(params[insertColumnsOf(sql).indexOf('status')]).toBe('pending');
  });

  it('persists an explicit status', async () => {
    await expenseService.createExpense({ ...validExpense, status: 'approved' });

    const { sql, params } = db.queries[0];
    expect(params[insertColumnsOf(sql).indexOf('status')]).toBe('approved');
  });

  it('stores the payee under vendor', async () => {
    await expenseService.createExpense(validExpense);

    const { sql, params } = db.queries[0];
    expect(params[insertColumnsOf(sql).indexOf('vendor')]).toBe('Acme Supplies');
  });

  it('rejects a non-positive amount', async () => {
    await expect(expenseService.createExpense({ ...validExpense, amount: 0 })).rejects.toThrow(/amount/i);
    await expect(expenseService.createExpense({ ...validExpense, amount: -5 })).rejects.toThrow(/amount/i);
  });

  it('rejects a missing description or date', async () => {
    await expect(expenseService.createExpense({ ...validExpense, description: '' })).rejects.toThrow(/description/i);
    await expect(expenseService.createExpense({ ...validExpense, date: '' })).rejects.toThrow(/date/i);
  });

  it('rejects a malformed date', async () => {
    await expect(expenseService.createExpense({ ...validExpense, date: 'last tuesday' })).rejects.toThrow(/date/i);
  });

  it('rejects a client_id that does not exist', async () => {
    db.getOne.mockReturnValue(undefined);
    await expect(
      expenseService.createExpense({ ...validExpense, client_id: 99 })
    ).rejects.toThrow(/client/i);
  });

  it('writes nothing when validation fails', async () => {
    await expect(expenseService.createExpense({ ...validExpense, amount: 0 })).rejects.toThrow();
    expect(db.queries).toHaveLength(0);
  });

  it('converts is_billable to the 0/1 SQLite stores', async () => {
    await expenseService.createExpense({ ...validExpense, is_billable: true });
    const { sql, params } = db.queries[0];
    expect(params[insertColumnsOf(sql).indexOf('is_billable')]).toBe(1);
  });
});

describe('updateExpense', () => {
  beforeEach(() => {
    // Existing expense lookup succeeds.
    db.getOne.mockReturnValue({ id: 1, amount: 100, description: 'x', date: '2026-07-01' });
  });

  it('lets status through the allowed-fields whitelist', async () => {
    await expenseService.updateExpense(1, { status: 'reimbursed' });

    expect(db.updateRecord).toHaveBeenCalledWith(
      'expenses',
      1,
      expect.objectContaining({ status: 'reimbursed' })
    );
  });

  it('lets vendor through the whitelist', async () => {
    await expenseService.updateExpense(1, { vendor: 'New Vendor' });

    expect(db.updateRecord).toHaveBeenCalledWith(
      'expenses',
      1,
      expect.objectContaining({ vendor: 'New Vendor' })
    );
  });

  it('drops fields that are not whitelisted', async () => {
    // An update naming only non-whitelisted columns has nothing left to write,
    // so it is rejected rather than silently writing id/created_at.
    await expect(
      expenseService.updateExpense(1, { id: 999, created_at: 'hacked' } as never)
    ).rejects.toThrow(/no valid fields/i);

    expect(db.updateRecord).not.toHaveBeenCalled();
  });

  it('keeps whitelisted fields while dropping the rest', async () => {
    await expenseService.updateExpense(1, { amount: 42, id: 999 } as never);

    const [, , updateData] = db.updateRecord.mock.calls[0];
    expect(updateData).toMatchObject({ amount: 42 });
    expect(updateData).not.toHaveProperty('id');
  });

  it('rejects an update to a missing expense', async () => {
    db.getOne.mockReturnValue(undefined);
    await expect(expenseService.updateExpense(1, { amount: 10 })).rejects.toThrow(/not found/i);
  });

  it('rejects a non-positive amount', async () => {
    await expect(expenseService.updateExpense(1, { amount: -1 })).rejects.toThrow(/amount/i);
  });

  it('rejects an invalid id', async () => {
    await expect(expenseService.updateExpense(0, { amount: 10 })).rejects.toThrow(/id/i);
  });
});

describe('getAllExpenses', () => {
  it('applies no WHERE clause when unfiltered', async () => {
    await expenseService.getAllExpenses();
    const sql = flattenSql(db.getMany.mock.calls[0][0] as string);
    expect(sql).not.toMatch(/WHERE/);
  });

  it('filters by category', async () => {
    await expenseService.getAllExpenses({ category: 'Office' });

    const [sql, params] = db.getMany.mock.calls[0];
    expect(flattenSql(sql as string)).toMatch(/WHERE category = \?/);
    expect(params).toContain('Office');
  });

  it('combines multiple filters with AND', async () => {
    await expenseService.getAllExpenses({ category: 'Office', date_from: '2026-01-01', date_to: '2026-12-31' });

    expect(flattenSql(db.getMany.mock.calls[0][0] as string)).toMatch(/WHERE .+ AND .+ AND/);
  });

  it('passes limit and offset through as the final parameters', async () => {
    await expenseService.getAllExpenses({}, { limit: 10, offset: 20 });

    const params = db.getMany.mock.calls[0][1] as unknown[];
    expect(params.slice(-2)).toEqual([10, 20]);
  });

  it('translates a boolean is_billable filter to 0/1', async () => {
    await expenseService.getAllExpenses({ is_billable: true });
    expect(db.getMany.mock.calls[0][1]).toContain(1);
  });
});

describe('deleteExpense', () => {
  it('refuses an invalid id', async () => {
    await expect(expenseService.deleteExpense(0)).rejects.toThrow(/id/i);
  });
});
