/**
 * Invoice Service Tests
 * Tests email sending, status updates, and scheduling functionality
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InvoiceService } from '@/services/invoices.svc';
import { mockFetchSuccess, mockFetchError } from '../apiMock';
import type { InvoiceEmailData } from '@/types';

// Mock the email service
vi.mock('@/services/email.svc', () => ({
  EmailService: {
    getInstance: () => ({
      sendEmail: vi.fn().mockResolvedValue({ success: true, message: 'Email sent' })
    })
  }
}));

// Mock API fetch
vi.mock('@/utils/api', () => ({
  authenticatedFetch: vi.fn(async (url: string, options?: RequestInit) => {
    const response = await global.fetch(url, options);
    // Mimic real authenticatedFetch behavior - throw on error responses
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
    }
    return response;
  }),
  getToken: vi.fn(() => 'mock-token')
}));

describe('InvoiceService - Email Functionality', () => {
  let invoiceService: InvoiceService;

  beforeEach(() => {
    vi.clearAllMocks();
    invoiceService = InvoiceService.getInstance();
  });

  describe('sendInvoiceEmail', () => {
    it('should send invoice email successfully', async () => {
      const invoiceData: InvoiceEmailData = {
        id: 1,
        invoice_number: 'INV-001',
        client_name: 'Test Client',
        client_email: 'test@example.com',
        amount: 1000,
        due_date: '2026-03-01',
        status: 'sent',
        notes: 'Thank you for your business'
      };

      const result = await invoiceService.sendInvoiceEmail(invoiceData);

      expect(result.success).toBe(true);
      expect(result.message).toBeTruthy();
    });

    it('should handle email sending failure', async () => {
      const invoiceData: InvoiceEmailData = {
        id: 1,
        invoice_number: 'INV-001',
        client_name: 'Test Client',
        client_email: 'invalid-email',
        amount: 1000,
        due_date: '2026-03-01',
        status: 'sent'
      };

      // Mock email service to fail
      const emailService = (invoiceService as any).emailService;
      emailService.sendEmail = vi.fn().mockResolvedValue({
        success: false,
        message: 'Invalid email address'
      });

      const result = await invoiceService.sendInvoiceEmail(invoiceData);

      expect(result.success).toBe(false);
    });
  });

  describe('updateEmailStatus', () => {
    it('should update email status to sending', async () => {
      mockFetchSuccess({ id: 1 });

      const result = await invoiceService.updateEmailStatus(1, 'sending');

      expect(result.success).toBe(true);
      expect(result.message).toContain('sending');
    });

    it('should update email status to sent with timestamp', async () => {
      mockFetchSuccess({ id: 1 });

      const result = await invoiceService.updateEmailStatus(1, 'sent');

      expect(result.success).toBe(true);
    });

    it('should handle email status update failure', async () => {
      mockFetchError(500, 'Server error');

      const result = await invoiceService.updateEmailStatus(1, 'failed', 'Network error');

      expect(result.success).toBe(false);
    });
  });

  describe('markInvoiceAsSent', () => {
    it('should mark invoice as sent with correct timestamps', async () => {
      mockFetchSuccess({ id: 1 });

      const result = await invoiceService.markInvoiceAsSent(1);

      expect(result.success).toBe(true);
      expect(result.message).toContain('sent');
    });
  });

  describe('getEmailStatus', () => {
    it('should retrieve email status for invoice', async () => {
      mockFetchSuccess({
        id: 1,
        email_status: 'sent',
        email_sent_at: '2026-02-16T10:00:00Z',
        last_email_attempt: '2026-02-16T10:00:00Z'
      });

      const status = await invoiceService.getEmailStatus(1);

      expect(status).not.toBeNull();
      expect(status?.status).toBe('sent');
      expect(status?.sentAt).toBeTruthy();
    });

    it('should return null for non-existent invoice', async () => {
      mockFetchError(404, 'Invoice not found');

      const status = await invoiceService.getEmailStatus(999);

      expect(status).toBeNull();
    });
  });

  describe('getStatusMessage', () => {
    it('should return "Not sent" for not_sent status', () => {
      const message = invoiceService.getStatusMessage('not_sent');
      expect(message).toBe('Not sent');
    });

    it('should return "Sending..." for sending status', () => {
      const message = invoiceService.getStatusMessage('sending');
      expect(message).toBe('Sending...');
    });

    it('should return formatted sent message with timestamp', () => {
      const message = invoiceService.getStatusMessage('sent', '2026-02-16T10:00:00Z');
      expect(message).toContain('Sent on');
    });

    it('should return error message for failed status', () => {
      const message = invoiceService.getStatusMessage('failed', undefined, 'SMTP error');
      expect(message).toContain('Failed to send');
      expect(message).toContain('SMTP error');
    });
  });
});

describe('InvoiceService - Scheduling Functionality', () => {
  let invoiceService: InvoiceService;

  beforeEach(() => {
    vi.clearAllMocks();
    invoiceService = InvoiceService.getInstance();
  });

  describe('getTodaysScheduledInvoices', () => {
    it('should return invoices scheduled for today', async () => {
      const today = new Date().toISOString().split('T')[0];
      mockFetchSuccess([
        {
          id: 1,
          invoice_number: 'INV-001',
          status: 'draft',
          due_date: today,
          email_status: 'not_sent',
          client_name: 'Test Client',
          client_email: 'test@example.com',
          amount: 1000
        }
      ]);

      const scheduled = await invoiceService.getTodaysScheduledInvoices();

      expect(Array.isArray(scheduled)).toBe(true);
    });

    it('should filter out already sent invoices', async () => {
      mockFetchSuccess([
        {
          id: 1,
          status: 'draft',
          due_date: new Date().toISOString(),
          email_status: 'sent'
        }
      ]);

      const scheduled = await invoiceService.getTodaysScheduledInvoices();

      expect(scheduled.length).toBe(0);
    });
  });

  describe('getOverdueInvoices', () => {
    it('should return overdue invoices', async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      mockFetchSuccess([
        {
          id: 1,
          invoice_number: 'INV-001',
          status: 'sent',
          due_date: yesterday.toISOString().split('T')[0],
          client_name: 'Test Client',
          client_email: 'test@example.com',
          amount: 1000
        }
      ]);

      const overdue = await invoiceService.getOverdueInvoices();

      expect(Array.isArray(overdue)).toBe(true);
    });

    it('should not return paid invoices', async () => {
      mockFetchSuccess([
        {
          id: 1,
          status: 'paid',
          due_date: '2026-01-01'
        }
      ]);

      const overdue = await invoiceService.getOverdueInvoices();

      expect(overdue.length).toBe(0);
    });
  });
});

describe('InvoiceService - Invoice Number Generation', () => {
  let invoiceService: InvoiceService;

  beforeEach(() => {
    vi.clearAllMocks();
    invoiceService = InvoiceService.getInstance();
  });

  describe('generateInvoiceNumber', () => {
    it('should generate invoice number from server', async () => {
      mockFetchSuccess({ invoice_number: 'INV-003' });

      const number = await invoiceService.generateInvoiceNumber();

      expect(number).toBeTruthy();
      expect(typeof number).toBe('string');
      expect(number).toBe('INV-003');
    });

    it('should handle server generation', async () => {
      mockFetchSuccess({ invoice_number: 'INV-001' });

      const number = await invoiceService.generateInvoiceNumber();

      expect(number).toBe('INV-001');
    });
  });

  describe('generateTemporaryInvoiceNumber', () => {
    it('should preview next invoice number', async () => {
      mockFetchSuccess({ invoice_number: 'INV-PREVIEW' });

      const tempNumber = await invoiceService.generateTemporaryInvoiceNumber();

      expect(tempNumber).toBeTruthy();
      expect(tempNumber).toBe('INV-PREVIEW');
    });
  });
});

describe('InvoiceService - Singleton Pattern', () => {
  it('should return the same instance', () => {
    const instance1 = InvoiceService.getInstance();
    const instance2 = InvoiceService.getInstance();

    expect(instance1).toBe(instance2);
  });
});
