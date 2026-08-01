// Stripe routes for Slimbooks API
// Payment link management and integration status
//
// The webhook receiver is deliberately NOT here - it needs the unparsed request
// body and so has to be mounted ahead of express.json(). See webhookRoutes.ts.

import { Router } from 'express';
import {
  getStripeStatus,
  testStripeConnection,
  createInvoicePaymentLink,
  deactivatePaymentLink
} from '../controllers/stripeController.js';
import { requireAuth, requireAdmin } from '../middleware/index.js';

const router: Router = Router();

// Every route here talks to Stripe with the account's own credentials.
router.use(requireAuth);

// GET /api/stripe/status - Whether Stripe is enabled, configured, in test mode
router.get('/status', getStripeStatus);

// POST /api/stripe/test-connection - Verify the stored keys against Stripe
router.post('/test-connection', requireAdmin, testStripeConnection);

// POST /api/stripe/invoices/:id/payment-link - Create or return an invoice's payment link
router.post('/invoices/:id/payment-link', createInvoicePaymentLink);

// DELETE /api/stripe/payment-links/:linkId - Take a payment link out of service
router.delete('/payment-links/:linkId', requireAdmin, deactivatePaymentLink);

export default router;
