// Email service for browser environment (simulation for development)

import { type EmailSettings, type EmailTemplate, type SmtpSecurityType, type StoredEmailSettings } from '@/types';

const SMTP_SECURITY_TYPES: readonly SmtpSecurityType[] = ['tls', 'ssl', 'none'];

/**
 * Narrows a stored smtp_secure value to a supported security type. Anything
 * unrecognised falls back to TLS, which is what port 587 (the default) uses.
 */
const toSmtpSecurity = (value: string | undefined): SmtpSecurityType =>
  SMTP_SECURITY_TYPES.includes(value as SmtpSecurityType) ? (value as SmtpSecurityType) : 'tls';

export class EmailService {
  private static instance: EmailService;
  private emailSettings: EmailSettings | null = null;

  static getInstance(): EmailService {
    if (!EmailService.instance) {
      EmailService.instance = new EmailService();
    }
    return EmailService.instance;
  }

  // Configure email settings
  configure(settings: EmailSettings): void {
    this.emailSettings = settings;
  }

  // Get current email settings
  getSettings(): EmailSettings | null {
    return this.emailSettings;
  }

  /**
   * Gets email settings from storage
   */
  private async getStoredEmailSettings(): Promise<EmailSettings | null> {
    try {
      const { sqliteService } = await import('./sqlite.svc');
      if (sqliteService.isReady()) {
        const settings = await sqliteService.getSetting('email_settings');
        // Convert snake_case to camelCase and validate required fields
        if (settings && typeof settings === 'object' &&
            'smtp_host' in settings && 'smtp_port' in settings) {
          const rawSettings = settings as StoredEmailSettings;
          return {
            smtpHost: rawSettings.smtp_host || '',
            smtpPort: Number(rawSettings.smtp_port) || 587,
            smtpUsername: rawSettings.smtp_username || rawSettings.smtp_user || '',
            smtpPassword: rawSettings.smtp_password || '',
            smtpSecure: toSmtpSecurity(rawSettings.smtp_secure),
            fromEmail: rawSettings.from_email || '',
            fromName: rawSettings.from_name || '',
            replyToEmail: rawSettings.reply_to_email || rawSettings.from_email || '',
            isEnabled: Boolean(rawSettings.is_enabled || rawSettings.isEnabled)
          };
        }
      }
    } catch (error) {
      console.error('Error loading email settings:', error);
    }
    return null;
  }

  /**
   * Tests SMTP connection with current settings
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const settings = await this.getStoredEmailSettings();

      if (!settings || !settings.isEnabled) {
        return {
          success: false,
          message: 'Email is not enabled or configured'
        };
      }

      if (!settings.smtpHost || !settings.smtpUsername || !settings.smtpPassword) {
        return {
          success: false,
          message: 'Missing required SMTP configuration'
        };
      }

      // Simulate success/failure based on basic validation
      const isValidConfig = settings.smtpHost.includes('.') &&
                           settings.smtpPort > 0 &&
                           settings.smtpUsername.includes('@');

      if (isValidConfig) {
        return {
          success: true,
          message: 'SMTP connection successful'
        };
      } else {
        return {
          success: false,
          message: 'Invalid SMTP configuration'
        };
      }
    } catch (error) {
      console.error('Error testing SMTP connection:', error);
      return {
        success: false,
        message: 'Connection test failed: ' + error
      };
    }
  }

  // Send email (simulated for browser environment)
  // Message arguments are accepted for the real transport but unused by the simulation
  async sendEmail(
    _to: string,
    _subject: string,
    _htmlContent: string,
    _textContent?: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      const settings = await this.getStoredEmailSettings();

      if (!settings || !settings.isEnabled) {
        return {
          success: false,
          message: 'Email sending is not enabled'
        };
      }

      // In a real application, this would make an API call to a backend service
      // For now, we'll simulate the email sending

      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 1000));

      // For development, we'll always return success
      // In production, this would integrate with your email service
      return {
        success: true,
        message: 'Email sent successfully (simulated)'
      };
    } catch (error) {
      console.error('Email sending error:', error);
      return {
        success: false,
        message: 'Failed to send email'
      };
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

  // Test email configuration
  async testEmailConfiguration(): Promise<{ success: boolean; message: string }> {
    if (!this.emailSettings) {
      return {
        success: false,
        message: 'Email settings not configured'
      };
    }

    return await this.sendEmail(
      this.emailSettings.fromEmail,
      'Slimbooks Email Test',
      '<h2>Email Configuration Test</h2><p>If you receive this email, your email configuration is working correctly!</p>',
      'Email Configuration Test\n\nIf you receive this email, your email configuration is working correctly!'
    );
  }
}
