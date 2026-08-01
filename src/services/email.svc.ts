// Email client service
//
// SMTP is handled entirely by the server, which is the only place the mail
// password is read. This file is a thin client over /api/email and holds no
// credentials.
//
// The previous version simulated everything: testConnection() checked that the
// host contained a dot and the username an "@", then reported success, and
// sendEmail() waited a second and returned "sent (simulated)". Invoices
// reported as delivered were never delivered.

import { authenticatedFetch } from '@/utils/api';
import { type EmailTemplate, type SmtpStatus } from '@/types';

/** Shape every endpoint in this API answers with. */
interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface EmailOperationResult {
  success: boolean;
  message: string;
}

/**
 * Calls an endpoint and unwraps the envelope.
 *
 * A refused SMTP connection comes back as a 200 whose body says
 * `success: false` — that is an answer, not a transport failure. Only a genuine
 * request failure is turned into a rejected result.
 */
const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await authenticatedFetch(`/api/email${path}`, init);
  const payload = await response.json() as ApiEnvelope<T>;

  if (!response.ok || !payload.success || payload.data === undefined) {
    throw new Error(payload.error || payload.message || 'Email request failed');
  }

  return payload.data;
};

export class EmailService {
  private static instance: EmailService;

  static getInstance(): EmailService {
    if (!EmailService.instance) {
      EmailService.instance = new EmailService();
    }
    return EmailService.instance;
  }

  /**
   * Whether email is switched on, whether it is fully configured, and which
   * fields are still missing. Carries no password.
   */
  async getStatus(): Promise<SmtpStatus> {
    return request<SmtpStatus>('/status');
  }

  /**
   * Open a real SMTP connection and authenticate, without sending anything.
   */
  async testConnection(): Promise<EmailOperationResult> {
    try {
      return await request<EmailOperationResult>('/test-connection', { method: 'POST' });
    } catch (error) {
      return { success: false, message: (error as Error).message };
    }
  }

  /**
   * Send the canned test message to the configured sender address.
   */
  async sendTestEmail(): Promise<EmailOperationResult> {
    try {
      return await request<EmailOperationResult>('/test', { method: 'POST' });
    } catch (error) {
      return { success: false, message: (error as Error).message };
    }
  }

  /**
   * Send an email. The sender address comes from settings, not from here.
   */
  async sendEmail(
    to: string,
    subject: string,
    htmlContent: string,
    textContent?: string
  ): Promise<EmailOperationResult> {
    try {
      return await request<EmailOperationResult>('/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, subject, html: htmlContent, text: textContent })
      });
    } catch (error) {
      return { success: false, message: (error as Error).message };
    }
  }

  // Send email using template
  async sendTemplateEmail(
    to: string,
    template: EmailTemplate,
    variables: Record<string, string>
  ): Promise<{ success: boolean; message: string }> {
    try {
      // Replace variables in template
      let subject = template.subject;
      let htmlContent = template.html_content;
      let textContent = template.text_content || '';

      // Replace all variables in the format {{variable_name}}
      Object.entries(variables).forEach(([key, value]) => {
        const placeholder = `{{${key}}}`;
        subject = subject.replace(new RegExp(placeholder, 'g'), value);
        htmlContent = htmlContent.replace(new RegExp(placeholder, 'g'), value);
        textContent = textContent.replace(new RegExp(placeholder, 'g'), value);
      });

      return await this.sendEmail(to, subject, htmlContent, textContent);
    } catch (error) {
      console.error('Template email sending error:', error);
      return {
        success: false,
        message: 'Failed to send template email'
      };
    }
  }

  // Send verification email
  async sendVerificationEmail(
    to: string,
    userName: string,
    verificationToken: string
  ): Promise<{ success: boolean; message: string }> {
    const verificationLink = `${window.location.origin}/verify-email?token=${verificationToken}`;
    
    const template: EmailTemplate = {
      id: 0,
      name: 'email_verification',
      subject: 'Verify your email address - Slimbooks',
      html_content: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Welcome to Slimbooks!</h2>
          <p>Hi ${userName},</p>
          <p>Please verify your email address by clicking the link below:</p>
          <p style="margin: 20px 0;">
            <a href="${verificationLink}" 
               style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
              Verify Email Address
            </a>
          </p>
          <p>This link will expire in 24 hours.</p>
          <p>If you didn't create an account, please ignore this email.</p>
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
          <p style="color: #666; font-size: 12px;">
            This email was sent by Slimbooks. If you have any questions, please contact our support team.
          </p>
        </div>
      `,
      text_content: `Welcome to Slimbooks!\n\nHi ${userName},\n\nPlease verify your email address by visiting: ${verificationLink}\n\nThis link will expire in 24 hours.\n\nIf you didn't create an account, please ignore this email.`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    return await this.sendTemplateEmail(to, template, {
      user_name: userName,
      verification_link: verificationLink,
      app_name: 'Slimbooks'
    });
  }

  // Send password reset email
  async sendPasswordResetEmail(
    to: string,
    userName: string,
    resetToken: string
  ): Promise<{ success: boolean; message: string }> {
    const resetLink = `${window.location.origin}/reset-password?token=${resetToken}`;
    
    const template: EmailTemplate = {
      id: 0,
      name: 'password_reset',
      subject: 'Reset your password - Slimbooks',
      html_content: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Password Reset Request</h2>
          <p>Hi ${userName},</p>
          <p>You requested to reset your password. Click the link below to set a new password:</p>
          <p style="margin: 20px 0;">
            <a href="${resetLink}" 
               style="background-color: #dc3545; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
              Reset Password
            </a>
          </p>
          <p>This link will expire in 1 hour.</p>
          <p>If you didn't request this, please ignore this email and your password will remain unchanged.</p>
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
          <p style="color: #666; font-size: 12px;">
            This email was sent by Slimbooks. If you have any questions, please contact our support team.
          </p>
        </div>
      `,
      text_content: `Password Reset Request\n\nHi ${userName},\n\nYou requested to reset your password. Visit this link to set a new password: ${resetLink}\n\nThis link will expire in 1 hour.\n\nIf you didn't request this, please ignore this email.`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    return await this.sendTemplateEmail(to, template, {
      user_name: userName,
      reset_link: resetLink,
      app_name: 'Slimbooks'
    });
  }

  // Send welcome email
  async sendWelcomeEmail(
    to: string,
    userName: string
  ): Promise<{ success: boolean; message: string }> {
    const loginLink = `${window.location.origin}/login`;

    const template: EmailTemplate = {
      id: 0,
      name: 'welcome',
      subject: 'Welcome to Slimbooks!',
      html_content: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Welcome to Slimbooks!</h2>
          <p>Hi ${userName},</p>
          <p>Your account has been successfully created and verified.</p>
          <p>You can now start using all the features of Slimbooks to manage your invoices, clients, and expenses.</p>
          <p style="margin: 20px 0;">
            <a href="${loginLink}"
               style="background-color: #28a745; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
              Get Started
            </a>
          </p>
          <p>If you have any questions, don't hesitate to reach out to our support team.</p>
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
          <p style="color: #666; font-size: 12px;">
            This email was sent by Slimbooks. If you have any questions, please contact our support team.
          </p>
        </div>
      `,
      text_content: `Welcome to Slimbooks!\n\nHi ${userName},\n\nYour account has been successfully created and verified.\n\nYou can now start using all the features of Slimbooks.\n\nGet started: ${loginLink}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    return await this.sendTemplateEmail(to, template, {
      user_name: userName,
      login_link: loginLink,
      app_name: 'Slimbooks'
    });
  }

}

export const emailService = EmailService.getInstance();
