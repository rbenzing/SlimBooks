/**
 * InvoiceService batch and status-presentation tests.
 *
 * invoiceService.test.ts covers single-invoice email calls. This file covers
 * the unattended batch runs and the status vocabulary the UI renders from.
 *
 * The batch runs matter because nobody watches them: one invoice failing must
 * not abandon the rest, a failure must leave the invoice marked `failed` rather
 * than stuck on `sending`, and a send must never be started for an invoice that
 * is already mid-send.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { authenticatedFetch, getToken } = vi.hoisted(() => ({
  authenticatedFetch: vi.fn(),
  getToken: vi.fn(() => 'mock-token')
}));
const { sendEmail } = vi.hoisted(() => ({ sendEmail: vi.fn() }));

vi.mock('@/utils/api', () => ({ authenticatedFetch, getToken, API_BASE: '/api' }));
vi.mock('@/services/email.svc', () => ({
  EmailService: { getInstance: () => ({ sendEmail }) }
}));

import { InvoiceService } from '@/services/invoices.svc';
import type { EmailStatus } from '@/types';

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;

const invoice = (over: Record<string, unknown> = {}) => ({
  id: 1,
  invoice_number: 'INV-001',
  client_name: 'Acme',
  client_email: 'billing@acme.com',
  amount: 500,
  due_date: '2026-07-01',
  status: 'sent',
  email_status: 'not_sent',
  ...over
});

/** Every PUT body the service sent, in order. */
const putBodies = () => authenticatedFetch.mock.calls
  .filter(call => (call[1] as RequestInit | undefined)?.method === 'PUT')
  .map(call => JSON.parse((call[1] as RequestInit).body as string));

/** The email_status values written, in order. */
const writtenStatuses = () => putBodies()
  .map(body => body.invoiceData?.email_status)
  .filter(Boolean);

let service: InvoiceService;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  authenticatedFetch.mockResolvedValue(ok({ success: true, data: [] }));
  sendEmail.mockResolvedValue({ success: true, message: 'Email sent' });
  // The constructor is private; the singleton is the only way in.
  service = InvoiceService.getInstance();
});

// The service is a singleton, so method spies must be removed between tests.
afterEach(() => vi.restoreAllMocks());

