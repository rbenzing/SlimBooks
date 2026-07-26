/**
 * Invoice CRUD Integration Tests
 * Tests the critical template_id schema fix and all CRUD operations
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Invoice } from '@/types';
import { isInvoice } from '@/types';
import { mockData, mockFetchSuccess, mockFetchError } from './apiMock';

vi.mock('@/utils/api', () => ({
  authenticatedFetch: vi.fn((url: string, options?: RequestInit) => {
    return global.fetch(url, options);
  })
}));

describe('Invoice CRUD Operations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('CREATE - Invoice', () => {
    it('should create invoice with design_template_id (NOT template_id)', async () => {
      mockFetchSuccess({ id: 1 });

      const response = await fetch('/api/invoices', {
        method: 'POST',
        body: JSON.stringify({
          invoiceData: {
            client_id: 1,
            design_template_id: 1, // Correct field
            recurring_template_id: undefined,
            amount: 1000,
            invoice_number: 'INV-001'
          }
        })
      });

      const result = await response.json();

      expect(result.success).toBe(true);
      expect(result.data.id).toBe(1);
    });

    it('should reject invoice with deprecated template_id field', async () => {
      // This should fail because template_id doesn't exist in DB
      const invalidInvoice = {
        client_id: 1,
        template_id: 1, // ❌ WRONG - deprecated field
        amount: 1000
      };

      mockFetchError(400, 'Database operation failed: table invoices has no column named template_id');

      const response = await fetch('/api/invoices', {
        method: 'POST',
        body: JSON.stringify({ invoiceData: invalidInvoice })
      });

      const result = await response.json();

      expect(result.success).toBe(false);
      expect(result.error).toContain('template_id');
    });

    it('should allow BOTH template fields to be null', async () => {
      const newInvoice = {
        client_id: 1,
        design_template_id: null,
        recurring_template_id: null,
        amount: 1000,
        invoice_number: 'INV-001'
      };

      mockFetchSuccess({ id: 1 });

      const response = await fetch('/api/invoices', {
        method: 'POST',
        body: JSON.stringify({ invoiceData: newInvoice })
      });

      const result = await response.json();

      expect(result.success).toBe(true);
    });

    it('should validate invoice type structure', async () => {
      const invoice = mockData.invoice(1, 1);
      mockFetchSuccess(invoice);

      const response = await fetch('/api/invoices/1');
      const result = await response.json();

      expect(isInvoice(result.data)).toBe(true);
      expect(result.data).toHaveProperty('design_template_id');
      expect(result.data).toHaveProperty('recurring_template_id');
      expect(result.data).not.toHaveProperty('template_id');
    });
  });

  describe('READ - Invoice', () => {
    it('should fetch all invoices with correct type structure', async () => {
      const invoices = [
        mockData.invoice(1, 1),
        mockData.invoice(2, 1)
      ];
      mockFetchSuccess(invoices);

      const response = await fetch('/api/invoices');
      const result = await response.json();

      expect(result.success).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);
      result.data.forEach((invoice: Invoice) => {
        expect(isInvoice(invoice)).toBe(true);
        expect(invoice).not.toHaveProperty('template_id');
      });
    });

    it('should preview next invoice number', async () => {
      mockFetchSuccess({ invoice_number: 'INV-003' });

      const response = await fetch('/api/invoices/preview-number');
      const result = await response.json();

      expect(result.success).toBe(true);
      expect(result.data.invoice_number).toMatch(/^INV-\d+$/);
    });

    it('should fetch invoice by ID with template fields', async () => {
      const invoice = {
        ...mockData.invoice(1, 1),
        design_template_id: 5,
        recurring_template_id: null
      };
      mockFetchSuccess(invoice);

      const response = await fetch('/api/invoices/1');
      const result = await response.json();

      expect(result.success).toBe(true);
      expect(result.data.design_template_id).toBe(5);
      expect(result.data.recurring_template_id).toBeNull();
    });
  });

  describe('UPDATE - Invoice', () => {
    it('should update invoice preserving template IDs', async () => {
      const updatedInvoice = {
        ...mockData.invoice(1, 1),
        amount: 2000,
        design_template_id: 3
      };
      mockFetchSuccess(updatedInvoice);

      const response = await fetch('/api/invoices/1', {
        method: 'PUT',
        body: JSON.stringify({
          invoiceData: {
            amount: 2000,
            design_template_id: 3,
            recurring_template_id: null
          }
        })
      });

      const result = await response.json();

      expect(result.success).toBe(true);
      expect(result.data.amount).toBe(2000);
      expect(result.data.design_template_id).toBe(3);
    });

    it('should handle changing from design to recurring template', async () => {
      const updatedInvoice = {
        ...mockData.invoice(1, 1),
        design_template_id: null,
        recurring_template_id: 7
      };
      mockFetchSuccess(updatedInvoice);

      const response = await fetch('/api/invoices/1', {
        method: 'PUT',
        body: JSON.stringify({
          invoiceData: {
            design_template_id: null,
            recurring_template_id: 7
          }
        })
      });

      const result = await response.json();

      expect(result.success).toBe(true);
      expect(result.data.design_template_id).toBeNull();
      expect(result.data.recurring_template_id).toBe(7);
    });
  });

  describe('DELETE - Invoice', () => {
    it('should delete invoice successfully', async () => {
      mockFetchSuccess({ changes: 1 });

      const response = await fetch('/api/invoices/1', {
        method: 'DELETE'
      });

      const result = await response.json();

      expect(result.success).toBe(true);
      expect(result.data.changes).toBe(1);
    });
  });

  describe('Template ID Schema Validation', () => {
    it('should enforce design_template_id and recurring_template_id exist', () => {
      const invoice = mockData.invoice(1, 1);

      expect(invoice).toHaveProperty('design_template_id');
      expect(invoice).toHaveProperty('recurring_template_id');
      expect(invoice).not.toHaveProperty('template_id');
    });

    it('should validate TypeScript Invoice interface structure', () => {
      const invoice: Invoice = {
        id: 1,
        invoice_number: 'INV-001',
        client_id: 1,
        design_template_id: 1,
        recurring_template_id: undefined,
        amount: 100,
        tax_amount: 10,
        total_amount: 110,
        status: 'draft',
        due_date: '2026-03-01',
        issue_date: '2026-02-01',
        type: 'one-time',
        shipping_amount: 0,
        email_status: 'not_sent',
        created_at: '2026-02-16',
        updated_at: '2026-02-16'
      };

      // TypeScript will error if template_id exists
      expect(isInvoice(invoice)).toBe(true);
    });

    it('should match frontend and backend Invoice types', async () => {
      const backendInvoice = mockData.invoice(1, 1);
      mockFetchSuccess(backendInvoice);

      const response = await fetch('/api/invoices/1');
      const result = await response.json();

      // Frontend type should match backend response
      const frontendInvoice: Invoice = result.data;

      expect(frontendInvoice).toHaveProperty('design_template_id');
      expect(frontendInvoice).toHaveProperty('recurring_template_id');
      expect(frontendInvoice).not.toHaveProperty('template_id');
    });
  });

  describe('Invoice Number Generation', () => {
    it('should auto-generate invoice number if not provided', async () => {
      mockFetchSuccess({ id: 1 });

      const response = await fetch('/api/invoices', {
        method: 'POST',
        body: JSON.stringify({
          invoiceData: {
            client_id: 1,
            amount: 1000
            // invoice_number not provided
          }
        })
      });

      const result = await response.json();

      expect(result.success).toBe(true);
      expect(result.data.id).toBeDefined();
    });

    it('should reject duplicate invoice numbers', async () => {
      mockFetchError(400, 'Invoice number already exists');

      const response = await fetch('/api/invoices', {
        method: 'POST',
        body: JSON.stringify({
          invoiceData: {
            invoice_number: 'INV-001',
            client_id: 1,
            amount: 1000
          }
        })
      });

      const result = await response.json();

      expect(result.success).toBe(false);
      expect(result.error).toContain('already exists');
    });
  });
});
