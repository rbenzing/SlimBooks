/**
 * Save/send validation tests.
 *
 * These gate the invoice editor's Save and Send buttons and the import paths
 * for clients, expenses and payments. A false positive here lets a malformed
 * invoice reach the API; a false negative locks the user out of saving.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  validateInvoiceForSave,
  validateInvoiceForSend,
  validateClientData,
  validateExpenseData,
  validatePaymentData,
  getAvailableInvoiceActions,
  autoFillInvoiceDefaults
} from '@/utils/data/validation.util';
import type { Client, InvoiceItem } from '@/types';

const client: Client = {
  id: 1,
  name: 'Acme Corporation',
  email: 'contact@acme.com',
  created_at: '2026-07-01',
  updated_at: '2026-07-01'
};

const invoiceData = { invoice_number: 'INV-001', due_date: '2026-08-01', status: 'draft' as const };

const lineItems: InvoiceItem[] = [
  { id: 1, description: 'Consulting', quantity: 10, unit_price: 150, total: 1500 }
];

describe('validateInvoiceForSave', () => {
  it('accepts a complete invoice', () => {
    const result = validateInvoiceForSave(invoiceData, client, lineItems);
    expect(result.isValid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('requires a client', () => {
    const result = validateInvoiceForSave(invoiceData, null, lineItems);
    expect(result.isValid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/client/i);
  });

  it('requires an invoice number when editing an existing invoice', () => {
    const result = validateInvoiceForSave({ ...invoiceData, invoice_number: '' }, client, lineItems);
    expect(result.isValid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/invoice number/i);
  });

  it('does not require an invoice number for a new invoice', () => {
    // New invoices get their number assigned on save.
    const result = validateInvoiceForSave({ ...invoiceData, invoice_number: '' }, client, lineItems, true);
    expect(result.errors.join(' ')).not.toMatch(/invoice number/i);
  });

  it('requires at least one priced line item', () => {
    const blank: InvoiceItem[] = [{ id: 1, description: '', quantity: 1, unit_price: 0, total: 0 }];
    const result = validateInvoiceForSave(invoiceData, client, blank);
    expect(result.isValid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/line item/i);
  });

  it('rejects a zero total even when a description is present', () => {
    const freebie: InvoiceItem[] = [{ id: 1, description: 'Free sample', quantity: 1, unit_price: 0, total: 0 }];
    const result = validateInvoiceForSave(invoiceData, client, freebie);
    expect(result.isValid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/greater than zero/i);
  });

  it('warns about incomplete rows without blocking the save', () => {
    const mixed: InvoiceItem[] = [
      ...lineItems,
      { id: 2, description: '', quantity: 1, unit_price: 0, total: 0 }
    ];
    const result = validateInvoiceForSave(invoiceData, client, mixed);
    expect(result.isValid).toBe(true);
    expect(result.warnings.join(' ')).toMatch(/1 line item/);
  });

  it('reports every problem at once rather than stopping at the first', () => {
    const result = validateInvoiceForSave({ ...invoiceData, invoice_number: '' }, null, []);
    expect(result.errors.length).toBeGreaterThan(2);
  });
});

describe('validateInvoiceForSend', () => {
  it('allows sending a complete invoice to a client with an email', () => {
    const result = validateInvoiceForSend(invoiceData, client, lineItems);
    expect(result.canSend).toBe(true);
  });

  it('refuses to send without a client email', () => {
    const result = validateInvoiceForSend(invoiceData, { ...client, email: '' }, lineItems);
    expect(result.canSend).toBe(false);
    expect(result.errors.join(' ')).toMatch(/email/i);
  });

  it('refuses to send anything that cannot be saved', () => {
    const result = validateInvoiceForSend(invoiceData, null, lineItems);
    expect(result.canSend).toBe(false);
  });

  it('warns, but still sends, when the due date is blank', () => {
    const result = validateInvoiceForSend({ ...invoiceData, due_date: '' }, client, lineItems);
    expect(result.canSend).toBe(true);
    expect(result.warnings.join(' ')).toMatch(/due date/i);
  });
});

describe('validateClientData', () => {
  it('accepts a client with a name and valid email', () => {
    expect(validateClientData({ name: 'Acme', email: 'a@b.com' }).isValid).toBe(true);
  });

  it('requires a name', () => {
    for (const name of ['', '   ', undefined]) {
      expect(validateClientData({ name, email: 'a@b.com' }).isValid).toBe(false);
    }
  });

  it('rejects a malformed email', () => {
    for (const email of ['not-an-email', 'a@b', 'a b@c.com', '@nodomain.com']) {
      const result = validateClientData({ name: 'Acme', email });
      expect(result.isValid).toBe(false);
      expect(result.errors.join(' ')).toMatch(/email/i);
    }
  });

  it('warns when no email is supplied but still validates', () => {
    const result = validateClientData({ name: 'Acme' });
    expect(result.isValid).toBe(true);
    expect(result.warnings.join(' ')).toMatch(/email/i);
  });
});

describe('validateExpenseData', () => {
  const expense = { description: 'Printer paper', amount: 125.5, date: '2026-07-01', category: 'Office' };

  it('accepts a complete expense', () => {
    expect(validateExpenseData(expense).isValid).toBe(true);
  });

  it('requires a description, a positive amount and a date', () => {
    expect(validateExpenseData({ ...expense, description: '' }).isValid).toBe(false);
    expect(validateExpenseData({ ...expense, amount: 0 }).isValid).toBe(false);
    expect(validateExpenseData({ ...expense, amount: -5 }).isValid).toBe(false);
    expect(validateExpenseData({ ...expense, date: '' }).isValid).toBe(false);
  });

  it('warns about a missing category without blocking', () => {
    const result = validateExpenseData({ ...expense, category: '' });
    expect(result.isValid).toBe(true);
    expect(result.warnings.join(' ')).toMatch(/category/i);
  });
});

describe('validatePaymentData', () => {
  const payment = { amount: 250, date: '2026-07-01', method: 'bank_transfer' };

  it('accepts a complete payment', () => {
    expect(validatePaymentData(payment).isValid).toBe(true);
  });

  it('requires a positive amount, a date and a method', () => {
    expect(validatePaymentData({ ...payment, amount: 0 }).isValid).toBe(false);
    expect(validatePaymentData({ ...payment, date: '' }).isValid).toBe(false);
    expect(validatePaymentData({ ...payment, method: '' }).isValid).toBe(false);
  });
});

describe('getAvailableInvoiceActions', () => {
  it('enables save, send and print for a complete existing invoice', () => {
    const actions = getAvailableInvoiceActions(invoiceData, client, lineItems);
    expect(actions).toMatchObject({ canSave: true, canSend: true, canPrint: true });
  });

  it('never offers print for an invoice that has not been created yet', () => {
    expect(getAvailableInvoiceActions(invoiceData, client, lineItems, true).canPrint).toBe(false);
  });

  it('disables everything when the invoice is incomplete', () => {
    const actions = getAvailableInvoiceActions(invoiceData, null, []);
    expect(actions.canSave).toBe(false);
    expect(actions.canSend).toBe(false);
    expect(actions.canPrint).toBe(false);
  });

  it('surfaces the send-specific error when only the email is missing', () => {
    const actions = getAvailableInvoiceActions(invoiceData, { ...client, email: '' }, lineItems);
    expect(actions.canSave).toBe(true);
    expect(actions.canSend).toBe(false);
    expect(actions.sendErrors.join(' ')).toMatch(/email/i);
  });
});

describe('autoFillInvoiceDefaults', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-15T12:00:00Z'));
  });

  afterEach(() => vi.useRealTimers());

  it('fills a blank due date with today', () => {
    expect(autoFillInvoiceDefaults({ ...invoiceData, due_date: '' }).due_date).toBe('2026-07-15');
  });

  it('leaves an existing due date alone', () => {
    expect(autoFillInvoiceDefaults(invoiceData).due_date).toBe('2026-08-01');
  });

  it('does not mutate its argument', () => {
    const original = { ...invoiceData, due_date: '' };
    autoFillInvoiceDefaults(original);
    expect(original.due_date).toBe('');
  });
});
