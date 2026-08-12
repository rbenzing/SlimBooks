// Recurring Invoice Template Service - Domain-specific service for recurring invoice template operations
// Handles all recurring invoice template-related business logic and database operations

import { databaseService } from '../core/DatabaseService.js';
import type { SQLParams } from '../types/database.types.js';
import { utcCalendarDay } from '../utils/utcTime.util.js';

/**
 * Recurring Invoice Template interface
 */
interface RecurringInvoiceTemplate {
  id: number;
  name: string;
  client_id: number;
  client_name?: string;
  client_email?: string;
  amount: number;
  description?: string;
  frequency: 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'custom';
  payment_terms: string;
  next_invoice_date: string;
  is_active: boolean;
  line_items?: string;
  tax_amount: number;
  tax_rate_id?: string;
  shipping_amount: number;
  shipping_rate_id?: string;
  notes?: string;
  created_at: number;
  updated_at: number;
}

/**
 * Recurring Invoice Template creation data interface
 */
interface RecurringInvoiceTemplateData {
  name: string;
  client_id: number;
  amount: number;
  description?: string;
  frequency: 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'custom';
  payment_terms: string;
  next_invoice_date: string;
  is_active?: boolean;
  line_items?: string;
  tax_amount?: number;
  tax_rate_id?: string;
  shipping_amount?: number;
  shipping_rate_id?: string;
  notes?: string;
}

/**
 * Recurring Invoice Template Service
 * Manages recurring invoice templates for automated invoice creation
 */
export class RecurringInvoiceTemplateService {
  /**
   * Get all recurring invoice templates
   */
  async getAllRecurringTemplates(): Promise<RecurringInvoiceTemplate[]> {
    return databaseService.getMany<RecurringInvoiceTemplate>(
      `SELECT rt.*, c.name as client_name, c.email as client_email
       FROM recurring_invoice_templates rt
       LEFT JOIN clients c ON rt.client_id = c.id
       ORDER BY rt.name ASC`
    );
  }

  /**
   * Get active recurring invoice templates
   */
  async getActiveRecurringTemplates(): Promise<RecurringInvoiceTemplate[]> {
    return databaseService.getMany<RecurringInvoiceTemplate>(
      `SELECT rt.*, c.name as client_name, c.email as client_email
       FROM recurring_invoice_templates rt
       LEFT JOIN clients c ON rt.client_id = c.id
       WHERE rt.is_active = 1
       ORDER BY rt.name ASC`
    );
  }

  /**
   * Get recurring templates due for processing
   */
  async getTemplatesDueForProcessing(): Promise<RecurringInvoiceTemplate[]> {
    return databaseService.getMany<RecurringInvoiceTemplate>(
      `SELECT * FROM recurring_invoice_templates
       WHERE is_active = 1 AND next_invoice_date <= ${databaseService.dialect.today()}
       ORDER BY next_invoice_date ASC`
    );
  }

  /**
   * Get recurring invoice template by ID
   */
  async getRecurringTemplateById(id: number): Promise<RecurringInvoiceTemplate | null> {
    if (!id || typeof id !== 'number') {
      throw new Error('Valid recurring template ID is required');
    }

    return databaseService.getOne<RecurringInvoiceTemplate>(
      'SELECT * FROM recurring_invoice_templates WHERE id = ?',
      [id]
    );
  }

  /**
   * Get recurring templates by client ID
   */
  async getRecurringTemplatesByClientId(clientId: number): Promise<RecurringInvoiceTemplate[]> {
    if (!clientId || typeof clientId !== 'number') {
      throw new Error('Valid client ID is required');
    }

    return databaseService.getMany<RecurringInvoiceTemplate>(
      'SELECT * FROM recurring_invoice_templates WHERE client_id = ? ORDER BY name ASC',
      [clientId]
    );
  }

