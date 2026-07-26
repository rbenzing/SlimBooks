// Unified Invoice Service - combines email, status, and scheduling functionality
// Consolidates invoiceEmail.svc.ts, invoiceStatus.svc.ts, and scheduledInvoice.svc.ts

import { EmailService } from './email.svc';
import { generateInvoiceToken } from '@/utils/invoiceTokens';
import { sqliteService } from './sqlite.svc';
import { formatClientAddressSingleLine } from '@/utils/formatting';
import { authenticatedFetch, getToken } from '@/utils/api';
import {
  type InvoiceEmailData,
  type CompanySettings,
  type EmailStatus,
  type EmailStatusUpdate,
  type ScheduledInvoice,
  type Invoice
} from '@/types';

export class InvoiceService {
  private static instance: InvoiceService;
  private emailService: EmailService;

  private constructor() {
    this.emailService = EmailService.getInstance();
  }

  static getInstance(): InvoiceService {
    if (!InvoiceService.instance) {
      InvoiceService.instance = new InvoiceService();
    }
    return InvoiceService.instance;
  }

  // ===== EMAIL FUNCTIONALITY =====

  /**
   * Sends an invoice email to the client
   */
  async sendInvoiceEmail(invoice: InvoiceEmailData): Promise<{ success: boolean; message: string }> {
    try {
      // Generate secure token for public viewing
      const token = generateInvoiceToken(invoice.id.toString());
      const invoiceViewUrl = `${window.location.origin}/invoice/${invoice.id}?token=${token}`;

      // Get company settings
      const companySettings = await this.getCompanySettings();
      
      // Create email content
      const subject = `Invoice ${invoice.invoice_number} from ${companySettings.companyName}`;
      const htmlContent = this.generateInvoiceEmailHTML(invoice, invoiceViewUrl, companySettings);
      const textContent = this.generateInvoiceEmailText(invoice, invoiceViewUrl, companySettings);

      // Send email
      const result = await this.emailService.sendEmail(
        invoice.client_email,
        subject,
        htmlContent,
        textContent
      );

      return result;
    } catch (error) {
      console.error('Error sending invoice email:', error);
      return {
        success: false,
        message: 'Failed to send invoice email'
      };
    }
  }

  /**
   * Sends a reminder email for an overdue invoice
   */
  async sendInvoiceReminder(invoice: InvoiceEmailData): Promise<{ success: boolean; message: string }> {
    try {
      const token = generateInvoiceToken(invoice.id.toString());
      const invoiceViewUrl = `${window.location.origin}/invoice/${invoice.id}?token=${token}`;
      const companySettings = await this.getCompanySettings();
      
      const subject = `Payment Reminder: Invoice ${invoice.invoice_number} - ${companySettings.companyName}`;
      const htmlContent = this.generateReminderEmailHTML(invoice, invoiceViewUrl, companySettings);
      const textContent = this.generateReminderEmailText(invoice, invoiceViewUrl, companySettings);

      const result = await this.emailService.sendEmail(
        invoice.client_email,
        subject,
        htmlContent,
        textContent
      );

      return result;
    } catch (error) {
      console.error('Error sending reminder email:', error);
      return {
        success: false,
        message: 'Failed to send reminder email'
      };
    }
  }

  /**
   * Gets company settings for email templates
   */
  private async getCompanySettings(): Promise<CompanySettings> {
    try {
      if (sqliteService.isReady()) {
        const settings = await sqliteService.getSetting('company_settings');
        // Type guard to ensure we have a valid CompanySettings object
        if (settings && typeof settings === 'object' && 
            'companyName' in settings && 'email' in settings) {
          return settings as CompanySettings;
        }
      }
    } catch (error) {
      console.error('Error loading company settings:', error);
    }

    // Return default settings if none found
    return {
      companyName: 'Slimbooks',
      ownerName: '',
      brandingImage: '',
      email: 'noreply@slimbooks.app',
      phone: '',
      address: '',
      city: '',
      state: '',
      zipCode: ''
    };
  }

