// Invoice Service - Domain-specific service for invoice operations
// Handles all invoice-related business logic and database operations

import jwt from 'jsonwebtoken';
import { databaseService } from '../core/DatabaseService.js';
import { authConfig } from '../config/index.js';
import { type ServiceOptions, type InvoiceWithClient, type InvoiceStatus } from '../types/index.js';
import { type PublicInvoiceDisplay, type PublicInvoiceTokenPayload } from '../types/invoice.types.js';
import { invoiceNumberService } from './InvoiceNumberService.js';

/**
 * Invoice Service
 * Manages invoice-related operations with proper validation and security
 */
export class InvoiceService {
  /**
   * Get all invoices with filtering and pagination
   */
  async getAllInvoices(filters: {
    status?: InvoiceStatus;
    client_id?: number;
  } = {}, options: ServiceOptions = {}): Promise<{
    invoices: InvoiceWithClient[];
    pagination: {
      total: number;
      limit: number;
      offset: number;
      hasMore: boolean;
    };
  }> {
    const { limit = 50, offset = 0 } = options;
    const { status, client_id } = filters;
    
    let query = `
      SELECT i.*, c.name as client_name, c.email as client_email 
      FROM invoices i 
      LEFT JOIN clients c ON i.client_id = c.id
    `;
    
    const conditions: string[] = [];
    const params: (string | number | null | boolean)[] = [];
    
    if (status) {
      conditions.push('i.status = ?');
      params.push(status);
    }
    
    if (client_id) {
      conditions.push('i.client_id = ?');
      params.push(client_id);
    }
    
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    
    query += ' ORDER BY i.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    
    const invoices = await databaseService.getMany<InvoiceWithClient>(query, params);

    // Get total count for pagination
    let countQuery = 'SELECT COUNT(*) as count FROM invoices i';
    if (conditions.length > 0) {
      countQuery += ' WHERE ' + conditions.join(' AND ');
    }

    const totalResult = await databaseService.getOne<{count: number}>(countQuery, params.slice(0, -2));
    const total = totalResult?.count || 0;
    
    return {
      invoices,
      pagination: {
        total,
        limit,
        offset,
        hasMore: total > offset + limit
      }
    };
  }

  /**
   * Get invoice by ID with client details
   */
  async getInvoiceById(id: number): Promise<InvoiceWithClient | null> {
    if (!id || typeof id !== 'number') {
      throw new Error('Valid invoice ID is required');
    }

    return databaseService.getOne<InvoiceWithClient>(`
      SELECT i.*, c.name as client_name, c.email as client_email, c.company as client_company,
             c.address as client_address, c.city as client_city, c.state as client_state,
             c.zipCode as client_zip, c.country as client_country, c.phone as client_phone
      FROM invoices i
      LEFT JOIN clients c ON i.client_id = c.id
      WHERE i.id = ?
    `, [id]);
  }

  /**
   * Get public invoice by ID with secure token validation
   */
  async getPublicInvoiceById(id: number, token: string): Promise<PublicInvoiceDisplay> {
    if (!token || !id) {
      throw new Error('Invalid or expired invoice link');
    }

    try {
      // Verify the token using JWT with expiration
      const decoded = jwt.verify(token, authConfig.jwtSecret) as PublicInvoiceTokenPayload;

      // Validate token payload
      if (!decoded.invoiceId || !decoded.type || decoded.type !== 'public_invoice') {
        throw new Error('Invalid or expired invoice link');
      }

      // Ensure token is for the requested invoice
      if (decoded.invoiceId !== id) {
        throw new Error('Invalid or expired invoice link');
      }

      // Get invoice with client details
      const invoice = await this.getInvoiceById(id);
      if (!invoice) {
        throw new Error('Invalid or expired invoice link');
      }

      // Get company settings for public display (independent reads)
      const [companySettings, currencySettings, invoiceTemplate] = await Promise.all([
        databaseService.getOne<{value: string}>(`
          SELECT value FROM settings WHERE key = ? AND category = ?
        `, ['company_settings', 'company']),
        databaseService.getOne<{value: string}>(`
          SELECT value FROM settings WHERE key = ? AND category = ?
        `, ['currency_settings', 'currency']),
        databaseService.getOne<{value: string}>(`
          SELECT value FROM settings WHERE key = ? AND category = ?
        `, ['invoice_template', 'appearance'])
      ]);

      // Include settings in the response for public display
      return {
        ...invoice,
        companySettings: companySettings ? JSON.parse(companySettings.value) : null,
        currencySettings: currencySettings ? JSON.parse(currencySettings.value) : null,
        invoiceTemplate: invoiceTemplate?.value || 'modern-blue'
      };

    } catch {
      throw new Error('Invalid or expired invoice link');
    }
  }