  /**
   * Create new recurring invoice template
   */
  async createRecurringTemplate(templateData: RecurringInvoiceTemplateData): Promise<number> {
    if (!templateData.name || typeof templateData.name !== 'string') {
      throw new Error('Template name is required');
    }

    if (!templateData.client_id || typeof templateData.client_id !== 'number') {
      throw new Error('Client ID is required');
    }

    if (!templateData.amount || typeof templateData.amount !== 'number' || templateData.amount <= 0) {
      throw new Error('Valid amount is required');
    }

    if (!templateData.frequency || !['weekly', 'monthly', 'quarterly', 'yearly', 'custom'].includes(templateData.frequency)) {
      throw new Error('Valid frequency is required');
    }

    if (!templateData.payment_terms || typeof templateData.payment_terms !== 'string') {
      throw new Error('Payment terms are required');
    }

    if (!templateData.next_invoice_date || typeof templateData.next_invoice_date !== 'string') {
      throw new Error('Next invoice date is required');
    }

    // Validate client exists
    const clientExists = await databaseService.getOne(
      'SELECT id FROM clients WHERE id = ?',
      [templateData.client_id]
    );

    if (!clientExists) {
      throw new Error('Client not found');
    }

    const result = await databaseService.executeQuery(
      `INSERT INTO recurring_invoice_templates (
        name, client_id, amount, description, frequency, payment_terms, 
        next_invoice_date, is_active, line_items, tax_amount, tax_rate_id, 
        shipping_amount, shipping_rate_id, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${databaseService.dialect.now()}, ${databaseService.dialect.now()})`,
      [
        templateData.name,
        templateData.client_id,
        templateData.amount,
        templateData.description || null,
        templateData.frequency,
        templateData.payment_terms,
        templateData.next_invoice_date,
        templateData.is_active !== false ? 1 : 0,
        templateData.line_items || null,
        templateData.tax_amount || 0,
        templateData.tax_rate_id || null,
        templateData.shipping_amount || 0,
        templateData.shipping_rate_id || null,
        templateData.notes || null
      ]
    );

    return result.lastInsertRowid;
  }

