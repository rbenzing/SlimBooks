// Known SMTP providers
//
// Almost nobody types their own SMTP host correctly first time — the host,
// port and security setting have to agree, and getting the port right while
// getting the security wrong fails in a way that reads like a bad password.
// Picking a provider fills all three from one choice.
//
// `custom` is the escape hatch: choose it and the host, port and security
// fields appear for hand entry.

import type { SmtpSecurity } from '@/types';

export interface EmailProvider {
  id: string;
  name: string;
  host: string;
  port: number;
  security: SmtpSecurity;
  /** What trips people up on this provider, shown once it is selected. */
  hint?: string;
}

/** Chosen when none of the known providers fit. */
export const CUSTOM_PROVIDER_ID = 'custom';

export const EMAIL_PROVIDERS: EmailProvider[] = [
  {
    id: 'gmail',
    name: 'Gmail',
    host: 'smtp.gmail.com',
    port: 587,
    security: 'tls',
    hint: 'Google rejects your normal password. Turn on 2-Step Verification, then create an App Password and use that here.'
  },
  {
    id: 'outlook',
    name: 'Outlook / Microsoft 365',
    host: 'smtp-mail.outlook.com',
    port: 587,
    security: 'tls',
    hint: 'Microsoft 365 business accounts often need SMTP AUTH switched on for the mailbox first.'
  },
  {
    id: 'yahoo',
    name: 'Yahoo Mail',
    host: 'smtp.mail.yahoo.com',
    port: 465,
    security: 'ssl',
    hint: 'Generate an App Password in your Yahoo account security settings.'
  },
  {
    id: 'icloud',
    name: 'iCloud Mail',
    host: 'smtp.mail.me.com',
    port: 587,
    security: 'tls',
    hint: 'Requires an app-specific password from appleid.apple.com.'
  },
  {
    id: 'zoho',
    name: 'Zoho Mail',
    host: 'smtp.zoho.com',
    port: 465,
    security: 'ssl',
    hint: 'Use smtp.zoho.eu or another regional host if your account is not on the .com data centre.'
  },
  {
    id: 'fastmail',
    name: 'Fastmail',
    host: 'smtp.fastmail.com',
    port: 465,
    security: 'ssl',
    hint: 'Create an app password with SMTP access in Fastmail settings.'
  },
  {
    id: 'sendgrid',
    name: 'SendGrid',
    host: 'smtp.sendgrid.net',
    port: 587,
    security: 'tls',
    hint: 'The username is the literal word "apikey". The password is your API key.'
  },
  {
    id: 'mailgun',
    name: 'Mailgun',
    host: 'smtp.mailgun.org',
    port: 587,
    security: 'tls',
    hint: 'Use the SMTP credentials from your sending domain, not your account login.'
  },
  {
    id: 'postmark',
    name: 'Postmark',
    host: 'smtp.postmarkapp.com',
    port: 587,
    security: 'tls',
    hint: 'Username and password are both your Server API token.'
  },
  {
    id: 'brevo',
    name: 'Brevo (Sendinblue)',
    host: 'smtp-relay.brevo.com',
    port: 587,
    security: 'tls',
    hint: 'The password is an SMTP key from Brevo, not your account password.'
  },
  {
    id: 'ses',
    name: 'Amazon SES',
    host: 'email-smtp.us-east-1.amazonaws.com',
    port: 587,
    security: 'tls',
    hint: 'Change the region in the host to match your SES region, and use SMTP credentials rather than your AWS keys.'
  }
];

export const findProvider = (id: string): EmailProvider | undefined =>
  EMAIL_PROVIDERS.find(provider => provider.id === id);

/**
 * Work out which provider a stored configuration came from.
 *
 * Matching on the host alone would call a Gmail host on a non-standard port
 * "Gmail" and then quietly overwrite that port when the form re-selected it, so
 * all three values have to agree before a stored config is claimed by a
 * provider. Anything else is custom, which is the honest answer.
 */
export const detectProvider = (
  host: string,
  port: number,
  security: SmtpSecurity
): string => {
  if (!host) return '';

  const match = EMAIL_PROVIDERS.find(provider =>
    provider.host.toLowerCase() === host.toLowerCase()
    && provider.port === port
    && provider.security === security
  );

  return match ? match.id : CUSTOM_PROVIDER_ID;
};
