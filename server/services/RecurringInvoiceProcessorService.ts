// Recurring Invoice Processor Service
// Handles creating invoices from recurring templates and updating next due dates

import { databaseService } from '../core/DatabaseService.js';
import { recurringInvoiceTemplateService } from './RecurringInvoiceTemplateService.js';
import { invoiceNumberService } from './InvoiceNumberService.js';

/**
 * Invoice creation data interface
 */
interface InvoiceCreationData {
  invoice_number: string;
  client_id: number;
  recurring_template_id: number;
  amount: number;
  tax_amount: number;
  total_amount: number;
  status: string;
  due_date: string;
  issue_date: string;
  description: string | null;
  line_items: string | null;
  notes: string | null;
  payment_terms: string;
  shipping_amount: number;
  tax_rate_id: string | null;
  shipping_rate_id: string | null;
}

/**
 * Recurring Invoice Processor Service
 * Handles the creation of invoices from recurring templates
 */
export class RecurringInvoiceProcessorService {
  /**
   * Process all due recurring templates and create invoices
   */
  async processAllDueTemplates(): Promise<{ created: number; errors: string[] }> {
    const results = {
      created: 0,
      errors: [] as string[]
    };

    try {
      const dueTemplates = await recurringInvoiceTemplateService.getTemplatesDueForProcessing();

      for (const template of dueTemplates) {
        try {
          await this.createInvoiceFromTemplate(template);
          results.created++;

          // Update next invoice date
          const nextDate = recurringInvoiceTemplateService.calculateNextInvoiceDate(
            template.next_invoice_date,
            template.frequency
          );
          await recurringInvoiceTemplateService.updateNextInvoiceDate(template.id, nextDate);

        } catch (error) {
          const errorMessage = `Template ID ${template.id}: ${(error as Error).message}`;
          results.errors.push(errorMessage);
        }
      }
    } catch (error) {
      results.errors.push(`Failed to fetch due templates: ${(error as Error).message}`);
    }

    return results;
  }