  /**
   * Update recurring invoice template
   */
  async updateRecurringTemplate(id: number, templateData: Partial<RecurringInvoiceTemplateData>): Promise<boolean> {
    if (!id || typeof id !== 'number') {
      throw new Error('Valid recurring template ID is required');
    }

    if (!templateData || Object.keys(templateData).length === 0) {
      throw new Error('Template data is required');
    }

    // Check if template exists
    const existingTemplate = await this.getRecurringTemplateById(id);
    if (!existingTemplate) {
      throw new Error('Recurring template not found');
    }

    // If client_id is being updated, validate it exists
    if (templateData.client_id) {
      const clientExists = await databaseService.getOne(
        'SELECT id FROM clients WHERE id = ?',
        [templateData.client_id]
      );

      if (!clientExists) {
        throw new Error('Client not found');
      }
    }

    const updates: string[] = [];
    const values: SQLParams = [];

    if (templateData.name !== undefined) {
      updates.push('name = ?');
      values.push(templateData.name);
    }

    if (templateData.client_id !== undefined) {
      updates.push('client_id = ?');
      values.push(templateData.client_id);
    }

    if (templateData.amount !== undefined) {
      updates.push('amount = ?');
      values.push(templateData.amount);
    }

    if (templateData.description !== undefined) {
      updates.push('description = ?');
      values.push(templateData.description);
    }

    if (templateData.frequency !== undefined) {
      updates.push('frequency = ?');
      values.push(templateData.frequency);
    }

    if (templateData.payment_terms !== undefined) {
      updates.push('payment_terms = ?');
      values.push(templateData.payment_terms);
    }

    if (templateData.next_invoice_date !== undefined) {
      updates.push('next_invoice_date = ?');
      values.push(templateData.next_invoice_date);
    }

    if (templateData.is_active !== undefined) {
      updates.push('is_active = ?');
      values.push(templateData.is_active ? 1 : 0);
    }

    if (templateData.line_items !== undefined) {
      updates.push('line_items = ?');
      values.push(templateData.line_items);
    }

    if (templateData.tax_amount !== undefined) {
      updates.push('tax_amount = ?');
      values.push(templateData.tax_amount);
    }

    if (templateData.tax_rate_id !== undefined) {
      updates.push('tax_rate_id = ?');
      values.push(templateData.tax_rate_id);
    }

    if (templateData.shipping_amount !== undefined) {
      updates.push('shipping_amount = ?');
      values.push(templateData.shipping_amount);
    }

    if (templateData.shipping_rate_id !== undefined) {
      updates.push('shipping_rate_id = ?');
      values.push(templateData.shipping_rate_id);
    }

    if (templateData.notes !== undefined) {
      updates.push('notes = ?');
      values.push(templateData.notes);
    }

    updates.push(`updated_at = ${databaseService.dialect.now()}`);
    values.push(id);

    const result = await databaseService.executeQuery(
      `UPDATE recurring_invoice_templates SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    return result.changes > 0;
  }

  /**
   * Delete recurring invoice template
   */
  async deleteRecurringTemplate(id: number): Promise<boolean> {
    if (!id || typeof id !== 'number') {
      throw new Error('Valid recurring template ID is required');
    }

    // Check if template is in use by any invoices
    const inUse = await databaseService.getOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM invoices WHERE recurring_template_id = ?',
      [id]
    );

    if (inUse && inUse.count > 0) {
      throw new Error('Recurring template is currently in use by invoices and cannot be deleted');
    }

    const result = await databaseService.executeQuery(
      'DELETE FROM recurring_invoice_templates WHERE id = ?',
      [id]
    );

    return result.changes > 0;
  }

  /**
   * Activate/deactivate recurring template
   */
  async toggleRecurringTemplate(id: number, isActive: boolean): Promise<boolean> {
    if (!id || typeof id !== 'number') {
      throw new Error('Valid recurring template ID is required');
    }

    const result = await databaseService.executeQuery(
      `UPDATE recurring_invoice_templates SET is_active = ?, updated_at = ${databaseService.dialect.now()} WHERE id = ?`,
      [isActive ? 1 : 0, id]
    );

    return result.changes > 0;
  }

  /**
   * Update next invoice date after processing
   */
  async updateNextInvoiceDate(id: number, nextDate: string): Promise<boolean> {
    if (!id || typeof id !== 'number') {
      throw new Error('Valid recurring template ID is required');
    }

    if (!nextDate || typeof nextDate !== 'string') {
      throw new Error('Valid next invoice date is required');
    }

    const result = await databaseService.executeQuery(
      `UPDATE recurring_invoice_templates SET next_invoice_date = ?, updated_at = ${databaseService.dialect.now()} WHERE id = ?`,
      [nextDate, id]
    );

    return result.changes > 0;
  }

  /**
   * Calculate next invoice date based on frequency
   */
  calculateNextInvoiceDate(currentDate: string, frequency: string): string {
    // `new Date('2026-12-01')` parses as UTC midnight, so the arithmetic must
    // read and write UTC components too. Mixing the two shifts the schedule by
    // a day west of UTC — '2026-12-01' monthly landed on 2026-12-31.
    const date = new Date(currentDate);

    switch (frequency) {
      case 'weekly':
        date.setUTCDate(date.getUTCDate() + 7);
        break;
      case 'monthly':
        date.setUTCMonth(date.getUTCMonth() + 1);
        break;
      case 'quarterly':
        date.setUTCMonth(date.getUTCMonth() + 3);
        break;
      case 'yearly':
        date.setUTCFullYear(date.getUTCFullYear() + 1);
        break;
      default:
        // For custom frequency, don't auto-calculate
        return currentDate;
    }

    return utcCalendarDay(date); // Return YYYY-MM-DD format
  }
}

// Export singleton instance
export const recurringInvoiceTemplateService = new RecurringInvoiceTemplateService();