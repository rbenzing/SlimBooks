// Email configuration utilities

import { emailService } from '@/services/email.svc';
import { type EmailConfigStatus } from '@/types';

/**
 * Whether this install can send email.
 *
 * The server is the only place that can answer this, because it resolves the
 * saved settings against `.env` and is the only side that can see the SMTP
 * password. Two earlier attempts to answer it in the browser both failed
 * silently:
 *
 *  - one read the stored settings and looked for `smtpHost`, `smtpUsername`,
 *    `fromEmail` — while the settings tab writes `smtp_host`, `smtp_user`,
 *    `from_email`, so every field read as missing and email was reported
 *    unconfigured no matter what had been saved;
 *  - the other fell back to `process.env.SMTP_HOST`, which does not exist in a
 *    browser bundle at all.
 *
 * Together they meant "Require Email Verification" could never be switched on.
 */
export const getEmailConfigurationStatus = async (): Promise<EmailConfigStatus> => {
  try {
    const status = await emailService.getStatus();

    return {
      isConfigured: status.configured,
      isEnabled: status.isEnabled,
      missingFields: status.missingFields,
      canSendEmails: status.canSendEmails
    };
  } catch (error) {
    console.error('Error checking email configuration:', error);
    return {
      isConfigured: false,
      isEnabled: false,
      missingFields: ['Configuration check failed'],
      canSendEmails: false
    };
  }
};
