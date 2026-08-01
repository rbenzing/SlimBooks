// Webhook routes for Slimbooks API
//
// Mounted separately from routes/index.ts, and ahead of express.json() in
// app.ts, because Stripe signs the exact bytes it sent. express.json() consumes
// the request stream and hands on a parsed object; re-serialising that object
// produces different bytes (key order, whitespace, unicode escaping), and the
// signature check then fails on every legitimate delivery.
//
// So this router parses the body as a raw Buffer and nothing else touches it
// first.

import { Router } from 'express';
import express from 'express';
import { handleStripeWebhook } from '../controllers/stripeController.js';

const router: Router = Router();

// POST /api/webhooks/stripe - Payment notifications from Stripe.
//
// Public by necessity: Stripe cannot authenticate. The signature check inside
// the handler is what makes it safe, so it must never be skipped.
router.post(
  '/stripe',
  express.raw({ type: 'application/json', limit: '1mb' }),
  handleStripeWebhook
);

export default router;
