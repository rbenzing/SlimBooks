/**
 * RecurringInvoiceTemplateService tests (`/api/recurring-templates`).
 *
 * The two template tables share an id space, so calling the wrong one silently
 * reads, writes or DELETES an unrelated row — that bug shipped once already.
 * Every statement here is asserted to name `recurring_invoice_templates` and
 * never `invoice_design_templates`.
 *
 * Recurring templates use `is_active` (0/1). There is no `status` column, and a
 * phantom one previously re-activated paused templates on every save.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { sqliteDialect } from '../database/dialects/sqlite.dialect.js';
import { createDatabaseMock, insertColumnsOf, flattenSql } from './databaseMock.test-helper.js';

const db = createDatabaseMock();
vi.mock('../core/DatabaseService.js', () => ({ databaseService: db }));

const { recurringInvoiceTemplateService: service } = await import('./RecurringInvoiceTemplateService.js');

/** A schema matching the live table, used only to parse generated SQL. */
const sqlite = new Database(':memory:');
sqlite.exec(`
  CREATE TABLE recurring_invoice_templates (
    id INTEGER PRIMARY KEY, name TEXT, client_id INTEGER, amount REAL, description TEXT,
    frequency TEXT, payment_terms TEXT, next_invoice_date TEXT, is_active INTEGER,
    line_items TEXT, tax_amount REAL, tax_rate_id TEXT, shipping_amount REAL,
    shipping_rate_id TEXT, notes TEXT, created_at TEXT, updated_at TEXT
  );
  CREATE TABLE invoices (id INTEGER PRIMARY KEY, recurring_template_id INTEGER);
`);

const expectPreparable = (sql: string) => {
  expect(() => sqlite.prepare(sql)).not.toThrow();
};

const validTemplate = {
  name: 'Monthly retainer',
  client_id: 3,
  amount: 2500,
  frequency: 'monthly' as const,
  payment_terms: 'net_30',
  next_invoice_date: '2026-08-01'
};

const insertedValue = (column: string) => {
  const { sql, params } = db.queries[0];
  return params[insertColumnsOf(sql).indexOf(column)];
};

beforeEach(() => {
  db.reset();
  // Client lookup succeeds by default.
  db.getOne.mockReturnValue({ id: 3 });
});

describe('createRecurringTemplate', () => {
  it('builds a statement SQLite can actually run', async () => {
    await service.createRecurringTemplate(validTemplate);

    expectPreparable(db.queries[0].sql);
  });

  it('writes to the recurring table, not the design table', async () => {
    await service.createRecurringTemplate(validTemplate);

    const sql = flattenSql(db.queries[0].sql);
    expect(sql).toMatch(/INSERT INTO recurring_invoice_templates/);
    expect(sql).not.toMatch(/invoice_design_templates/);
  });

  it('persists every column the billing run reads', async () => {
    await service.createRecurringTemplate(validTemplate);

    const columns = insertColumnsOf(db.queries[0].sql);
    for (const column of [
      'name', 'client_id', 'amount', 'description', 'frequency', 'payment_terms',
      'next_invoice_date', 'is_active', 'line_items', 'tax_amount', 'tax_rate_id',
      'shipping_amount', 'shipping_rate_id', 'notes'
    ]) {
      expect(columns).toContain(column);
    }
  });

  it('never writes a status column', async () => {
    await service.createRecurringTemplate(validTemplate);

    expect(insertColumnsOf(db.queries[0].sql)).not.toContain('status');
  });

  it('binds one parameter per placeholder', async () => {
    await service.createRecurringTemplate(validTemplate);

    const { sql, params } = db.queries[0];
    expect(params).toHaveLength((flattenSql(sql).match(/\?/g) ?? []).length);
  });

  it('starts a new template active', async () => {
    await service.createRecurringTemplate(validTemplate);

    expect(insertedValue('is_active')).toBe(1);
  });

  it('honours an explicitly paused template', async () => {
    await service.createRecurringTemplate({ ...validTemplate, is_active: false });

    expect(insertedValue('is_active')).toBe(0);
  });

  it('defaults tax and shipping to zero rather than null', async () => {
    await service.createRecurringTemplate(validTemplate);

    expect(insertedValue('tax_amount')).toBe(0);
    expect(insertedValue('shipping_amount')).toBe(0);
  });

  it('accepts every supported frequency', async () => {
    for (const frequency of ['weekly', 'monthly', 'quarterly', 'yearly', 'custom'] as const) {
      db.reset();
      db.getOne.mockReturnValue({ id: 3 });
      await service.createRecurringTemplate({ ...validTemplate, frequency });
      expect(insertedValue('frequency')).toBe(frequency);
    }
  });

  it('rejects an unsupported frequency', async () => {
    await expect(
      service.createRecurringTemplate({ ...validTemplate, frequency: 'fortnightly' as never })
    ).rejects.toThrow(/frequency/i);
    expect(db.queries).toHaveLength(0);
  });

  it('rejects a template missing anything the billing run needs', async () => {
    await expect(service.createRecurringTemplate({ ...validTemplate, name: '' })).rejects.toThrow(/name/i);
    await expect(service.createRecurringTemplate({ ...validTemplate, client_id: 0 })).rejects.toThrow(/client/i);
    await expect(service.createRecurringTemplate({ ...validTemplate, amount: 0 })).rejects.toThrow(/amount/i);
    await expect(service.createRecurringTemplate({ ...validTemplate, payment_terms: '' })).rejects.toThrow(/payment terms/i);
    await expect(service.createRecurringTemplate({ ...validTemplate, next_invoice_date: '' })).rejects.toThrow(/date/i);
    expect(db.queries).toHaveLength(0);
  });

  it('rejects a negative amount', async () => {
    await expect(
      service.createRecurringTemplate({ ...validTemplate, amount: -100 })
    ).rejects.toThrow(/amount/i);
  });

  it('refuses a template for a client that does not exist', async () => {
    db.getOne.mockReturnValue(undefined);

    await expect(service.createRecurringTemplate(validTemplate)).rejects.toThrow(/client not found/i);
    expect(db.queries).toHaveLength(0);
  });
});

