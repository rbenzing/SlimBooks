/**
 * InvoiceNumberService tests.
 *
 * Invoice numbers are what a client quotes back when they pay, so two invoices
 * must never share one. The counter increment and the preview path read the
 * same row but only one of them writes — that asymmetry is the thing to pin.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createDatabaseMock, flattenSql } from './databaseMock.test-helper.js';

const db = createDatabaseMock();
vi.mock('../core/DatabaseService.js', () => ({ databaseService: db }));

const { invoiceNumberService } = await import('./InvoiceNumberService.js');

/** The yyyyMM segment the formatter stamps in. */
const currentPeriod = () => {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
};

/** Serves the settings row and/or the counter row. */
const seed = ({ prefix, counter }: { prefix?: string; counter?: number }) => {
  db.getOne.mockImplementation((sql: string) => {
    if (/FROM settings/.test(sql)) {
      return prefix === undefined ? undefined : { value: JSON.stringify({ prefix }) };
    }
    if (/FROM counters/.test(sql)) {
      return counter === undefined ? undefined : { value: counter };
    }
    return undefined;
  });
};

beforeEach(() => db.reset());

describe('generateInvoiceNumber', () => {
  it('formats as PREFIX-YYYYMM-NNNN', async () => {
    seed({ prefix: 'INV', counter: 41 });

    await expect(invoiceNumberService.generateInvoiceNumber())
      .resolves.toBe(`INV-${currentPeriod()}-0042`);
  });

  it('pads the sequence to four digits', async () => {
    seed({ prefix: 'INV', counter: 0 });

    await expect(invoiceNumberService.generateInvoiceNumber())
      .resolves.toMatch(/-0001$/);
  });

  it('does not truncate a sequence past four digits', async () => {
    seed({ prefix: 'INV', counter: 99999 });

    await expect(invoiceNumberService.generateInvoiceNumber())
      .resolves.toMatch(/-100000$/);
  });

  it('honours a configured prefix', async () => {
    seed({ prefix: 'SB', counter: 0 });

    await expect(invoiceNumberService.generateInvoiceNumber()).resolves.toMatch(/^SB-/);
  });

  it('falls back to INV when nothing is configured', async () => {
    seed({ counter: 0 });

    await expect(invoiceNumberService.generateInvoiceNumber()).resolves.toMatch(/^INV-/);
  });

  it('falls back to INV when the stored settings are corrupt', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    db.getOne.mockImplementation((sql: string) =>
      /FROM settings/.test(sql) ? { value: 'not json' } : { value: 0 }
    );

    await expect(invoiceNumberService.generateInvoiceNumber()).resolves.toMatch(/^INV-/);
  });

  it('advances the counter so the next call differs', async () => {
    seed({ prefix: 'INV', counter: 41 });

    await invoiceNumberService.generateInvoiceNumber();

    const update = db.queries.find(q => /UPDATE counters/i.test(q.sql));
    expect(update?.params).toEqual([42, 'invoice_counter']);
  });

  it('creates the counter on a database that has never issued one', async () => {
    seed({ prefix: 'INV' });

    await expect(invoiceNumberService.generateInvoiceNumber()).resolves.toMatch(/-0001$/);

    const insert = db.queries.find(q => /INSERT INTO counters/i.test(q.sql));
    expect(insert?.params).toEqual(['invoice_counter', 1]);
  });

  it('issues a distinct number each time the counter moves', async () => {
    const issued = new Set<string>();
    for (const counter of [0, 1, 2, 3]) {
      db.reset();
      seed({ prefix: 'INV', counter });
      issued.add(await invoiceNumberService.generateInvoiceNumber());
    }

    expect(issued.size).toBe(4);
  });

  it('reports a failure rather than returning an unusable number', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    db.getOne.mockImplementation(() => { throw new Error('counters table missing'); });

    await expect(invoiceNumberService.generateInvoiceNumber())
      .rejects.toThrow(/failed to generate invoice number/i);
  });
});

describe('getNextInvoiceNumber (preview)', () => {
  it('shows the number that would be issued next', async () => {
    seed({ prefix: 'INV', counter: 41 });

    await expect(invoiceNumberService.getNextInvoiceNumber())
      .resolves.toBe(`INV-${currentPeriod()}-0042`);
  });

  it('does not consume the number it previews', async () => {
    // A preview that increments would burn a number every time a form opened.
    seed({ prefix: 'INV', counter: 41 });

    await invoiceNumberService.getNextInvoiceNumber();

    expect(db.queries).toHaveLength(0);
  });

  it('agrees with what generate would actually issue', async () => {
    seed({ prefix: 'INV', counter: 41 });
    const preview = await invoiceNumberService.getNextInvoiceNumber();

    db.reset();
    seed({ prefix: 'INV', counter: 41 });
    const issued = await invoiceNumberService.generateInvoiceNumber();

    expect(preview).toBe(issued);
  });

  it('previews the first number on an empty database', async () => {
    seed({ prefix: 'INV' });

    await expect(invoiceNumberService.getNextInvoiceNumber()).resolves.toMatch(/-0001$/);
    expect(db.queries).toHaveLength(0);
  });

  it('reports a failure rather than a misleading preview', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    db.getOne.mockImplementation((sql: string) => {
      if (/FROM counters/.test(sql)) throw new Error('counters table missing');
      return undefined;
    });

    await expect(invoiceNumberService.getNextInvoiceNumber())
      .rejects.toThrow(/failed to get next invoice number/i);
  });
});

describe('isInvoiceNumberUnique', () => {
  it('accepts a number no invoice uses', async () => {
    db.getOne.mockReturnValue(undefined);

    await expect(invoiceNumberService.isInvoiceNumberUnique('INV-202607-0001')).resolves.toBe(true);
    expect(flattenSql(db.getOne.mock.calls[0][0] as string))
      .toBe('SELECT id FROM invoices WHERE invoice_number = ?');
  });

  it('rejects a number already in use', async () => {
    db.getOne.mockReturnValue({ id: 5 });

    await expect(invoiceNumberService.isInvoiceNumberUnique('INV-202607-0001')).resolves.toBe(false);
  });

  it('refuses to claim uniqueness it could not verify', async () => {
    // Answering true on a failed lookup would let a duplicate through.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    db.getOne.mockImplementation(() => { throw new Error('database locked'); });

    await expect(invoiceNumberService.isInvoiceNumberUnique('INV-202607-0001')).resolves.toBe(false);
  });
});

describe('settings lookup', () => {
  it('reads the prefix from the general settings namespace', async () => {
    seed({ prefix: 'INV', counter: 0 });

    await invoiceNumberService.generateInvoiceNumber();

    const settingsCall = db.getOne.mock.calls.find(call => /FROM settings/.test(call[0] as string));
    expect(settingsCall?.[1]).toEqual(['invoice_number_settings', 'general']);
  });

  it('reads the counter by its own name', async () => {
    seed({ prefix: 'INV', counter: 0 });

    await invoiceNumberService.generateInvoiceNumber();

    const counterCall = db.getOne.mock.calls.find(call => /FROM counters/.test(call[0] as string));
    expect(counterCall?.[1]).toEqual(['invoice_counter']);
  });
});
