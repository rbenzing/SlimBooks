/**
 * Invoice business-rule tests.
 *
 * These drive real behaviour: the permission matrix decides which buttons the
 * invoice editor renders, and `calculateInvoiceTotal` is the money maths behind
 * every invoice total.
 */

import { describe, it, expect } from 'vitest';
import {
  getInvoiceStatusPermissions,
  getInvoiceStatusColor,
  generateInvoiceNumberPattern,
  parseInvoiceNumber,
  getNextInvoiceNumber,
  calculateInvoiceTotal
} from '@/utils/business/invoice.util';
import { type InvoiceStatus } from '@/types';

describe('getInvoiceStatusPermissions', () => {
  it('locks a paid invoice completely', () => {
    // Money has changed hands: editing or deleting would rewrite history.
    expect(getInvoiceStatusPermissions('paid')).toEqual({
      canEdit: false,
      canSave: false,
      canSend: false,
      canDelete: false,
      showDeleteOnly: false
    });
  });

  it('allows editing a sent invoice but not re-sending it', () => {
    const permissions = getInvoiceStatusPermissions('sent');
    expect(permissions.canEdit).toBe(true);
    expect(permissions.canSave).toBe(true);
    expect(permissions.canSend).toBe(false);
    expect(permissions.canDelete).toBe(true);
  });

  it('allows an overdue invoice to be re-sent as a chase', () => {
    expect(getInvoiceStatusPermissions('overdue').canSend).toBe(true);
  });

  it('gives a draft full permissions', () => {
    expect(getInvoiceStatusPermissions('draft')).toEqual({
      canEdit: true,
      canSave: true,
      canSend: true,
      canDelete: true,
      showDeleteOnly: false
    });
  });

  it('defaults to draft permissions for an unknown or missing status', () => {
    const draft = getInvoiceStatusPermissions('draft');
    expect(getInvoiceStatusPermissions(undefined)).toEqual(draft);
    expect(getInvoiceStatusPermissions('cancelled' as InvoiceStatus)).toEqual(draft);
  });

  it('never marks an invoice delete-only', () => {
    const statuses: InvoiceStatus[] = ['draft', 'sent', 'paid', 'overdue', 'cancelled', 'refunded'];
    for (const status of statuses) {
      expect(getInvoiceStatusPermissions(status).showDeleteOnly).toBe(false);
    }
  });

  it('only ever allows saving when editing is allowed', () => {
    const statuses: InvoiceStatus[] = ['draft', 'sent', 'paid', 'overdue', 'cancelled', 'refunded'];
    for (const status of statuses) {
      const { canEdit, canSave } = getInvoiceStatusPermissions(status);
      if (canSave) expect(canEdit).toBe(true);
    }
  });
});

describe('getInvoiceStatusColor', () => {
  it('gives each status a colour', () => {
    const statuses: InvoiceStatus[] = ['draft', 'sent', 'paid', 'overdue', 'cancelled', 'refunded'];
    for (const status of statuses) {
      expect(typeof getInvoiceStatusColor(status)).toBe('string');
      expect(getInvoiceStatusColor(status).length).toBeGreaterThan(0);
    }
  });

  it('distinguishes paid from overdue', () => {
    expect(getInvoiceStatusColor('paid')).not.toBe(getInvoiceStatusColor('overdue'));
  });
});

describe('generateInvoiceNumberPattern', () => {
  it('pads the sequence to the requested width', () => {
    expect(generateInvoiceNumberPattern('INV', 2026, 7, 4)).toBe('INV-2026-0007');
  });

  it('defaults to INV, the current year and sequence 1', () => {
    const year = new Date().getFullYear();
    expect(generateInvoiceNumberPattern()).toBe(`INV-${year}-0001`);
  });

  it('does not truncate a sequence longer than the padding', () => {
    expect(generateInvoiceNumberPattern('INV', 2026, 123456, 4)).toBe('INV-2026-123456');
  });

  it('honours a custom prefix', () => {
    expect(generateInvoiceNumberPattern('ACME', 2026, 1)).toBe('ACME-2026-0001');
  });
});

describe('parseInvoiceNumber', () => {
  it('splits a well-formed number into its parts', () => {
    expect(parseInvoiceNumber('INV-2026-0042')).toEqual({
      prefix: 'INV',
      year: 2026,
      sequence: 42
    });
  });

  it('returns an empty object for a number it cannot parse', () => {
    for (const value of ['', 'INV-26-1', '2026-0001', 'INV/2026/0001', 'not-a-number']) {
      expect(parseInvoiceNumber(value)).toEqual({});
    }
  });

  it('round-trips with generateInvoiceNumberPattern', () => {
    const generated = generateInvoiceNumberPattern('ACME', 2026, 42);
    expect(parseInvoiceNumber(generated)).toEqual({ prefix: 'ACME', year: 2026, sequence: 42 });
  });
});

describe('getNextInvoiceNumber', () => {
  const year = new Date().getFullYear();

  it('increments the sequence within the current year', () => {
    expect(getNextInvoiceNumber(`INV-${year}-0007`)).toBe(`INV-${year}-0008`);
  });

  it('restarts at 1 when the last number is from a previous year', () => {
    expect(getNextInvoiceNumber(`INV-${year - 1}-0099`)).toBe(`INV-${year}-0001`);
  });

  it('restarts at 1 when the last number is unparseable', () => {
    expect(getNextInvoiceNumber('garbage')).toBe(`INV-${year}-0001`);
  });

  it('applies the requested prefix to the new number', () => {
    expect(getNextInvoiceNumber(`INV-${year}-0007`, 'ACME')).toBe(`ACME-${year}-0008`);
  });
});

describe('calculateInvoiceTotal', () => {
  const items = [
    { quantity: 2, unit_price: 100 },
    { quantity: 1, unit_price: 50 }
  ];

  it('sums line items into a subtotal', () => {
    expect(calculateInvoiceTotal(items).subtotal).toBe(250);
  });

  it('applies tax as a percentage of the subtotal', () => {
    const { taxAmount, total } = calculateInvoiceTotal(items, 10);
    expect(taxAmount).toBe(25);
    expect(total).toBe(275);
  });

  it('adds shipping after tax', () => {
    const { total } = calculateInvoiceTotal(items, 10, 15);
    expect(total).toBe(290);
  });

  it('does not tax the shipping amount', () => {
    const withShipping = calculateInvoiceTotal(items, 10, 100);
    const withoutShipping = calculateInvoiceTotal(items, 10, 0);
    expect(withShipping.taxAmount).toBe(withoutShipping.taxAmount);
  });

  it('returns zeroes for an empty invoice', () => {
    expect(calculateInvoiceTotal([])).toEqual({ subtotal: 0, taxAmount: 0, total: 0 });
  });

  it('handles fractional quantities and prices', () => {
    const { subtotal } = calculateInvoiceTotal([{ quantity: 1.5, unit_price: 10.5 }]);
    expect(subtotal).toBeCloseTo(15.75, 10);
  });

  it('supports a credit note via a negative line', () => {
    const { subtotal } = calculateInvoiceTotal([
      { quantity: 1, unit_price: 100 },
      { quantity: 1, unit_price: -30 }
    ]);
    expect(subtotal).toBe(70);
  });

  it('treats a zero tax rate as no tax', () => {
    expect(calculateInvoiceTotal(items, 0).taxAmount).toBe(0);
  });
});