describe('updateRecurringTemplate', () => {
  it('builds a statement SQLite can actually run', async () => {
    await service.updateRecurringTemplate(1, { name: 'Renamed' });

    expectPreparable(db.queries[0].sql);
  });

  it('updates the recurring table only', async () => {
    await service.updateRecurringTemplate(1, { name: 'Renamed' });

    const sql = flattenSql(db.queries[0].sql);
    expect(sql).toMatch(/UPDATE recurring_invoice_templates/);
    expect(sql).not.toMatch(/invoice_design_templates/);
  });

  it('sets only the fields that were supplied', async () => {
    await service.updateRecurringTemplate(1, { name: 'Renamed' });

    // Built from the dialect rather than a literal: pinning the exact spelling
    // is what let ten uppercase DATETIME('now') sites survive the portability
    // sweep, since a test asserting the SQLite text passes whether or not the
    // statement would run anywhere else.
    expect(flattenSql(db.queries[0].sql)).toBe(
      `UPDATE recurring_invoice_templates SET name = ?, updated_at = ${sqliteDialect.now()} WHERE id = ?`
    );
    expect(db.queries[0].params).toEqual(['Renamed', 1]);
  });

  it('pauses a template without reactivating it', async () => {
    // A phantom `status` field used to overwrite this back to active.
    await service.updateRecurringTemplate(1, { is_active: false });

    expect(db.queries[0].params).toEqual([0, 1]);
  });

  it('resumes a paused template', async () => {
    await service.updateRecurringTemplate(1, { is_active: true });

    expect(db.queries[0].params).toEqual([1, 1]);
  });

  it('keeps the id as the final parameter however many fields change', async () => {
    await service.updateRecurringTemplate(1, {
      name: 'Renamed', amount: 100, frequency: 'weekly', notes: 'x'
    });

    const { params } = db.queries[0];
    expect(params[params.length - 1]).toBe(1);
  });

  it('rejects an update to a template that does not exist', async () => {
    db.getOne.mockReturnValue(undefined);

    await expect(service.updateRecurringTemplate(1, { name: 'x' })).rejects.toThrow(/not found/i);
  });

  it('refuses a move to a client that does not exist', async () => {
    db.getOne.mockImplementation((sql: string) =>
      /FROM clients/.test(sql) ? undefined : { id: 1 }
    );

    await expect(service.updateRecurringTemplate(1, { client_id: 99 })).rejects.toThrow(/client not found/i);
    expect(db.queries).toHaveLength(0);
  });

  it('rejects an empty payload', async () => {
    await expect(service.updateRecurringTemplate(1, {})).rejects.toThrow(/data is required/i);
  });

  it('rejects an invalid id', async () => {
    await expect(service.updateRecurringTemplate(0, { name: 'x' })).rejects.toThrow(/id/i);
  });
});

describe('deleteRecurringTemplate', () => {
  it('refuses to delete a template invoices were generated from', async () => {
    db.getOne.mockReturnValue({ count: 3 });

    await expect(service.deleteRecurringTemplate(1)).rejects.toThrow(/in use/i);
    expect(db.queries).toHaveLength(0);
  });

  it('checks usage against recurring_template_id, not the design column', async () => {
    db.getOne.mockReturnValue({ count: 0 });

    await service.deleteRecurringTemplate(1);

    const usageSql = flattenSql(db.getOne.mock.calls[0][0] as string);
    expect(usageSql).toMatch(/recurring_template_id/);
    expect(usageSql).not.toMatch(/design_template_id/);
  });

  it('deletes from the recurring table only', async () => {
    db.getOne.mockReturnValue({ count: 0 });

    await expect(service.deleteRecurringTemplate(1)).resolves.toBe(true);
    expect(flattenSql(db.queries[0].sql))
      .toBe('DELETE FROM recurring_invoice_templates WHERE id = ?');
  });

  it('rejects an invalid id', async () => {
    await expect(service.deleteRecurringTemplate(0)).rejects.toThrow(/id/i);
  });
});

