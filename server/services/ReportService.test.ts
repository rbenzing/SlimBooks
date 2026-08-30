/**
 * ReportService tests.
 *
 * Report payloads are a recurring source of crashes: the UI does
 * `Object.entries(payload.expensesByStatus)` and dies on a missing key, so the
 * shape of every generator is pinned here alongside the arithmetic. The
 * cash-vs-accrual split and the per-period columns are the parts that must
 * reconcile with each other — a column set that does not add up to the total is
 * worse than no breakdown at all.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createDatabaseMock, flattenSql } from './databaseMock.test-helper.js';

const db = createDatabaseMock();
vi.mock('../core/DatabaseService.js', () => ({ databaseService: db }));

const { reportService } = await import('./ReportService.js');

const invoice = (over: Record<string, unknown> = {}) => ({
  id: 1,
  client_id: 1,
  amount: 100,
  status: 'paid',
  issue_date: '2026-02-15',
  created_at: Date.parse('2026-02-15T00:00:00.000Z'),
  ...over
});

const expense = (over: Record<string, unknown> = {}) => ({
  id: 1,
  amount: 40,
  category: 'Office',
  status: 'approved',
  date: '2026-02-15',
  ...over
});

/** Serves invoices/expenses/clients to whichever query asks for them. */
const seed = (data: { invoices?: unknown[]; expenses?: unknown[]; clients?: unknown[] }) => {
  db.getMany.mockImplementation((sql: string) => {
    if (/FROM invoices/.test(sql)) return data.invoices ?? [];
    if (/FROM expenses/.test(sql)) return data.expenses ?? [];
    if (/FROM clients/.test(sql)) return data.clients ?? [];
    return [];
  });
};

beforeEach(() => db.reset());

