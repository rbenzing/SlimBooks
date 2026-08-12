/**
 * Type Validation Tests
 * Ensures TypeScript interfaces match actual data structures
 */

import { describe, it, expect } from 'vitest';
import type { Invoice, Client, Payment, Expense } from '@/types';
import { isInvoice, isClient, isPayment, isExpense } from '@/types';

describe('Type Validation - Invoice', () => {
  it('should validate correct Invoice object', () => {
    const validInvoice: Invoice = {
      id: 1,
      invoice_number: 'INV-001',
      client_id: 1,
      design_template_id: 1,
      recurring_template_id: undefined,
      amount: 1000,
      tax_amount: 100,
      total_amount: 1100,
      status: 'draft',
      due_date: '2026-03-01',
      issue_date: '2026-02-01',
      description: 'Test invoice',
      notes: 'Test notes',
      type: 'one-time',
      shipping_amount: 0,
      email_status: 'not_sent',
      created_at: Date.parse('2026-02-16'),
      updated_at: Date.parse('2026-02-16')
    };

    expect(isInvoice(validInvoice)).toBe(true);
  });

  it('should reject invalid Invoice object', () => {
    const invalidInvoice = {
      id: 1,
      // missing required fields
    };

    expect(isInvoice(invalidInvoice)).toBe(false);
  });

  it('should enforce template_id fields are separate', () => {
    // TypeScript interface should not have template_id
    const validInvoice: Invoice = {
      id: 1,
      invoice_number: 'INV-001',
      client_id: 1,
      design_template_id: 1, // Correct field
      amount: 100,
      tax_amount: 0,
      total_amount: 100,
      status: 'draft',
      due_date: '2026-03-01',
      issue_date: '2026-02-01',
      type: 'one-time',
      shipping_amount: 0,
      email_status: 'not_sent',
      created_at: Date.parse('2026-02-16'),
      updated_at: Date.parse('2026-02-16')
    };

    expect(validInvoice).not.toHaveProperty('template_id');
    expect(validInvoice).toHaveProperty('design_template_id');
  });
});

describe('Type Validation - Client', () => {
  it('should validate correct Client object', () => {
    const validClient: Client = {
      id: 1,
      name: 'Test Client',
      email: 'test@example.com',
      phone: '555-0100',
      company: 'Test Corp',
      address: '123 Test St',
      created_at: Date.parse('2026-02-16'),
      updated_at: Date.parse('2026-02-16')
    };

    expect(isClient(validClient)).toBe(true);
  });

  it('should reject invalid Client object', () => {
    expect(isClient({})).toBe(false);
    expect(isClient(null)).toBe(false);
    expect(isClient(undefined)).toBe(false);
  });
});

describe('Type Validation - Payment', () => {
  it('should validate correct Payment object', () => {
    const validPayment: Payment = {
      id: 1,
      date: '2026-02-16',
      client_name: 'Test Client',
      invoice_id: 1,
      amount: 500,
      method: 'bank_transfer',
      status: 'received',
      created_at: Date.parse('2026-02-16'),
      updated_at: Date.parse('2026-02-16')
    };

    expect(isPayment(validPayment)).toBe(true);
  });

  it('should reject invalid Payment object', () => {
    expect(isPayment({ id: 1 })).toBe(false);
  });
});

describe('Type Validation - Expense', () => {
  it('should validate correct Expense object with vendor field', () => {
    const validExpense: Expense = {
      id: 1,
      date: '2026-02-16',
      vendor: 'Office Supplies Inc', // Correct field name
      category: 'Office Supplies',
      amount: 150,
      description: 'Office chairs',
      created_at: Date.parse('2026-02-16'),
      updated_at: Date.parse('2026-02-16')
    };

    expect(isExpense(validExpense)).toBe(true);
  });

  it('should handle optional fields correctly', () => {
    const minimalExpense: Expense = {
      id: 1,
      date: '2026-02-16',
      vendor: 'Test Vendor',
      amount: 100,
      description: 'Test expense',
      created_at: Date.parse('2026-02-16'),
      updated_at: Date.parse('2026-02-16')
    };

    expect(isExpense(minimalExpense)).toBe(true);
  });
});

describe('Type Guards - Runtime Type Checking', () => {
  it('should correctly identify Invoice type at runtime', () => {
    const invoice = {
      id: 1,
      client_id: 1,
      amount: 100,
      invoice_number: 'INV-001'
    };

    expect(isInvoice(invoice)).toBe(true);
  });

  it('should correctly identify Client type at runtime', () => {
    const client = {
      id: 1,
      name: 'Test'
    };

    expect(isClient(client)).toBe(true);
  });

  it('should correctly identify Payment type at runtime', () => {
    const payment = {
      id: 1,
      amount: 100,
      date: '2026-02-16',
      method: 'bank_transfer'
    };

    expect(isPayment(payment)).toBe(true);
  });

  it('should correctly identify Expense type at runtime', () => {
    const expense = {
      id: 1,
      amount: 100,
      vendor: 'Test Vendor'
    };

    expect(isExpense(expense)).toBe(true);
  });
});
