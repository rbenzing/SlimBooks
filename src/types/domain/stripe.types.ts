// Stripe types
//
// These mirror what /api/stripe returns, and nothing else. They deliberately do
// not model Stripe's own objects: the browser never talks to Stripe, so an
// Invoice, Subscription or PaymentIntent shape here would describe data that
// never arrives. The server holds the SDK types.
//
// No type in this file carries a credential. The publishable key is the one
// Stripe value that belongs in the browser.

/**
 * Configuration state, as reported by GET /api/stripe/status.
 *
 * Says whether each credential is present, never what it is.
 */
export interface StripeStatus {
  /** Switched on from the Security settings tab. */
  enabled: boolean;
  /** Both a publishable and a secret key resolve, from settings or .env. */
  configured: boolean;
  /** A webhook signing secret is stored, so payments can be reconciled. */
  webhookConfigured: boolean;
  testMode: boolean;
  publishableKey: string;
}

/**
 * The Stripe account a set of keys belongs to.
 */
export interface StripeAccountSummary {
  id: string;
  display_name: string | null;
  country: string | null;
  default_currency: string | null;
  /** False while Stripe is still verifying the account. */
  charges_enabled: boolean;
}

/**
 * Result of asking the server to call Stripe with the stored keys.
 *
 * `success: false` here means Stripe rejected the keys — the request itself
 * worked.
 */
export interface StripeConnectionTestResult {
  success: boolean;
  message: string;
  account?: StripeAccountSummary;
}

/**
 * A payment link and the invoice it settles.
 */
export interface StripePaymentLink {
  id: string;
  url: string;
  invoice_id: number;
  invoice_number: string;
}
