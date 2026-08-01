// Stripe Service - payment links and webhook reconciliation
//
// This is the only place the Stripe secret key is ever read. It is resolved
// from project settings (or .env as the fallback) at the moment it is needed
// and never returned to a caller, so it cannot reach the browser.
//
// The flow this service implements:
//
//   invoice -> payment link -> the client pays on Stripe's page
//           -> webhook -> payment row -> invoice marked paid
//
// Stripe delivers each webhook at least once and retries until it gets a 2xx,
// so every write below has to be safe to run twice.

import Stripe from 'stripe';
import { databaseService } from '../core/DatabaseService.js';
import { settingsService, type StripeCredentials } from './SettingsService.js';
import { paymentService } from './PaymentService.js';
import { type Invoice } from '../types/index.js';

/**
 * Raised when Stripe is asked to do something before it has been configured.
 * The controller turns this into a 400 rather than a 500 — it is a
 * configuration problem, not a server fault.
 */
export class StripeNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StripeNotConfiguredError';
  }
}

/** What the settings screen is allowed to know. No credentials. */
export interface StripeStatus {
  enabled: boolean;
  configured: boolean;
  webhookConfigured: boolean;
  testMode: boolean;
  publishableKey: string;
}

export interface StripeAccountSummary {
  id: string;
  display_name: string | null;
  country: string | null;
  default_currency: string | null;
  charges_enabled: boolean;
}

export interface StripeConnectionTestResult {
  success: boolean;
  message: string;
  account?: StripeAccountSummary;
}

export interface StripePaymentLinkSummary {
  id: string;
  url: string;
  invoice_id: number;
  invoice_number: string;
}

export interface StripeWebhookOutcome {
  received: true;
  type: string;
  /** False when the event is one we deliberately ignore. */
  handled: boolean;
  invoice_id?: number;
  payment_id?: number;
}

/**
 * Currencies Stripe expects without a fractional part.
 *
 * Amounts everywhere else in Stripe's API are in the smallest currency unit, so
 * $10.00 is 1000 — but ¥1000 is 1000, not 100000. Sending the wrong one
 * overcharges by a hundredfold, so it is worth spelling out.
 *
 * https://docs.stripe.com/currencies#zero-decimal
 */
const ZERO_DECIMAL_CURRENCIES = new Set([
  'bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf', 'krw', 'mga',
  'pyg', 'rwf', 'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf'
]);

/** Converts a decimal amount to the smallest unit of its currency. */
export const toStripeAmount = (amount: number, currency: string): number => {
  const factor = ZERO_DECIMAL_CURRENCIES.has(currency.toLowerCase()) ? 1 : 100;
  return Math.round(amount * factor);
};

/** Converts a Stripe amount back to the decimal amount we store. */
export const fromStripeAmount = (amount: number, currency: string): number => {
  const factor = ZERO_DECIMAL_CURRENCIES.has(currency.toLowerCase()) ? 1 : 100;
  return amount / factor;
};

/**
 * Today as a `yyyy-MM-dd` calendar day in the server's timezone.
 *
 * Not `toISOString().split('T')[0]`, which renders the UTC day: a payment taken
 * at 19:00 in New York would be filed under tomorrow's date, and land in the
 * wrong month on every report that groups by it.
 */
const todayAsCalendarDay = (): string => {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
};

/**
 * Stripe Service
 */
export class StripeService {
  /**
   * Clients are cached per secret key rather than per process: an admin can
   * change the key in the settings screen without a restart, and the next call
   * has to use the new one.
   */
  private client: Stripe | null = null;
  private clientSecretKey = '';

  /** Resolved fresh each time so settings changes take effect immediately. */
  private getCredentials(): StripeCredentials {
    return settingsService.getStripeCredentials();
  }

  /**
   * An SDK client, or an explanation of what is missing.
   */
  private getClient(): Stripe {
    const { enabled, configured, secretKey } = this.getCredentials();

    if (!enabled) {
      throw new StripeNotConfiguredError('Stripe is not enabled');
    }
    if (!configured || !secretKey) {
      throw new StripeNotConfiguredError(
        'Stripe is not configured - set a secret key in Settings, or STRIPE_SECRET_KEY in .env'
      );
    }

    if (!this.client || this.clientSecretKey !== secretKey) {
      this.client = new Stripe(secretKey);
      this.clientSecretKey = secretKey;
    }

    return this.client;
  }