  /**
   * Process a specific recurring template
   */
  async processSingleTemplate(templateId: number): Promise<{ success: boolean; invoiceId?: number; error?: string }> {
    try {
      const template = await recurringInvoiceTemplateService.getRecurringTemplateById(templateId);
      
      if (!template) {
        return { success: false, error: 'Recurring template not found' };
      }

      if (!template.is_active) {
        return { success: false, error: 'Recurring template is inactive' };
      }

      const invoiceId = await this.createInvoiceFromTemplate(template);

      // Update next invoice date
      const nextDate = recurringInvoiceTemplateService.calculateNextInvoiceDate(
        template.next_invoice_date,
        template.frequency
      );
      await recurringInvoiceTemplateService.updateNextInvoiceDate(template.id, nextDate);

      return { success: true, invoiceId };

    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Create an invoice from a recurring template
   */
  private async createInvoiceFromTemplate(template: {
    id: number;
    name: string;
    client_id: number;
    amount: number;
    description?: string | null;
    frequency: string;
    payment_terms: string;
    next_invoice_date: string;
    is_active: boolean;
    line_items?: string | null;
    tax_amount: number;
    tax_rate_id?: string | null;
    shipping_amount: number;
    shipping_rate_id?: string | null;
    notes?: string | null;
  }): Promise<number> {
    // Use the same numbering service manual invoices use, so a configured
    // prefix applies to both and the counter is not advanced twice.
    const invoiceNumber = await invoiceNumberService.generateInvoiceNumber();

    // Calculate due date based on payment terms
    const issueDate: string = new Date().toISOString().split('T')[0]!;
    const dueDate = this.calculateDueDate(issueDate, template.payment_terms!);

    // Calculate total amount
    const totalAmount = template.amount + template.tax_amount + template.shipping_amount;

    const invoiceData: InvoiceCreationData = {
      invoice_number: invoiceNumber,
      client_id: template.client_id,
      recurring_template_id: template.id,
      amount: template.amount,
      tax_amount: template.tax_amount,
      total_amount: totalAmount,
      status: 'draft',
      due_date: dueDate,
      issue_date: issueDate,
      description: template.description ?? null,
      line_items: template.line_items ?? null,
      notes: template.notes ?? null,
      payment_terms: template.payment_terms!,
      shipping_amount: template.shipping_amount,
      tax_rate_id: template.tax_rate_id ?? null,
      shipping_rate_id: template.shipping_rate_id ?? null
    };

    // Insert invoice into database
    const result = databaseService.executeQuery(
      `INSERT INTO invoices (
        invoice_number, client_id, recurring_template_id, amount, tax_amount,
        total_amount, status, due_date, issue_date, description, line_items,
        notes, payment_terms, shipping_amount, tax_rate_id, shipping_rate_id,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, DATETIME('now'), DATETIME('now'))`,
      [
        invoiceData.invoice_number,
        invoiceData.client_id,
        invoiceData.recurring_template_id,
        invoiceData.amount,
        invoiceData.tax_amount,
        invoiceData.total_amount,
        invoiceData.status,
        invoiceData.due_date,
        invoiceData.issue_date,
        invoiceData.description || null,
        invoiceData.line_items || null,
        invoiceData.notes || null,
        invoiceData.payment_terms,
        invoiceData.shipping_amount,
        invoiceData.tax_rate_id,
        invoiceData.shipping_rate_id
      ]
    );

    return result.lastInsertRowid;
  }

  /**
   * Calculate due date based on payment terms
   */
  private calculateDueDate(issueDate: string, paymentTerms: string): string {
    // `new Date('2026-03-01')` parses as UTC midnight, so the day arithmetic
    // must be UTC too. Adding days in local time shifts the instant by an hour
    // across a daylight-saving change, landing on the previous day.
    const date = new Date(issueDate);

    // Parse payment terms (e.g., "Net 30", "Due on receipt", "30 days")
    const terms = paymentTerms.toLowerCase();

    if (terms.includes('receipt') || terms.includes('due immediately')) {
      // Due immediately
      return issueDate;
    }

    // Extract number of days from payment terms
    const daysMatch = terms.match(/(\d+)\s*(day|days)/);
    const netMatch = terms.match(/net\s*(\d+)/);

    let daysToAdd = 30; // Default to 30 days

    if (netMatch && netMatch[1]) {
      daysToAdd = parseInt(netMatch[1]);
    } else if (daysMatch && daysMatch[1]) {
      daysToAdd = parseInt(daysMatch[1]);
    }

    date.setUTCDate(date.getUTCDate() + daysToAdd);
    return date.toISOString().split('T')[0]!;
  }

  /**
   * Get processing statistics
   */
  async getProcessingStats(): Promise<{
    totalActiveTemplates: number;
    templatesDueToday: number;
    templatesOverdue: number;
    nextProcessingDate?: string | undefined;
  }> {
    const today = new Date().toISOString().split('T')[0];

    const activeTemplates = await databaseService.getOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM recurring_invoice_templates WHERE is_active = 1'
    );

    const dueToday = await databaseService.getOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM recurring_invoice_templates WHERE is_active = 1 AND next_invoice_date = ?',
      [today]
    );

    const overdue = await databaseService.getOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM recurring_invoice_templates WHERE is_active = 1 AND next_invoice_date < ?',
      [today]
    );

    const nextProcessing = await databaseService.getOne<{ next_date: string }>(
      'SELECT next_invoice_date as next_date FROM recurring_invoice_templates WHERE is_active = 1 AND next_invoice_date > ? ORDER BY next_invoice_date ASC LIMIT 1',
      [today]
    );

    return {
      totalActiveTemplates: activeTemplates?.count || 0,
      templatesDueToday: dueToday?.count || 0,
      templatesOverdue: overdue?.count || 0,
      nextProcessingDate: nextProcessing?.next_date
    };
  }
}

// Export singleton instance
export const recurringInvoiceProcessorService = new RecurringInvoiceProcessorService();