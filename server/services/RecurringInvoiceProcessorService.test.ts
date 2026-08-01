/**
 * RecurringInvoiceProcessorService tests.
 *
 * This is the unattended billing run: it creates invoices nobody is watching be
 * created. So the assertions are about fidelity and containment — the generated
 * invoice must carry everything the template held, the due date must match the
 * payment terms exactly, and one bad template must not abort the whole run.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createDatabaseMock, insertColumnsOf, flattenSql } from './databaseMock.test-helper.js';

const db = createDatabaseMock();
vi.mock('../core/DatabaseService.js', () => ({ databaseService: db }));

const generateInvoiceNumber = vi.fn(async () => 'INV-202607-0042');
vi.mock('./InvoiceNumberService.js', () => ({
  invoiceNumberService: { generateInvoiceNumber }
}));

const { recurringInvoiceProcessorService: processor } = await import('./RecurringInvoiceProcessorService.js');
const { recurringInvoiceTemplateService: templates } = await import('./RecurringInvoiceTemplateService.js');

const template = (over: Record<string, unknown> = {}) => ({
  id: 5,
  name: 'Monthly retainer',
  client_id: 3,
  amount: 1000,
  description: 'Retainer',
  frequency: 'monthly',
  payment_terms: 'Net 30',
  next_invoice_date: '2026-07-01',
  is_active: true,
  line_items: '[{"description":"Retainer","amount":1000}]',
  tax_amount: 80,
  tax_rate_id: 'tax-1',
  shipping_amount: 20,
  shipping_rate_id: 'ship-1',
  notes: 'Thanks',
  ...over
});

/** The INSERT the processor built, with its columns resolved. */
const invoiceInsert = () => {
  const query = db.queries.find(q => /INSERT INTO invoices/i.test(q.sql));
  if (!query) throw new Error('no invoice INSERT was issued');
  const columns = insertColumnsOf(query.sql);
  return {
    columns,
    valueOf: (column: string) => query.params[columns.indexOf(column)],
    query
  };
};

beforeEach(() => {
  db.reset();
  generateInvoiceNumber.mockClear();
  generateInvoiceNumber.mockResolvedValue('INV-202607-0042');
});