describe('generateProfitLossData', () => {
  it('returns every key the P&L screen reads', async () => {
    seed({});

    const report = await reportService.generateProfitLossData('2026-01-01', '2026-03-31', 1);

    expect(Object.keys(report)).toEqual(expect.arrayContaining([
      'revenue', 'expenses', 'profit', 'netIncome', 'accountingMethod',
      'invoices', 'periodColumns', 'hasBreakdown', 'breakdownPeriod'
    ]));
    expect(report.revenue).toMatchObject({ total: 0, paid: 0, pending: 0, otherIncome: 0 });
    expect(report.expenses).toMatchObject({ total: 0 });
  });

  it('recognises all invoiced revenue on the accrual method', async () => {
    seed({
      invoices: [invoice({ amount: 300 }), invoice({ id: 2, amount: 200, status: 'sent' })],
      expenses: [expense({ amount: 50 })]
    });

    const report = await reportService.generateProfitLossData('2026-01-01', '2026-03-31', 1, 'accrual');

    expect(report.revenue.total).toBe(500);
    expect(report.revenue.paid).toBe(300);
    expect(report.revenue.pending).toBe(200);
    expect(report.netIncome).toBe(450);
  });

  it('recognises only collected revenue on the cash method', async () => {
    seed({
      invoices: [invoice({ amount: 300 }), invoice({ id: 2, amount: 200, status: 'sent' })],
      expenses: [expense({ amount: 50 })]
    });

    const report = await reportService.generateProfitLossData('2026-01-01', '2026-03-31', 1, 'cash');

    expect(report.revenue.total).toBe(300);
    expect(report.netIncome).toBe(250);
  });

  it('groups expenses by category beside the total', async () => {
    seed({
      expenses: [
        expense({ amount: 40, category: 'Office' }),
        expense({ id: 2, amount: 60, category: 'Travel' }),
        expense({ id: 3, amount: 10, category: 'Office' })
      ]
    });

    const report = await reportService.generateProfitLossData('2026-01-01', '2026-03-31', 1);

    expect(report.expenses).toMatchObject({ total: 110, Office: 50, Travel: 60 });
  });

  it('files an uncategorised expense rather than dropping it', async () => {
    seed({ expenses: [expense({ category: null, amount: 25 })] });

    const report = await reportService.generateProfitLossData('2026-01-01', '2026-03-31', 1);

    expect(report.expenses).toMatchObject({ total: 25, Uncategorized: 25 });
  });

  it('coerces amounts stored as strings', async () => {
    seed({ invoices: [invoice({ amount: '150.50' })], expenses: [expense({ amount: '0.50' })] });

    const report = await reportService.generateProfitLossData('2026-01-01', '2026-03-31', 1);

    expect(report.revenue.total).toBe(150.5);
    expect(report.expenses.total).toBe(0.5);
  });

  it('treats an unparseable amount as zero instead of NaN', async () => {
    seed({ invoices: [invoice({ amount: 'n/a' }), invoice({ id: 2, amount: null })] });

    const report = await reportService.generateProfitLossData('2026-01-01', '2026-03-31', 1);

    expect(report.revenue.total).toBe(0);
    expect(Number.isNaN(report.profit.margin)).toBe(false);
  });

  it('reports a zero margin rather than dividing by zero', async () => {
    seed({ expenses: [expense({ amount: 100 })] });

    const report = await reportService.generateProfitLossData('2026-01-01', '2026-03-31', 1);

    expect(report.profit.margin).toBe(0);
    expect(report.netIncome).toBe(-100);
  });

  it('computes the margin against recognised revenue', async () => {
    seed({ invoices: [invoice({ amount: 1000 })], expenses: [expense({ amount: 250 })] });

    const report = await reportService.generateProfitLossData('2026-01-01', '2026-03-31', 1);

    expect(report.profit.margin).toBeCloseTo(75);
  });

  it('breaks the period into columns that add up to the total', async () => {
    seed({
      invoices: [
        invoice({ amount: 300, issue_date: '2026-02-15' }),
        invoice({ id: 2, amount: 200, issue_date: '2026-05-15' })
      ],
      expenses: [
        expense({ amount: 40, date: '2026-02-20' }),
        expense({ id: 2, amount: 60, date: '2026-05-20' })
      ]
    });

    const report = await reportService.generateProfitLossData(
      '2026-01-01', '2026-06-30', 1, 'accrual', undefined, 'quarterly'
    );

    const columnRevenue = report.periodColumns.reduce((sum, c) => sum + c.revenue, 0);
    const columnExpenses = report.periodColumns.reduce((sum, c) => sum + c.expenses, 0);
    expect(columnRevenue).toBe(report.revenue.total);
    expect(columnExpenses).toBe(report.expenses.total);
    expect(report.periodColumns).toHaveLength(2);
    expect(report.hasBreakdown).toBe(true);
  });

  it('buckets by month when asked', async () => {
    seed({ invoices: [invoice({ amount: 100, issue_date: '2026-02-15' })] });

    const report = await reportService.generateProfitLossData(
      '2026-01-01', '2026-03-31', 1, 'accrual', undefined, 'monthly'
    );

    expect(report.breakdownPeriod).toBe('monthly');
    expect(report.periodColumns).toHaveLength(3);
  });

  it('labels quarterly columns by fiscal quarter, not the calendar one', async () => {
    seed({
      invoices: [
        invoice({ amount: 300, issue_date: '2026-07-15' }),
        invoice({ id: 2, amount: 200, issue_date: '2026-10-15' })
      ]
    });

    const report = await reportService.generateProfitLossData(
      '2026-07-01', '2027-06-30', 7, 'accrual', undefined, 'quarterly'
    );

    expect(report.periodColumns.map(c => c.label)).toEqual([
      'FY2027 Q1', 'FY2027 Q2', 'FY2027 Q3', 'FY2027 Q4'
    ]);
    expect(report.periodColumns[0].revenue).toBe(300);
    expect(report.periodColumns[1].revenue).toBe(200);
  });

  it('hides a breakdown that would just restate the total column', async () => {
    seed({ invoices: [invoice({ amount: 100, issue_date: '2026-02-15' })] });

    const report = await reportService.generateProfitLossData(
      '2026-02-01', '2026-02-28', 1, 'accrual', undefined, 'quarterly'
    );

    expect(report.periodColumns).toHaveLength(1);
    expect(report.hasBreakdown).toBe(false);
  });

  it('applies the cash method inside each column too', async () => {
    // Columns must use the same recognition rule as the totals, or they will
    // not reconcile with the total column beside them.
    seed({
      invoices: [
        invoice({ amount: 300, issue_date: '2026-02-15' }),
        invoice({ id: 2, amount: 200, status: 'sent', issue_date: '2026-02-16' })
      ]
    });

    const report = await reportService.generateProfitLossData(
      '2026-01-01', '2026-06-30', 1, 'cash', undefined, 'quarterly'
    );

    const columnRevenue = report.periodColumns.reduce((sum, c) => sum + c.revenue, 0);
    expect(columnRevenue).toBe(300);
    expect(columnRevenue).toBe(report.revenue.total);
  });

  it('queries invoices by issue date, not row creation time', async () => {
    // An invoice issued last January but entered today must land in last
    // January's report, not this month's. `issue_date` is `YYYY-MM-DD` text,
    // so it binds directly — running it through the instant conversion used
    // for timestamp columns would compare a number against text and fail
    // silently and differently on each engine: SQLite orders every number
    // below every string, so the report comes back empty; MySQL reads the
    // string as 2026, so the lower bound matches everything and the upper
    // bound nothing.
    seed({});

    await reportService.generateProfitLossData('2026-01-01', '2026-03-31', 1);

    const invoiceCall = db.getMany.mock.calls.find(
      call => /FROM invoices/.test(call[0] as string)
    );
    expect(flattenSql(invoiceCall?.[0] as string)).toMatch(/i\.issue_date >= \? AND i\.issue_date <= \?/);
    expect(flattenSql(invoiceCall?.[0] as string)).toMatch(/ORDER BY i\.issue_date DESC/);
    expect(invoiceCall?.[1]).toEqual(['2026-01-01', '2026-03-31']);
  });

  it('still queries expenses by calendar day, because that column is days', async () => {
    // `expenses.date` is a day, not an instant. Converting it too would compare
    // 'YYYY-MM-DD' text against a number and return nothing.
    seed({});

    await reportService.generateProfitLossData('2026-01-01', '2026-03-31', 1);

    const expenseParams = db.getMany.mock.calls.find(
      call => /FROM expenses/.test(call[0] as string)
    )?.[1] as unknown[];
    expect(expenseParams).toEqual(['2026-01-01', '2026-03-31']);
  });

  it('excludes soft-deleted records', async () => {
    seed({});

    await reportService.generateProfitLossData('2026-01-01', '2026-03-31', 1);

    for (const [sql] of db.getMany.mock.calls) {
      expect(flattenSql(sql as string)).toMatch(/deleted_at IS NULL/);
    }
  });
});

