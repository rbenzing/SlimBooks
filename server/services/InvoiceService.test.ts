/**
 * InvoiceService tests.
 *
 * Invoices are the widest table in the schema, so the INSERT column list is the
 * highest-risk statement in the codebase: a column missing from it is dropped
 * with no error, which is how `line_items` and `tax_rate_id` were lost before.
 * The public-link token check matters just as much — it is the only thing
 * standing between a shared invoice URL and every other invoice.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import { createDatabaseMock, insertColumnsOf, flattenSql } from './databaseMock.test-helper.js';
import { epochToCalendarDay } from '../utils/utcTime.util.js';

const db = createDatabaseMock();
vi.mock('../core/DatabaseService.js', () => ({ databaseService: db }));

const generateInvoiceNumber = vi.fn(async () => 'INV-0042');
vi.mock('./InvoiceNumberService.js', () => ({
  invoiceNumberService: { generateInvoiceNumber }
}));

const { invoiceService } = await import('./InvoiceService.js');
const { authConfig } = await import('../config/index.js');

const validInvoice = {
  client_id: 3,
  amount: 1200,
  invoice_number: 'INV-001'
};

/** Reads the value bound to a named INSERT column. */
const insertedValue = (column: string) => {
  const { sql, params } = db.queries[0];
  return params[insertColumnsOf(sql).indexOf(column)];
};

beforeEach(() => {
  db.reset();
  generateInvoiceNumber.mockClear();
  generateInvoiceNumber.mockResolvedValue('INV-0042');
});

describe('createInvoice', () => {
  beforeEach(() => {
    // Client exists; invoice number does not.
    db.exists.mockImplementation((table: string) => table === 'clients');
  });

  it('persists every column the invoices table supports', async () => {
    await invoiceService.createInvoice(validInvoice);

    const columns = insertColumnsOf(db.queries[0].sql);
    for (const column of [
      'invoice_number', 'client_id', 'design_template_id', 'recurring_template_id',
      'amount', 'tax_amount', 'total_amount', 'status', 'due_date', 'issue_date',
      'description', 'items', 'notes', 'payment_terms', 'type',
      'client_name', 'client_email', 'client_phone', 'client_address',
      'line_items', 'tax_rate_id', 'shipping_amount', 'shipping_rate_id',
      'email_status', 'created_at', 'updated_at'
    ]) {
      expect(columns).toContain(column);
    }
  });

  it('never writes the phantom template_id column', async () => {
    await invoiceService.createInvoice(validInvoice);

    expect(insertColumnsOf(db.queries[0].sql)).not.toContain('template_id');
  });

  it('binds exactly one parameter per column', async () => {
    await invoiceService.createInvoice(validInvoice);

    const { sql, params } = db.queries[0];
    expect(params).toHaveLength(insertColumnsOf(sql).length);
  });

  it('keeps the two template ids in separate columns', async () => {
    await invoiceService.createInvoice({
      ...validInvoice,
      design_template_id: 7,
      recurring_template_id: 9
    });

    expect(insertedValue('design_template_id')).toBe(7);
    expect(insertedValue('recurring_template_id')).toBe(9);
  });

  it('stores line items and the tax rate rather than dropping them', async () => {
    await invoiceService.createInvoice({
      ...validInvoice,
      line_items: '[{"description":"Design","amount":1200}]',
      tax_rate_id: 4
    });

    expect(insertedValue('line_items')).toContain('Design');
    expect(insertedValue('tax_rate_id')).toBe(4);
  });

  it('defaults the total to the amount when no total is supplied', async () => {
    await invoiceService.createInvoice(validInvoice);

    expect(insertedValue('total_amount')).toBe(1200);
    expect(insertedValue('tax_amount')).toBe(0);
  });

  it('honours an explicit total that includes tax', async () => {
    await invoiceService.createInvoice({ ...validInvoice, tax_amount: 96, total_amount: 1296 });

    expect(insertedValue('total_amount')).toBe(1296);
  });

  it('starts an invoice as a draft that has not been emailed', async () => {
    await invoiceService.createInvoice(validInvoice);

    expect(insertedValue('status')).toBe('draft');
    expect(insertedValue('email_status')).toBe('not_sent');
  });

  it('defaults issue_date to the day the row was created, rather than null', async () => {
    // Every report and list screen now windows on issue_date, and NULL
    // compares false against every range: an omitted issue_date used to make
    // the invoice silently disappear from every report.
    await invoiceService.createInvoice(validInvoice);

    const createdAt = insertedValue('created_at') as number;
    expect(insertedValue('issue_date')).toBe(epochToCalendarDay(createdAt));
    expect(insertedValue('issue_date')).not.toBeNull();
  });

  it('honours an explicitly supplied issue_date instead of the default', async () => {
    await invoiceService.createInvoice({ ...validInvoice, issue_date: '2026-01-15' });

    expect(insertedValue('issue_date')).toBe('2026-01-15');
  });

  it('generates a number when the caller does not supply one', async () => {
    await invoiceService.createInvoice({ client_id: 3, amount: 500 });

    expect(generateInvoiceNumber).toHaveBeenCalled();
    expect(insertedValue('invoice_number')).toBe('INV-0042');
  });

  it('does not generate a number when one is supplied', async () => {
    await invoiceService.createInvoice(validInvoice);

    expect(generateInvoiceNumber).not.toHaveBeenCalled();
    expect(insertedValue('invoice_number')).toBe('INV-001');
  });

  it('refuses to duplicate an existing invoice number', async () => {
    db.exists.mockReturnValue(true);

    await expect(invoiceService.createInvoice(validInvoice)).rejects.toThrow(/already exists/i);
    expect(db.queries).toHaveLength(0);
  });

  it('refuses an invoice for a client that does not exist', async () => {
    db.exists.mockReturnValue(false);

    await expect(invoiceService.createInvoice(validInvoice)).rejects.toThrow(/client not found/i);
    expect(db.queries).toHaveLength(0);
  });

  it('rejects a missing client or amount', async () => {
    await expect(invoiceService.createInvoice({ amount: 100 } as never)).rejects.toThrow(/required/i);
    await expect(invoiceService.createInvoice({ client_id: 3 } as never)).rejects.toThrow(/required/i);
  });

  it('rejects a negative amount', async () => {
    await expect(
      invoiceService.createInvoice({ ...validInvoice, amount: -1 })
    ).rejects.toThrow(/amount/i);
  });

  it('rejects a client id that is not a number', async () => {
    await expect(
      invoiceService.createInvoice({ ...validInvoice, client_id: '3' as never })
    ).rejects.toThrow(/client id/i);
  });

  it('returns the new invoice id', async () => {
    db.getNextSequence.mockReturnValue(77);

    await expect(invoiceService.createInvoice(validInvoice)).resolves.toBe(77);
  });
});