  /**
   * Configuration state for the settings screen.
   */
  getStatus(): StripeStatus {
    const credentials = this.getCredentials();

    return {
      enabled: credentials.enabled,
      configured: credentials.configured,
      webhookConfigured: !!credentials.webhookSecret,
      testMode: credentials.testMode,
      publishableKey: credentials.publishableKey
    };
  }

  /**
   * Verify the stored keys against Stripe by fetching the account they belong
   * to. This is the real call — a key that is well-formed but revoked fails
   * here, which is the whole point of a connection test.
   */
  async testConnection(): Promise<StripeConnectionTestResult> {
    let stripe: Stripe;
    try {
      stripe = this.getClient();
    } catch (error) {
      return { success: false, message: (error as Error).message };
    }

    try {
      // `null` means "the account these keys belong to" — the point of the test.
      const account = await stripe.accounts.retrieve(null);

      return {
        success: true,
        message: 'Stripe connection successful',
        account: {
          id: account.id,
          display_name: account.settings?.dashboard?.display_name ?? account.business_profile?.name ?? null,
          country: account.country ?? null,
          default_currency: account.default_currency ?? null,
          charges_enabled: account.charges_enabled ?? false
        }
      };
    } catch (error) {
      return {
        success: false,
        message: this.describeError(error)
      };
    }
  }

  /**
   * Create — or return — the payment link for an invoice.
   *
   * Minting a second link for an invoice that already has one would leave two
   * live ways to pay the same bill, so a stored link is handed back as-is.
   */
  async createPaymentLinkForInvoice(invoiceId: number): Promise<StripePaymentLinkSummary> {
    if (!invoiceId || typeof invoiceId !== 'number') {
      throw new Error('Valid invoice ID is required');
    }

    const stripe = this.getClient();
    const invoice = databaseService.getOne<Invoice>(
      'SELECT * FROM invoices WHERE id = ? AND deleted_at IS NULL',
      [invoiceId]
    );

    if (!invoice) {
      throw new Error('Invoice not found');
    }
    if (invoice.status === 'paid') {
      throw new Error('Invoice is already paid');
    }

    if (invoice.stripe_payment_link_id && invoice.stripe_payment_link_url) {
      return {
        id: invoice.stripe_payment_link_id,
        url: invoice.stripe_payment_link_url,
        invoice_id: invoice.id,
        invoice_number: invoice.invoice_number
      };
    }

    const amount = invoice.total_amount || invoice.amount;
    if (!amount || amount <= 0) {
      throw new Error('Invoice amount must be greater than zero to collect payment');
    }

    const currency = (invoice.currency || 'USD').toLowerCase();

    // Payment links take a Price, not an inline amount, so the price and its
    // product are created first. `product_data` keeps that to one round trip.
    const price = await stripe.prices.create({
      currency,
      unit_amount: toStripeAmount(amount, currency),
      product_data: { name: `Invoice ${invoice.invoice_number}` }
    });

    // The metadata is the reconciliation key. It is set in both places on
    // purpose: `metadata` reaches the checkout session, and
    // `payment_intent_data.metadata` reaches the payment intent, so whichever
    // event arrives first can find its way back to this invoice.
    const metadata = {
      invoice_id: String(invoice.id),
      invoice_number: invoice.invoice_number
    };

    const paymentLink = await stripe.paymentLinks.create({
      line_items: [{ price: price.id, quantity: 1 }],
      metadata,
      payment_intent_data: { metadata }
    });

    databaseService.executeQuery(`
      UPDATE invoices
      SET stripe_payment_link_id = ?, stripe_payment_link_url = ?, updated_at = datetime('now')
      WHERE id = ?
    `, [paymentLink.id, paymentLink.url, invoice.id]);

    return {
      id: paymentLink.id,
      url: paymentLink.url,
      invoice_id: invoice.id,
      invoice_number: invoice.invoice_number
    };
  }

