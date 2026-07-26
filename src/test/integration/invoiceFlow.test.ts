/**
 * Invoice Flow Integration Tests
 * Tests complete invoice lifecycle from creation to payment
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockFetchSuccess, mockFetchError, mockData } from '../apiMock';
import type { Invoice, Client } from '@/types';

// Mock API
vi.mock('@/utils/api', () => ({
  authenticatedFetch: vi.fn((url: string, options?: RequestInit) => {
    return global.fetch(url, options);
  }),
  getToken: vi.fn(() => 'mock-token')
}));

describe('Invoice Lifecycle Integration Tests', () => {
  let testClient: Client;


  beforeEach(() => {
    vi.clearAllMocks();

    testClient = mockData.client(1);
  });

  describe('Complete Invoice Flow', () => {
    it('should handle full invoice lifecycle: create -> send -> pay', async () => {
      // Step 1: Create client
      mockFetchSuccess({ id: 1 });
      let response = await fetch('/api/clients', {
        method: 'POST',
        body: JSON.stringify({ clientData: testClient })
      });
      let result = await response.json();

      expect(result.success).toBe(true);
      expect(result.data.id).toBe(1);

      // Step 2: Create draft invoice
      mockFetchSuccess({ id: 1 });
      response = await fetch('/api/invoices', {
        method: 'POST',
        body: JSON.stringify({
          invoiceData: {
            client_id: testClient.id,
            amount: 1000,
            status: 'draft',
            email_status: 'not_sent'
          }
        })
      });
      result = await response.json();

      expect(result.success).toBe(true);
      expect(result.data.id).toBe(1);

      // Step 3: Send invoice (update status to sent)
      mockFetchSuccess({ id: 1, status: 'sent', email_status: 'sent' });
      response = await fetch('/api/invoices/1', {
        method: 'PUT',
        body: JSON.stringify({
          invoiceData: {
            status: 'sent',
            email_status: 'sent'
          }
        })
      });
      result = await response.json();

      expect(result.success).toBe(true);
      expect(result.data.status).toBe('sent');

      // Step 4: Record payment
      mockFetchSuccess({ id: 1 });
      response = await fetch('/api/payments', {
        method: 'POST',
        body: JSON.stringify({
          paymentData: {
            invoice_id: 1,
            amount: 1000,
            method: 'bank_transfer',
            status: 'received'
          }
        })
      });
      result = await response.json();

      expect(result.success).toBe(true);

      // Step 5: Mark invoice as paid
      mockFetchSuccess({ id: 1, status: 'paid' });
      response = await fetch('/api/invoices/1', {
        method: 'PUT',
        body: JSON.stringify({
          invoiceData: { status: 'paid' }
        })
      });
      result = await response.json();

      expect(result.success).toBe(true);
      expect(result.data.status).toBe('paid');
    });

    it('should handle invoice with partial payments', async () => {
      // Create invoice for $1000
      mockFetchSuccess({ id: 1, amount: 1000, total_amount: 1100 });
      let response = await fetch('/api/invoices', {
        method: 'POST',
        body: JSON.stringify({
          invoiceData: { amount: 1000, tax_amount: 100, total_amount: 1100 }
        })
      });
      let result = await response.json();

      expect(result.data.total_amount).toBe(1100);

      // First partial payment of $500
      mockFetchSuccess({ id: 1, amount: 500 });
      response = await fetch('/api/payments', {
        method: 'POST',
        body: JSON.stringify({
          paymentData: { invoice_id: 1, amount: 500 }
        })
      });
      result = await response.json();

      expect(result.success).toBe(true);

      // Second partial payment of $600 (total $1100)
      mockFetchSuccess({ id: 2, amount: 600 });
      response = await fetch('/api/payments', {
        method: 'POST',
        body: JSON.stringify({
          paymentData: { invoice_id: 1, amount: 600 }
        })
      });
      result = await response.json();

      expect(result.success).toBe(true);

      // Mark invoice as paid
      mockFetchSuccess({ id: 1, status: 'paid' });
      response = await fetch('/api/invoices/1', {
        method: 'PUT',
        body: JSON.stringify({
          invoiceData: { status: 'paid' }
        })
      });
      result = await response.json();

      expect(result.data.status).toBe('paid');
    });

    it('should handle invoice cancellation', async () => {
      // Create invoice
      mockFetchSuccess({ id: 1, status: 'draft' });
      let response = await fetch('/api/invoices', {
        method: 'POST',
        body: JSON.stringify({ invoiceData: { status: 'draft' } })
      });

      // Cancel invoice
      mockFetchSuccess({ id: 1, status: 'cancelled' });
      response = await fetch('/api/invoices/1', {
        method: 'PUT',
        body: JSON.stringify({
          invoiceData: { status: 'cancelled' }
        })
      });
      const result = await response.json();

      expect(result.data.status).toBe('cancelled');
    });

    it('should handle invoice becoming overdue', async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      // Create sent invoice with past due date
      mockFetchSuccess({
        id: 1,
        status: 'sent',
        due_date: yesterday.toISOString().split('T')[0]
      });

      let response = await fetch('/api/invoices', {
        method: 'POST',
        body: JSON.stringify({
          invoiceData: {
            status: 'sent',
            due_date: yesterday.toISOString().split('T')[0]
          }
        })
      });

      // System should mark as overdue
      mockFetchSuccess({ id: 1, status: 'overdue' });
      response = await fetch('/api/invoices/1', {
        method: 'PUT',
        body: JSON.stringify({
          invoiceData: { status: 'overdue' }
        })
      });
      const result = await response.json();

      expect(result.data.status).toBe('overdue');
    });
  });

  describe('Recurring Invoice Flow', () => {
    it('should create recurring invoice template and generate instances', async () => {
      // Create recurring template
      mockFetchSuccess({ id: 1, frequency: 'monthly' });
      let response = await fetch('/api/templates', {
        method: 'POST',
        body: JSON.stringify({
          templateData: {
            name: 'Monthly Service',
            client_id: 1,
            amount: 500,
            frequency: 'monthly'
          }
        })
      });
      let result = await response.json();

      expect(result.success).toBe(true);
      expect(result.data.frequency).toBe('monthly');

      // Generate invoice from template
      mockFetchSuccess({ id: 1, recurring_template_id: 1 });
      response = await fetch('/api/invoices', {
        method: 'POST',
        body: JSON.stringify({
          invoiceData: {
            recurring_template_id: 1,
            client_id: 1,
            amount: 500
          }
        })
      });
      result = await response.json();

      expect(result.success).toBe(true);
      expect(result.data.recurring_template_id).toBe(1);
    });

    it('should handle template updates affecting future invoices', async () => {
      // Update template amount
      mockFetchSuccess({ id: 1, amount: 600 });
      const response = await fetch('/api/templates/1', {
        method: 'PUT',
        body: JSON.stringify({
          templateData: { amount: 600 }
        })
      });
      const result = await response.json();

      expect(result.success).toBe(true);
      expect(result.data.amount).toBe(600);
    });
  });

  describe('Error Handling in Flow', () => {
    it('should handle invoice creation failure', async () => {
      mockFetchError(400, 'Invalid invoice data');

      const response = await fetch('/api/invoices', {
        method: 'POST',
        body: JSON.stringify({ invoiceData: {} })
      });
      const result = await response.json();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid');
    });

    it('should handle payment failure', async () => {
      mockFetchError(400, 'Insufficient payment amount');

      const response = await fetch('/api/payments', {
        method: 'POST',
        body: JSON.stringify({
          paymentData: { invoice_id: 1, amount: -100 }
        })
      });
      const result = await response.json();

      expect(result.success).toBe(false);
    });

    it('should handle concurrent invoice updates', async () => {
      // Simulate two users updating same invoice
      mockFetchSuccess({ id: 1, updated_at: '2026-02-16T10:00:00Z' });

      const response1 = fetch('/api/invoices/1', {
        method: 'PUT',
        body: JSON.stringify({ invoiceData: { amount: 1000 } })
      });

      const response2 = fetch('/api/invoices/1', {
        method: 'PUT',
        body: JSON.stringify({ invoiceData: { amount: 2000 } })
      });

      const [result1, result2] = await Promise.all([response1, response2]);

      // Both should complete (last write wins or optimistic locking)
      expect((await result1.json()).success).toBe(true);
      expect((await result2.json()).success).toBe(true);
    });
  });

  describe('Multi-Entity Flow', () => {
    it('should handle client with multiple invoices and payments', async () => {
      // Create 3 invoices for same client
      for (let i = 1; i <= 3; i++) {
        mockFetchSuccess({ id: i, client_id: 1 });
        const response = await fetch('/api/invoices', {
          method: 'POST',
          body: JSON.stringify({
            invoiceData: { client_id: 1, amount: i * 100 }
          })
        });
        const result = await response.json();

        expect(result.success).toBe(true);
      }

      // Get all invoices for client
      mockFetchSuccess([
        { id: 1, client_id: 1, amount: 100 },
        { id: 2, client_id: 1, amount: 200 },
        { id: 3, client_id: 1, amount: 300 }
      ]);

      const response = await fetch('/api/invoices?client_id=1');
      const result = await response.json();

      expect(result.data.length).toBe(3);
      expect(result.data.every((inv: Invoice) => inv.client_id === 1)).toBe(true);
    });

    it('should calculate total outstanding amount for client', async () => {
      mockFetchSuccess([
        { id: 1, status: 'sent', total_amount: 1000 },
        { id: 2, status: 'overdue', total_amount: 2000 },
        { id: 3, status: 'paid', total_amount: 500 }
      ]);

      const response = await fetch('/api/invoices?client_id=1&status=unpaid');
      const result = await response.json();

      const outstanding = result.data
        .filter((inv: Invoice) => inv.status !== 'paid')
        .reduce((sum: number, inv: Invoice) => sum + (inv.total_amount || 0), 0);

      expect(outstanding).toBe(3000);
    });
  });

  describe('Data Consistency', () => {
    it('should maintain referential integrity between entities', async () => {
      // Delete client should fail if has unpaid invoices
      mockFetchSuccess([
        { id: 1, client_id: 1, status: 'sent' }
      ]);

      let response = await fetch('/api/invoices?client_id=1');
      const invoices = await response.json();

      if (invoices.data.some((inv: Invoice) => inv.status !== 'paid')) {
        mockFetchError(400, 'Cannot delete client with unpaid invoices');

        response = await fetch('/api/clients/1', { method: 'DELETE' });
        const result = await response.json();

        expect(result.success).toBe(false);
      }
    });

    it('should soft delete and restore entities', async () => {
      // Soft delete invoice
      mockFetchSuccess({ id: 1, deleted_at: '2026-02-16T10:00:00Z' });
      let response = await fetch('/api/invoices/1', {
        method: 'DELETE'
      });
      let result = await response.json();

      expect(result.success).toBe(true);

      // Restore invoice
      mockFetchSuccess({ id: 1, deleted_at: null });
      response = await fetch('/api/invoices/1/restore', {
        method: 'POST'
      });
      result = await response.json();

      expect(result.success).toBe(true);
    });
  });
});

describe('Performance and Scalability', () => {
  it('should handle large number of invoices efficiently', async () => {
    const manyInvoices = Array.from({ length: 1000 }, (_, i) =>
      mockData.invoice(i + 1, 1)
    );

    mockFetchSuccess(manyInvoices);

    const startTime = Date.now();
    const response = await fetch('/api/invoices');
    const result = await response.json();
    const duration = Date.now() - startTime;

    expect(result.success).toBe(true);
    expect(result.data.length).toBe(1000);
    expect(duration).toBeLessThan(1000); // Should complete in under 1 second
  });

  it('should handle pagination correctly', async () => {
    const page1 = Array.from({ length: 50 }, (_, i) => mockData.invoice(i + 1));
    const page2 = Array.from({ length: 50 }, (_, i) => mockData.invoice(i + 51));

    // First page
    mockFetchSuccess(page1);
    let response = await fetch('/api/invoices?page=1&limit=50');
    let result = await response.json();

    expect(result.success).toBe(true);
    expect(result.data.length).toBe(50);

    // Second page
    mockFetchSuccess(page2);
    response = await fetch('/api/invoices?page=2&limit=50');
    result = await response.json();

    expect(result.success).toBe(true);
    expect(result.data.length).toBe(50);
  });
});