describe('status presentation', () => {
  it('describes every status the UI can render', () => {
    expect(service.getStatusMessage('not_sent')).toBe('Not sent');
    expect(service.getStatusMessage('sending')).toBe('Sending...');
    expect(service.getStatusMessage('sent')).toBe('Sent');
    expect(service.getStatusMessage('failed')).toBe('Failed to send');
  });

  it('never renders an unknown status as blank', () => {
    // A blank cell in the list reads as "nothing happened" rather than "bug".
    expect(service.getStatusMessage('nonsense' as EmailStatus)).toBe('Unknown status');
    expect(service.getStatusColor('nonsense' as EmailStatus)).toBeTruthy();
    expect(service.getStatusIcon('nonsense' as EmailStatus)).toBeTruthy();
  });

  it('includes the send time when there is one', () => {
    const message = service.getStatusMessage('sent', '2026-07-04T10:30:00.000Z');

    expect(message).toMatch(/^Sent on /);
    expect(message).toMatch(/ at /);
  });

  it('prefers the error text over the attempt time on a failure', () => {
    const message = service.getStatusMessage('failed', undefined, 'mailbox full', '2026-07-04T10:00:00.000Z');

    expect(message).toBe('Failed to send: mailbox full');
  });

  it('falls back to the last attempt when there is no error text', () => {
    const message = service.getStatusMessage('failed', undefined, undefined, '2026-07-04T10:00:00.000Z');

    expect(message).toMatch(/^Failed to send \(last attempt: /);
  });

  it('gives each status a distinct colour and icon', () => {
    const statuses: EmailStatus[] = ['not_sent', 'sending', 'sent', 'failed'];

    expect(new Set(statuses.map(s => service.getStatusColor(s))).size).toBe(4);
    expect(new Set(statuses.map(s => service.getStatusIcon(s))).size).toBe(4);
  });

  it('blocks a second send while one is in flight', () => {
    // Sending twice would deliver the client two copies of the same invoice.
    expect(service.canSendInvoice('sending')).toBe(false);
    expect(service.canSendInvoice('not_sent')).toBe(true);
    expect(service.canSendInvoice('sent')).toBe(true);
    expect(service.canSendInvoice('failed')).toBe(true);
  });

  it('offers retry only after a failure', () => {
    expect(service.shouldShowRetry('failed')).toBe(true);
    expect(service.shouldShowRetry('not_sent')).toBe(false);
    expect(service.shouldShowRetry('sent')).toBe(false);
    expect(service.shouldShowRetry('sending')).toBe(false);
  });
});

describe('getFailedInvoices', () => {
  it('returns only the invoices whose email failed', async () => {
    authenticatedFetch.mockResolvedValue(ok({
      data: [
        invoice({ id: 1, email_status: 'failed' }),
        invoice({ id: 2, email_status: 'sent' }),
        invoice({ id: 3, email_status: 'failed' })
      ]
    }));

    const failed = await service.getFailedInvoices();

    expect(failed.map(i => i.id)).toEqual([1, 3]);
  });

  it('returns an empty list rather than throwing when the request fails', async () => {
    authenticatedFetch.mockRejectedValue(new Error('offline'));

    await expect(service.getFailedInvoices()).resolves.toEqual([]);
  });

  it('returns an empty list when nothing has failed', async () => {
    authenticatedFetch.mockResolvedValue(ok({ data: [invoice({ email_status: 'sent' })] }));

    await expect(service.getFailedInvoices()).resolves.toEqual([]);
  });
});

describe('retryFailedInvoice', () => {
  it('resets the status so the invoice can be sent again', async () => {
    await expect(service.retryFailedInvoice(1))
      .resolves.toMatchObject({ success: true });

    expect(writtenStatuses()).toContain('not_sent');
  });
});

describe('processScheduledInvoices', () => {
  // A scheduled invoice is a draft that has come due and has not been emailed.
  const scheduled = (over: Record<string, unknown> = {}) =>
    invoice({ status: 'draft', due_date: '2020-01-01', email_status: 'not_sent', ...over });

  /**
   * Serves the invoice list and stubs the email step, so these tests exercise
   * the batch orchestration rather than HTML generation.
   */
  const withScheduled = (invoices: unknown[]) => {
    authenticatedFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') return ok({ success: true });
      return ok({ success: true, data: invoices });
    });
    return vi.spyOn(service, 'sendInvoiceEmail')
      .mockResolvedValue({ success: true, message: 'Email sent' });
  };

  it('reports nothing to do on an empty schedule', async () => {
    const send = withScheduled([]);

    await expect(service.processScheduledInvoices())
      .resolves.toMatchObject({ processed: 0, successful: 0, failed: 0, results: [] });
    expect(send).not.toHaveBeenCalled();
  });

  it('leaves an invoice that is not yet due alone', async () => {
    withScheduled([scheduled({ due_date: '2999-01-01' })]);

    await expect(service.processScheduledInvoices())
      .resolves.toMatchObject({ processed: 0 });
  });

  it('leaves an already-sent invoice alone', async () => {
    // Re-sending would deliver the client a duplicate.
    withScheduled([scheduled({ email_status: 'sent' })]);

    await expect(service.processScheduledInvoices())
      .resolves.toMatchObject({ processed: 0 });
  });

  it('marks the invoice sending before it attempts delivery', async () => {
    // Without this the list shows nothing while a slow send is in progress.
    withScheduled([scheduled()]);

    await service.processScheduledInvoices();

    expect(writtenStatuses()[0]).toBe('sending');
  });

  it('leaves a failed invoice marked failed, not stuck sending', async () => {
    const send = withScheduled([scheduled()]);
    send.mockResolvedValue({ success: false, message: 'mailbox full' });

    const result = await service.processScheduledInvoices();

    expect(result.failed).toBe(1);
    expect(writtenStatuses()).toContain('failed');
    expect(writtenStatuses().at(-1)).not.toBe('sending');
  });

  it('records the failure reason against the invoice', async () => {
    const send = withScheduled([scheduled()]);
    send.mockResolvedValue({ success: false, message: 'mailbox full' });

    const result = await service.processScheduledInvoices();

    expect(result.results[0].message).toBe('mailbox full');
  });

  it('keeps going after one invoice throws', async () => {
    // One bad address must not abandon the rest of the day's billing.
    const send = withScheduled([
      scheduled({ id: 1 }), scheduled({ id: 2 }), scheduled({ id: 3 })
    ]);
    send
      .mockResolvedValueOnce({ success: true, message: 'ok' })
      .mockRejectedValueOnce(new Error('smtp refused'))
      .mockResolvedValueOnce({ success: true, message: 'ok' });

    const result = await service.processScheduledInvoices();

    expect(result.processed).toBe(3);
    expect(result.successful).toBe(2);
    expect(result.failed).toBe(1);
  });

  it('counts every invoice it looked at', async () => {
    withScheduled([scheduled({ id: 1 }), scheduled({ id: 2 })]);

    const result = await service.processScheduledInvoices();

    expect(result.processed).toBe(result.successful + result.failed);
    expect(result.results).toHaveLength(result.processed);
  });
});