  /**
   * Take a payment link out of service and forget it, so the next request for
   * this invoice mints a fresh one.
   */
  async deactivatePaymentLink(linkId: string): Promise<void> {
    if (!linkId || typeof linkId !== 'string') {
      throw new Error('Valid payment link ID is required');
    }

    const stripe = this.getClient();
    await stripe.paymentLinks.update(linkId, { active: false });

    databaseService.executeQuery(`
      UPDATE invoices
      SET stripe_payment_link_id = NULL, stripe_payment_link_url = NULL, updated_at = datetime('now')
      WHERE stripe_payment_link_id = ?
    `, [linkId]);
  }

  /**
   * Verify and process a webhook delivery.
   *
   * The signature is checked against the raw request body — not a re-serialised
   * copy of it, which would not match the bytes Stripe signed. An unverified
   * body is refused outright: this endpoint is public, and without the check
   * anyone could post a payment into the ledger.
   */
  async handleWebhook(rawBody: Buffer | string, signature: string): Promise<StripeWebhookOutcome> {
    const { webhookSecret } = this.getCredentials();

    if (!webhookSecret) {
      throw new StripeNotConfiguredError(
        'Webhook signing secret is not configured - set it in Settings, or STRIPE_WEBHOOK_SECRET in .env'
      );
    }
    if (!signature) {
      throw new Error('Missing stripe-signature header');
    }

    const stripe = this.getClient();
    const event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        if (session.payment_status !== 'paid') {
          return { received: true, type: event.type, handled: false };
        }
        return this.reconcileCheckoutSession(session, event.type);
      }

      case 'payment_intent.succeeded':
        return this.reconcilePaymentIntent(event.data.object, event.type);