  /**
   * Generates HTML content for invoice email
   */
  private generateInvoiceEmailHTML(
    invoice: InvoiceEmailData, 
    viewUrl: string, 
    company: CompanySettings
  ): string {
    const dueDate = new Date(invoice.due_date).toLocaleDateString();
    
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #333; margin-bottom: 10px;">${company.companyName}</h1>
          <p style="color: #666; margin: 0;">New Invoice</p>
        </div>
        
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <h2 style="color: #333; margin-top: 0;">Invoice ${invoice.invoice_number}</h2>
          <p style="color: #666; margin: 5px 0;"><strong>Amount:</strong> $${invoice.amount.toFixed(2)}</p>
          <p style="color: #666; margin: 5px 0;"><strong>Due Date:</strong> ${dueDate}</p>
          <p style="color: #666; margin: 5px 0;"><strong>To:</strong> ${invoice.client_name}</p>
        </div>
        
        <p style="color: #333; line-height: 1.6;">
          Hello ${invoice.client_name},
        </p>
        
        <p style="color: #333; line-height: 1.6;">
          We've prepared a new invoice for you. Please review the details and submit your payment by the due date.
        </p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${viewUrl}" 
             style="background-color: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
            View Invoice
          </a>
        </div>
        
        ${invoice.notes ? `
          <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <h4 style="margin-top: 0; color: #333;">Notes:</h4>
            <p style="color: #666; margin-bottom: 0; white-space: pre-line;">${invoice.notes}</p>
          </div>
        ` : ''}
        
        <div style="border-top: 1px solid #eee; padding-top: 20px; margin-top: 30px;">
          <p style="color: #666; font-size: 14px; margin: 5px 0;">
            <strong>${company.companyName}</strong>
          </p>
          ${company.email ? `<p style="color: #666; font-size: 14px; margin: 5px 0;">${company.email}</p>` : ''}
          ${company.phone ? `<p style="color: #666; font-size: 14px; margin: 5px 0;">${company.phone}</p>` : ''}
          ${formatClientAddressSingleLine(company) ? `
            <p style="color: #666; font-size: 14px; margin: 5px 0;">
              ${formatClientAddressSingleLine(company)}
            </p>
          ` : ''}
        </div>
        
        <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
          <p style="color: #999; font-size: 12px; margin: 0;">
            This email was sent by ${company.companyName}. If you have any questions about this invoice, please contact us.
          </p>
        </div>
      </div>
    `;
  }

  /**
   * Generates text content for invoice email
   */
  private generateInvoiceEmailText(
    invoice: InvoiceEmailData,
    viewUrl: string,
    company: CompanySettings
  ): string {
    const dueDate = new Date(invoice.due_date).toLocaleDateString();

    return `
${company.companyName}
New Invoice

Invoice ${invoice.invoice_number}
Amount: $${invoice.amount.toFixed(2)}
Due Date: ${dueDate}
To: ${invoice.client_name}

Hello ${invoice.client_name},

We've prepared a new invoice for you. Please review the details and submit your payment by the due date.

View Invoice: ${viewUrl}

${invoice.notes ? `Notes:\n${invoice.notes}\n\n` : ''}

${company.companyName}
${company.email ? company.email + '\n' : ''}${company.phone ? company.phone + '\n' : ''}${formatClientAddressSingleLine(company) ? formatClientAddressSingleLine(company) + '\n' : ''}

This email was sent by ${company.companyName}. If you have any questions about this invoice, please contact us.
    `.trim();
  }

  /**
   * Generates HTML content for reminder email
   */
  private generateReminderEmailHTML(
    invoice: InvoiceEmailData,
    viewUrl: string,
    company: CompanySettings
  ): string {
    const dueDate = new Date(invoice.due_date).toLocaleDateString();
    const isOverdue = new Date(invoice.due_date) < new Date();

    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #333; margin-bottom: 10px;">${company.companyName}</h1>
          <p style="color: #dc3545; margin: 0; font-weight: bold;">Payment Reminder</p>
        </div>

        <div style="background-color: ${isOverdue ? '#fff5f5' : '#f8f9fa'}; padding: 20px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid ${isOverdue ? '#dc3545' : '#ffc107'};">
          <h2 style="color: #333; margin-top: 0;">Invoice ${invoice.invoice_number}</h2>
          <p style="color: #666; margin: 5px 0;"><strong>Amount:</strong> $${invoice.amount.toFixed(2)}</p>
          <p style="color: #666; margin: 5px 0;"><strong>Due Date:</strong> ${dueDate}</p>
          <p style="color: #666; margin: 5px 0;"><strong>Status:</strong> ${isOverdue ? 'Overdue' : 'Due Soon'}</p>
        </div>

        <p style="color: #333; line-height: 1.6;">
          Hello ${invoice.client_name},
        </p>

        <p style="color: #333; line-height: 1.6;">
          This is a friendly reminder that invoice ${invoice.invoice_number} ${isOverdue ? 'is now overdue' : 'is due soon'}.
          Please review the invoice and submit your payment at your earliest convenience.
        </p>

        <div style="text-align: center; margin: 30px 0;">
          <a href="${viewUrl}"
             style="background-color: #dc3545; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
            View & Pay Invoice
          </a>
        </div>

        <div style="border-top: 1px solid #eee; padding-top: 20px; margin-top: 30px;">
          <p style="color: #666; font-size: 14px; margin: 5px 0;">
            <strong>${company.companyName}</strong>
          </p>
          ${company.email ? `<p style="color: #666; font-size: 14px; margin: 5px 0;">${company.email}</p>` : ''}
          ${company.phone ? `<p style="color: #666; font-size: 14px; margin: 5px 0;">${company.phone}</p>` : ''}
        </div>
      </div>
    `;
  }