describe('updateInvoice', () => {
  beforeEach(() => {
    db.getOne.mockReturnValue({ id: 1, invoice_number: 'INV-001', status: 'draft' });
    db.exists.mockReturnValue(true);
  });

  it('lets the wide invoice fields through the whitelist', async () => {
    // Existing-invoice lookup succeeds, duplicate-number lookup must not.
    db.getOne.mockImplementation((sql: string) =>
      /invoice_number = \?/.test(sql) ? undefined : { id: 1, status: 'draft' }
    );

    await invoiceService.updateInvoice(1, {
      line_items: '[]',
      tax_rate_id: 2,
      design_template_id: 5,
      recurring_template_id: 6,
      shipping_amount: 15,
      notes: 'Thanks'
    });

    const [, , updateData] = db.updateRecord.mock.calls[0];
    expect(updateData).toMatchObject({
      line_items: '[]',
      tax_rate_id: 2,
      design_template_id: 5,
      recurring_template_id: 6,
      shipping_amount: 15,
      notes: 'Thanks'
    });
  });

  it('drops fields outside the whitelist', async () => {
    await invoiceService.updateInvoice(1, { amount: 50, id: 999, created_at: 'hacked' } as never);

    const [, , updateData] = db.updateRecord.mock.calls[0];
    expect(updateData).toMatchObject({ amount: 50 });
    expect(updateData).not.toHaveProperty('id');
    expect(updateData).not.toHaveProperty('created_at');
  });

  it('rejects an update with nothing whitelisted left to write', async () => {
    await expect(
      invoiceService.updateInvoice(1, { id: 999 } as never)
    ).rejects.toThrow(/no valid fields/i);
    expect(db.updateRecord).not.toHaveBeenCalled();
  });

  it('rejects an update to an invoice that does not exist', async () => {
    db.getOne.mockReturnValue(undefined);

    await expect(invoiceService.updateInvoice(1, { amount: 10 })).rejects.toThrow(/not found/i);
  });

  it('rejects renumbering onto another invoice number', async () => {
    db.getOne.mockReturnValue({ id: 2 });

    await expect(
      invoiceService.updateInvoice(1, { invoice_number: 'INV-002' })
    ).rejects.toThrow(/already exists/i);
  });

  it('rejects a move to a client that does not exist', async () => {
    db.exists.mockReturnValue(false);

    await expect(invoiceService.updateInvoice(1, { client_id: 99 })).rejects.toThrow(/client not found/i);
  });

  it('rejects a negative amount', async () => {
    await expect(invoiceService.updateInvoice(1, { amount: -5 })).rejects.toThrow(/amount/i);
  });

  it('rejects an invalid id', async () => {
    await expect(invoiceService.updateInvoice(0, { amount: 10 })).rejects.toThrow(/id/i);
  });
});

