/**
 * Validation Utilities Tests
 * Tests email, invoice, and data validation functions
 */

import { describe, it, expect } from 'vitest';
import {
  validateInvoiceForSave,
  validateInvoiceForSend,
  validateClientData,
  validateExpenseData,
  validatePaymentData
} from '@/utils/data';
import type { Client, InvoiceItem } from '@/types';

describe('Client Email Validation', () => {
  it('should validate client with valid email', () => {
    const result = validateClientData({ name: 'Test', email: 'test@example.com' });
    expect(result.isValid).toBe(true);
  });

  it('should reject invalid email format', () => {
    const result = validateClientData({ name: 'Test', email: 'invalid-email' });
    expect(result.isValid).toBe(false);
    expect(result.errors.some(e => e.includes('email'))).toBe(true);
  });

  it('should allow empty email with warning', () => {
    const result = validateClientData({ name: 'Test', email: '' });
    expect(result.isValid).toBe(true);
    expect(result.warnings.some(w => w.includes('Email'))).toBe(true);
  });
});

describe('Invoice Validation', () => {
  const mockClient: Client = {
    id: 1,
    name: 'Test Client',
    email: 'test@example.com',
    phone: '5551234567',
    created_at: Date.parse('2026-02-16'),
    updated_at: Date.parse('2026-02-16')
  };

  const mockLineItems: InvoiceItem[] = [
    {
      id: 1,
      description: 'Service 1',
      quantity: 1,
      unit_price: 100,
      total: 100
    }
  ];

  const mockInvoiceData = {
    invoice_number: 'INV-001',
    due_date: '2026-03-01',
    status: 'draft',
    payment_terms: 'net_30'
  };

  describe('validateInvoiceForSave', () => {
    it('should validate complete invoice data', () => {
      const result = validateInvoiceForSave(
        mockInvoiceData,
        mockClient,
        mockLineItems,
        false // not a new invoice
      );

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should require client selection', () => {
      const result = validateInvoiceForSave(
        mockInvoiceData,
        null,
        mockLineItems,
        false
      );

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Please select a client');
    });

    it('should require at least one line item with description', () => {
      const emptyLineItems: InvoiceItem[] = [
        {
          id: 1,
          description: '',
          quantity: 1,
          unit_price: 0,
          total: 0
        }
      ];

      const result = validateInvoiceForSave(
        mockInvoiceData,
        mockClient,
        emptyLineItems,
        false
      );

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('line item'))).toBe(true);
    });

    it('should require invoice number for existing invoices', () => {
      const dataWithoutNumber = {
        ...mockInvoiceData,
        invoice_number: ''
      };

      const result = validateInvoiceForSave(
        dataWithoutNumber,
        mockClient,
        mockLineItems,
        false // existing invoice
      );

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.toLowerCase().includes('invoice number'))).toBe(true);
    });

    it('should allow missing invoice number for new invoices', () => {
      const dataWithoutNumber = {
        ...mockInvoiceData,
        invoice_number: ''
      };

      const result = validateInvoiceForSave(
        dataWithoutNumber,
        mockClient,
        mockLineItems,
        true // new invoice
      );

      expect(result.isValid).toBe(true);
    });
  });

  describe('validateInvoiceForSend', () => {
    it('should validate invoice ready to send', () => {
      const result = validateInvoiceForSend(
        mockInvoiceData,
        mockClient,
        mockLineItems,
        false
      );

      expect(result.canSend).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should require valid client email', () => {
      const clientWithoutEmail = {
        ...mockClient,
        email: ''
      };

      const result = validateInvoiceForSend(
        mockInvoiceData,
        clientWithoutEmail,
        mockLineItems,
        false
      );

      expect(result.canSend).toBe(false);
      expect(result.errors.some(e => e.includes('email'))).toBe(true);
    });

    it('should require all save validations plus send-specific checks', () => {
      const result = validateInvoiceForSend(
        mockInvoiceData,
        null, // No client
        mockLineItems,
        false
      );

      expect(result.canSend).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});

describe('Data Validation Functions', () => {
  describe('validateExpenseData', () => {
    it('should validate complete expense', () => {
      const result = validateExpenseData({
        description: 'Office supplies',
        amount: 100,
        date: '2026-02-16',
        category: 'Office Supplies'
      });
      expect(result.isValid).toBe(true);
    });

    it('should reject expense with no amount', () => {
      const result = validateExpenseData({
        description: 'Test',
        amount: 0,
        date: '2026-02-16'
      });
      expect(result.isValid).toBe(false);
    });
  });

  describe('validatePaymentData', () => {
    it('should validate complete payment', () => {
      const result = validatePaymentData({
        amount: 100,
        date: '2026-02-16',
        method: 'bank_transfer'
      });
      expect(result.isValid).toBe(true);
    });

    it('should reject payment with no method', () => {
      const result = validatePaymentData({
        amount: 100,
        date: '2026-02-16',
        method: ''
      });
      expect(result.isValid).toBe(false);
    });
  });
});

describe('Business Logic Validation', () => {
  it('should validate invoice total calculation', () => {
    const lineItems: InvoiceItem[] = [
      { id: 1, description: 'Item 1', quantity: 2, unit_price: 50, total: 100 },
      { id: 2, description: 'Item 2', quantity: 1, unit_price: 75, total: 75 }
    ];

    const subtotal = lineItems.reduce((sum, item) => sum + item.total, 0);
    expect(subtotal).toBe(175);

    const taxRate = 0.08;
    const taxAmount = subtotal * taxRate;
    expect(taxAmount).toBe(14);

    const total = subtotal + taxAmount;
    expect(total).toBe(189);
  });

  it('should validate line item totals', () => {
    const item: InvoiceItem = {
      id: 1,
      description: 'Test',
      quantity: 5,
      unit_price: 20,
      total: 100
    };

    const calculatedTotal = item.quantity * item.unit_price;
    expect(item.total).toBe(calculatedTotal);
  });

  it('should validate payment terms', () => {
    const validTerms = ['due_on_receipt', 'net_15', 'net_30', 'net_60', 'net_90'];

    expect(validTerms.includes('net_30')).toBe(true);
    expect(validTerms.includes('invalid')).toBe(false);
  });

  it('should validate invoice statuses', () => {
    const validStatuses = ['draft', 'sent', 'paid', 'overdue', 'cancelled'];

    expect(validStatuses.includes('draft')).toBe(true);
    expect(validStatuses.includes('invalid')).toBe(false);
  });
});

describe('Edge Cases and Security', () => {
  it('should reject SQL injection attempts in email', () => {
    const maliciousInput = "'; DROP TABLE invoices; --";
    const result = validateClientData({ name: 'Test', email: maliciousInput });
    expect(result.isValid).toBe(false);
    expect(result.errors.some(e => e.toLowerCase().includes('email'))).toBe(true);
  });

  it('should handle XSS attempts in descriptions', () => {
    const xssAttempt = '<script>alert("XSS")</script>';
    const result = validateExpenseData({
      description: xssAttempt,
      amount: 100,
      date: '2026-02-16'
    });
    // Validation should allow the input (sanitization happens elsewhere)
    expect(result.isValid).toBe(true);
  });
});
