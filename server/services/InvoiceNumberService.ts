// Invoice Number Generation Service
// Centralized service for generating unique invoice numbers

import { databaseService } from '../core/DatabaseService.js';

/**
 * Service for generating unique invoice numbers
 * Uses database counter and settings for consistent numbering
 */
export class InvoiceNumberService {
  private static instance: InvoiceNumberService;

  static getInstance(): InvoiceNumberService {
    if (!InvoiceNumberService.instance) {
      InvoiceNumberService.instance = new InvoiceNumberService();
    }
    return InvoiceNumberService.instance;
  }

  /**
   * Generate a unique invoice number based on settings
   * @returns Promise<string> - Generated invoice number
   */
  async generateInvoiceNumber(): Promise<string> {
    try {
      // Get user's invoice numbering settings
      const settings = await this.getInvoiceNumberSettings();

      // Get and increment counter
      const counter = await this.getNextCounter();

      // Format invoice number based on settings
      return this.formatInvoiceNumber(counter, settings.prefix);
    } catch (error) {
      console.error('Error generating invoice number:', error);
      throw new Error('Failed to generate invoice number');
    }
  }

  /**
   * Get invoice number settings from database
   */
  private async getInvoiceNumberSettings(): Promise<{ prefix: string }> {
    try {
      const settings = await databaseService.getOne<{ value: string }>(
        'SELECT value FROM settings WHERE `key` = ? AND category = ?',
        ['invoice_number_settings', 'general']
      );

      if (settings && settings.value) {
        const parsed = JSON.parse(settings.value);
        return { prefix: parsed.prefix || 'INV' };
      }
    } catch (error) {
      console.warn('Could not load invoice number settings, using defaults:', error);
    }

    // Return default settings
    return { prefix: 'INV' };
  }

  /**
   * Get next counter value and increment it
   */
  private async getNextCounter(): Promise<number> {
    // Get current counter value
    const counter = await databaseService.getOne<{ value: number }>(
      'SELECT value FROM counters WHERE name = ?',
      ['invoice_counter']
    );

    let nextNumber = 1;
    if (counter) {
      nextNumber = counter.value + 1;
      // Update counter
      await databaseService.executeQuery(
        'UPDATE counters SET value = ?, updated_at = DATETIME(\'now\') WHERE name = ?',
        [nextNumber, 'invoice_counter']
      );
    } else {
      // Create counter if it doesn't exist
      await databaseService.executeQuery(
        'INSERT INTO counters (name, value, created_at, updated_at) VALUES (?, ?, DATETIME(\'now\'), DATETIME(\'now\'))',
        ['invoice_counter', nextNumber]
      );
    }

    return nextNumber;
  }

  /**
   * Format invoice number according to pattern
   */
  private formatInvoiceNumber(counter: number, prefix: string): string {
    const year = new Date().getFullYear();
    const month = String(new Date().getMonth() + 1).padStart(2, '0');
    const paddedCounter = String(counter).padStart(4, '0');

    // Format: PREFIX-YYYYMM-XXXX (e.g., INV-202412-0001)
    return `${prefix}-${year}${month}-${paddedCounter}`;
  }

  /**
   * Check if invoice number already exists
   */
  async isInvoiceNumberUnique(invoiceNumber: string): Promise<boolean> {
    try {
      const existing = await databaseService.getOne(
        'SELECT id FROM invoices WHERE invoice_number = ?',
        [invoiceNumber]
      );
      return !existing;
    } catch (error) {
      console.error('Error checking invoice number uniqueness:', error);
      return false;
    }
  }

  /**
   * Get next invoice number without incrementing counter (preview)
   */
  async getNextInvoiceNumber(): Promise<string> {
    try {
      const settings = await this.getInvoiceNumberSettings();
      const counter = await databaseService.getOne<{ value: number }>(
        'SELECT value FROM counters WHERE name = ?',
        ['invoice_counter']
      );

      const nextNumber = counter ? counter.value + 1 : 1;
      return this.formatInvoiceNumber(nextNumber, settings.prefix);
    } catch (error) {
      console.error('Error getting next invoice number:', error);
      throw new Error('Failed to get next invoice number');
    }
  }
}

export const invoiceNumberService = InvoiceNumberService.getInstance();