describe('scheduling', () => {
  it('lists only active templates whose date has arrived', async () => {
    await service.getTemplatesDueForProcessing();

    const sql = flattenSql(db.getMany.mock.calls[0][0] as string);
    expect(sql).toMatch(/FROM recurring_invoice_templates/);
    expect(sql).toMatch(/is_active = 1/);
    expect(sql).toContain(`next_invoice_date <= ${sqliteDialect.today()}`);
  });

  it('toggles activity with a 0/1 flag', async () => {
    await service.toggleRecurringTemplate(1, false);
    expect(db.queries[0].params).toEqual([0, 1]);

    db.reset();
    await service.toggleRecurringTemplate(1, true);
    expect(db.queries[0].params).toEqual([1, 1]);
  });

  it('advances the next invoice date', async () => {
    await service.updateNextInvoiceDate(1, '2026-09-01');

    expect(flattenSql(db.queries[0].sql)).toMatch(/SET next_invoice_date = \?/);
    expect(db.queries[0].params).toEqual(['2026-09-01', 1]);
  });

  it('rejects a blank next date', async () => {
    await expect(service.updateNextInvoiceDate(1, '')).rejects.toThrow(/date/i);
  });

  it('rejects an invalid id', async () => {
    await expect(service.toggleRecurringTemplate(0, true)).rejects.toThrow(/id/i);
    await expect(service.updateNextInvoiceDate(0, '2026-09-01')).rejects.toThrow(/id/i);
    await expect(service.getRecurringTemplateById(0)).rejects.toThrow(/id/i);
    await expect(service.getRecurringTemplatesByClientId(0)).rejects.toThrow(/client id/i);
  });
});

describe('calculateNextInvoiceDate', () => {
  it('advances a week', () => {
    expect(service.calculateNextInvoiceDate('2026-08-01', 'weekly')).toBe('2026-08-08');
  });

  it('advances a month', () => {
    expect(service.calculateNextInvoiceDate('2026-08-01', 'monthly')).toBe('2026-09-01');
  });

  it('advances a quarter', () => {
    expect(service.calculateNextInvoiceDate('2026-08-01', 'quarterly')).toBe('2026-11-01');
  });

  it('advances a year', () => {
    expect(service.calculateNextInvoiceDate('2026-08-01', 'yearly')).toBe('2027-08-01');
  });

  it('rolls a monthly schedule across the year boundary', () => {
    expect(service.calculateNextInvoiceDate('2026-12-01', 'monthly')).toBe('2027-01-01');
  });

  it('keeps the billing day fixed month after month', () => {
    // Reparsing a calendar date through a local timezone drifts it a day, and
    // the drift compounds every cycle until the schedule is weeks out.
    let date = '2026-01-01';
    for (const expected of ['2026-02-01', '2026-03-01', '2026-04-01', '2026-05-01']) {
      date = service.calculateNextInvoiceDate(date, 'monthly');
      expect(date).toBe(expected);
    }
  });

  it('crosses February without losing a day', () => {
    expect(service.calculateNextInvoiceDate('2026-02-01', 'monthly')).toBe('2026-03-01');
    expect(service.calculateNextInvoiceDate('2026-01-15', 'quarterly')).toBe('2026-04-15');
  });

  it('leaves a custom schedule for a human to set', () => {
    expect(service.calculateNextInvoiceDate('2026-08-01', 'custom')).toBe('2026-08-01');
  });

  it('returns a bare calendar date, not a timestamp', () => {
    expect(service.calculateNextInvoiceDate('2026-08-01', 'monthly')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('reads', () => {
  it('joins the client so the list can show who is billed', async () => {
    await service.getAllRecurringTemplates();

    const sql = flattenSql(db.getMany.mock.calls[0][0] as string);
    expect(sql).toMatch(/FROM recurring_invoice_templates/);
    expect(sql).toMatch(/LEFT JOIN clients/);
  });

  it('filters the active list on is_active', async () => {
    await service.getActiveRecurringTemplates();

    expect(flattenSql(db.getMany.mock.calls[0][0] as string)).toMatch(/WHERE rt\.is_active = 1/);
  });

  it('never touches the design-template table', async () => {
    await service.getAllRecurringTemplates();
    await service.getActiveRecurringTemplates();
    await service.getTemplatesDueForProcessing();
    await service.getRecurringTemplatesByClientId(3);

    const allSql = db.getMany.mock.calls.map(call => call[0] as string).join(' ');
    expect(allSql).not.toMatch(/invoice_design_templates/);
  });
});
