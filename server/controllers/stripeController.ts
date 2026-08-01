// Stripe controller for Slimbooks
// Thin HTTP layer over StripeService - no Stripe calls or business logic here

import { type Request, type Response } from 'express';
import {
  stripeService,
  StripeNotConfiguredError
} from '../services/StripeService.js';
import {
  ValidationError,
  NotFoundError,
  asyncHandler
} from '../middleware/index.js';

/**
 * Turn a service failure into the right status code.
 *
 * An unconfigured or misconfigured integration is the caller's problem to fix,
 * so it answers 400 with the reason rather than a 500 that says nothing.
 */
const toHttpError = (error: unknown): never => {
  const message = (error as Error).message;

  if (error instanceof StripeNotConfiguredError) {
    throw new ValidationError(message);
  }
  if (message === 'Invoice not found') {
    throw new NotFoundError(message);
  }
  throw new ValidationError(message);
};

/**
 * Stripe configuration state for the settings screen.
 *
 * Reports whether each credential is present, never what it is.
 */
export const getStripeStatus = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  res.json({ success: true, data: stripeService.getStatus() });
});

/**
 * Verify the stored keys against the Stripe API.
 */
export const testStripeConnection = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const result = await stripeService.testConnection();

  // A rejected key is a successful test that answered "no", so the HTTP call
  // succeeds and the verdict travels in the body.
  res.json({ success: true, data: result });
});

/**
 * Create (or return) the payment link for an invoice.
 */
export const createInvoicePaymentLink = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const invoiceId = parseInt(req.params.id ?? '', 10);

  if (!Number.isInteger(invoiceId) || invoiceId <= 0) {
    throw new ValidationError('Valid invoice ID is required');
  }

  try {
    const paymentLink = await stripeService.createPaymentLinkForInvoice(invoiceId);
    res.json({ success: true, data: paymentLink });
  } catch (error) {
    toHttpError(error);
  }
});

/**
 * Deactivate a payment link.
 */
export const deactivatePaymentLink = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { linkId } = req.params;

  if (!linkId) {
    throw new ValidationError('Payment link ID is required');
  }

  try {
    await stripeService.deactivatePaymentLink(linkId);
    res.json({ success: true, message: 'Payment link deactivated' });
  } catch (error) {
    toHttpError(error);
  }
});

/**
 * Receive a Stripe webhook.
 *
 * `req.body` is the raw Buffer here, not parsed JSON — see the route for why
 * that matters. A failed signature check answers 400 without touching the
 * database.
 *
 * Everything that gets past verification answers 200, including events we
 * ignore and events whose invoice has since been deleted: Stripe retries a
 * non-2xx for days, and there is nothing to retry when the answer will not
 * change.
 */
export const handleStripeWebhook = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const signature = req.headers['stripe-signature'];

  if (typeof signature !== 'string') {
    res.status(400).json({ success: false, error: 'Missing stripe-signature header' });
    return;
  }

  try {
    const outcome = await stripeService.handleWebhook(req.body as Buffer, signature);
    res.json({ success: true, data: outcome });
  } catch (error) {
    const message = (error as Error).message;
    console.error('Stripe webhook rejected:', message);
    res.status(400).json({ success: false, error: message });
  }
});
