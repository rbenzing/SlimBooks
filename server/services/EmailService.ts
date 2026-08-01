// Email Service - real SMTP delivery
//
// This is the only place the SMTP password is read. Like the Stripe secret key,
// it is resolved server-side when needed and never returned to a caller.
//
// Settings are read from the `email_settings` row that the Email Settings tab
// writes, with .env as the fallback for a deployment that configures SMTP
// there instead. Same precedence as everywhere else: a saved value wins.

import nodemailer, { type Transporter } from 'nodemailer';
import { settingsService } from './SettingsService.js';

/**
 * How the connection is secured.
 *
 * `ssl` means TLS from the first byte (port 465). `tls` means connect in the
 * clear and upgrade with STARTTLS (port 587) — nodemailer calls that
 * `secure: false`, which reads like "no encryption" but is not.
 */
export type SmtpSecurity = 'ssl' | 'tls' | 'none';

export interface EmailCredentials {
  isEnabled: boolean;
  host: string;
  port: number;
  security: SmtpSecurity;
  user: string;
  password: string;
  fromEmail: string;
  fromName: string;
  configured: boolean;
}

export interface EmailStatus {
  isEnabled: boolean;
  configured: boolean;
  /** Which required fields are still blank, so the UI can say what is missing. */
  missingFields: string[];
  canSendEmails: boolean;
  host: string;
  port: number;
  security: SmtpSecurity;
  user: string;
  fromEmail: string;
  fromName: string;
}

export interface EmailOperationResult {
  success: boolean;
  message: string;
}

/** Raised when email is asked to do something before it is usable. */
export class EmailNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmailNotConfiguredError';
  }
}

/** The stored shape, as the settings tab writes it. */
interface StoredEmailSettings {
  smtp_host?: string;
  smtp_port?: number | string;
  smtp_user?: string;
  smtp_password?: string;
  smtp_security?: SmtpSecurity;
  smtp_secure?: boolean;
  from_email?: string;
  from_name?: string;
  isEnabled?: boolean;
}

const SECURITY_VALUES: readonly SmtpSecurity[] = ['ssl', 'tls', 'none'];

/**
 * Reads the stored security choice.
 *
 * `smtp_secure` is the older boolean form. It cannot distinguish SSL from
 * STARTTLS, so it maps to the one that matters more often: true meant "secure",
 * and port 587 with STARTTLS is the common case.
 */
const toSecurity = (stored: StoredEmailSettings): SmtpSecurity => {
  if (stored.smtp_security && SECURITY_VALUES.includes(stored.smtp_security)) {
    return stored.smtp_security;
  }
  if (typeof stored.smtp_secure === 'boolean') {
    return stored.smtp_secure ? 'tls' : 'none';
  }
  return 'tls';
};

const envString = (name: string): string => process.env[name] || '';

export class EmailService {
  private transporter: Transporter | null = null;
  /** Identifies the connection the cached transporter was built for. */
  private transporterKey = '';

  /**
   * Resolve SMTP credentials. SERVER-SIDE ONLY — carries the password.
   */
  async getCredentials(): Promise<EmailCredentials> {
    const stored = (await settingsService.getSettingByKey('email.email_settings')) as StoredEmailSettings | null;
    const settings = stored ?? {};

    const host = String(settings.smtp_host || '') || envString('SMTP_HOST');
    const user = String(settings.smtp_user || '') || envString('SMTP_USER');
    const password = String(settings.smtp_password || '') || envString('SMTP_PASS');
    const fromEmail = String(settings.from_email || '') || envString('EMAIL_FROM');
    const port = Number(settings.smtp_port) || Number(process.env.SMTP_PORT) || 587;

    // Enabled by the toggle, or implicitly when a deployment has configured
    // SMTP entirely through .env and never opened the settings screen.
    const configuredInEnv = !!(envString('SMTP_HOST') && envString('SMTP_USER') && envString('SMTP_PASS'));
    const isEnabled = settings.isEnabled ?? configuredInEnv;

    return {
      isEnabled,
      host,
      port,
      security: toSecurity(settings),
      user,
      password,
      fromEmail,
      fromName: String(settings.from_name || '') || 'Slimbooks',
      configured: !!(host && user && password && fromEmail)
    };
  }