      default:
        // Acknowledged and ignored. Returning an error for an event we do not
        // care about would make Stripe retry it for days.
        return { received: true, type: event.type, handled: false };
    }
  }

  /**
   * Book a completed checkout.
   */
  private async reconcileCheckoutSession(
    session: Stripe.Checkout.Session,
    eventType: string
  ): Promise<StripeWebhookOutcome> {
    const invoice = this.findInvoiceForSession(session);
    if (!invoice) {
      return { received: true, type: eventType, handled: false };
    }

    const currency = session.currency || invoice.currency || 'usd';
    const amount = session.amount_total !== null && session.amount_total !== undefined
      ? fromStripeAmount(session.amount_total, currency)
      : (invoice.total_amount || invoice.amount);

    const paymentIntentId = typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent?.id ?? null;

    // The session id is the idempotency key rather than the payment intent:
    // it is present on this event even when the intent is still expanding.
    const paymentId = await this.recordPayment({
      invoice,
      amount,
      stripePaymentId: session.id,
      reference: paymentIntentId ?? session.id
    });

    databaseService.executeQuery(`
      UPDATE invoices
      SET stripe_checkout_session_id = ?,
          stripe_payment_intent_id = COALESCE(?, stripe_payment_intent_id),
          updated_at = datetime('now')
      WHERE id = ?
    `, [session.id, paymentIntentId, invoice.id]);

    this.markInvoicePaid(invoice.id);

    return {
      received: true,
      type: eventType,
      handled: true,
      invoice_id: invoice.id,
      ...(paymentId !== null && { payment_id: paymentId })
    };
  }

  /**
   * Book a succeeded payment intent.
   *
   * A checkout normally raises both this and `checkout.session.completed`; the
   * duplicate is absorbed by `recordPayment`, which refuses to write a second
   * payment for an invoice that Stripe has already settled.
   */
  private async reconcilePaymentIntent(
    paymentIntent: Stripe.PaymentIntent,
    eventType: string
  ): Promise<StripeWebhookOutcome> {
    const invoice = this.findInvoiceByMetadata(paymentIntent.metadata)
      ?? this.findInvoiceByColumn('stripe_payment_intent_id', paymentIntent.id);

    if (!invoice) {
      return { received: true, type: eventType, handled: false };
    }

    const currency = paymentIntent.currency || invoice.currency || 'usd';
    const paymentId = await this.recordPayment({
      invoice,
      amount: fromStripeAmount(paymentIntent.amount_received || paymentIntent.amount, currency),
      stripePaymentId: paymentIntent.id,
      reference: paymentIntent.id
    });

    databaseService.executeQuery(`
      UPDATE invoices
      SET stripe_payment_intent_id = ?, updated_at = datetime('now')
      WHERE id = ?
    `, [paymentIntent.id, invoice.id]);

    this.markInvoicePaid(invoice.id);

    return {
      received: true,
      type: eventType,
      handled: true,
      invoice_id: invoice.id,
      ...(paymentId !== null && { payment_id: paymentId })
    };
  }

  /**
   * Write the payment row, unless this money is already in the ledger.
   *
   * Two guards, because there are two ways the same payment arrives twice:
   * Stripe redelivering one event (same id), and a checkout raising both a
   * session and an intent event (different ids, one payment).
   *
   * Returns null when nothing was written.
   */
  private async recordPayment(args: {
    invoice: Invoice;
    amount: number;
    stripePaymentId: string;
    reference: string;
  }): Promise<number | null> {
    const { invoice, amount, stripePaymentId, reference } = args;

    const alreadyRecorded = databaseService.getOne<{ id: number }>(
      'SELECT id FROM payments WHERE stripe_payment_id = ? AND deleted_at IS NULL',
      [stripePaymentId]
    );
    if (alreadyRecorded) {
      return null;
    }

    const settledByAnotherEvent = databaseService.getOne<{ id: number }>(
      `SELECT id FROM payments
       WHERE invoice_id = ? AND method = 'stripe' AND status = 'received' AND deleted_at IS NULL`,
      [invoice.id]
    );
    if (settledByAnotherEvent) {
      return null;
    }

    if (!amount || amount <= 0) {
      return null;
    }

    return paymentService.createPayment({
      date: todayAsCalendarDay(),
      client_name: invoice.client_name || 'Unknown',
      invoice_id: invoice.id,
      amount,
      method: 'stripe',
      status: 'received',
      reference,
      description: `Stripe payment for invoice ${invoice.invoice_number}`,
      stripe_payment_id: stripePaymentId
    });
  }

  /**
   * Mark the invoice paid, leaving an already-paid invoice alone so a redelivered
   * event does not move `paid_date` forward.
   */
  private markInvoicePaid(invoiceId: number): void {
    databaseService.executeQuery(`
      UPDATE invoices
      SET status = 'paid', paid_date = COALESCE(paid_date, date('now')), updated_at = datetime('now')
      WHERE id = ? AND status != 'paid'
    `, [invoiceId]);
  }

  /**
   * Find the invoice a checkout belongs to, most reliable route first.
   */
  private findInvoiceForSession(session: Stripe.Checkout.Session): Invoice | null {
    const paymentLinkId = typeof session.payment_link === 'string'
      ? session.payment_link
      : session.payment_link?.id;

    return this.findInvoiceByMetadata(session.metadata)
      ?? (paymentLinkId ? this.findInvoiceByColumn('stripe_payment_link_id', paymentLinkId) : null)
      ?? this.findInvoiceByColumn('stripe_checkout_session_id', session.id);
  }

  private findInvoiceByMetadata(metadata: Stripe.Metadata | null | undefined): Invoice | null {
    const invoiceId = Number(metadata?.invoice_id);
    if (!Number.isInteger(invoiceId) || invoiceId <= 0) {
      return null;
    }

    return databaseService.getOne<Invoice>(
      'SELECT * FROM invoices WHERE id = ? AND deleted_at IS NULL',
      [invoiceId]
    );
  }

  private findInvoiceByColumn(column: string, value: string): Invoice | null {
    if (!value) return null;

    return databaseService.getOne<Invoice>(
      `SELECT * FROM invoices WHERE ${column} = ? AND deleted_at IS NULL`,
      [value]
    );
  }

  /**
   * Stripe's own message where there is one, since it says far more than
   * "request failed" — a revoked key, a wrong mode, an amount below the
   * minimum all read differently.
   */
  private describeError(error: unknown): string {
    if (error instanceof Stripe.errors.StripeError) {
      return error.message;
    }
    return (error as Error)?.message || 'Stripe request failed';
  }
}

export const stripeService = new StripeService();
