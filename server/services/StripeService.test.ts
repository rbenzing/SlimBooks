/**
 * StripeService tests.
 *
 * The Stripe SDK is mocked throughout: these tests assert the shape of what we
 * ask Stripe for and what we do with what it sends back. No network, no keys.
 *
 * Three things here have real teeth:
 *
 *  - Amounts. Stripe wants the smallest currency unit, and getting the factor
 *    wrong overcharges by a hundredfold.
 *  - Signature verification. The webhook endpoint is public, so an unverified
 *    body must never reach the ledger.
 *  - Idempotency. Stripe retries an event until it is acknowledged, and one
 *    checkout raises two events we both act on, so a payment must not book
 *    twice.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createDatabaseMock, flattenSql } from './databaseMock.test-helper.js';

const db = createDatabaseMock();
vi.mock('../core/DatabaseService.js', () => ({ databaseService: db }));

const createPayment = vi.fn(async () => 42);
vi.mock('./PaymentService.js', () => ({ paymentService: { createPayment } }));

const getStripeCredentials = vi.fn();
vi.mock('./SettingsService.js', () => ({ settingsService: { getStripeCredentials } }));

/** The SDK surface this service touches. */
const stripeApi = {
  accounts: { retrieve: vi.fn() },
  prices: { create: vi.fn() },
  paymentLinks: { create: vi.fn(), update: vi.fn() },
  webhooks: { constructEvent: vi.fn() }
};

class MockStripeError extends Error {}

const StripeConstructor = vi.fn(() => stripeApi);

vi.mock('stripe', () => {
  const Stripe = function (this: unknown, ...args: unknown[]) {
    return StripeConstructor(...args);
  } as unknown as { new (...args: unknown[]): unknown; errors: { StripeError: typeof MockStripeError } };
  Stripe.errors = { StripeError: MockStripeError };
  return { default: Stripe };
});

const { stripeService, StripeNotConfiguredError, toStripeAmount, fromStripeAmount } =
  await import('./StripeService.js');

const configured = (overrides: Record<string, unknown> = {}) => ({
  enabled: true,
  testMode: true,
  secretKey: 'sk_test_key',
  publishableKey: 'pk_test_key',
  webhookSecret: 'whsec_test',
  configured: true,
  ...overrides
});

const anInvoice = (overrides: Record<string, unknown> = {}) => ({
  id: 7,
  invoice_number: 'INV-0007',
  client_id: 3,
  client_name: 'Acme Ltd',
  amount: 100,
  tax_amount: 0,
  total_amount: 120,
  currency: 'USD',
  status: 'sent',
  due_date: '2026-08-31',
  issue_date: '2026-08-01',
  type: 'one-time',
  created_at: '2026-08-01',
  updated_at: '2026-08-01',
  ...overrides
});

beforeEach(() => {
  db.reset();
  createPayment.mockClear();
  createPayment.mockResolvedValue(42);
  StripeConstructor.mockClear();
  StripeConstructor.mockReturnValue(stripeApi);
  Object.values(stripeApi).forEach(resource =>
    Object.values(resource).forEach(fn => fn.mockReset())
  );
  getStripeCredentials.mockReturnValue(configured());
});

afterEach(() => vi.restoreAllMocks());

describe('currency amounts', () => {
  it('converts a decimal currency to cents', () => {
    expect(toStripeAmount(120.5, 'usd')).toBe(12050);
  });

  it('leaves a zero-decimal currency alone', () => {
    // ¥1000 is 1000, not 100000. Multiplying here would charge a hundred times
    // the invoice.
    expect(toStripeAmount(1000, 'jpy')).toBe(1000);
  });

  it('recognises a zero-decimal currency whatever the case', () => {
    expect(toStripeAmount(1000, 'JPY')).toBe(1000);
  });

  it('rounds rather than truncating a fractional cent', () => {
    expect(toStripeAmount(0.615, 'usd')).toBe(62);
  });

  it('round-trips back to the stored amount', () => {
    expect(fromStripeAmount(12050, 'usd')).toBe(120.5);
    expect(fromStripeAmount(1000, 'jpy')).toBe(1000);
  });
});