describe('createInvoiceFromTemplate', () => {
  beforeEach(() => db.getOne.mockReturnValue(template()));

  it('carries every billable field from the template onto the invoice', async () => {
    await processor.processSingleTemplate(5);

    const { valueOf } = invoiceInsert();
    expect(valueOf('client_id')).toBe(3);
    expect(valueOf('recurring_template_id')).toBe(5);
    expect(valueOf('amount')).toBe(1000);
    expect(valueOf('tax_amount')).toBe(80);
    expect(valueOf('shipping_amount')).toBe(20);
    expect(valueOf('description')).toBe('Retainer');
    expect(valueOf('notes')).toBe('Thanks');
    expect(valueOf('line_items')).toContain('Retainer');
  });

  it('carries the tax and shipping rate references too', async () => {
    // Dropping these silently detaches the invoice from the rates it was
    // priced with, so editing it later recalculates against nothing.
    await processor.processSingleTemplate(5);

    const { columns, valueOf } = invoiceInsert();
    expect(columns).toContain('tax_rate_id');
    expect(columns).toContain('shipping_rate_id');
    expect(valueOf('tax_rate_id')).toBe('tax-1');
    expect(valueOf('shipping_rate_id')).toBe('ship-1');
  });

  it('links the invoice with recurring_template_id, never template_id', async () => {
    await processor.processSingleTemplate(5);

    const { columns } = invoiceInsert();
    expect(columns).toContain('recurring_template_id');
    expect(columns).not.toContain('template_id');
    expect(columns).not.toContain('design_template_id');
  });

  it('totals amount plus tax plus shipping', async () => {
    await processor.processSingleTemplate(5);

    expect(invoiceInsert().valueOf('total_amount')).toBe(1100);
  });

  it('binds one parameter per placeholder', async () => {
    // created_at/updated_at are SQL literals, so the column count is two higher
    // than the bound-parameter count by design.
    await processor.processSingleTemplate(5);

    const { columns, query } = invoiceInsert();
    const placeholders = (flattenSql(query.sql).match(/\?/g) ?? []).length;
    expect(query.params).toHaveLength(placeholders);
    expect(columns).toHaveLength(placeholders + 2);
  });

  it('creates the invoice as a draft for review', async () => {
    // An unattended run must not mark anything sent or paid on its own.
    await processor.processSingleTemplate(5);

    expect(invoiceInsert().valueOf('status')).toBe('draft');
  });

  it('uses the configured invoice numbering rather than its own', async () => {
    // A second numbering implementation ignores the user's prefix setting and
    // drifts out of step with manually created invoices.
    generateInvoiceNumber.mockResolvedValue('SB-202607-0007');

    await processor.processSingleTemplate(5);

    expect(generateInvoiceNumber).toHaveBeenCalled();
    expect(invoiceInsert().valueOf('invoice_number')).toBe('SB-202607-0007');
  });

  it('issues the invoice dated today', async () => {
    await processor.processSingleTemplate(5);

    expect(String(invoiceInsert().valueOf('issue_date'))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('due dates', () => {
  const dueDateFor = async (paymentTerms: string, issueDate?: string) => {
    db.reset();
    generateInvoiceNumber.mockResolvedValue('INV-202607-0042');
    db.getOne.mockReturnValue(template({ payment_terms: paymentTerms }));
    if (issueDate) vi.setSystemTime(new Date(`${issueDate}T12:00:00.000Z`));
    await processor.processSingleTemplate(5);
    return String(invoiceInsert().valueOf('due_date'));
  };

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('reads a net term', async () => {
    await expect(dueDateFor('Net 30', '2026-07-01')).resolves.toBe('2026-07-31');
  });

  it('reads a plain day count', async () => {
    await expect(dueDateFor('15 days', '2026-07-01')).resolves.toBe('2026-07-16');
  });

  it('treats due-on-receipt as due the same day', async () => {
    await expect(dueDateFor('Due on receipt', '2026-07-01')).resolves.toBe('2026-07-01');
  });

  it('defaults to thirty days for an unrecognised term', async () => {
    await expect(dueDateFor('whenever', '2026-07-01')).resolves.toBe('2026-07-31');
  });

  it('is case-insensitive', async () => {
    await expect(dueDateFor('NET 45', '2026-07-01')).resolves.toBe('2026-08-15');
  });

  it('does not lose a day across a daylight-saving boundary', async () => {
    // Adding days in local time while parsing the date as UTC shifts the
    // result by an hour across a DST change, which lands on the previous day.
    await expect(dueDateFor('Net 30', '2026-03-01')).resolves.toBe('2026-03-31');
  });

  it('crosses a year boundary', async () => {
    await expect(dueDateFor('Net 60', '2026-12-01')).resolves.toBe('2027-01-30');
  });
});

describe('processAllDueTemplates', () => {
  it('creates an invoice per due template and advances each schedule', async () => {
    vi.spyOn(templates, 'getTemplatesDueForProcessing').mockResolvedValue([
      template({ id: 1, next_invoice_date: '2026-07-01' }),
      template({ id: 2, next_invoice_date: '2026-07-01' })
    ] as never);
    const advance = vi.spyOn(templates, 'updateNextInvoiceDate').mockResolvedValue(true);

    const result = await processor.processAllDueTemplates();

    expect(result.created).toBe(2);
    expect(result.errors).toEqual([]);
    expect(advance).toHaveBeenCalledTimes(2);
    expect(advance).toHaveBeenCalledWith(1, '2026-08-01');
  });

  it('keeps going when one template fails', async () => {
    // One broken template must not stop the rest of the month's billing.
    vi.spyOn(templates, 'getTemplatesDueForProcessing').mockResolvedValue([
      template({ id: 1 }), template({ id: 2 }), template({ id: 3 })
    ] as never);
    vi.spyOn(templates, 'updateNextInvoiceDate').mockResolvedValue(true);
    let inserted = 0;
    db.executeQuery.mockImplementation((sql: string) => {
      if (/INSERT INTO invoices/i.test(sql)) {
        inserted += 1;
        if (inserted === 2) throw new Error('client was deleted');
      }
      return { changes: 1, lastInsertRowid: 1 };
    });

    const result = await processor.processAllDueTemplates();

    expect(result.created).toBe(2);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/Template ID 2/);
  });

  it('names the failing template in the error', async () => {
    vi.spyOn(templates, 'getTemplatesDueForProcessing').mockResolvedValue([template({ id: 9 })] as never);
    db.executeQuery.mockImplementation(() => { throw new Error('client was deleted'); });

    const result = await processor.processAllDueTemplates();

    expect(result.created).toBe(0);
    expect(result.errors[0]).toBe('Template ID 9: client was deleted');
  });

  it('does not advance the schedule of a template that failed', async () => {
    // Advancing it would skip the billing period entirely.
    vi.spyOn(templates, 'getTemplatesDueForProcessing').mockResolvedValue([template({ id: 9 })] as never);
    const advance = vi.spyOn(templates, 'updateNextInvoiceDate').mockResolvedValue(true);
    db.executeQuery.mockImplementation(() => { throw new Error('boom'); });

    await processor.processAllDueTemplates();

    expect(advance).not.toHaveBeenCalled();
  });

  it('reports a failure to read the schedule rather than throwing', async () => {
    vi.spyOn(templates, 'getTemplatesDueForProcessing').mockRejectedValue(new Error('table missing'));

    const result = await processor.processAllDueTemplates();

    expect(result).toEqual({ created: 0, errors: ['Failed to fetch due templates: table missing'] });
  });

  it('does nothing when nothing is due', async () => {
    vi.spyOn(templates, 'getTemplatesDueForProcessing').mockResolvedValue([]);

    await expect(processor.processAllDueTemplates()).resolves.toEqual({ created: 0, errors: [] });
    expect(db.queries).toHaveLength(0);
  });
});

describe('processSingleTemplate', () => {
  it('returns the new invoice id', async () => {
    db.getOne.mockReturnValue(template());
    db.executeQuery.mockReturnValue({ changes: 1, lastInsertRowid: 77 });
    vi.spyOn(templates, 'updateNextInvoiceDate').mockResolvedValue(true);

    await expect(processor.processSingleTemplate(5))
      .resolves.toMatchObject({ success: true, invoiceId: 77 });
  });

  it('refuses a template that does not exist', async () => {
    db.getOne.mockReturnValue(undefined);

    await expect(processor.processSingleTemplate(5))
      .resolves.toEqual({ success: false, error: 'Recurring template not found' });
    expect(db.queries).toHaveLength(0);
  });

  it('refuses a paused template', async () => {
    // Running a paused template by hand would bill a client who was put on hold.
    db.getOne.mockReturnValue(template({ is_active: false }));

    await expect(processor.processSingleTemplate(5))
      .resolves.toEqual({ success: false, error: 'Recurring template is inactive' });
    expect(db.queries).toHaveLength(0);
  });

  it('reports a write failure instead of throwing', async () => {
    db.getOne.mockReturnValue(template());
    db.executeQuery.mockImplementation(() => { throw new Error('disk full'); });

    await expect(processor.processSingleTemplate(5))
      .resolves.toEqual({ success: false, error: 'disk full' });
  });

  it('advances the schedule by the template frequency', async () => {
    db.getOne.mockReturnValue(template({ frequency: 'quarterly', next_invoice_date: '2026-07-01' }));
    const advance = vi.spyOn(templates, 'updateNextInvoiceDate').mockResolvedValue(true);

    await processor.processSingleTemplate(5);

    expect(advance).toHaveBeenCalledWith(5, '2026-10-01');
  });
});

describe('getProcessingStats', () => {
  it('counts active, due and overdue templates against today', async () => {
    db.getOne.mockImplementation((sql: string) => {
      if (/next_invoice_date = \?/.test(sql)) return { count: 2 };
      if (/next_invoice_date < \?/.test(sql)) return { count: 1 };
      if (/next_invoice_date > \?/.test(sql)) return { next_date: '2026-08-01' };
      return { count: 7 };
    });

    await expect(processor.getProcessingStats()).resolves.toEqual({
      totalActiveTemplates: 7,
      templatesDueToday: 2,
      templatesOverdue: 1,
      nextProcessingDate: '2026-08-01'
    });
  });

  it('reports zeroes on an empty schedule', async () => {
    db.getOne.mockReturnValue(undefined);

    await expect(processor.getProcessingStats()).resolves.toMatchObject({
      totalActiveTemplates: 0, templatesDueToday: 0, templatesOverdue: 0
    });
  });

  it('counts only active templates', async () => {
    db.getOne.mockReturnValue({ count: 0 });

    await processor.getProcessingStats();

    for (const [sql] of db.getOne.mock.calls) {
      expect(flattenSql(sql as string)).toMatch(/is_active = 1/);
    }
  });

  it('compares against a bare calendar date', async () => {
    db.getOne.mockReturnValue({ count: 0 });

    await processor.getProcessingStats();

    const [, params] = db.getOne.mock.calls[1];
    expect(String((params as unknown[])[0])).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