describe('generateExpenseData', () => {
  it('always returns the grouping objects the screen iterates', async () => {
    // `Object.entries(undefined)` is what crashed the expense report before.
    seed({ expenses: [] });

    const report = await reportService.generateExpenseData('2026-01-01', '2026-03-31');

    expect(report.expensesByCategory).toEqual({});
    expect(report.expensesByStatus).toEqual({});
    expect(report).toMatchObject({ totalAmount: 0, totalCount: 0 });
  });

  it('groups by category and by status', async () => {
    seed({
      expenses: [
        expense({ amount: 40, category: 'Office', status: 'approved' }),
        expense({ id: 2, amount: 60, category: 'Travel', status: 'pending' }),
        expense({ id: 3, amount: 10, category: 'Office', status: 'approved' })
      ]
    });

    const report = await reportService.generateExpenseData('2026-01-01', '2026-03-31');

    expect(report.expensesByCategory).toEqual({ Office: 50, Travel: 60 });
    expect(report.expensesByStatus).toEqual({ approved: 50, pending: 60 });
    expect(report.totalAmount).toBe(110);
    expect(report.totalCount).toBe(3);
  });

  it('treats an expense with no status as pending', async () => {
    seed({ expenses: [expense({ status: null, amount: 30 })] });

    const report = await reportService.generateExpenseData('2026-01-01', '2026-03-31');

    expect(report.expensesByStatus).toEqual({ pending: 30 });
  });
});