  /**
   * Generates text content for reminder email
   */
  private generateReminderEmailText(
    invoice: InvoiceEmailData,
    viewUrl: string,
    company: CompanySettings
  ): string {
    const dueDate = new Date(invoice.due_date).toLocaleDateString();
    const isOverdue = new Date(invoice.due_date) < new Date();

    return `
${company.companyName}
Payment Reminder

Invoice ${invoice.invoice_number}
Amount: $${invoice.amount.toFixed(2)}
Due Date: ${dueDate}
Status: ${isOverdue ? 'Overdue' : 'Due Soon'}

Hello ${invoice.client_name},

This is a friendly reminder that invoice ${invoice.invoice_number} ${isOverdue ? 'is now overdue' : 'is due soon'}.
Please review the invoice and submit your payment at your earliest convenience.

View & Pay Invoice: ${viewUrl}

${company.companyName}
${company.email ? company.email + '\n' : ''}${company.phone ? company.phone + '\n' : ''}
    `.trim();
  }

  // ===== STATUS MANAGEMENT FUNCTIONALITY =====

  /**
   * Updates the email status of an invoice
   */
  async updateEmailStatus(
    invoiceId: number, 
    status: EmailStatus, 
    error?: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      const now = new Date().toISOString();
      
      const updateData: Partial<EmailStatusUpdate> = {
        email_status: status,
        last_email_attempt: now
      };

      // Set specific fields based on status
      switch (status) {
        case 'sent':
          updateData.email_sent_at = now;
          updateData.email_error = null;
          break;
        case 'failed':
          updateData.email_error = error || 'Unknown error';
          break;
        case 'sending':
          updateData.email_error = null;
          break;
        case 'not_sent':
          updateData.email_sent_at = null;
          updateData.email_error = null;
          break;
      }

      await authenticatedFetch(`/api/invoices/${invoiceId}`, {
        method: 'PUT',
        body: JSON.stringify({ invoiceData: updateData })
      });

      return {
        success: true,
        message: `Email status updated to ${status}`
      };
    } catch (error) {
      console.error('Error updating email status:', error);
      return {
        success: false,
        message: 'Failed to update email status'
      };
    }
  }

  /**
   * Marks an invoice as being sent (updates status to 'sent' and email status)
   */
  async markInvoiceAsSent(invoiceId: number): Promise<{ success: boolean; message: string }> {
    try {
      const now = new Date().toISOString();

      await authenticatedFetch(`/api/invoices/${invoiceId}`, {
        method: 'PUT',
        body: JSON.stringify({
          invoiceData: {
            status: 'sent',
            email_status: 'sent',
            email_sent_at: now,
            last_email_attempt: now,
            email_error: null
          }
        })
      });

      return {
        success: true,
        message: 'Invoice marked as sent'
      };
    } catch (error) {
      console.error('Error marking invoice as sent:', error);
      return {
        success: false,
        message: 'Failed to mark invoice as sent'
      };
    }
  }

  /**
   * Gets the email status of an invoice
   */
  async getEmailStatus(invoiceId: number): Promise<{
    status: EmailStatus;
    sentAt?: string;
    error?: string;
    lastAttempt?: string;
  } | null> {
    try {
      const response = await authenticatedFetch(`/api/invoices/${invoiceId}`);
      const result = await response.json();
      const invoice = result.data;
      if (!invoice) {
        return null;
      }

      return {
        status: (invoice.email_status as EmailStatus) || 'not_sent',
        sentAt: invoice.email_sent_at || undefined,
        error: invoice.email_error || undefined,
        lastAttempt: invoice.last_email_attempt || undefined
      };
    } catch (error) {
      console.error('Error getting email status:', error);
      return null;
    }
  }

  /**
   * Gets a human-readable status message
   */
  getStatusMessage(
    status: EmailStatus, 
    sentAt?: string, 
    error?: string, 
    lastAttempt?: string
  ): string {
    switch (status) {
      case 'not_sent':
        return 'Not sent';
      case 'sending':
        return 'Sending...';
      case 'sent':
        if (sentAt) {
          const date = new Date(sentAt);
          return `Sent on ${date.toLocaleDateString()} at ${date.toLocaleTimeString()}`;
        }
        return 'Sent';
      case 'failed':
        if (error) {
          return `Failed to send: ${error}`;
        }
        if (lastAttempt) {
          const date = new Date(lastAttempt);
          return `Failed to send (last attempt: ${date.toLocaleDateString()})`;
        }
        return 'Failed to send';
      default:
        return 'Unknown status';
    }
  }

  /**
   * Gets the appropriate status color for UI display
   */
  getStatusColor(status: EmailStatus): string {
    switch (status) {
      case 'not_sent':
        return 'text-muted-foreground';
      case 'sending':
        return 'text-blue-600';
      case 'sent':
        return 'text-green-600';
      case 'failed':
        return 'text-red-600';
      default:
        return 'text-muted-foreground';
    }
  }

  /**
   * Gets the appropriate status icon for UI display
   */
  getStatusIcon(status: EmailStatus): string {
    switch (status) {
      case 'not_sent':
        return 'mail';
      case 'sending':
        return 'loader';
      case 'sent':
        return 'check-circle';
      case 'failed':
        return 'x-circle';
      default:
        return 'mail';
    }
  }

  /**
   * Checks if an invoice can be sent based on its current email status
   */
  canSendInvoice(status: EmailStatus): boolean {
    // Can send if not currently sending
    return status !== 'sending';
  }

  /**
   * Checks if an invoice should show retry option
   */
  shouldShowRetry(status: EmailStatus): boolean {
    return status === 'failed';
  }

  /**
   * Gets all invoices with failed email status for retry processing
   */
  async getFailedInvoices(): Promise<Invoice[]> {
    try {
        const allInvoicesResponse = await authenticatedFetch("/api/invoices");
        if (allInvoicesResponse.ok) {
          const allInvoices = await allInvoicesResponse.json();
          return allInvoices.data.filter(invoice => invoice.email_status === 'failed');
        } else {
          throw new Error('Failed to load clients');
        }
    } catch (error) {
      console.error('Error getting failed invoices:', error);
      return [];
    }
  }

  /**
   * Retries sending a failed invoice
   */
  async retryFailedInvoice(invoiceId: number): Promise<{ success: boolean; message: string }> {
    try {
      // Reset status to allow retry
      await this.updateEmailStatus(invoiceId, 'not_sent');
      
      return {
        success: true,
        message: 'Invoice ready for retry'
      };
    } catch (error) {
      console.error('Error preparing invoice for retry:', error);
      return {
        success: false,
        message: 'Failed to prepare invoice for retry'
      };
    }
  }

  /**
   * Clears email error for an invoice
   */
  async clearEmailError(invoiceId: number): Promise<{ success: boolean; message: string }> {
    try {
      await authenticatedFetch(`/api/invoices/${invoiceId}`, {
        method: 'PUT',
        body: JSON.stringify({
          invoiceData: {
            email_error: null
          }
        })
      });

      return {
        success: true,
        message: 'Email error cleared'
      };
    } catch (error) {
      console.error('Error clearing email error:', error);
      return {
        success: false,
        message: 'Failed to clear email error'
      };
    }
  }

  // ===== SCHEDULING FUNCTIONALITY =====

  /**
   * Gets all invoices that are scheduled to be sent today
   */
  async getTodaysScheduledInvoices(): Promise<ScheduledInvoice[]> {
    try {
      const today = new Date();

      // Get all invoices and filter for scheduled ones
      const response = await authenticatedFetch('/api/invoices');
      const result = await response.json();
      const allInvoices = result.data;
      const scheduledInvoices = allInvoices.filter((invoice: Invoice) => 
        invoice.status === 'draft' &&
        new Date(invoice.due_date) <= today &&
        invoice.email_status !== 'sent'
      );

      return scheduledInvoices.map(invoice => ({
        id: invoice.id,
        invoice_number: invoice.invoice_number,
        client_name: invoice.client_name,
        client_email: invoice.client_email,
        amount: invoice.amount,
        due_date: invoice.due_date,
        status: invoice.status,
        notes: invoice.notes,
        email_status: invoice.email_status
      }));
    } catch (error) {
      console.error('Error getting scheduled invoices:', error);
      return [];
    }
  }

  /**
   * Gets all overdue invoices that need reminder emails
   */
  async getOverdueInvoices(): Promise<ScheduledInvoice[]> {
    try {
      const today = new Date();

      // Get all invoices and filter for overdue ones
      const response = await authenticatedFetch('/api/invoices');
      const result = await response.json();
      const allInvoices = result.data;
      const overdueInvoices = allInvoices.filter((invoice: Invoice) => 
        (invoice.status === 'sent' || invoice.status === 'overdue') &&
        new Date(invoice.due_date) < today
      );

      return overdueInvoices.map(invoice => ({
        id: invoice.id,
        invoice_number: invoice.invoice_number,
        client_name: invoice.client_name,
        client_email: invoice.client_email,
        amount: invoice.amount,
        due_date: invoice.due_date,
        status: invoice.status,
        notes: invoice.notes,
        email_status: invoice.email_status
      }));
    } catch (error) {
      console.error('Error getting overdue invoices:', error);
      return [];
    }
  }

  /**
   * Processes and sends all scheduled invoices for today
   */
  async processScheduledInvoices(): Promise<{
    processed: number;
    successful: number;
    failed: number;
    results: Array<{ invoice: ScheduledInvoice; success: boolean; message: string }>;
  }> {
    const scheduledInvoices = await this.getTodaysScheduledInvoices();
    const results: Array<{ invoice: ScheduledInvoice; success: boolean; message: string }> = [];
    
    let successful = 0;
    let failed = 0;

    for (const invoice of scheduledInvoices) {
      try {
        // Update status to 'sending'
        await this.updateEmailStatus(invoice.id, 'sending');
        
        // Send the invoice email
        const emailResult = await this.sendInvoiceEmail(invoice);
        
        if (emailResult.success) {
          // Mark as sent and update invoice status
          await this.markInvoiceAsSent(invoice.id);
          successful++;
          results.push({
            invoice,
            success: true,
            message: 'Invoice sent successfully'
          });
        } else {
          // Mark as failed
          await this.updateEmailStatus(invoice.id, 'failed', emailResult.message);
          failed++;
          results.push({
            invoice,
            success: false,
            message: emailResult.message
          });
        }
      } catch (error) {
        // Mark as failed
        await this.updateEmailStatus(invoice.id, 'failed', error.message);
        failed++;
        results.push({
          invoice,
          success: false,
          message: error.message
        });
      }
    }

    return {
      processed: scheduledInvoices.length,
      successful,
      failed,
      results
    };
  }

  /**
   * Sends reminder emails for overdue invoices
   */
  async sendOverdueReminders(): Promise<{
    processed: number;
    successful: number;
    failed: number;
    results: Array<{ invoice: ScheduledInvoice; success: boolean; message: string }>;
  }> {
    const overdueInvoices = await this.getOverdueInvoices();
    const results: Array<{ invoice: ScheduledInvoice; success: boolean; message: string }> = [];
    
    let successful = 0;
    let failed = 0;

    for (const invoice of overdueInvoices) {
      try {
        // Send reminder email
        const emailResult = await this.sendInvoiceReminder(invoice);
        
        if (emailResult.success) {
          successful++;
          results.push({
            invoice,
            success: true,
            message: 'Reminder sent successfully'
          });
        } else {
          failed++;
          results.push({
            invoice,
            success: false,
            message: emailResult.message
          });
        }
      } catch (error) {
        failed++;
        results.push({
          invoice,
          success: false,
          message: error.message
        });
      }
    }

    return {
      processed: overdueInvoices.length,
      successful,
      failed,
      results
    };
  }

  /**
   * Manually sends a specific scheduled invoice
   */
  async sendScheduledInvoice(invoiceId: number): Promise<{ success: boolean; message: string }> {
    try {
      const response = await authenticatedFetch(`/api/invoices/${invoiceId}`);
      const result = await response.json();
      const invoice = result.data;
      if (!invoice) {
        return {
          success: false,
          message: 'Invoice not found'
        };
      }

      // Check if invoice can be sent
      const emailStatus = await this.getEmailStatus(invoiceId);
      if (emailStatus && !this.canSendInvoice(emailStatus.status)) {
        return {
          success: false,
          message: 'Invoice is currently being sent'
        };
      }

      // Update status to 'sending'
      await this.updateEmailStatus(invoiceId, 'sending');
      
      // Send the invoice email
      const emailResult = await this.sendInvoiceEmail({
        id: invoice.id,
        invoice_number: invoice.invoice_number,
        client_name: invoice.client_name,
        client_email: invoice.client_email,
        amount: invoice.amount,
        due_date: invoice.due_date,
        status: invoice.status,
        notes: invoice.notes
      });
      
      if (emailResult.success) {
        // Mark as sent and update invoice status
        await this.markInvoiceAsSent(invoiceId);
        return {
          success: true,
          message: 'Invoice sent successfully'
        };
      } else {
        // Mark as failed
        await this.updateEmailStatus(invoiceId, 'failed', emailResult.message);
        return {
          success: false,
          message: emailResult.message
        };
      }
    } catch (error) {
      console.error('Error sending scheduled invoice:', error);
      // Mark as failed
      await this.updateEmailStatus(invoiceId, 'failed', error.message);
      return {
        success: false,
        message: 'Failed to send invoice'
      };
    }
  }

  // ===== INVOICE NUMBER FUNCTIONALITY =====

  /**
   * Generates a new invoice number from the server
   */
  async generateInvoiceNumber(): Promise<string> {
    try {
      const token = getToken();
      const response = await fetch('/api/invoices/generate-number', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.message || 'Failed to generate invoice number');
      }

      return result.data.invoice_number;
    } catch (error) {
      console.error('Error generating invoice number:', error);
      throw new Error('Failed to generate invoice number from server');
    }
  }

  /**
   * Previews the next invoice number without incrementing the counter
   */
  async previewNextInvoiceNumber(): Promise<string> {
    try {
      const token = getToken();
      const response = await fetch('/api/invoices/preview-number', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.message || 'Failed to preview invoice number');
      }

      return result.data.invoice_number;
    } catch (error) {
      console.error('Error previewing invoice number:', error);
      throw new Error('Failed to preview invoice number from server');
    }
  }

  /**
   * Generates a temporary invoice number for display (uses preview)
   */
  async generateTemporaryInvoiceNumber(): Promise<string> {
    return this.previewNextInvoiceNumber();
  }
}

// Export singleton instance
export const invoiceService = InvoiceService.getInstance();
export default invoiceService;