describe('sendOverdueReminders', () => {
  // An overdue invoice has been sent (or gone overdue) and is past its due date.
  const overdue = (over: Record<string, unknown> = {}) =>
    invoice({ status: 'sent', due_date: '2020-01-01', ...over });

  const withOverdue = (invoices: unknown[]) => {
    authenticatedFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') return ok({ success: true });
      return ok({ success: true, data: invoices });
    });
    return vi.spyOn(service, 'sendInvoiceReminder')
      .mockResolvedValue({ success: true, message: 'Reminder sent' });
  };

  it('reports nothing to do when nothing is overdue', async () => {
    withOverdue([]);

    await expect(service.sendOverdueReminders())
      .resolves.toMatchObject({ processed: 0, successful: 0, failed: 0 });
  });

  it('leaves an invoice that is not yet due alone', async () => {
    withOverdue([overdue({ due_date: '2999-01-01' })]);

    await expect(service.sendOverdueReminders()).resolves.toMatchObject({ processed: 0 });
  });

  it('does not chase an invoice that is already paid', async () => {
    withOverdue([overdue({ status: 'paid' })]);

    await expect(service.sendOverdueReminders()).resolves.toMatchObject({ processed: 0 });
  });

  it('keeps going after one reminder throws', async () => {
    const remind = withOverdue([overdue({ id: 1 }), overdue({ id: 2 })]);
    remind
      .mockRejectedValueOnce(new Error('smtp refused'))
      .mockResolvedValueOnce({ success: true, message: 'ok' });

    const result = await service.sendOverdueReminders();

    expect(result.processed).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.successful).toBe(1);
  });

  it('does not change email status when only reminding', async () => {
    // A reminder is not the invoice being sent; overwriting the status would
    // lose the record of when the invoice itself went out.
    withOverdue([overdue({ id: 1 })]);

    await service.sendOverdueReminders();

    expect(writtenStatuses()).toEqual([]);
  });
});

describe('sendScheduledInvoice', () => {
  /** Serves one invoice record; getEmailStatus reads the same row. */
  const withInvoice = (record: unknown) => {
    authenticatedFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') return ok({ success: true });
      return ok({ success: true, data: record });
    });
    return vi.spyOn(service, 'sendInvoiceEmail')
      .mockResolvedValue({ success: true, message: 'Email sent' });
  };

  it('refuses an invoice that does not exist', async () => {
    const send = withInvoice(null);

    await expect(service.sendScheduledInvoice(1))
      .resolves.toMatchObject({ success: false, message: 'Invoice not found' });
    expect(send).not.toHaveBeenCalled();
  });

  it('refuses an invoice that is already mid-send', async () => {
    // Otherwise a double click delivers the client two copies.
    const send = withInvoice(invoice({ email_status: 'sending' }));

    await expect(service.sendScheduledInvoice(1))
      .resolves.toMatchObject({ success: false, message: 'Invoice is currently being sent' });
    expect(send).not.toHaveBeenCalled();
  });

  it('sends and marks the invoice sent on success', async () => {
    const send = withInvoice(invoice());

    await expect(service.sendScheduledInvoice(1))
      .resolves.toMatchObject({ success: true });
    expect(send).toHaveBeenCalled();
  });

  it('marks a rejected send as failed rather than leaving it sending', async () => {
    const send = withInvoice(invoice());
    send.mockResolvedValue({ success: false, message: 'mailbox full' });

    const result = await service.sendScheduledInvoice(1);

    expect(result).toMatchObject({ success: false, message: 'mailbox full' });
    expect(writtenStatuses().at(-1)).toBe('failed');
  });

  it('reports a thrown error without leaving the invoice sending', async () => {
    const send = withInvoice(invoice());
    send.mockRejectedValue(new Error('smtp refused'));

    const result = await service.sendScheduledInvoice(1);

    expect(result.success).toBe(false);
    expect(writtenStatuses().at(-1)).toBe('failed');
  });
});

describe('getInstance', () => {
  it('shares one service across the app', () => {
    expect(InvoiceService.getInstance()).toBe(InvoiceService.getInstance());
  });
});