  /**
   * Generate secure public token for invoice
   */
  async generatePublicInvoiceToken(id: number): Promise<{
    token: string;
    expiresIn: string;
    publicUrl: string;
  }> {
    if (!id || typeof id !== 'number') {
      throw new Error('Valid invoice ID is required');
    }

    // Verify invoice exists
    const invoice = await databaseService.getOne<{id: number; invoice_number: string}>(`
      SELECT i.id, i.invoice_number
      FROM invoices i
      WHERE i.id = ?
    `, [id]);

    if (!invoice) {
      throw new Error('Invoice not found');
    }

    // Generate secure token with expiration
    const tokenPayload = {
      invoiceId: id,
      type: 'public_invoice',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours
    };

    const token = jwt.sign(tokenPayload, authConfig.jwtSecret);

    return {
      token,
      expiresIn: '24h',
      publicUrl: `${process.env.CLIENT_URL}/invoice/${id}?token=${token}`
    };
  }

  /**
   * Create new invoice
   */
  async createInvoice(invoiceData: {
    invoice_number?: string;  // Now optional - will be auto-generated if not provided
    client_id: number;
    design_template_id?: number;
    recurring_template_id?: number;
    amount: number;
    tax_amount?: number;
    total_amount?: number;
    status?: InvoiceStatus;
    due_date?: string;
    issue_date?: string;
    description?: string;
    items?: string;
    notes?: string;
    payment_terms?: string;
    stripe_invoice_id?: string;
    stripe_payment_intent_id?: string;
    type?: string;
    client_name?: string;
    client_email?: string;
    client_phone?: string;
    client_address?: string;
    line_items?: string;
    tax_rate_id?: number;
    shipping_amount?: number;
    shipping_rate_id?: number;
    email_status?: string;
    email_sent_at?: string;
    email_error?: string;
    last_email_attempt?: string;
  }): Promise<number> {
    if (!invoiceData || !invoiceData.client_id || !invoiceData.amount) {
      throw new Error('Invalid invoice data - client_id and amount are required');
    }

    // Validate required fields
    if (typeof invoiceData.amount !== 'number' || invoiceData.amount < 0) {
      throw new Error('Valid invoice amount is required');
    }

    if (typeof invoiceData.client_id !== 'number') {
      throw new Error('Valid client ID is required');
    }

    // Check if client exists
    const clientExists = await databaseService.exists('clients', 'id', invoiceData.client_id);
    if (!clientExists) {
      throw new Error('Client not found');
    }

    // Auto-generate invoice number if not provided
    let invoiceNumber = invoiceData.invoice_number;
    if (!invoiceNumber) {
      invoiceNumber = await invoiceNumberService.generateInvoiceNumber();
    } else {
      // Check if provided invoice number already exists
      const invoiceExists = await databaseService.exists('invoices', 'invoice_number', invoiceNumber);
      if (invoiceExists) {
        throw new Error('Invoice number already exists');
      }
    }

    // Get next invoice ID
    const nextId = await databaseService.getNextSequence('invoices');
    
    // Prepare invoice data
    const now = new Date().toISOString();
    const invoiceRecord = {
      id: nextId,
      invoice_number: invoiceNumber,
      client_id: invoiceData.client_id,
      design_template_id: invoiceData.design_template_id || null,
      recurring_template_id: invoiceData.recurring_template_id || null,
      amount: invoiceData.amount,
      tax_amount: invoiceData.tax_amount || 0,
      total_amount: invoiceData.total_amount || invoiceData.amount,
      status: invoiceData.status || 'draft',
      due_date: invoiceData.due_date || null,
      issue_date: invoiceData.issue_date || null,
      description: invoiceData.description || '',
      items: invoiceData.items || null,
      notes: invoiceData.notes || '',
      payment_terms: invoiceData.payment_terms || '',
      stripe_invoice_id: invoiceData.stripe_invoice_id || null,
      stripe_payment_intent_id: invoiceData.stripe_payment_intent_id || null,
      type: invoiceData.type || 'one-time',
      client_name: invoiceData.client_name || null,
      client_email: invoiceData.client_email || null,
      client_phone: invoiceData.client_phone || null,
      client_address: invoiceData.client_address || null,
      line_items: invoiceData.line_items || null,
      tax_rate_id: invoiceData.tax_rate_id || null,
      shipping_amount: invoiceData.shipping_amount || 0,
      shipping_rate_id: invoiceData.shipping_rate_id || null,
      email_status: invoiceData.email_status || 'not_sent',
      email_sent_at: invoiceData.email_sent_at || null,
      email_error: invoiceData.email_error || null,
      last_email_attempt: invoiceData.last_email_attempt || null,
      created_at: now,
      updated_at: now
    };

    // Create invoice
    await databaseService.executeQuery(`
      INSERT INTO invoices (
        id, invoice_number, client_id, design_template_id, recurring_template_id, amount, tax_amount, total_amount,
        status, due_date, issue_date, description, items, notes, payment_terms,
        stripe_invoice_id, stripe_payment_intent_id, type, client_name, client_email,
        client_phone, client_address, line_items, tax_rate_id, shipping_amount,
        shipping_rate_id, email_status, email_sent_at, email_error, last_email_attempt,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      invoiceRecord.id, invoiceRecord.invoice_number, invoiceRecord.client_id,
      invoiceRecord.design_template_id, invoiceRecord.recurring_template_id, invoiceRecord.amount, invoiceRecord.tax_amount,
      invoiceRecord.total_amount, invoiceRecord.status, invoiceRecord.due_date,
      invoiceRecord.issue_date, invoiceRecord.description, invoiceRecord.items,
      invoiceRecord.notes, invoiceRecord.payment_terms, invoiceRecord.stripe_invoice_id,
      invoiceRecord.stripe_payment_intent_id, invoiceRecord.type, invoiceRecord.client_name,
      invoiceRecord.client_email, invoiceRecord.client_phone, invoiceRecord.client_address,
      invoiceRecord.line_items, invoiceRecord.tax_rate_id, invoiceRecord.shipping_amount,
      invoiceRecord.shipping_rate_id, invoiceRecord.email_status, invoiceRecord.email_sent_at,
      invoiceRecord.email_error, invoiceRecord.last_email_attempt, invoiceRecord.created_at,
      invoiceRecord.updated_at
    ]);

    return nextId;
  }

  /**
   * Update invoice
   */
  async updateInvoice(id: number, invoiceData: Partial<{
    invoice_number: string;
    client_id: number;
    design_template_id: number;
    recurring_template_id: number;
    amount: number;
    tax_amount: number;
    total_amount: number;
    status: InvoiceStatus;
    due_date: string;
    issue_date: string;
    description: string;
    items: string;
    notes: string;
    payment_terms: string;
    stripe_invoice_id: string;
    stripe_payment_intent_id: string;
    type: string;
    client_name: string;
    client_email: string;
    client_phone: string;
    client_address: string;
    line_items: string;
    tax_rate_id: number;
    shipping_amount: number;
    shipping_rate_id: number;
    email_status: string;
    email_sent_at: string;
    email_error: string;
    last_email_attempt: string;
  }>): Promise<number> {
    if (!id || typeof id !== 'number') {
      throw new Error('Valid invoice ID is required');
    }

    if (!invoiceData || typeof invoiceData !== 'object') {
      throw new Error('Invoice data is required');
    }

    // Check if invoice exists
    const existingInvoice = await this.getInvoiceById(id);
    if (!existingInvoice) {
      throw new Error('Invoice not found');
    }

    // Validate amount if provided
    if (invoiceData.amount !== undefined && 
        (typeof invoiceData.amount !== 'number' || invoiceData.amount < 0)) {
      throw new Error('Valid invoice amount is required');
    }

    // If invoice number is being updated, check for duplicates
    if (invoiceData.invoice_number) {
      const numberExists = await databaseService.getOne<{id: number}>(
        'SELECT id FROM invoices WHERE invoice_number = ? AND id != ?',
        [invoiceData.invoice_number, id]
      );
      if (numberExists) {
        throw new Error('Another invoice with this number already exists');
      }
    }

    // If client_id is being updated, check if client exists
    if (invoiceData.client_id && !(await databaseService.exists('clients', 'id', invoiceData.client_id))) {
      throw new Error('Client not found');
    }

    // Filter allowed fields
    const allowedFields = [
      'invoice_number', 'client_id', 'design_template_id', 'recurring_template_id', 'amount', 'tax_amount',
      'total_amount', 'status', 'due_date', 'issue_date', 'description',
      'items', 'notes', 'payment_terms', 'stripe_invoice_id', 'stripe_payment_intent_id',
      'type', 'client_name', 'client_email', 'client_phone', 'client_address',
      'line_items', 'tax_rate_id', 'shipping_amount', 'shipping_rate_id',
      'email_status', 'email_sent_at', 'email_error', 'last_email_attempt'
    ];
    
    const updateData: Record<string, unknown> = {};
    allowedFields.forEach(field => {
      if (invoiceData[field as keyof typeof invoiceData] !== undefined) {
        updateData[field] = invoiceData[field as keyof typeof invoiceData];
      }
    });

    if (Object.keys(updateData).length === 0) {
      throw new Error('No valid fields to update');
    }

    const success = await databaseService.updateRecord('invoices', id, updateData);
    return success ? 1 : 0;
  }

  /**
   * Delete invoice
   */
  async deleteInvoice(id: number): Promise<number> {
    if (!id || typeof id !== 'number') {
      throw new Error('Valid invoice ID is required');
    }

    // Check if invoice exists and get status
    const invoice = await databaseService.getOne<{id: number; status: InvoiceStatus}>(
      'SELECT id, status FROM invoices WHERE id = ?',
      [id]
    );

    if (!invoice) {
      throw new Error('Invoice not found');
    }

    // Prevent deletion of paid invoices
    if (invoice.status === 'paid') {
      throw new Error('Cannot delete paid invoices');
    }

    const success = await databaseService.deleteById('invoices', id);
    return success ? 1 : 0;
  }

  /**
   * Get invoice statistics
   */
  async getInvoiceStats(): Promise<{
    total_invoices: number;
    total_paid: number;
    total_pending: number;
    total_overdue: number;
    total_draft: number;
    average_amount: number;
    paid_count: number;
    pending_count: number;
    overdue_count: number;
    draft_count: number;
  }> {
    const stats = await databaseService.getOne<{
      total_invoices: number;
      total_paid: number;
      total_pending: number;
      total_overdue: number;
      total_draft: number;
      average_amount: number;
      paid_count: number;
      pending_count: number;
      overdue_count: number;
      draft_count: number;
    }>(`
      SELECT 
        COUNT(*) as total_invoices,
        SUM(CASE WHEN status = 'paid' THEN total_amount ELSE 0 END) as total_paid,
        SUM(CASE WHEN status = 'sent' THEN total_amount ELSE 0 END) as total_pending,
        SUM(CASE WHEN status = 'overdue' THEN total_amount ELSE 0 END) as total_overdue,
        SUM(CASE WHEN status = 'draft' THEN total_amount ELSE 0 END) as total_draft,
        AVG(total_amount) as average_amount,
        COUNT(CASE WHEN status = 'paid' THEN 1 END) as paid_count,
        COUNT(CASE WHEN status = 'sent' THEN 1 END) as pending_count,
        COUNT(CASE WHEN status = 'overdue' THEN 1 END) as overdue_count,
        COUNT(CASE WHEN status = 'draft' THEN 1 END) as draft_count
      FROM invoices
    `);

    return stats || {
      total_invoices: 0,
      total_paid: 0,
      total_pending: 0,
      total_overdue: 0,
      total_draft: 0,
      average_amount: 0,
      paid_count: 0,
      pending_count: 0,
      overdue_count: 0,
      draft_count: 0
    };
  }

  /**
   * Update invoice status
   */
  async updateInvoiceStatus(id: number, status: InvoiceStatus): Promise<number> {
    if (!id || typeof id !== 'number') {
      throw new Error('Valid invoice ID is required');
    }

    const validStatuses: InvoiceStatus[] = ['draft', 'sent', 'paid', 'overdue', 'cancelled'];
    if (!status || !validStatuses.includes(status)) {
      throw new Error('Invalid status');
    }

    // Check if invoice exists
    const invoiceExists = await databaseService.exists('invoices', 'id', id);
    if (!invoiceExists) {
      throw new Error('Invoice not found');
    }

    const result = await databaseService.executeQuery(`
      UPDATE invoices
      SET status = ?, updated_at = datetime('now')
      WHERE id = ?
    `, [status, id]);

    return result.changes;
  }

  /**
   * Mark invoice as sent
   */
  async markInvoiceAsSent(id: number, emailSentAt?: string): Promise<number> {
    if (!id || typeof id !== 'number') {
      throw new Error('Valid invoice ID is required');
    }

    const sentAt = emailSentAt || new Date().toISOString();

    const result = await databaseService.executeQuery(`
      UPDATE invoices
      SET status = 'sent', email_status = 'sent', email_sent_at = ?, updated_at = datetime('now')
      WHERE id = ?
    `, [sentAt, id]);

    return result.changes;
  }

  /**
   * Get overdue invoices
   */
  async getOverdueInvoices(): Promise<InvoiceWithClient[]> {
    return databaseService.getMany<InvoiceWithClient>(`
      SELECT i.*, c.name as client_name, c.email as client_email
      FROM invoices i
      LEFT JOIN clients c ON i.client_id = c.id
      WHERE i.status IN ('sent', 'overdue') AND i.due_date < date('now')
      ORDER BY i.due_date ASC
    `);
  }

  /**
   * Get invoices by client ID
   */
  async getInvoicesByClientId(clientId: number, options: ServiceOptions = {}): Promise<InvoiceWithClient[]> {
    if (!clientId || typeof clientId !== 'number') {
      throw new Error('Valid client ID is required');
    }

    const { limit = 100, offset = 0 } = options;

    return databaseService.getMany<InvoiceWithClient>(`
      SELECT i.*, c.name as client_name, c.email as client_email
      FROM invoices i
      LEFT JOIN clients c ON i.client_id = c.id
      WHERE i.client_id = ?
      ORDER BY i.created_at DESC
      LIMIT ? OFFSET ?
    `, [clientId, limit, offset]);
  }

  /**
   * Get recent invoices
   */
  async getRecentInvoices(limit: number = 10): Promise<InvoiceWithClient[]> {
    if (typeof limit !== 'number' || limit < 1) {
      limit = 10;
    }

    return databaseService.getMany<InvoiceWithClient>(`
      SELECT i.*, c.name as client_name, c.email as client_email
      FROM invoices i
      LEFT JOIN clients c ON i.client_id = c.id
      ORDER BY i.created_at DESC
      LIMIT ?
    `, [limit]);
  }

  /**
   * Check if invoice exists
   */
  async invoiceExists(id: number): Promise<boolean> {
    if (!id || typeof id !== 'number') {
      return false;
    }

    return databaseService.exists('invoices', 'id', id);
  }

  /**
   * Check if invoice number exists
   */
  async invoiceNumberExists(invoiceNumber: string, excludeId?: number): Promise<boolean> {
    if (!invoiceNumber || typeof invoiceNumber !== 'string') {
      return false;
    }

    if (excludeId) {
      const result = await databaseService.getOne<{id: number}>(
        'SELECT id FROM invoices WHERE invoice_number = ? AND id != ?',
        [invoiceNumber, excludeId]
      );
      return !!result;
    }

    return databaseService.exists('invoices', 'invoice_number', invoiceNumber);
  }
}

// Export singleton instance
export const invoiceService = new InvoiceService();