describe('deleteInvoice', () => {
  it('will not delete a paid invoice', async () => {
    // Deleting a paid invoice would orphan its payment and break the ledger.
    db.getOne.mockReturnValue({ id: 1, status: 'paid' });

    await expect(invoiceService.deleteInvoice(1)).rejects.toThrow(/paid/i);
    expect(db.deleteById).not.toHaveBeenCalled();
  });

  it('deletes a draft invoice', async () => {
    db.getOne.mockReturnValue({ id: 1, status: 'draft' });

    await expect(invoiceService.deleteInvoice(1)).resolves.toBe(1);
    expect(db.deleteById).toHaveBeenCalledWith('invoices', 1);
  });

  it('rejects an invoice that does not exist', async () => {
    db.getOne.mockReturnValue(undefined);

    await expect(invoiceService.deleteInvoice(1)).rejects.toThrow(/not found/i);
  });

  it('rejects an invalid id', async () => {
    await expect(invoiceService.deleteInvoice(0)).rejects.toThrow(/id/i);
  });
});

describe('updateInvoiceStatus', () => {
  beforeEach(() => db.exists.mockReturnValue(true));

  it('accepts each status the UI can set', async () => {
    for (const status of ['draft', 'sent', 'paid', 'overdue', 'cancelled'] as const) {
      db.reset();
      db.exists.mockReturnValue(true);
      await expect(invoiceService.updateInvoiceStatus(1, status)).resolves.toBe(1);
      expect(db.queries[0].params[0]).toBe(status);
    }
  });

  it('rejects a payment status borrowed from the payments table', async () => {
    // `received` is a payment status, not an invoice status.
    await expect(invoiceService.updateInvoiceStatus(1, 'received' as never)).rejects.toThrow(/invalid status/i);
    expect(db.queries).toHaveLength(0);
  });

  it('rejects a status change on a missing invoice', async () => {
    db.exists.mockReturnValue(false);

    await expect(invoiceService.updateInvoiceStatus(1, 'paid')).rejects.toThrow(/not found/i);
  });

  it('rejects an invalid id', async () => {
    await expect(invoiceService.updateInvoiceStatus(0, 'paid')).rejects.toThrow(/id/i);
  });
});

describe('markInvoiceAsSent', () => {
  it('records the send time alongside both status columns', async () => {
    await invoiceService.markInvoiceAsSent(1, Date.parse('2026-07-04T10:00:00Z'));

    const { sql, params } = db.queries[0];
    expect(flattenSql(sql)).toMatch(/status = 'sent'/);
    expect(flattenSql(sql)).toMatch(/email_status = 'sent'/);
    expect(params).toEqual([Date.parse('2026-07-04T10:00:00Z'), 1]);
  });

  it('stamps the current time when none is supplied', async () => {
    await invoiceService.markInvoiceAsSent(1);

    expect(db.queries[0].params[0]).toBeGreaterThan(Date.now() - 5000);
  });

  it('rejects an invalid id', async () => {
    await expect(invoiceService.markInvoiceAsSent(0)).rejects.toThrow(/id/i);
  });
});

