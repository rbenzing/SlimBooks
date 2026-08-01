// Email controller for Slimbooks
// Thin HTTP layer over EmailService - no SMTP work or credentials here

import { type Request, type Response } from 'express';
import { emailService } from '../services/EmailService.js';
import { asyncHandler, ValidationError } from '../middleware/index.js';

/**
 * Email configuration state for the settings screen.
 *
 * Reports the host, port and sender so the tab can show what is in use, and
 * which required fields are still blank. Never the password.
 */
export const getEmailStatus = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  res.json({ success: true, data: await emailService.getStatus() });
});

/**
 * Open a real SMTP connection and authenticate.
 *
 * A refused connection is a successful test that answered "no", so the HTTP
 * call succeeds and the verdict travels in the body.
 */
export const testEmailConnection = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  res.json({ success: true, data: await emailService.testConnection() });
});

/**
 * Send an email — invoices and reminders go through here.
 *
 * Any signed-in user may send, because sending an invoice is ordinary work,
 * but the sender address is not theirs to choose: it comes from the configured
 * settings, so this cannot be used to send as someone else.
 */
export const sendEmail = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { to, subject, html, text } = req.body as {
    to?: string; subject?: string; html?: string; text?: string;
  };

  if (!to || typeof to !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    throw new ValidationError('A valid recipient address is required');
  }
  if (!subject || typeof subject !== 'string') {
    throw new ValidationError('A subject is required');
  }
  if (!html || typeof html !== 'string') {
    throw new ValidationError('Message content is required');
  }

  const status = await emailService.getStatus();
  if (!status.canSendEmails) {
    throw new ValidationError(
      status.missingFields.length > 0
        ? `Email is not configured - missing: ${status.missingFields.join(', ')}`
        : 'Email sending is switched off'
    );
  }

  res.json({
    success: true,
    data: await emailService.sendEmail({ to, subject, html, ...(text ? { text } : {}) })
  });
});

/**
 * Send the canned test message to the configured sender.
 */
export const sendTestEmail = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const status = await emailService.getStatus();

  if (!status.canSendEmails) {
    throw new ValidationError(
      status.missingFields.length > 0
        ? `Email is not configured - missing: ${status.missingFields.join(', ')}`
        : 'Email sending is switched off'
    );
  }

  res.json({ success: true, data: await emailService.sendTestEmail() });
});