describe('getStatus', () => {
  it('reports configuration without disclosing any credential', async () => {
    const status = await stripeService.getStatus();

    expect(JSON.stringify(status)).not.toMatch(/sk_test_key|whsec_test/);
  });

  it('reports the publishable key, which belongs in the browser', async () => {
    expect((await stripeService.getStatus()).publishableKey).toBe('pk_test_key');
  });

  it('reports the webhook as unconfigured when no secret is stored', async () => {
    getStripeCredentials.mockReturnValue(configured({ webhookSecret: '' }));

    expect((await stripeService.getStatus()).webhookConfigured).toBe(false);
  });
});

describe('testConnection', () => {
  it('asks Stripe for the account the keys belong to', async () => {
    stripeApi.accounts.retrieve.mockResolvedValue({
      id: 'acct_1', country: 'US', default_currency: 'usd', charges_enabled: true,
      settings: { dashboard: { display_name: 'Acme' } }
    });

    const result = await stripeService.testConnection();

    expect(stripeApi.accounts.retrieve).toHaveBeenCalledWith(null);
    expect(result.success).toBe(true);
    expect(result.account?.display_name).toBe('Acme');
  });

  it('falls back to the business profile name when no dashboard name is set', async () => {
    stripeApi.accounts.retrieve.mockResolvedValue({
      id: 'acct_1', charges_enabled: true, business_profile: { name: 'Acme Trading' }
    });

    const result = await stripeService.testConnection();

    expect(result.account?.display_name).toBe('Acme Trading');
  });

  it('reports a rejected key as a failed test rather than throwing', async () => {
    // A revoked key is the case this test exists for, so it has to come back as
    // an answer the settings screen can show.
    stripeApi.accounts.retrieve.mockRejectedValue(new MockStripeError('Invalid API Key provided'));

    const result = await stripeService.testConnection();

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/invalid api key/i);
  });

  it('explains that Stripe is switched off instead of calling it', async () => {
    getStripeCredentials.mockReturnValue(configured({ enabled: false }));

    const result = await stripeService.testConnection();

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/not enabled/i);
    expect(stripeApi.accounts.retrieve).not.toHaveBeenCalled();
  });

  it('names the missing setting when no key is stored', async () => {
    getStripeCredentials.mockReturnValue(configured({ secretKey: '', configured: false }));

    const result = await stripeService.testConnection();

    expect(result.message).toMatch(/STRIPE_SECRET_KEY/);
  });
});

describe('client construction', () => {
  it('builds the client with the resolved secret key', async () => {
    // A key this test alone uses, because the service caches its client and
    // would otherwise reuse the one an earlier test built.
    getStripeCredentials.mockReturnValue(configured({ secretKey: 'sk_test_first' }));
    stripeApi.accounts.retrieve.mockResolvedValue({ id: 'acct_1', charges_enabled: true });

    await stripeService.testConnection();

    expect(StripeConstructor).toHaveBeenCalledWith('sk_test_first');
  });

  it('rebuilds the client when the key changes, so a saved key takes effect', async () => {
    stripeApi.accounts.retrieve.mockResolvedValue({ id: 'acct_1', charges_enabled: true });
    await stripeService.testConnection();

    getStripeCredentials.mockReturnValue(configured({ secretKey: 'sk_test_rotated' }));
    await stripeService.testConnection();

    expect(StripeConstructor).toHaveBeenLastCalledWith('sk_test_rotated');
  });

  it('reuses the client while the key is unchanged', async () => {
    getStripeCredentials.mockReturnValue(configured({ secretKey: 'sk_test_stable' }));
    stripeApi.accounts.retrieve.mockResolvedValue({ id: 'acct_1', charges_enabled: true });

    await stripeService.testConnection();
    StripeConstructor.mockClear();
    await stripeService.testConnection();

    expect(StripeConstructor).not.toHaveBeenCalled();
  });
});