describe('generateInvoiceData', () => {
  it('always returns the grouping objects the screen iterates', async () => {
    seed({ invoices: [] });

    const report = await reportService.generateInvoiceData('2026-01-01', '2026-03-31');

    expect(report.invoicesByStatus).toEqual({});
    expect(report.invoicesByClient).toEqual({});
    expect(report).toMatchObject({
      totalAmount: 0, paidAmount: 0, pendingAmount: 0, overdueAmount: 0, totalCount: 0
    });
  });

  it('splits the total into paid, pending and overdue', async () => {
    seed({
      invoices: [
        invoice({ amount: 300, status: 'paid' }),
        invoice({ id: 2, amount: 200, status: 'sent' }),
        invoice({ id: 3, amount: 100, status: 'overdue' })
      ]
    });

    const report = await reportService.generateInvoiceData('2026-01-01', '2026-03-31');

    expect(report.totalAmount).toBe(600);
    expect(report.paidAmount).toBe(300);
    // Overdue is still money owed, so it counts as pending as well.
    expect(report.pendingAmount).toBe(300);
    expect(report.overdueAmount).toBe(100);
  });

  it('groups by client, naming the unattached ones', async () => {
    seed({
      invoices: [
        invoice({ amount: 100, client_name: 'Acme' }),
        invoice({ id: 2, amount: 50, client_name: 'Acme' }),
        invoice({ id: 3, amount: 25, client_name: null })
      ]
    });

    const report = await reportService.generateInvoiceData('2026-01-01', '2026-03-31');

    expect(report.invoicesByClient).toEqual({ Acme: 150, 'Unknown Client': 25 });
  });

  it('treats an invoice with no status as a draft', async () => {
    seed({ invoices: [invoice({ status: null, amount: 75 })] });

    const report = await reportService.generateInvoiceData('2026-01-01', '2026-03-31');

    expect(report.invoicesByStatus).toEqual({ draft: 75 });
  });

  it('windows on issue date, not row creation time', async () => {
    // Same defect as generateProfitLossData: the list and the report must
    // agree on which date places an invoice inside the range.
    seed({});

    await reportService.generateInvoiceData('2026-01-01', '2026-03-31');

    const invoiceCall = db.getMany.mock.calls.find(
      call => /FROM invoices/.test(call[0] as string)
    );
    expect(flattenSql(invoiceCall?.[0] as string)).toMatch(/i\.issue_date >= \? AND i\.issue_date <= \?/);
    expect(flattenSql(invoiceCall?.[0] as string)).toMatch(/ORDER BY i\.issue_date DESC/);
    expect(invoiceCall?.[1]).toEqual(['2026-01-01', '2026-03-31']);
  });
});

describe('generateClientData', () => {
  it('rolls invoices up per client', async () => {
    seed({
      clients: [{ id: 1, name: 'Acme' }, { id: 2, name: 'Globex' }],
      invoices: [
        invoice({ client_id: 1, amount: 300, status: 'paid' }),
        invoice({ id: 2, client_id: 1, amount: 200, status: 'overdue' }),
        invoice({ id: 3, client_id: 2, amount: 100, status: 'sent' })
      ]
    });

    const report = await reportService.generateClientData();

    const acme = report.clients.find(c => c.name === 'Acme');
    expect(acme).toMatchObject({
      totalInvoices: 2, totalRevenue: 500, paidRevenue: 300,
      pendingRevenue: 200, overdueRevenue: 200
    });
    expect(report.totalRevenue).toBe(600);
    expect(report.totalPaidRevenue).toBe(300);
  });

  it('leaves clients with no invoices out of the report', async () => {
    seed({
      clients: [{ id: 1, name: 'Acme' }, { id: 2, name: 'Dormant' }],
      invoices: [invoice({ client_id: 1, amount: 100 })]
    });

    const report = await reportService.generateClientData();

    expect(report.clients.map(c => c.name)).toEqual(['Acme']);
    expect(report.totalClients).toBe(1);
  });

  it('filters invoices to the range when one is given', async () => {
    seed({ clients: [], invoices: [] });

    await reportService.generateClientData('2026-01-01', '2026-03-31');

    const call = db.getMany.mock.calls.find(c => /FROM invoices/.test(c[0] as string));
    expect(flattenSql(call?.[0] as string)).toMatch(/i\.created_at >= \? AND i\.created_at <= \?/);
    expect(call?.[1]).toEqual([
      Date.parse('2026-01-01T00:00:00.000Z'),
      Date.parse('2026-03-31T23:59:59.999Z')
    ]);
  });

  it('reports over all time when no range is given', async () => {
    seed({ clients: [], invoices: [] });

    await reportService.generateClientData();

    const call = db.getMany.mock.calls.find(c => /FROM invoices/.test(c[0] as string));
    expect(flattenSql(call?.[0] as string)).not.toMatch(/created_at >=/);
    expect(call?.[1]).toEqual([]);
  });
});

