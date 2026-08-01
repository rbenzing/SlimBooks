// Stripe client service
//
// Every Stripe call is made by the server, which is the only place the secret
// key is ever read. This file is a thin client over /api/stripe and holds no
// credentials of its own: the publishable key is the only Stripe value that
// reaches the browser, and it arrives from the server as part of the status.
//
// The previous version of this file simulated Stripe entirely — it returned a
// fabricated account from testConnection() after a setTimeout, and minted fake
// buy.stripe.com URLs — while holding the secret key in frontend state.

import { authenticatedFetch } from '@/utils/api';
import type {
  StripeStatus,
  StripeConnectionTestResult,
  StripePaymentLink
} from '@/types';

/** Shape every endpoint in this API answers with. */
interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/**
 * Calls an endpoint and unwraps the envelope, turning a failure into a thrown
 * Error carrying the server's own message.
 */
const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await authenticatedFetch(`/api/stripe${path}`, init);
  const payload = await response.json() as ApiEnvelope<T>;

  if (!response.ok || !payload.success || payload.data === undefined) {
    throw new Error(payload.error || payload.message || 'Stripe request failed');
  }

  return payload.data;
};

export class StripeService {
  private static instance: StripeService;

  static getInstance(): StripeService {
    if (!StripeService.instance) {
      StripeService.instance = new StripeService();
    }
    return StripeService.instance;
  }

  /**
   * Whether Stripe is switched on, whether its credentials resolve, and which
   * mode it is in. Reports presence, never values.
   */
  async getStatus(): Promise<StripeStatus> {
    return request<StripeStatus>('/status');
  }

  /**
   * Ask the server to call Stripe with the stored keys.
   *
   * A rejected key is a successful request that answers `success: false` in the
   * result, so only a transport or permission failure throws.
   */
  async testConnection(): Promise<StripeConnectionTestResult> {
    return request<StripeConnectionTestResult>('/test-connection', { method: 'POST' });
  }

  /**
   * The payment link for an invoice, created on first request and reused after
   * that so one invoice never has two live ways to pay it.
   */
  async createPaymentLink(invoiceId: number): Promise<StripePaymentLink> {
    return request<StripePaymentLink>(`/invoices/${invoiceId}/payment-link`, { method: 'POST' });
  }

  /**
   * Take a payment link out of service. The next request for that invoice
   * creates a fresh one.
   */
  async deactivatePaymentLink(linkId: string): Promise<void> {
    const response = await authenticatedFetch(`/api/stripe/payment-links/${linkId}`, {
      method: 'DELETE'
    });
    const payload = await response.json() as ApiEnvelope<never>;

    if (!response.ok || !payload.success) {
      throw new Error(payload.error || payload.message || 'Failed to deactivate payment link');
    }
  }

  /**
   * Whether Stripe can currently take a payment.
   */
  async isConfigured(): Promise<boolean> {
    try {
      const status = await this.getStatus();
      return status.enabled && status.configured;
    } catch {
      return false;
    }
  }

  /**
   * The Stripe dashboard for the mode currently in use.
   */
  async getDashboardUrl(): Promise<string> {
    const baseUrl = 'https://dashboard.stripe.com';

    try {
      const status = await this.getStatus();
      return status.testMode ? `${baseUrl}/test` : baseUrl;
    } catch {
      return baseUrl;
    }
  }
}

export const stripeService = StripeService.getInstance();