describe('getAllInvoices', () => {
  it('applies no WHERE clause when unfiltered', async () => {
    await invoiceService.getAllInvoices();

    expect(flattenSql(db.getMany.mock.calls[0][0] as string)).not.toMatch(/WHERE/);
  });

  it('filters by status and client together', async () => {
    await invoiceService.getAllInvoices({ status: 'sent', client_id: 3 });

    const [sql, params] = db.getMany.mock.calls[0];
    expect(flattenSql(sql as string)).toMatch(/WHERE i\.status = \? AND i\.client_id = \?/);
    expect(params).toEqual(['sent', 3, 50, 0]);
  });

  it('does not pass limit and offset to the count query', async () => {
    // The count query has no LIMIT placeholders; passing them would throw.
    await invoiceService.getAllInvoices({ status: 'sent' }, { limit: 10, offset: 20 });

    const [countSql, countParams] = db.getOne.mock.calls[0];
    expect(flattenSql(countSql as string)).toMatch(/COUNT\(\*\)/);
    expect(countParams).toEqual(['sent']);
  });

  it('reports hasMore only while records remain', async () => {
    db.getOne.mockReturnValue({ count: 75 });
    const page = await invoiceService.getAllInvoices({}, { limit: 50, offset: 0 });
    expect(page.pagination).toMatchObject({ total: 75, hasMore: true });

    db.getOne.mockReturnValue({ count: 40 });
    const lastPage = await invoiceService.getAllInvoices({}, { limit: 50, offset: 0 });
    expect(lastPage.pagination.hasMore).toBe(false);
  });

  it('reports a zero total when the count query returns nothing', async () => {
    db.getOne.mockReturnValue(undefined);

    const page = await invoiceService.getAllInvoices();
    expect(page.pagination.total).toBe(0);
  });
});

describe('getInvoiceById', () => {
  it('joins the client so the editor can render the bill-to block', async () => {
    db.getOne.mockReturnValue({ id: 1 });

    await invoiceService.getInvoiceById(1);

    const sql = flattenSql(db.getOne.mock.calls[0][0] as string);
    expect(sql).toMatch(/LEFT JOIN clients/);
    expect(sql).toMatch(/c\.zipCode as client_zip/);
  });

  it('rejects an invalid id', async () => {
    await expect(invoiceService.getInvoiceById(undefined as never)).rejects.toThrow(/id/i);
  });
});

describe('public invoice links', () => {
  const tokenFor = (invoiceId: number, overrides: Record<string, unknown> = {}) =>
    jwt.sign(
      { invoiceId, type: 'public_invoice', exp: Math.floor(Date.now() / 1000) + 3600, ...overrides },
      authConfig.jwtSecret
    );

  beforeEach(() => {
    db.getOne.mockImplementation((sql: string) =>
      /FROM invoices/.test(sql) ? { id: 5, invoice_number: 'INV-005' } : undefined
    );
  });

  it('returns the invoice for a token issued for it', async () => {
    const result = await invoiceService.getPublicInvoiceById(5, tokenFor(5));

    expect(result).toMatchObject({ id: 5 });
    expect(result.invoiceTemplate).toBe('modern-blue');
  });

  it('refuses a token issued for a different invoice', async () => {
    // Without this check, one shared link would expose every invoice.
    await expect(invoiceService.getPublicInvoiceById(5, tokenFor(6)))
      .rejects.toThrow(/invalid or expired/i);
  });

  it('refuses a token signed with the wrong secret', async () => {
    const forged = jwt.sign({ invoiceId: 5, type: 'public_invoice' }, 'not-the-secret');

    await expect(invoiceService.getPublicInvoiceById(5, forged))
      .rejects.toThrow(/invalid or expired/i);
  });

  it('refuses a token minted for some other purpose', async () => {
    await expect(invoiceService.getPublicInvoiceById(5, tokenFor(5, { type: 'password_reset' })))
      .rejects.toThrow(/invalid or expired/i);
  });

  it('refuses an expired token', async () => {
    const expired = tokenFor(5, { exp: Math.floor(Date.now() / 1000) - 60 });

    await expect(invoiceService.getPublicInvoiceById(5, expired))
      .rejects.toThrow(/invalid or expired/i);
  });

  it('refuses a missing token', async () => {
    await expect(invoiceService.getPublicInvoiceById(5, '')).rejects.toThrow(/invalid or expired/i);
  });

  it('does not reveal whether the invoice exists', async () => {
    db.getOne.mockReturnValue(undefined);

    await expect(invoiceService.getPublicInvoiceById(5, tokenFor(5)))
      .rejects.toThrow(/invalid or expired/i);
  });

  it('parses company and currency settings for the public view', async () => {
    db.getOne.mockImplementation((sql: string, params: unknown[] = []) => {
      if (/FROM invoices/.test(sql)) return { id: 5 };
      if (params[0] === 'company_settings') return { value: '{"name":"Slimbooks"}' };
      if (params[0] === 'currency_settings') return { value: '{"code":"USD"}' };
      return undefined;
    });

    const result = await invoiceService.getPublicInvoiceById(5, tokenFor(5));

    expect(result.companySettings).toEqual({ name: 'Slimbooks' });
    expect(result.currencySettings).toEqual({ code: 'USD' });
  });

  it('issues a token that the reader accepts', async () => {
    const { token, expiresIn } = await invoiceService.generatePublicInvoiceToken(5);

    expect(expiresIn).toBe('24h');
    await expect(invoiceService.getPublicInvoiceById(5, token)).resolves.toMatchObject({ id: 5 });
  });

  it('will not issue a token for an invoice that does not exist', async () => {
    db.getOne.mockReturnValue(undefined);

    await expect(invoiceService.generatePublicInvoiceToken(5)).rejects.toThrow(/not found/i);
  });

  it('rejects an invalid id when issuing a token', async () => {
    await expect(invoiceService.generatePublicInvoiceToken(0)).rejects.toThrow(/id/i);
  });
});

