// Payment Service - Domain-specific service for payment operations
// Handles all payment-related business logic and database operations

import { databaseService } from '../core/DatabaseService.js';
import { type Payment, type ServiceOptions, type PaymentStatus, type PaymentMethod } from '../types/index.js';

/**
 * Payment Service
 * Manages payment-related operations with proper validation and security
 */
export class PaymentService {
  /**
   * Get all payments with filtering and pagination
   */
  async getAllPayments(filters: {
    status?: PaymentStatus;
    method?: PaymentMethod;
    date_from?: string;
    date_to?: string;
  } = {}, options: ServiceOptions = {}): Promise<{
    payments: Payment[];
    pagination: {
      total: number;
      limit: number;
      offset: number;
      hasMore: boolean;
    };
  }> {
    const { limit = 50, offset = 0 } = options;
    const { status, method, date_from, date_to } = filters;
    
    let query = 'SELECT * FROM payments';
    const conditions: string[] = [];
    const params: (string | number | null | boolean)[] = [];
    
    if (status) {
      conditions.push('status = ?');
      params.push(status);
    }
    
    if (method) {
      conditions.push('method = ?');
      params.push(method);
    }
    
    if (date_from) {
      conditions.push('date >= ?');
      params.push(date_from);
    }
    
    if (date_to) {
      conditions.push('date <= ?');
      params.push(date_to);
    }
    
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    
    query += ' ORDER BY date DESC, created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    
    const payments = databaseService.getMany<Payment>(query, params);
    
    // Get total count for pagination
    let countQuery = 'SELECT COUNT(*) as count FROM payments';
    if (conditions.length > 0) {
      countQuery += ' WHERE ' + conditions.join(' AND ');
    }
    
    const totalResult = databaseService.getOne<{count: number}>(countQuery, params.slice(0, -2));
    const total = totalResult?.count || 0;
    
    return {
      payments,
      pagination: {
        total,
        limit,
        offset,
        hasMore: total > offset + limit
      }
    };
  }

  /**
   * Get payment by ID
   */
  async getPaymentById(id: number): Promise<Payment | null> {
    if (!id || typeof id !== 'number') {
      throw new Error('Valid payment ID is required');
    }

    return databaseService.getOne<Payment>('SELECT * FROM payments WHERE id = ?', [id]);
  }