describe('createPaymentLinkForInvoice', () => {
  const aLink = { id: 'plink_1', url: 'https://buy.stripe.com/test_1' };

  beforeEach(() => {
    db.getOne.mockReturnValue(anInvoice());
    stripeApi.prices.create.mockResolvedValue({ id: 'price_1' });
    stripeApi.paymentLinks.create.mockResolvedValue(aLink);
  });

  it('prices the invoice in the smallest currency unit', async () => {
    await stripeService.createPaymentLinkForInvoice(7);

    expect(stripeApi.prices.create).toHaveBeenCalledWith(expect.objectContaining({
      currency: 'usd',
      unit_amount: 12000
    }));
  });

  it('charges the total, not the pre-tax amount', async () => {
    db.getOne.mockReturnValue(anInvoice({ amount: 100, tax_amount: 20, total_amount: 120 }));

    await stripeService.createPaymentLinkForInvoice(7);

    expect(stripeApi.prices.create.mock.calls[0][0].unit_amount).toBe(12000);
  });

  it('falls back to the net amount when no total is stored', async () => {
    db.getOne.mockReturnValue(anInvoice({ total_amount: 0, amount: 45 }));

    await stripeService.createPaymentLinkForInvoice(7);

    expect(stripeApi.prices.create.mock.calls[0][0].unit_amount).toBe(4500);
  });

  it('carries the invoice id in metadata, which is how the payment finds its way back', async () => {
    await stripeService.createPaymentLinkForInvoice(7);

    const params = stripeApi.paymentLinks.create.mock.calls[0][0];
    expect(params.metadata).toEqual({ invoice_id: '7', invoice_number: 'INV-0007' });
    expect(params.payment_intent_data.metadata).toEqual(params.metadata);
  });

  it('stores the link on the invoice', async () => {
    await stripeService.createPaymentLinkForInvoice(7);

    const update = db.queries.find(q => flattenSql(q.sql).includes('stripe_payment_link_id = ?'));
    expect(update?.params).toEqual(['plink_1', 'https://buy.stripe.com/test_1', 7]);
  });

  it('returns the existing link rather than minting a second way to pay', async () => {
    db.getOne.mockReturnValue(anInvoice({
      stripe_payment_link_id: 'plink_existing',
      stripe_payment_link_url: 'https://buy.stripe.com/existing'
    }));

    const result = await stripeService.createPaymentLinkForInvoice(7);

    expect(result.id).toBe('plink_existing');
    expect(stripeApi.paymentLinks.create).not.toHaveBeenCalled();
  });

  it('refuses an invoice that is already paid', async () => {
    db.getOne.mockReturnValue(anInvoice({ status: 'paid' }));

    await expect(stripeService.createPaymentLinkForInvoice(7)).rejects.toThrow(/already paid/i);
  });

  it('refuses a zero-value invoice, which Stripe cannot charge for', async () => {
    db.getOne.mockReturnValue(anInvoice({ amount: 0, total_amount: 0 }));

    await expect(stripeService.createPaymentLinkForInvoice(7)).rejects.toThrow(/greater than zero/i);
  });

  it('reports a missing invoice', async () => {
    db.getOne.mockReturnValue(undefined);

    await expect(stripeService.createPaymentLinkForInvoice(7)).rejects.toThrow(/not found/i);
  });

  it('excludes soft-deleted invoices', async () => {
    await stripeService.createPaymentLinkForInvoice(7);

    expect(flattenSql(db.getOne.mock.calls[0][0])).toContain('deleted_at IS NULL');
  });

  it('refuses before calling Stripe when the integration is off', async () => {
    getStripeCredentials.mockReturnValue(configured({ enabled: false }));

    await expect(stripeService.createPaymentLinkForInvoice(7))
      .rejects.toBeInstanceOf(StripeNotConfiguredError);
    expect(stripeApi.prices.create).not.toHaveBeenCalled();
  });

  it('rejects a nonsense invoice id', async () => {
    await expect(stripeService.createPaymentLinkForInvoice(0)).rejects.toThrow(/valid invoice id/i);
  });
});