describe('lookups', () => {
  it('reports overdue invoices that are still outstanding', async () => {
    await invoiceService.getOverdueInvoices();

    const sql = flattenSql(db.getMany.mock.calls[0][0] as string);
    expect(sql).toMatch(/status IN \('sent', 'overdue'\)/);
    expect(sql).toMatch(/due_date < date\('now'\)/);
  });

  it('pages invoices for one client', async () => {
    await invoiceService.getInvoicesByClientId(3, { limit: 5, offset: 10 });

    expect(db.getMany.mock.calls[0][1]).toEqual([3, 5, 10]);
  });

  it('rejects an invalid client id', async () => {
    await expect(invoiceService.getInvoicesByClientId(0)).rejects.toThrow(/client id/i);
  });

  it('falls back to a sane limit for recent invoices', async () => {
    await invoiceService.getRecentInvoices(-1);

    expect(db.getMany.mock.calls[0][1]).toEqual([10]);
  });

  it('honours a supplied recent-invoice limit', async () => {
    await invoiceService.getRecentInvoices(3);

    expect(db.getMany.mock.calls[0][1]).toEqual([3]);
  });

  it('answers false for an invalid id rather than querying', async () => {
    await expect(invoiceService.invoiceExists(0)).resolves.toBe(false);
    expect(db.exists).not.toHaveBeenCalled();
  });

  it('excludes the invoice being renamed from its own uniqueness check', async () => {
    db.getOne.mockReturnValue(undefined);

    await expect(invoiceService.invoiceNumberExists('INV-001', 1)).resolves.toBe(false);
    expect(db.getOne.mock.calls[0][1]).toEqual(['INV-001', 1]);
  });

  it('answers false for an empty invoice number', async () => {
    await expect(invoiceService.invoiceNumberExists('')).resolves.toBe(false);
  });
});

describe('getInvoiceStats', () => {
  it('returns zeroes rather than undefined on an empty ledger', async () => {
    db.getOne.mockReturnValue(undefined);

    const stats = await invoiceService.getInvoiceStats();

    expect(stats.total_invoices).toBe(0);
    expect(stats.average_amount).toBe(0);
  });

  it('passes the aggregates straight through', async () => {
    db.getOne.mockReturnValue({ total_invoices: 4, total_paid: 900, paid_count: 2 });

    const stats = await invoiceService.getInvoiceStats();

    expect(stats).toMatchObject({ total_invoices: 4, total_paid: 900, paid_count: 2 });
  });
});
