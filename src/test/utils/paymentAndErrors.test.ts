/**
 * Mark-as-paid flow and error surfacing tests.
 *
 * `createPaymentForInvoice` is a two-step write with no transaction: it creates
 * a payment, then flips the invoice to paid. The partial-failure path — payment
 * written, status update rejected — leaves the books inconsistent, so it must
 * report failure rather than a success the user will trust.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { authenticatedFetch } = vi.hoisted(() => ({ authenticatedFetch: vi.fn() }));
const { toastError, toastSuccess, toastWarning, toastInfo } = vi.hoisted(() => ({
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  toastWarning: vi.fn(),
  toastInfo: vi.fn()
}));

vi.mock('@/utils/api', () => ({ authenticatedFetch }));
vi.mock('sonner', () => ({
  toast: { error: toastError, success: toastSuccess, warning: toastWarning, info: toastInfo }
}));

import { createPaymentForInvoice } from '@/utils/payment.util';
import { handleError } from '@/utils/errorHandling.util';
import type { Invoice } from '@/types';

const invoice = {
  id: 2,
  invoice_number: 'INV-002',
  client_name: 'Tech Solutions LLC',
  total_amount: 2700
} as Invoice;

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;

const bodyOf = (call: unknown[]) => JSON.parse((call[1] as RequestInit).body as string);

beforeEach(() => {
  vi.clearAllMocks();
  authenticatedFetch.mockResolvedValue(ok({ success: true }));
});

describe('createPaymentForInvoice', () => {
  it('records the payment and marks the invoice paid', async () => {
    await expect(createPaymentForInvoice(invoice)).resolves.toBe(true);

    const [paymentCall, statusCall] = authenticatedFetch.mock.calls;
    expect(paymentCall[0]).toBe('/api/payments');
    expect(statusCall[0]).toBe('/api/invoices/2/status');
    expect(bodyOf(statusCall)).toEqual({ status: 'paid' });
  });

  it('derives the payment from the invoice', async () => {
    await createPaymentForInvoice(invoice);

    const { paymentData } = bodyOf(authenticatedFetch.mock.calls[0]);
    expect(paymentData).toMatchObject({
      invoice_id: 2,
      amount: 2700,
      client_name: 'Tech Solutions LLC',
      status: 'received',
      reference: 'AUTO-INV-002'
    });
  });

  it('defaults the method to bank transfer and honours an override', async () => {
    await createPaymentForInvoice(invoice);
    expect(bodyOf(authenticatedFetch.mock.calls[0]).paymentData.method).toBe('bank_transfer');

    vi.clearAllMocks();
    authenticatedFetch.mockResolvedValue(ok({ success: true }));
    await createPaymentForInvoice(invoice, 'cash');
    expect(bodyOf(authenticatedFetch.mock.calls[0]).paymentData.method).toBe('cash');
  });

  it('uses the supplied payment date', async () => {
    await createPaymentForInvoice(invoice, 'cash', '2026-07-04');
    expect(bodyOf(authenticatedFetch.mock.calls[0]).paymentData.date).toBe('2026-07-04');
  });

  it('falls back to a placeholder when the invoice has no client name', async () => {
    await createPaymentForInvoice({ ...invoice, client_name: undefined } as Invoice);
    expect(bodyOf(authenticatedFetch.mock.calls[0]).paymentData.client_name).toBe('Unknown Client');
  });

  it('reports failure and does not touch the invoice when the payment is rejected', async () => {
    authenticatedFetch.mockResolvedValueOnce(ok({ success: false, message: 'duplicate reference' }));

    await expect(createPaymentForInvoice(invoice)).resolves.toBe(false);
    expect(authenticatedFetch).toHaveBeenCalledTimes(1);
    expect(toastError).toHaveBeenCalled();
  });

  it('reports failure when the payment saved but the status update did not', async () => {
    // The books are now inconsistent; returning true here would hide that.
    authenticatedFetch
      .mockResolvedValueOnce(ok({ success: true }))
      .mockResolvedValueOnce(ok({ success: false, message: 'locked' }));

    await expect(createPaymentForInvoice(invoice)).resolves.toBe(false);
    expect(toastWarning).toHaveBeenCalled();
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it('reports failure when the network throws', async () => {
    authenticatedFetch.mockRejectedValue(new Error('offline'));

    await expect(createPaymentForInvoice(invoice)).resolves.toBe(false);
    expect(toastError).toHaveBeenCalled();
  });

  it('confirms success to the user only on the happy path', async () => {
    await createPaymentForInvoice(invoice);
    expect(toastSuccess).toHaveBeenCalledWith(expect.stringContaining('INV-002'));
  });
});

describe('handleError', () => {
  it('returns the underlying message and shows it', () => {
    expect(handleError(new Error('boom'))).toBe('boom');
    expect(toastError).toHaveBeenCalledWith('boom');
  });

  it('prefers a user-facing message for the toast but still returns the technical one', () => {
    expect(handleError(new Error('ECONNREFUSED'), { userMessage: 'Cannot reach the server' }))
      .toBe('ECONNREFUSED');
    expect(toastError).toHaveBeenCalledWith('Cannot reach the server');
  });

  it('describes a non-Error throw', () => {
    expect(handleError('just a string')).toBe('An unknown error occurred');
  });

  it('routes each severity to the matching toast', () => {
    handleError(new Error('a'), { severity: 'warning' });
    expect(toastWarning).toHaveBeenCalledWith('a');

    handleError(new Error('b'), { severity: 'info' });
    expect(toastInfo).toHaveBeenCalledWith('b');

    handleError(new Error('c'), { severity: 'critical' });
    expect(toastError).toHaveBeenCalledWith('c');
  });

  it('can stay silent in the console', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    handleError(new Error('quiet'), { logToConsole: false });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