describe('deactivatePaymentLink', () => {
  it('deactivates at Stripe and forgets the link locally', async () => {
    stripeApi.paymentLinks.update.mockResolvedValue({ id: 'plink_1', active: false });

    await stripeService.deactivatePaymentLink('plink_1');

    expect(stripeApi.paymentLinks.update).toHaveBeenCalledWith('plink_1', { active: false });
    const cleared = db.queries.find(q => flattenSql(q.sql).includes('stripe_payment_link_id = NULL'));
    expect(cleared?.params).toEqual(['plink_1']);
  });

  it('rejects an empty link id', async () => {
    await expect(stripeService.deactivatePaymentLink('')).rejects.toThrow(/valid payment link id/i);
  });
});

describe('webhook verification', () => {
  it('verifies the signature against the raw body and the stored secret', async () => {
    stripeApi.webhooks.constructEvent.mockReturnValue({ type: 'customer.created', data: { object: {} } });
    const rawBody = Buffer.from('{"id":"evt_1"}');

    await stripeService.handleWebhook(rawBody, 'sig_header');

    expect(stripeApi.webhooks.constructEvent).toHaveBeenCalledWith(rawBody, 'sig_header', 'whsec_test');
  });

  it('refuses a body whose signature does not verify', async () => {
    // This endpoint is public. Without this check, anyone could post a payment
    // into the ledger.
    stripeApi.webhooks.constructEvent.mockImplementation(() => {
      throw new MockStripeError('No signatures found matching the expected signature');
    });

    await expect(stripeService.handleWebhook(Buffer.from('{}'), 'forged'))
      .rejects.toThrow(/no signatures found/i);
  });

  it('writes nothing when the signature fails', async () => {
    stripeApi.webhooks.constructEvent.mockImplementation(() => {
      throw new MockStripeError('bad signature');
    });

    await stripeService.handleWebhook(Buffer.from('{}'), 'forged').catch(() => undefined);

    expect(db.queries).toHaveLength(0);
    expect(createPayment).not.toHaveBeenCalled();
  });

  it('refuses to process anything when no signing secret is configured', async () => {
    getStripeCredentials.mockReturnValue(configured({ webhookSecret: '' }));

    await expect(stripeService.handleWebhook(Buffer.from('{}'), 'sig'))
      .rejects.toBeInstanceOf(StripeNotConfiguredError);
    expect(stripeApi.webhooks.constructEvent).not.toHaveBeenCalled();
  });

  it('refuses a request with no signature header', async () => {
    await expect(stripeService.handleWebhook(Buffer.from('{}'), ''))
      .rejects.toThrow(/missing stripe-signature/i);
  });

  it('acknowledges an event it does not act on', async () => {
    // Returning an error for an uninteresting event would make Stripe retry it
    // for days.
    stripeApi.webhooks.constructEvent.mockReturnValue({
      type: 'customer.subscription.created', data: { object: {} }
    });

    const outcome = await stripeService.handleWebhook(Buffer.from('{}'), 'sig');

    expect(outcome).toEqual({ received: true, type: 'customer.subscription.created', handled: false });
  });
});

