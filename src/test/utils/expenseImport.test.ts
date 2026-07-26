/**
 * Expense CSV import tests.
 *
 * The expenses table stores the payee in a `vendor` column. The frontend used
 * to carry a parallel `merchant` name, so parsed rows never satisfied the
 * declared shape and anything reading `.merchant` downstream got undefined.
 * The frontend is now single-named on `vendor`; `merchant` survives only as a
 * tolerated CSV *header* so existing users' files still import.
 */

import { describe, it, expect } from 'vitest';
import { parseExpenseCSV } from '@/utils/data';

const csv = [
  'date,vendor,category,amount,description,notes',
  '2026-07-01,Acme Supplies,Office,125.50,Printer paper,Quarterly restock',
  '2026-07-02,Cloud Host,Software,40,Hosting,'
].join('\n');

describe('parseExpenseCSV', () => {
  it('maps the payee column onto vendor', () => {
    const [first] = parseExpenseCSV(csv);
    expect(first.vendor).toBe('Acme Supplies');
  });

  it('accepts a capitalised Vendor header', () => {
    const [first] = parseExpenseCSV('Date,Vendor,Amount\n2026-07-01,Acme Supplies,125.50');
    expect(first.vendor).toBe('Acme Supplies');
  });

  it('parses amounts as numbers', () => {
    const rows = parseExpenseCSV(csv);
    expect(rows[0].amount).toBe(125.5);
    expect(rows[1].amount).toBe(40);
  });

  it('carries the remaining fields through', () => {
    const [first] = parseExpenseCSV(csv);
    expect(first.date).toBe('2026-07-01');
    expect(first.category).toBe('Office');
    expect(first.description).toBe('Printer paper');
  });

  describe('legacy merchant header tolerance', () => {
    it('maps a lowercase merchant column onto vendor', () => {
      const [first] = parseExpenseCSV(
        'date,merchant,category,amount\n2026-07-01,Acme Supplies,Office,125.50'
      );
      expect(first.vendor).toBe('Acme Supplies');
    });

    it('maps a capitalised Merchant column onto vendor', () => {
      const [first] = parseExpenseCSV(
        'Date,Merchant,Category,Amount\n2026-07-01,Acme Supplies,Office,125.50'
      );
      expect(first.vendor).toBe('Acme Supplies');
    });

    it('does not expose a merchant field on the parsed row', () => {
      const [first] = parseExpenseCSV(
        'date,merchant,amount\n2026-07-01,Acme Supplies,125.50'
      );
      expect(first).not.toHaveProperty('merchant');
    });

    it('prefers vendor when both headers are present', () => {
      const [first] = parseExpenseCSV(
        'date,vendor,merchant,amount\n2026-07-01,Real Vendor,Legacy Merchant,125.50'
      );
      expect(first.vendor).toBe('Real Vendor');
    });
  });
});
