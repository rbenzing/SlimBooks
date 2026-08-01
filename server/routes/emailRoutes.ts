// Email routes for Slimbooks API
// SMTP status and connection testing

import { Router } from 'express';
import {
  getEmailStatus,
  testEmailConnection,
  sendTestEmail,
  sendEmail
} from '../controllers/emailController.js';
import { requireAuth, requireAdmin } from '../middleware/index.js';

const router: Router = Router();

router.use(requireAuth);

// GET /api/email/status - Whether email is enabled, configured, and what is missing
router.get('/status', getEmailStatus);

// POST /api/email/test-connection - Open a real SMTP connection and authenticate.
// Admin-only: it reaches out to a host of the caller's choosing.
router.post('/test-connection', requireAdmin, testEmailConnection);

// POST /api/email/test - Send the canned test message to the configured sender
router.post('/test', requireAdmin, sendTestEmail);

// POST /api/email/send - Send an invoice or reminder. Any signed-in user; the
// sender address comes from settings, not from the request.
router.post('/send', sendEmail);

export default router;