  /**
   * Configuration state for the settings screen. Carries no password.
   */
  async getStatus(): Promise<EmailStatus> {
    const credentials = await this.getCredentials();
    const missingFields: string[] = [];

    if (!credentials.host) missingFields.push('SMTP Host');
    if (!credentials.user) missingFields.push('Username');
    if (!credentials.password) missingFields.push('Password');
    if (!credentials.fromEmail) missingFields.push('From Email');

    return {
      isEnabled: credentials.isEnabled,
      configured: credentials.configured,
      missingFields,
      canSendEmails: credentials.configured && credentials.isEnabled,
      host: credentials.host,
      port: credentials.port,
      security: credentials.security,
      user: credentials.user,
      fromEmail: credentials.fromEmail,
      fromName: credentials.fromName
    };
  }

  /**
   * A transporter for the current settings, rebuilt whenever they change so a
   * saved change takes effect without a restart.
   */
  private async getTransporter(): Promise<{ transporter: Transporter; credentials: EmailCredentials }> {
    const credentials = await this.getCredentials();

    if (!credentials.isEnabled) {
      throw new EmailNotConfiguredError('Email sending is switched off');
    }
    if (!credentials.configured) {
      const { missingFields } = await this.getStatus();
      throw new EmailNotConfiguredError(`Email is not configured - missing: ${missingFields.join(', ')}`);
    }

    const key = [
      credentials.host, credentials.port, credentials.security,
      credentials.user, credentials.password
    ].join('|');

    if (!this.transporter || this.transporterKey !== key) {
      this.transporter = nodemailer.createTransport({
        host: credentials.host,
        port: credentials.port,
        // `secure: true` is TLS from the first byte; STARTTLS is secure: false
        // plus an upgrade, which nodemailer does automatically when offered.
        secure: credentials.security === 'ssl',
        ...(credentials.security === 'none' ? { ignoreTLS: true } : {}),
        auth: { user: credentials.user, pass: credentials.password }
      });
      this.transporterKey = key;
    }

    return { transporter: this.transporter, credentials };
  }

  /**
   * Open a real connection and authenticate, without sending anything.
   *
   * This is what makes the Test Connection button worth pressing: a wrong
   * password, a blocked port or a host that does not resolve all fail here
   * rather than silently at the moment an invoice is sent.
   */
  async testConnection(): Promise<EmailOperationResult> {
    try {
      const { transporter } = await this.getTransporter();
      await transporter.verify();

      return { success: true, message: 'SMTP connection successful' };
    } catch (error) {
      return { success: false, message: this.describeError(error) };
    }
  }

  /**
   * Send an email.
   */
  async sendEmail(args: {
    to: string;
    subject: string;
    html: string;
    text?: string;
  }): Promise<EmailOperationResult> {
    try {
      const { transporter, credentials } = await this.getTransporter();

      const info = await transporter.sendMail({
        from: `"${credentials.fromName}" <${credentials.fromEmail}>`,
        to: args.to,
        subject: args.subject,
        html: args.html,
        ...(args.text ? { text: args.text } : {})
      });

      return { success: true, message: `Email sent (${info.messageId})` };
    } catch (error) {
      return { success: false, message: this.describeError(error) };
    }
  }

  /**
   * Send the canned test message, addressed to the configured sender.
   */
  async sendTestEmail(): Promise<EmailOperationResult> {
    const credentials = await this.getCredentials();

    return this.sendEmail({
      to: credentials.fromEmail,
      subject: 'Test email from Slimbooks',
      html: '<h2>Test email</h2><p>Your Slimbooks email configuration is working.</p>',
      text: 'Test email\n\nYour Slimbooks email configuration is working.'
    });
  }

  /**
   * The transport's own message, which says far more than "send failed" — a
   * rejected password, a refused port and an unknown host all read differently.
   */
  private describeError(error: unknown): string {
    const message = (error as Error)?.message;
    return message || 'SMTP request failed';
  }
}

export const emailService = new EmailService();
