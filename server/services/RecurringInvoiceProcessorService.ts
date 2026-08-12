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
  /** Which billing period this invoice covers. Unique per template. */
  recurring_period_date: string;
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
  async processAllDueTemplates(): Promise<{ created: number; skipped: number; errors: string[] }> {
    const results = {
      created: 0,
      skipped: 0,
      errors: [] as string[]
    };

    try {
      const dueTemplates = await recurringInvoiceTemplateService.getTemplatesDueForProcessing();

      for (const template of dueTemplates) {
        const periodDate = template.next_invoice_date;

        try {
          const row = await this.buildInvoiceRow(template, periodDate);

          const nextDate = recurringInvoiceTemplateService.calculateNextInvoiceDate(
            periodDate,
            template.frequency
          );

          // One transaction. Creating the invoice and advancing the template
          // used to be two statements, so a process killed between them — which
          // an ephemeral host does on every redeploy — re-created the invoice on
          // the next boot with nothing to reject it.
          await databaseService.withTransaction(async () => {
            await this.insertInvoiceRow(row);

            await databaseService.executeQuery(
              `UPDATE recurring_invoice_templates SET next_invoice_date = ?, updated_at = ${databaseService.dialect.now()} WHERE id = ?`,
              [nextDate, template.id]
            );
          });

          results.created++;
        } catch (error) {
          const message = (error as Error).message;

          // The unique index is the real guarantee. A duplicate here means
          // another instance, or an earlier interrupted run, already billed this
          // period — which is success, not failure.
          if (message.includes('idx_invoices_recurring_period') || message.includes('UNIQUE')) {
            results.skipped++;
            continue;
          }

          results.errors.push(`Template ID ${template.id}: ${message}`);
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

      const periodDate = template.next_invoice_date;
      const row = await this.buildInvoiceRow(template, periodDate);

      const nextDate = recurringInvoiceTemplateService.calculateNextInvoiceDate(
        periodDate,
        template.frequency
      );

      // Same guarantee as the scheduled path: create and advance together, or
      // neither. A manual run and a scheduled run can otherwise collide.
      const invoiceId = await databaseService.withTransaction(async () => {
        const id = await this.insertInvoiceRow(row);

        await databaseService.executeQuery(
          `UPDATE recurring_invoice_templates SET next_invoice_date = ?, updated_at = ${databaseService.dialect.now()} WHERE id = ?`,
          [nextDate, template.id]
        );

        return id;
      });

      return { success: true, invoiceId };

    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Assemble the invoice row for a template's billing period.
   *
   * Split from the insert because generating the invoice number is async, and
   * better-sqlite3 transactions are synchronous — an await inside one would
   * commit at an unpredictable point.
   */
  private async buildInvoiceRow(
    template: {
      id: number;
      client_id: number;
      amount: number;
      description?: string | null;
      payment_terms: string;
      line_items?: string | null;
      tax_amount: number;
      tax_rate_id?: string | null;
      shipping_amount: number;
      shipping_rate_id?: string | null;
      notes?: string | null;
    },
    periodDate: string
  ): Promise<InvoiceCreationData> {
    // The same numbering service manual invoices use, so a configured prefix
    // applies to both and the counter is not advanced twice.
    const invoiceNumber = await invoiceNumberService.generateInvoiceNumber();

    const issueDate: string = new Date().toISOString().split('T')[0]!;
    const dueDate = this.calculateDueDate(issueDate, template.payment_terms);

    return {
      invoice_number: invoiceNumber,
      client_id: template.client_id,
      recurring_template_id: template.id,
      recurring_period_date: periodDate,
      amount: template.amount,
      tax_amount: template.tax_amount,
      total_amount: template.amount + template.tax_amount + template.shipping_amount,
      status: 'draft',
      due_date: dueDate,
      issue_date: issueDate,
      description: template.description ?? null,
      line_items: template.line_items ?? null,
      notes: template.notes ?? null,
      payment_terms: template.payment_terms,
      shipping_amount: template.shipping_amount,
      tax_rate_id: template.tax_rate_id ?? null,
      shipping_rate_id: template.shipping_rate_id ?? null
    };
  }

  /** Insert an assembled invoice row. */
  private async insertInvoiceRow(data: InvoiceCreationData): Promise<number> {
    const result = await databaseService.executeQuery(
      `INSERT INTO invoices (
        invoice_number, client_id, recurring_template_id, recurring_period_date,
        amount, tax_amount, total_amount, status, due_date, issue_date,
        description, line_items, notes, payment_terms, shipping_amount,
        tax_rate_id, shipping_rate_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${databaseService.dialect.now()}, ${databaseService.dialect.now()})`,
      [
        data.invoice_number,
        data.client_id,
        data.recurring_template_id,
        data.recurring_period_date,
        data.amount,
        data.tax_amount,
        data.total_amount,
        data.status,
        data.due_date,
        data.issue_date,
        data.description,
        data.line_items,
        data.notes,
        data.payment_terms,
        data.shipping_amount,
        data.tax_rate_id,
        data.shipping_rate_id
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