describe('checkout reconciliation', () => {
  const aSession = (overrides: Record<string, unknown> = {}) => ({
    id: 'cs_1',
    payment_status: 'paid',
    amount_total: 12000,
    currency: 'usd',
    payment_intent: 'pi_1',
    payment_link: 'plink_1',
    metadata: { invoice_id: '7', invoice_number: 'INV-0007' },
    ...overrides
  });

  const givenSession = (session: Record<string, unknown>) => {
    stripeApi.webhooks.constructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      data: { object: session }
    });
  };

  beforeEach(() => {
    givenSession(aSession());
    // Invoice lookup succeeds; the two idempotency probes find nothing.
    db.getOne.mockImplementation((sql: string) =>
      flattenSql(sql).startsWith('SELECT * FROM invoices') ? anInvoice() : undefined
    );
  });

  it('books the payment against the invoice', async () => {
    await stripeService.handleWebhook(Buffer.from('{}'), 'sig');

    expect(createPayment).toHaveBeenCalledWith(expect.objectContaining({
      invoice_id: 7,
      amount: 120,
      method: 'stripe',
      status: 'received',
      client_name: 'Acme Ltd'
    }));
  });

  it('converts the Stripe amount back out of cents', async () => {
    givenSession(aSession({ amount_total: 4599 }));

    await stripeService.handleWebhook(Buffer.from('{}'), 'sig');

    expect(createPayment.mock.calls[0][0].amount).toBe(45.99);
  });

  it('records the Stripe id, which is what makes a retry harmless', async () => {
    await stripeService.handleWebhook(Buffer.from('{}'), 'sig');

    expect(createPayment.mock.calls[0][0].stripe_payment_id).toBe('cs_1');
  });

  it('dates the payment as a local calendar day, not a UTC one', async () => {
    await stripeService.handleWebhook(Buffer.from('{}'), 'sig');

    const now = new Date();
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    expect(createPayment.mock.calls[0][0].date).toBe(expected);
  });

  it('marks the invoice paid', async () => {
    await stripeService.handleWebhook(Buffer.from('{}'), 'sig');

    const update = db.queries.find(q => flattenSql(q.sql).includes("SET status = 'paid'"));
    expect(update?.params).toEqual([7]);
  });

  it('leaves an already-paid invoice alone so paid_date does not move', async () => {
    await stripeService.handleWebhook(Buffer.from('{}'), 'sig');

    const update = db.queries.find(q => flattenSql(q.sql).includes("SET status = 'paid'"));
    expect(flattenSql(update?.sql ?? '')).toContain("status != 'paid'");
  });

  it('stores the session and payment intent on the invoice', async () => {
    await stripeService.handleWebhook(Buffer.from('{}'), 'sig');

    const update = db.queries.find(q => flattenSql(q.sql).includes('stripe_checkout_session_id = ?'));
    expect(update?.params).toEqual(['cs_1', 'pi_1', 7]);
  });

  it('ignores a session that has not actually been paid', async () => {
    givenSession(aSession({ payment_status: 'unpaid' }));

    const outcome = await stripeService.handleWebhook(Buffer.from('{}'), 'sig');

    expect(outcome.handled).toBe(false);
    expect(createPayment).not.toHaveBeenCalled();
  });

  it('does not book the same event twice when Stripe redelivers it', async () => {
    db.getOne.mockImplementation((sql: string) => {
      const query = flattenSql(sql);
      if (query.startsWith('SELECT * FROM invoices')) return anInvoice();
      if (query.includes('stripe_payment_id = ?')) return { id: 99 };
      return undefined;
    });

    await stripeService.handleWebhook(Buffer.from('{}'), 'sig');

    expect(createPayment).not.toHaveBeenCalled();
  });

  it('still marks the invoice paid on a redelivery, in case the first attempt half-finished', async () => {
    db.getOne.mockImplementation((sql: string) => {
      const query = flattenSql(sql);
      if (query.startsWith('SELECT * FROM invoices')) return anInvoice();
      if (query.includes('stripe_payment_id = ?')) return { id: 99 };
      return undefined;
    });

    await stripeService.handleWebhook(Buffer.from('{}'), 'sig');

    expect(db.queries.some(q => flattenSql(q.sql).includes("SET status = 'paid'"))).toBe(true);
  });

  it('does not book a second payment for an invoice Stripe already settled', async () => {
    // One checkout raises both checkout.session.completed and
    // payment_intent.succeeded, under different ids.
    db.getOne.mockImplementation((sql: string) => {
      const query = flattenSql(sql);
      if (query.startsWith('SELECT * FROM invoices')) return anInvoice();
      if (query.includes("method = 'stripe'")) return { id: 99 };
      return undefined;
    });

    await stripeService.handleWebhook(Buffer.from('{}'), 'sig');

    expect(createPayment).not.toHaveBeenCalled();
  });

  it('finds the invoice by payment link when metadata is missing', async () => {
    givenSession(aSession({ metadata: {} }));
    const lookups: unknown[][] = [];
    db.getOne.mockImplementation((sql: string, params: unknown[]) => {
      lookups.push([flattenSql(sql), params]);
      return flattenSql(sql).includes('stripe_payment_link_id = ?') ? anInvoice() : undefined;
    });

    await stripeService.handleWebhook(Buffer.from('{}'), 'sig');

    expect(lookups.some(([sql, params]) =>
      String(sql).includes('stripe_payment_link_id = ?') && (params as unknown[])[0] === 'plink_1'
    )).toBe(true);
    expect(createPayment).toHaveBeenCalled();
  });

  it('acknowledges a payment for an invoice that no longer exists', async () => {
    // Retrying forever cannot conjure the invoice back.
    db.getOne.mockReturnValue(undefined);

    const outcome = await stripeService.handleWebhook(Buffer.from('{}'), 'sig');

    expect(outcome).toMatchObject({ received: true, handled: false });
    expect(createPayment).not.toHaveBeenCalled();
  });

  it('ignores a metadata invoice id that is not a number', async () => {
    givenSession(aSession({ metadata: { invoice_id: 'not-an-id' }, payment_link: null }));
    db.getOne.mockReturnValue(undefined);

    const outcome = await stripeService.handleWebhook(Buffer.from('{}'), 'sig');

    expect(outcome.handled).toBe(false);
  });
});