  /**
   * Create new payment
   */
  async createPayment(paymentData: {
    date: string;
    client_name: string;
    invoice_id?: number;
    amount: number;
    method: PaymentMethod;
    reference?: string;
    description?: string;
    status?: PaymentStatus;
  }): Promise<number> {
    if (!paymentData || !paymentData.date || !paymentData.client_name || !paymentData.amount || !paymentData.method) {
      throw new Error('Invalid payment data - date, client_name, amount, and method are required');
    }

    // Validate required fields
    if (typeof paymentData.amount !== 'number' || paymentData.amount <= 0) {
      throw new Error('Amount must be a positive number');
    }

    if (!paymentData.client_name || typeof paymentData.client_name !== 'string') {
      throw new Error('Valid client name is required');
    }

    if (!paymentData.date || typeof paymentData.date !== 'string') {
      throw new Error('Valid payment date is required');
    }

    // Validate date format
    if (!this.isValidDate(paymentData.date)) {
      throw new Error('Invalid date format');
    }

    // Validate invoice exists if invoice_id provided
    if (paymentData.invoice_id && !databaseService.exists('invoices', 'id', paymentData.invoice_id)) {
      throw new Error('Specified invoice does not exist');
    }

    // Get next payment ID
    const nextId = databaseService.getNextSequence('payments');
    
    // Prepare payment data
    const now = new Date().toISOString();
    const paymentRecord = {
      id: nextId,
      date: paymentData.date,
      client_name: paymentData.client_name,
      invoice_id: paymentData.invoice_id || null,
      amount: paymentData.amount,
      method: paymentData.method,
      reference: paymentData.reference || null,
      description: paymentData.description || '',
      status: paymentData.status || 'received',
      created_at: now,
      updated_at: now
    };

    // Create payment
    databaseService.executeQuery(`
      INSERT INTO payments (
        id, date, client_name, invoice_id, amount, method, reference, 
        description, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      paymentRecord.id, paymentRecord.date, paymentRecord.client_name,
      paymentRecord.invoice_id, paymentRecord.amount, paymentRecord.method,
      paymentRecord.reference, paymentRecord.description, paymentRecord.status,
      paymentRecord.created_at, paymentRecord.updated_at
    ]);

    return nextId;
  }

  /**
   * Update payment
   */
  async updatePayment(id: number, paymentData: Partial<{
    date: string;
    client_name: string;
    invoice_id: number;
    amount: number;
    method: PaymentMethod;
    reference: string;
    description: string;
    status: PaymentStatus;
  }>): Promise<number> {
    if (!id || typeof id !== 'number') {
      throw new Error('Valid payment ID is required');
    }

    if (!paymentData || typeof paymentData !== 'object') {
      throw new Error('Payment data is required');
    }

    // Check if payment exists
    const existingPayment = await this.getPaymentById(id);
    if (!existingPayment) {
      throw new Error('Payment not found');
    }

    // Validate amount if provided
    if (paymentData.amount !== undefined && 
        (typeof paymentData.amount !== 'number' || paymentData.amount <= 0)) {
      throw new Error('Amount must be a positive number');
    }

    // Validate date if provided
    if (paymentData.date && !this.isValidDate(paymentData.date)) {
      throw new Error('Invalid date format');
    }

    // Validate invoice exists if invoice_id provided
    if (paymentData.invoice_id && !databaseService.exists('invoices', 'id', paymentData.invoice_id)) {
      throw new Error('Specified invoice does not exist');
    }

    // Filter allowed fields
    const allowedFields = [
      'date', 'client_name', 'invoice_id', 'amount', 'method', 
      'reference', 'description', 'status'
    ];
    
    const updateData: Record<string, unknown> = {};
    allowedFields.forEach(field => {
      if (paymentData[field as keyof typeof paymentData] !== undefined) {
        updateData[field] = paymentData[field as keyof typeof paymentData];
      }
    });

    if (Object.keys(updateData).length === 0) {
      throw new Error('No valid fields to update');
    }

    const success = databaseService.updateRecord('payments', id, updateData);
    return success ? 1 : 0;
  }

  /**
   * Delete payment
   */
  async deletePayment(id: number): Promise<number> {
    if (!id || typeof id !== 'number') {
      throw new Error('Valid payment ID is required');
    }

    // Check if payment exists
    const existingPayment = await this.getPaymentById(id);
    if (!existingPayment) {
      throw new Error('Payment not found');
    }

    const success = databaseService.deleteById('payments', id);
    return success ? 1 : 0;
  }

  /**
   * Bulk delete payments
   */
  async bulkDeletePayments(paymentIds: number[]): Promise<number> {
    if (!paymentIds || !Array.isArray(paymentIds) || paymentIds.length === 0) {
      throw new Error('payment_ids must be a non-empty array');
    }

    if (paymentIds.length > 500) {
      throw new Error('Maximum 500 payments can be deleted at once');
    }

    // Validate all IDs are numbers
    paymentIds.forEach(id => {
      if (!id || typeof id !== 'number') {
        throw new Error('All payment IDs must be valid numbers');
      }
    });

    // Validate all payment IDs exist
    const placeholders = paymentIds.map(() => '?').join(',');
    const existingPayments = databaseService.getMany<{id: number}>(
      `SELECT id FROM payments WHERE id IN (${placeholders})`, 
      paymentIds
    );
    
    if (existingPayments.length !== paymentIds.length) {
      throw new Error('One or more payment IDs not found');
    }

    // Delete all payments
    const result = databaseService.executeQuery(
      `DELETE FROM payments WHERE id IN (${placeholders})`, 
      paymentIds
    );

    return result.changes;
  }

  /**
   * Get payment statistics
   */
  async getPaymentStats(filters: {
    year?: string;
    month?: string;
  } = {}): Promise<{
    summary: {
      total_payments: number;
      total_amount: number;
      average_amount: number;
      received_count: number;
      pending_count: number;
      failed_count: number;
      refunded_count: number;
      received_amount: number;
      pending_amount: number;
    };
    methods: Array<{
      method: PaymentMethod;
      count: number;
      total_amount: number;
      average_amount: number;
    }>;
    monthlyTrends: Array<{
      month: string;
      count: number;
      total_amount: number;
    }>;
  }> {
    const { year, month } = filters;
    
    let dateFilter = '';
    const params: (string | number | null | boolean)[] = [];
    
    if (year) {
      if (month) {
        dateFilter = "WHERE strftime('%Y-%m', date) = ?";
        params.push(`${year}-${month.padStart(2, '0')}`);
      } else {
        dateFilter = "WHERE strftime('%Y', date) = ?";
        params.push(year);
      }
    }
    
    const summaryStats = databaseService.getOne<{
      total_payments: number;
      total_amount: number;
      average_amount: number;
      received_count: number;
      pending_count: number;
      failed_count: number;
      refunded_count: number;
      received_amount: number;
      pending_amount: number;
    }>(`
      SELECT 
        COUNT(*) as total_payments,
        SUM(amount) as total_amount,
        AVG(amount) as average_amount,
        COUNT(CASE WHEN status = 'received' THEN 1 END) as received_count,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_count,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_count,
        COUNT(CASE WHEN status = 'refunded' THEN 1 END) as refunded_count,
        SUM(CASE WHEN status = 'received' THEN amount ELSE 0 END) as received_amount,
        SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END) as pending_amount
      FROM payments ${dateFilter}
    `, params);
    
    // Get method breakdown
    const methodStats = databaseService.getMany<{
      method: PaymentMethod;
      count: number;
      total_amount: number;
      average_amount: number;
    }>(`
      SELECT 
        method,
        COUNT(*) as count,
        SUM(amount) as total_amount,
        AVG(amount) as average_amount
      FROM payments ${dateFilter}
      GROUP BY method
      ORDER BY total_amount DESC
    `, params);
    
    // Get monthly trends (last 12 months)
    const monthlyTrends = databaseService.getMany<{
      month: string;
      count: number;
      total_amount: number;
    }>(`
      SELECT 
        strftime('%Y-%m', date) as month,
        COUNT(*) as count,
        SUM(amount) as total_amount
      FROM payments
      WHERE date >= date('now', '-12 months')
      GROUP BY strftime('%Y-%m', date)
      ORDER BY month ASC
    `);

    return {
      summary: summaryStats || {
        total_payments: 0,
        total_amount: 0,
        average_amount: 0,
        received_count: 0,
        pending_count: 0,
        failed_count: 0,
        refunded_count: 0,
        received_amount: 0,
        pending_amount: 0
      },
      methods: methodStats,
      monthlyTrends
    };
  }

  /**
   * Get payments by invoice ID
   */
  async getPaymentsByInvoiceId(invoiceId: number, options: ServiceOptions = {}): Promise<Payment[]> {
    if (!invoiceId || typeof invoiceId !== 'number') {
      throw new Error('Valid invoice ID is required');
    }

    const { limit = 100, offset = 0 } = options;

    return databaseService.getMany<Payment>(`
      SELECT * FROM payments 
      WHERE invoice_id = ? 
      ORDER BY date DESC 
      LIMIT ? OFFSET ?
    `, [invoiceId, limit, offset]);
  }

  /**
   * Get payments by client name
   */
  async getPaymentsByClientName(clientName: string, options: ServiceOptions = {}): Promise<Payment[]> {
    if (!clientName || typeof clientName !== 'string') {
      throw new Error('Valid client name is required');
    }

    const { limit = 100, offset = 0 } = options;

    return databaseService.getMany<Payment>(`
      SELECT * FROM payments 
      WHERE client_name LIKE ? 
      ORDER BY date DESC 
      LIMIT ? OFFSET ?
    `, [`%${clientName}%`, limit, offset]);
  }

  /**
   * Get payments by date range
   */
  async getPaymentsByDateRange(
    startDate: string, 
    endDate: string, 
    options: ServiceOptions = {}
  ): Promise<{
    payments: Payment[];
    summary: {
      count: number;
      total_amount: number;
      average_amount: number;
    };
  }> {
    if (!startDate || !endDate) {
      throw new Error('start_date and end_date are required');
    }

    if (!this.isValidDate(startDate) || !this.isValidDate(endDate)) {
      throw new Error('Invalid date format');
    }

    const { limit = 100, offset = 0 } = options;

    const payments = databaseService.getMany<Payment>(`
      SELECT * FROM payments
      WHERE date BETWEEN ? AND ?
      ORDER BY date DESC, created_at DESC
      LIMIT ? OFFSET ?
    `, [startDate, endDate, limit, offset]);

    const summaryResult = databaseService.getOne<{
      count: number;
      total_amount: number;
      average_amount: number;
    }>(`
      SELECT 
        COUNT(*) as count,
        SUM(amount) as total_amount,
        AVG(amount) as average_amount
      FROM payments
      WHERE date BETWEEN ? AND ?
    `, [startDate, endDate]);

    const summary = summaryResult || {
      count: 0,
      total_amount: 0,
      average_amount: 0
    };

    return {
      payments,
      summary
    };
  }

  /**
   * Get recent payments
   */
  async getRecentPayments(limit: number = 10): Promise<Payment[]> {
    if (typeof limit !== 'number' || limit < 1) {
      limit = 10;
    }

    return databaseService.getMany<Payment>(`
      SELECT * FROM payments
      ORDER BY date DESC, created_at DESC
      LIMIT ?
    `, [limit]);
  }

  /**
   * Get total payments amount
   */
  async getTotalPaymentsAmount(filters: {
    status?: PaymentStatus;
    method?: PaymentMethod;
    date_from?: string;
    date_to?: string;
  } = {}): Promise<number> {
    const { status, method, date_from, date_to } = filters;
    
    let query = 'SELECT SUM(amount) as total FROM payments';
    const conditions: string[] = [];
    const params: (string | number | null | boolean)[] = [];
    
    if (status) {
      conditions.push('status = ?');
      params.push(status);
    }
    
    if (method) {
      conditions.push('method = ?');
      params.push(method);
    }
    
    if (date_from) {
      conditions.push('date >= ?');
      params.push(date_from);
    }
    
    if (date_to) {
      conditions.push('date <= ?');
      params.push(date_to);
    }
    
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    
    const result = databaseService.getOne<{total: number}>(query, params);
    return result?.total || 0;
  }

  /**
   * Update payment status
   */
  async updatePaymentStatus(id: number, status: PaymentStatus): Promise<number> {
    if (!id || typeof id !== 'number') {
      throw new Error('Valid payment ID is required');
    }

    const validStatuses: PaymentStatus[] = ['received', 'pending', 'failed', 'refunded'];
    if (!status || !validStatuses.includes(status)) {
      throw new Error('Invalid status. Must be received, pending, failed, or refunded');
    }

    // Check if payment exists
    const paymentExists = databaseService.exists('payments', 'id', id);
    if (!paymentExists) {
      throw new Error('Payment not found');
    }

    const result = databaseService.executeQuery(`
      UPDATE payments 
      SET status = ?, updated_at = datetime('now')
      WHERE id = ?
    `, [status, id]);

    return result.changes;
  }

  /**
   * Get payment methods statistics
   */
  async getPaymentMethodsStats(): Promise<Array<{
    method: PaymentMethod;
    count: number;
    total_amount: number;
    average_amount: number;
    last_used: string;
  }>> {
    return databaseService.getMany<{
      method: PaymentMethod;
      count: number;
      total_amount: number;
      average_amount: number;
      last_used: string;
    }>(`
      SELECT 
        method,
        COUNT(*) as count,
        SUM(amount) as total_amount,
        AVG(amount) as average_amount,
        MAX(date) as last_used
      FROM payments
      GROUP BY method
      ORDER BY count DESC
    `);
  }

  /**
   * Search payments
   */
  async searchPayments(searchTerm: string, options: ServiceOptions = {}): Promise<{
    payments: Payment[];
    pagination: {
      total: number;
      limit: number;
      offset: number;
      hasMore: boolean;
    };
  }> {
    if (!searchTerm || typeof searchTerm !== 'string' || searchTerm.trim().length < 2) {
      return {
        payments: [],
        pagination: {
          total: 0,
          limit: options.limit || 10,
          offset: options.offset || 0,
          hasMore: false
        }
      };
    }

    const { limit = 50, offset = 0 } = options;
    const searchPattern = `%${searchTerm.trim()}%`;

    const payments = databaseService.getMany<Payment>(`
      SELECT * FROM payments 
      WHERE (reference LIKE ? OR description LIKE ? OR client_name LIKE ?)
      ORDER BY 
        CASE 
          WHEN reference = ? THEN 1
          WHEN client_name = ? THEN 2
          ELSE 3
        END,
        date DESC
      LIMIT ? OFFSET ?
    `, [
      searchPattern, searchPattern, searchPattern,
      searchTerm, searchTerm,
      limit, offset
    ]);

    const totalResult = databaseService.getOne<{count: number}>(`
      SELECT COUNT(*) as count FROM payments 
      WHERE reference LIKE ? OR description LIKE ? OR client_name LIKE ?
    `, [searchPattern, searchPattern, searchPattern]);

    const total = totalResult?.count || 0;

    return {
      payments,
      pagination: {
        total,
        limit,
        offset,
        hasMore: total > offset + limit
      }
    };
  }

  /**
   * Check if payment exists
   */
  async paymentExists(id: number): Promise<boolean> {
    if (!id || typeof id !== 'number') {
      return false;
    }

    return databaseService.exists('payments', 'id', id);
  }

  /**
   * Validate date format
   */
  private isValidDate(dateString: string): boolean {
    if (!dateString) return false;
    
    // Check for YYYY-MM-DD format
    const date = new Date(dateString);
    return !isNaN(date.getTime()) && /^\d{4}-\d{2}-\d{2}$/.test(dateString);
  }
}

// Export singleton instance
export const paymentService = new PaymentService();