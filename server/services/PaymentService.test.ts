/**
 * PaymentService tests — the surface beyond create/list, which
 * ClientPaymentService.test.ts already covers.
 *
 * Payments are the ledger side of the books, so the assertions that matter are
 * the ones that stop money moving silently: the update whitelist, the bulk
 * delete's all-or-nothing check, and the status vocabulary (payments use
 * `received`, invoices use `paid` — mixing them has broken both screens).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createDatabaseMock, flattenSql } from './databaseMock.test-helper.js';

const db = createDatabaseMock();
vi.mock('../core/DatabaseService.js', () => ({ databaseService: db }));

const { paymentService } = await import('./PaymentService.js');

const existingPayment = {
  id: 1, date: '2026-07-01', client_name: 'Acme', amount: 500,
  method: 'bank_transfer', status: 'received'
};

beforeEach(() => db.reset());

describe('updatePayment', () => {
  beforeEach(() => {
    db.getOne.mockReturnValue(existingPayment);
    db.exists.mockReturnValue(true);
  });

  it('lets every editable field through the whitelist', async () => {
    await paymentService.updatePayment(1, {
      date: '2026-07-02', client_name: 'Acme Inc', invoice_id: 4, amount: 600,
      method: 'cash', reference: 'REF-1', description: 'Deposit', status: 'pending'
    });

    const [, , updateData] = db.updateRecord.mock.calls[0];
    expect(updateData).toEqual({
      date: '2026-07-02', client_name: 'Acme Inc', invoice_id: 4, amount: 600,
      method: 'cash', reference: 'REF-1', description: 'Deposit', status: 'pending'
    });
  });

  it('drops fields outside the whitelist', async () => {
    await paymentService.updatePayment(1, { amount: 600, id: 999, created_at: 'x' } as never);

    const [, , updateData] = db.updateRecord.mock.calls[0];
    expect(updateData).toEqual({ amount: 600 });
  });

  it('rejects an update with nothing whitelisted left to write', async () => {
    await expect(paymentService.updatePayment(1, { id: 9 } as never)).rejects.toThrow(/no valid fields/i);
    expect(db.updateRecord).not.toHaveBeenCalled();
  });

  it('rejects a zero or negative amount', async () => {
    await expect(paymentService.updatePayment(1, { amount: 0 })).rejects.toThrow(/positive/i);
    await expect(paymentService.updatePayment(1, { amount: -1 })).rejects.toThrow(/positive/i);
  });

  it('rejects a malformed date', async () => {
    await expect(paymentService.updatePayment(1, { date: '07/02/2026' })).rejects.toThrow(/date format/i);
    await expect(paymentService.updatePayment(1, { date: 'yesterday' })).rejects.toThrow(/date format/i);
  });

  it('rejects a link to an invoice that does not exist', async () => {
    db.exists.mockReturnValue(false);

    await expect(paymentService.updatePayment(1, { invoice_id: 99 }))
      .rejects.toThrow(/invoice does not exist/i);
  });

  it('rejects an update to a payment that does not exist', async () => {
    db.getOne.mockReturnValue(undefined);

    await expect(paymentService.updatePayment(1, { amount: 10 })).rejects.toThrow(/not found/i);
  });

  it('rejects an invalid id', async () => {
    await expect(paymentService.updatePayment(0, { amount: 10 })).rejects.toThrow(/id/i);
  });
});

describe('deletePayment', () => {
  it('deletes a payment that exists', async () => {
    db.getOne.mockReturnValue(existingPayment);

    await expect(paymentService.deletePayment(1)).resolves.toBe(1);
    expect(db.deleteById).toHaveBeenCalledWith('payments', 1);
  });

  it('rejects a payment that does not exist', async () => {
    db.getOne.mockReturnValue(undefined);

    await expect(paymentService.deletePayment(1)).rejects.toThrow(/not found/i);
    expect(db.deleteById).not.toHaveBeenCalled();
  });

  it('rejects an invalid id', async () => {
    await expect(paymentService.deletePayment(0)).rejects.toThrow(/id/i);
  });
});

describe('bulkDeletePayments', () => {
  it('deletes every id in one statement', async () => {
    db.getMany.mockReturnValue([{ id: 1 }, { id: 2 }, { id: 3 }]);
    db.executeQuery.mockReturnValue({ changes: 3, lastInsertRowid: 0 });

    await expect(paymentService.bulkDeletePayments([1, 2, 3])).resolves.toBe(3);
    expect(flattenSql(db.executeQuery.mock.calls[0][0] as string))
      .toBe('DELETE FROM payments WHERE id IN (?,?,?)');
    expect(db.executeQuery.mock.calls[0][1]).toEqual([1, 2, 3]);
  });

  it('deletes nothing when any id is missing', async () => {
    // A partial bulk delete would leave the user unable to tell what survived.
    db.getMany.mockReturnValue([{ id: 1 }, { id: 2 }]);

    await expect(paymentService.bulkDeletePayments([1, 2, 99])).rejects.toThrow(/not found/i);
    expect(db.executeQuery).not.toHaveBeenCalled();
  });

  it('parameterises the id list rather than interpolating it', async () => {
    db.getMany.mockReturnValue([{ id: 1 }, { id: 2 }]);

    await paymentService.bulkDeletePayments([1, 2]);

    const [sql, params] = db.executeQuery.mock.calls[0];
    expect(sql).not.toMatch(/\b1\b|\b2\b/);
    expect(params).toEqual([1, 2]);
  });

  it('rejects an empty or non-array selection', async () => {
    await expect(paymentService.bulkDeletePayments([])).rejects.toThrow(/non-empty array/i);
    await expect(paymentService.bulkDeletePayments(null as never)).rejects.toThrow(/non-empty array/i);
  });

  it('caps the batch size', async () => {
    const tooMany = Array.from({ length: 501 }, (_, i) => i + 1);

    await expect(paymentService.bulkDeletePayments(tooMany)).rejects.toThrow(/maximum 500/i);
    expect(db.getMany).not.toHaveBeenCalled();
  });

  it('rejects a selection containing a non-number', async () => {
    await expect(paymentService.bulkDeletePayments([1, '2' as never])).rejects.toThrow(/valid numbers/i);
    await expect(paymentService.bulkDeletePayments([1, 0])).rejects.toThrow(/valid numbers/i);
  });
});

describe('updatePaymentStatus', () => {
  beforeEach(() => db.exists.mockReturnValue(true));

  it('accepts every payment status', async () => {
    for (const status of ['received', 'pending', 'failed', 'refunded'] as const) {
      db.reset();
      db.exists.mockReturnValue(true);
      await expect(paymentService.updatePaymentStatus(1, status)).resolves.toBe(1);
      expect(db.queries[0].params).toEqual([status, 1]);
    }
  });

  it('rejects an invoice status borrowed from the invoices table', async () => {
    // `paid` and `sent` belong to invoices; payments are `received`.
    await expect(paymentService.updatePaymentStatus(1, 'paid' as never)).rejects.toThrow(/invalid status/i);
    await expect(paymentService.updatePaymentStatus(1, 'sent' as never)).rejects.toThrow(/invalid status/i);
    expect(db.queries).toHaveLength(0);
  });

  it('rejects a status change on a missing payment', async () => {
    db.exists.mockReturnValue(false);

    await expect(paymentService.updatePaymentStatus(1, 'received')).rejects.toThrow(/not found/i);
  });

  it('rejects an invalid id', async () => {
    await expect(paymentService.updatePaymentStatus(0, 'received')).rejects.toThrow(/id/i);
  });
});

describe('getPaymentStats', () => {
  it('returns a zeroed summary rather than undefined on an empty ledger', async () => {
    db.getOne.mockReturnValue(undefined);
    db.getMany.mockReturnValue([]);

    const stats = await paymentService.getPaymentStats();

    expect(stats.summary).toMatchObject({ total_payments: 0, total_amount: 0, received_amount: 0 });
    expect(stats.methods).toEqual([]);
    expect(stats.monthlyTrends).toEqual([]);
  });

  it('reports the whole ledger when unfiltered', async () => {
    await paymentService.getPaymentStats();

    expect(flattenSql(db.getOne.mock.calls[0][0] as string)).not.toMatch(/WHERE/);
    expect(db.getOne.mock.calls[0][1]).toEqual([]);
  });

  it('filters to a year', async () => {
    await paymentService.getPaymentStats({ year: '2026' });

    expect(flattenSql(db.getOne.mock.calls[0][0] as string))
      .toMatch(/WHERE strftime\('%Y', date\) = \?/);
    expect(db.getOne.mock.calls[0][1]).toEqual(['2026']);
  });

  it('pads a single-digit month so the comparison matches', async () => {
    await paymentService.getPaymentStats({ year: '2026', month: '7' });

    expect(db.getOne.mock.calls[0][1]).toEqual(['2026-07']);
  });

  it('leaves the monthly trend unfiltered so the chart keeps its history', async () => {
    await paymentService.getPaymentStats({ year: '2026' });

    const trendSql = flattenSql(db.getMany.mock.calls[1][0] as string);
    expect(trendSql).toMatch(/date >= date\('now', '-12 months'\)/);
    expect(trendSql).not.toMatch(/strftime\('%Y', date\) = \?/);
  });

  it('counts each status separately from its amount', async () => {
    await paymentService.getPaymentStats();

    const sql = flattenSql(db.getOne.mock.calls[0][0] as string);
    expect(sql).toMatch(/COUNT\(CASE WHEN status = 'received' THEN 1 END\) as received_count/);
    expect(sql).toMatch(/SUM\(CASE WHEN status = 'received' THEN amount ELSE 0 END\) as received_amount/);
  });
});

describe('getPaymentsByDateRange', () => {
  it('returns the page and its summary together', async () => {
    db.getMany.mockReturnValue([existingPayment]);
    db.getOne.mockReturnValue({ count: 1, total_amount: 500, average_amount: 500 });

    const result = await paymentService.getPaymentsByDateRange('2026-01-01', '2026-12-31');

    expect(result.payments).toHaveLength(1);
    expect(result.summary).toMatchObject({ count: 1, total_amount: 500 });
  });

  it('summarises the whole range, not just the page', async () => {
    // The summary query must not carry the LIMIT/OFFSET parameters.
    await paymentService.getPaymentsByDateRange('2026-01-01', '2026-12-31', { limit: 10, offset: 20 });

    expect(db.getMany.mock.calls[0][1]).toEqual(['2026-01-01', '2026-12-31', 10, 20]);
    expect(db.getOne.mock.calls[0][1]).toEqual(['2026-01-01', '2026-12-31']);
  });

  it('returns a zeroed summary when the range is empty', async () => {
    db.getOne.mockReturnValue(undefined);

    const result = await paymentService.getPaymentsByDateRange('2026-01-01', '2026-12-31');

    expect(result.summary).toEqual({ count: 0, total_amount: 0, average_amount: 0 });
  });

  it('rejects a missing or malformed range', async () => {
    await expect(paymentService.getPaymentsByDateRange('', '2026-12-31')).rejects.toThrow(/required/i);
    await expect(paymentService.getPaymentsByDateRange('2026-01-01', '')).rejects.toThrow(/required/i);
    await expect(paymentService.getPaymentsByDateRange('01/01/2026', '2026-12-31')).rejects.toThrow(/date format/i);
    await expect(paymentService.getPaymentsByDateRange('2026-01-01', '2026-13-45')).rejects.toThrow(/date format/i);
  });
});

describe('getTotalPaymentsAmount', () => {
  it('sums the whole ledger when unfiltered', async () => {
    db.getOne.mockReturnValue({ total: 1250 });

    await expect(paymentService.getTotalPaymentsAmount()).resolves.toBe(1250);
    expect(flattenSql(db.getOne.mock.calls[0][0] as string)).toBe('SELECT SUM(amount) as total FROM payments');
  });

  it('combines every filter with AND', async () => {
    await paymentService.getTotalPaymentsAmount({
      status: 'received', method: 'cash', date_from: '2026-01-01', date_to: '2026-12-31'
    });

    const [sql, params] = db.getOne.mock.calls[0];
    expect(flattenSql(sql as string))
      .toMatch(/WHERE status = \? AND method = \? AND date >= \? AND date <= \?/);
    expect(params).toEqual(['received', 'cash', '2026-01-01', '2026-12-31']);
  });

  it('reports zero rather than null on an empty ledger', async () => {
    db.getOne.mockReturnValue({ total: null });

    await expect(paymentService.getTotalPaymentsAmount()).resolves.toBe(0);
  });
});

describe('searchPayments', () => {
  it('matches reference, description and client name', async () => {
    await paymentService.searchPayments('acme');

    const [sql, params] = db.getMany.mock.calls[0];
    expect(flattenSql(sql as string))
      .toMatch(/WHERE \(reference LIKE \? OR description LIKE \? OR client_name LIKE \?\)/);
    expect((params as unknown[]).slice(0, 3)).toEqual(['%acme%', '%acme%', '%acme%']);
  });

  it('trims the term before matching', async () => {
    await paymentService.searchPayments('  acme  ');

    expect((db.getMany.mock.calls[0][1] as unknown[])[0]).toBe('%acme%');
  });

  it('refuses a term too short to be useful', async () => {
    // A one-character search would return the entire ledger.
    const result = await paymentService.searchPayments('a');

    expect(result.payments).toEqual([]);
    expect(result.pagination.total).toBe(0);
    expect(db.getMany).not.toHaveBeenCalled();
  });

  it('refuses an empty term', async () => {
    await expect(paymentService.searchPayments('')).resolves.toMatchObject({ payments: [] });
    expect(db.getMany).not.toHaveBeenCalled();
  });

  it('counts matches across the whole ledger, not just the page', async () => {
    db.getOne.mockReturnValue({ count: 120 });

    const result = await paymentService.searchPayments('acme', { limit: 50, offset: 0 });

    expect(db.getOne.mock.calls[0][1]).toEqual(['%acme%', '%acme%', '%acme%']);
    expect(result.pagination).toMatchObject({ total: 120, hasMore: true });
  });

  it('reports no more results on the last page', async () => {
    db.getOne.mockReturnValue({ count: 30 });

    const result = await paymentService.searchPayments('acme', { limit: 50, offset: 0 });

    expect(result.pagination.hasMore).toBe(false);
  });
});

describe('lookups', () => {
  it('pages payments for one invoice', async () => {
    await paymentService.getPaymentsByInvoiceId(4, { limit: 5, offset: 10 });

    expect(db.getMany.mock.calls[0][1]).toEqual([4, 5, 10]);
  });

  it('matches a client name loosely', async () => {
    await paymentService.getPaymentsByClientName('Acme');

    expect((db.getMany.mock.calls[0][1] as unknown[])[0]).toBe('%Acme%');
  });

  it('falls back to a sane limit for recent payments', async () => {
    await paymentService.getRecentPayments(-5);

    expect(db.getMany.mock.calls[0][1]).toEqual([10]);
  });

  it('honours a supplied recent-payment limit', async () => {
    await paymentService.getRecentPayments(3);

    expect(db.getMany.mock.calls[0][1]).toEqual([3]);
  });

  it('groups method statistics with the last use', async () => {
    await paymentService.getPaymentMethodsStats();

    const sql = flattenSql(db.getMany.mock.calls[0][0] as string);
    expect(sql).toMatch(/MAX\(date\) as last_used/);
    expect(sql).toMatch(/GROUP BY method/);
  });

  it('rejects an invalid invoice id or blank client name', async () => {
    await expect(paymentService.getPaymentsByInvoiceId(0)).rejects.toThrow(/invoice id/i);
    await expect(paymentService.getPaymentsByClientName('')).rejects.toThrow(/client name/i);
    await expect(paymentService.getPaymentById(0)).rejects.toThrow(/id/i);
  });

  it('answers false for an invalid id rather than querying', async () => {
    await expect(paymentService.paymentExists(0)).resolves.toBe(false);
    expect(db.exists).not.toHaveBeenCalled();
  });
});