describe('payment intent reconciliation', () => {
  const givenIntent = (intent: Record<string, unknown>) => {
    stripeApi.webhooks.constructEvent.mockReturnValue({
      type: 'payment_intent.succeeded',
      data: { object: intent }
    });
  };

  beforeEach(() => {
    givenIntent({
      id: 'pi_1',
      amount: 12000,
      amount_received: 12000,
      currency: 'usd',
      metadata: { invoice_id: '7' }
    });
    db.getOne.mockImplementation((sql: string) =>
      flattenSql(sql).startsWith('SELECT * FROM invoices') ? anInvoice() : undefined
    );
  });

  it('books the payment against the invoice named in metadata', async () => {
    const outcome = await stripeService.handleWebhook(Buffer.from('{}'), 'sig');

    expect(outcome).toMatchObject({ handled: true, invoice_id: 7, payment_id: 42 });
    expect(createPayment.mock.calls[0][0].stripe_payment_id).toBe('pi_1');
  });

  it('prefers the amount actually received', async () => {
    givenIntent({
      id: 'pi_1', amount: 12000, amount_received: 5000, currency: 'usd',
      metadata: { invoice_id: '7' }
    });

    await stripeService.handleWebhook(Buffer.from('{}'), 'sig');

    expect(createPayment.mock.calls[0][0].amount).toBe(50);
  });

  it('records the intent id on the invoice', async () => {
    await stripeService.handleWebhook(Buffer.from('{}'), 'sig');

    const update = db.queries.find(q => flattenSql(q.sql).includes('stripe_payment_intent_id = ?'));
    expect(update?.params).toEqual(['pi_1', 7]);
  });

  it('falls back to matching the intent already stored on an invoice', async () => {
    givenIntent({ id: 'pi_1', amount: 12000, amount_received: 12000, currency: 'usd', metadata: {} });
    const lookups: string[] = [];
    db.getOne.mockImplementation((sql: string) => {
      const query = flattenSql(sql);
      lookups.push(query);
      return query.includes('stripe_payment_intent_id = ?') ? anInvoice() : undefined;
    });

    await stripeService.handleWebhook(Buffer.from('{}'), 'sig');

    expect(lookups.some(q => q.includes('stripe_payment_intent_id = ?'))).toBe(true);
    expect(createPayment).toHaveBeenCalled();
  });
});