describe('saved report CRUD', () => {
  it('stores the data payload as JSON', async () => {
    db.getNextSequence.mockReturnValue(12);

    const result = await reportService.createReport({
      name: 'Q1', type: 'profit-loss', data: { netIncome: 400 }
    });

    expect(result.id).toBe(12);
    expect(db.queries[0].params[5]).toBe('{"netIncome":400}');
  });

  it('stores a null payload when there is no data', async () => {
    await reportService.createReport({ name: 'Q1', type: 'profit-loss' });

    expect(db.queries[0].params[5]).toBeNull();
  });

  it('rejects a report with no name or type', async () => {
    await expect(reportService.createReport({ name: '', type: 'x' })).rejects.toThrow(/required/i);
    await expect(reportService.createReport({ name: 'x', type: '' })).rejects.toThrow(/required/i);
  });

  it('parses the payload back on read', async () => {
    db.getOne.mockReturnValue({ id: 1, name: 'Q1', type: 'profit-loss', data: '{"netIncome":400}' });

    const report = await reportService.getReportById(1);

    expect(report?.data).toEqual({ netIncome: 400 });
  });

  it('keeps an unparseable payload rather than throwing', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    db.getOne.mockReturnValue({ id: 1, name: 'Q1', type: 'x', data: 'not json' });

    const report = await reportService.getReportById(1);

    expect(report?.data).toBe('not json');
  });

  it('returns null for a report that does not exist', async () => {
    db.getOne.mockReturnValue(undefined);

    await expect(reportService.getReportById(1)).resolves.toBeNull();
  });

  it('reports a failed update as not found', async () => {
    db.executeQuery.mockReturnValue({ changes: 0, lastInsertRowid: 0 });

    await expect(reportService.updateReport(1, { name: 'Q1', type: 'x' })).rejects.toThrow(/not found/i);
  });

  it('reports a failed delete as not found', async () => {
    db.executeQuery.mockReturnValue({ changes: 0, lastInsertRowid: 0 });

    await expect(reportService.deleteReport(1)).rejects.toThrow(/not found/i);
  });

  it('deletes a report that exists', async () => {
    await expect(reportService.deleteReport(1)).resolves.toMatchObject({ id: 1, changes: 1 });
  });

  it('rejects an invalid id everywhere it is taken', async () => {
    await expect(reportService.getReportById(0)).rejects.toThrow(/id/i);
    await expect(reportService.updateReport(0, { name: 'x', type: 'y' })).rejects.toThrow(/id/i);
    await expect(reportService.deleteReport(0)).rejects.toThrow(/id/i);
    await expect(reportService.reportExists(0)).resolves.toBe(false);
  });

  it('rejects a blank report type on lookup', async () => {
    await expect(reportService.getReportsByType('')).rejects.toThrow(/type/i);
    await expect(reportService.getReportCountByType('')).rejects.toThrow(/type/i);
  });

  it('rejects an incomplete date range', async () => {
    await expect(reportService.getReportsByDateRange('2026-01-01', '')).rejects.toThrow(/date range/i);
  });

  it('counts zero when the table is empty', async () => {
    db.getOne.mockReturnValue(undefined);

    await expect(reportService.getReportCount()).resolves.toBe(0);
  });

  it('lists saved reports newest first', async () => {
    await reportService.getAllReports();

    expect(flattenSql(db.getMany.mock.calls[0][0] as string)).toMatch(/ORDER BY created_at DESC/);
  });
});
