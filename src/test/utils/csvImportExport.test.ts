/**
 * CSV import/export tests.
 *
 * This is the one place users hand the app a file they built themselves, so the
 * parser has to survive quoting, blank fields and unfamiliar header spellings.
 * The defaults matter as much as the parsing: a default that isn't a valid
 * value for its column produces rows the API will refuse, one at a time, after
 * the user believes the import worked.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  exportToCSV,
  parseCSV,
  parseClientCSV,
  parseExpenseCSV,
  parsePaymentCSV,
  validateClientImportData,
  validateExpenseImportData,
  validatePaymentImportData
} from '@/utils/data/import-export.util';
import { PAYMENT_STATUSES, PAYMENT_METHODS } from '@/types';

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe('parseCSV', () => {
  it('reads a header row and one record', () => {
    expect(parseCSV('name,email\nAcme,billing@acme.com'))
      .toEqual([{ name: 'Acme', email: 'billing@acme.com' }]);
  });

  it('returns nothing for a header-only file', () => {
    expect(parseCSV('name,email')).toEqual([]);
  });

  it('returns nothing for an empty file', () => {
    expect(parseCSV('')).toEqual([]);
    expect(parseCSV('   ')).toEqual([]);
  });

  it('keeps a quoted comma inside its field', () => {
    // Without this a single address splits a row across two columns.
    const rows = parseCSV('name,address\n"Acme, Inc.","1 High St, London"');

    expect(rows[0].name).toBe('Acme, Inc.');
    expect(rows[0].address).toBe('1 High St, London');
  });

  it('unescapes a doubled quote', () => {
    const rows = parseCSV('name\n"He said ""hello"""');

    expect(rows[0].name).toBe('He said "hello"');
  });

  it('fills a missing trailing field with an empty string', () => {
    const rows = parseCSV('name,email,phone\nAcme,billing@acme.com');

    expect(rows[0].phone).toBe('');
  });

  it('trims surrounding whitespace', () => {
    expect(parseCSV('name , email\n Acme , billing@acme.com ')[0])
      .toEqual({ name: 'Acme', email: 'billing@acme.com' });
  });

  it('reads every record in a multi-row file', () => {
    expect(parseCSV('name\nAcme\nGlobex\nInitech')).toHaveLength(3);
  });
});

describe('parseClientCSV', () => {
  it('reads the canonical headers', () => {
    const [client] = parseClientCSV(
      'name,email,phone,company,address,city,state,zipCode,country\n' +
      'Acme,billing@acme.com,555-0100,Acme Inc,1 High St,London,CA,90210,US'
    );

    expect(client).toMatchObject({
      name: 'Acme', email: 'billing@acme.com', zipCode: '90210', country: 'US'
    });
  });

  it('accepts title-case headers from a spreadsheet export', () => {
    const [client] = parseClientCSV('Name,Email,City\nAcme,billing@acme.com,London');

    expect(client).toMatchObject({ name: 'Acme', email: 'billing@acme.com', city: 'London' });
  });

  it('normalises legacy postal-code headers onto zipCode', () => {
    // `zip` and `Zip Code` are tolerated on the way in; only zipCode is stored.
    expect(parseClientCSV('name,zip\nAcme,90210')[0].zipCode).toBe('90210');
    expect(parseClientCSV('name,Zip Code\nAcme,90210')[0].zipCode).toBe('90210');
  });

  it('leaves absent columns as empty strings, not undefined', () => {
    const [client] = parseClientCSV('name\nAcme');

    expect(client.email).toBe('');
    expect(client.zipCode).toBe('');
  });
});

describe('parseExpenseCSV', () => {
  it('reads the canonical headers', () => {
    const [expense] = parseExpenseCSV(
      'description,amount,category,date,vendor\nPaper,12.50,Office,2026-07-01,Acme Supplies'
    );

    expect(expense).toMatchObject({
      description: 'Paper', amount: 12.5, category: 'Office',
      date: '2026-07-01', vendor: 'Acme Supplies'
    });
  });

  it('normalises the legacy merchant header onto vendor', () => {
    // `merchant` is a tolerated import header; `vendor` is the stored field.
    expect(parseExpenseCSV('description,merchant\nPaper,Acme')[0].vendor).toBe('Acme');
    expect(parseExpenseCSV('description,Merchant\nPaper,Acme')[0].vendor).toBe('Acme');
  });

  it('prefers vendor when a file carries both spellings', () => {
    expect(parseExpenseCSV('vendor,merchant\nReal,Legacy')[0].vendor).toBe('Real');
  });

  it('reads the amount as a number', () => {
    expect(parseExpenseCSV('description,amount\nPaper,12.50')[0].amount).toBe(12.5);
  });

  it('reads a missing amount as zero rather than NaN', () => {
    // NaN would reach the API and be stored as null.
    expect(parseExpenseCSV('description\nPaper')[0].amount).toBe(0);
  });

  it('reads an unparseable amount as NaN so validation can reject it', () => {
    expect(Number.isNaN(parseExpenseCSV('description,amount\nPaper,abc')[0].amount)).toBe(true);
  });
});

describe('parsePaymentCSV', () => {
  it('reads the canonical headers', () => {
    const [payment] = parsePaymentCSV(
      'client_name,amount,method,date,status\nAcme,500,bank_transfer,2026-07-01,received'
    );

    expect(payment).toMatchObject({
      client_name: 'Acme', amount: 500, method: 'bank_transfer',
      date: '2026-07-01', status: 'received'
    });
  });

  it('accepts spaced headers from a spreadsheet export', () => {
    const [payment] = parsePaymentCSV(
      'Client Name,Amount,Reference Number\nAcme,500,REF-1'
    );

    expect(payment).toMatchObject({ client_name: 'Acme', reference_number: 'REF-1' });
  });

  it('defaults the status to one the application actually accepts', () => {
    // A default outside the enum produces rows the API refuses one at a time,
    // after the user believes the import succeeded.
    const [payment] = parsePaymentCSV('client_name,amount\nAcme,500');

    expect(PAYMENT_STATUSES).toContain(payment.status);
  });

  it('defaults the method to one the application actually accepts', () => {
    const [payment] = parsePaymentCSV('client_name,amount\nAcme,500');

    expect(PAYMENT_METHODS).toContain(payment.method);
  });

  it('keeps an explicit status', () => {
    expect(parsePaymentCSV('client_name,status\nAcme,refunded')[0].status).toBe('refunded');
  });
});

describe('import validation', () => {
  it('reports which row failed so the user can find the bad line', () => {
    const results = validateClientImportData([
      { name: 'Acme', email: 'billing@acme.com' } as never,
      { name: '', email: 'nope' } as never
    ]);

    expect(results).toHaveLength(2);
    expect(results[1].index).toBe(1);
    expect(results[1].isValid).toBe(false);
  });

  it('marks a valid client row as valid', () => {
    const [result] = validateClientImportData([
      { name: 'Acme', email: 'billing@acme.com' } as never
    ]);

    expect(result.isValid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('marks a client row with no name as invalid', () => {
    const [result] = validateClientImportData([{ name: '', email: '' } as never]);

    expect(result.isValid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('marks a valid expense row as valid', () => {
    const [result] = validateExpenseImportData([
      { description: 'Paper', amount: 12.5, category: 'Office', date: '2026-07-01' } as never
    ]);

    expect(result.isValid).toBe(true);
  });

  it('marks an expense with no amount as invalid', () => {
    const [result] = validateExpenseImportData([
      { description: 'Paper', amount: 0, category: 'Office', date: '2026-07-01' } as never
    ]);

    expect(result.isValid).toBe(false);
  });

  it('marks a valid payment row as valid', () => {
    const [result] = validatePaymentImportData([
      { client_name: 'Acme', amount: 500, method: 'cash', date: '2026-07-01', status: 'received' } as never
    ]);

    expect(result.isValid).toBe(true);
  });

  it('validates a whole file rather than stopping at the first bad row', () => {
    const results = validatePaymentImportData([
      { client_name: 'Acme', amount: 500, method: 'cash', date: '2026-07-01', status: 'received' } as never,
      { client_name: '', amount: -1, method: 'cash', date: '', status: 'received' } as never,
      { client_name: 'Globex', amount: 250, method: 'cash', date: '2026-07-02', status: 'received' } as never
    ]);

    expect(results).toHaveLength(3);
    expect(results.filter(r => r.isValid)).toHaveLength(2);
  });

  it('accepts an empty file without error', () => {
    expect(validateClientImportData([])).toEqual([]);
    expect(validateExpenseImportData([])).toEqual([]);
    expect(validatePaymentImportData([])).toEqual([]);
  });

  it('validates what the parser produced, end to end', () => {
    const parsed = parsePaymentCSV('client_name,amount,date\nAcme,500,2026-07-01');

    const [result] = validatePaymentImportData(parsed);

    expect(result.isValid).toBe(true);
  });
});

describe('exportToCSV', () => {
  let createObjectURL: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    createObjectURL = vi.fn(() => 'blob:mock-url');
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() }));
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  it('writes nothing for an empty data set', () => {
    exportToCSV([], 'empty.csv');

    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('offers a download named as requested', () => {
    const links: HTMLAnchorElement[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) { links.push(this); });

    exportToCSV([{ name: 'Acme', email: 'billing@acme.com' }], 'clients.csv');

    expect(links[0].getAttribute('download')).toBe('clients.csv');
  });

  it('removes the temporary link afterwards', () => {
    exportToCSV([{ name: 'Acme' }], 'clients.csv');

    expect(document.querySelectorAll('a[download]')).toHaveLength(0);
  });

  it('round-trips a value containing a comma', async () => {
    // Export then re-import is the workflow users actually perform.
    const blobs: Blob[] = [];
    vi.stubGlobal('URL', Object.assign(URL, {
      createObjectURL: vi.fn((blob: Blob) => { blobs.push(blob); return 'blob:x'; }),
      revokeObjectURL: vi.fn()
    }));

    exportToCSV([{ name: 'Acme, Inc.', city: 'London' }], 'clients.csv');
    const text = await blobs[0].text();

    expect(parseCSV(text)[0]).toEqual({ name: 'Acme, Inc.', city: 'London' });
  });

  it('round-trips a value containing a quote', async () => {
    const blobs: Blob[] = [];
    vi.stubGlobal('URL', Object.assign(URL, {
      createObjectURL: vi.fn((blob: Blob) => { blobs.push(blob); return 'blob:x'; }),
      revokeObjectURL: vi.fn()
    }));

    exportToCSV([{ name: 'He said "hello"' }], 'x.csv');
    const text = await blobs[0].text();

    expect(parseCSV(text)[0].name).toBe('He said "hello"');
  });

  it('writes a header row taken from the first record', async () => {
    const blobs: Blob[] = [];
    vi.stubGlobal('URL', Object.assign(URL, {
      createObjectURL: vi.fn((blob: Blob) => { blobs.push(blob); return 'blob:x'; }),
      revokeObjectURL: vi.fn()
    }));

    exportToCSV([{ name: 'Acme', email: 'a@b.co' }], 'x.csv');
    const text = await blobs[0].text();

    expect(text.split('\n')[0]).toBe('name,email');
  });
});
