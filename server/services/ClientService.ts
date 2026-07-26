// Client Service - Domain-specific service for client operations
// Handles all client-related business logic and database operations

import { databaseService } from '../core/DatabaseService.js';
import { type Client, type ServiceOptions } from '../types/index.js';

/**
 * Client Service
 * Manages client-related operations with proper validation and security
 */
export class ClientService {
  /**
   * Get all clients
   */
  async getAllClients(options: ServiceOptions = {}): Promise<Client[]> {
    const { limit = 100, offset = 0 } = options;

    return databaseService.getMany<Client>(`
      SELECT * FROM clients
      WHERE deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `, [limit, offset]);
  }

  /**
   * Get client by ID
   */
  async getClientById(id: number): Promise<Client | null> {
    if (!id || typeof id !== 'number') {
      throw new Error('Valid client ID is required');
    }

    return databaseService.getOne<Client>('SELECT * FROM clients WHERE id = ? AND deleted_at IS NULL', [id]);
  }

  /**
   * Create new client
   */
  async createClient(clientData: {
    name: string;
    first_name?: string;
    last_name?: string;
    email?: string;
    phone?: string;
    address?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
    company?: string;
    tax_id?: string;
    notes?: string;
  }): Promise<number> {
    if (!clientData) {
      throw new Error('Client data is required');
    }

    // Validate required fields
    if (!clientData.name || typeof clientData.name !== 'string') {
      throw new Error('Client name is required');
    }

    // Validate email format if provided
    if (clientData.email && !this.isValidEmail(clientData.email)) {
      throw new Error('Invalid email format');
    }

    // Check if client with same email already exists (if email provided)
    if (clientData.email) {
      const existingClient = databaseService.getOne<{id: number}>(
        'SELECT id FROM clients WHERE email = ?', 
        [clientData.email]
      );
      if (existingClient) {
        throw new Error('Client with this email already exists');
      }
    }

    // Get next client ID
    const nextId = databaseService.getNextSequence('clients');
    
    // Prepare client data
    const now = new Date().toISOString();
    const clientRecord = {
      id: nextId,
      name: clientData.name,
      first_name: clientData.first_name || null,
      last_name: clientData.last_name || null,
      email: clientData.email || null,
      phone: clientData.phone || null,
      address: clientData.address || null,
      city: clientData.city || null,
      state: clientData.state || null,
      zipCode: clientData.zipCode || null,
      country: clientData.country || null,
      company: clientData.company || null,
      tax_id: clientData.tax_id || null,
      notes: clientData.notes || null,
      created_at: now,
      updated_at: now
    };

    // Create client
    databaseService.executeQuery(`
      INSERT INTO clients (
        id, name, first_name, last_name, email, phone, company, address, city, state,
        zipCode, country, stripe_customer_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      clientRecord.id, clientRecord.name, clientRecord.first_name, clientRecord.last_name,
      clientRecord.email, clientRecord.phone, clientRecord.company, clientRecord.address,
      clientRecord.city, clientRecord.state, clientRecord.zipCode, clientRecord.country,
      null, clientRecord.created_at, clientRecord.updated_at
    ]);

    return nextId;
  }

  /**
   * Update client
   */
  async updateClient(id: number, clientData: Partial<{
    name: string;
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    address: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
    company: string;
  }>): Promise<number> {
    if (!id || typeof id !== 'number') {
      throw new Error('Valid client ID is required');
    }

    if (!clientData || typeof clientData !== 'object') {
      throw new Error('Client data is required');
    }

    // Check if client exists
    const existingClient = await this.getClientById(id);
    if (!existingClient) {
      throw new Error('Client not found');
    }

    // Validate email if being updated
    if (clientData.email) {
      if (!this.isValidEmail(clientData.email)) {
        throw new Error('Invalid email format');
      }

      // Check email uniqueness if email is being changed
      if (clientData.email !== existingClient.email) {
        const emailExists = databaseService.getOne<{id: number}>(
          'SELECT id FROM clients WHERE email = ? AND id != ?', 
          [clientData.email, id]
        );
        if (emailExists) {
          throw new Error('Email is already in use by another client');
        }
      }
    }

    // Filter allowed fields
    const allowedFields = [
      'name', 'first_name', 'last_name', 'email', 'phone', 'company', 'address', 'city', 'state',
      'zipCode', 'country', 'stripe_customer_id'
    ];
    
    const updateData: Record<string, unknown> = {};
    allowedFields.forEach(field => {
      if (clientData[field as keyof typeof clientData] !== undefined) {
        const value = clientData[field as keyof typeof clientData];
        
        updateData[field] = value;
      }
    });

    if (Object.keys(updateData).length === 0) {
      throw new Error('No valid fields to update');
    }

    const success = databaseService.updateRecord('clients', id, updateData);
    return success ? 1 : 0;
  }

  /**
   * Delete client
   */
  async deleteClient(id: number): Promise<number> {
    if (!id || typeof id !== 'number') {
      throw new Error('Valid client ID is required');
    }

    // Check if client exists
    const existingClient = await this.getClientById(id);
    if (!existingClient) {
      throw new Error('Client not found');
    }

    // Check if client has associated invoices
    const invoiceCount = databaseService.getOne<{count: number}>(
      'SELECT COUNT(*) as count FROM invoices WHERE client_id = ?',
      [id]
    );

    if (invoiceCount && invoiceCount.count > 0) {
      throw new Error('Cannot delete client with existing invoices. Archive the client instead.');
    }

    // Use setting-based delete (checks data.clients_soft_delete_enabled setting)
    // Default is hard delete if setting doesn't exist
    const success = databaseService.deleteWithSetting('clients', id, 'clients');
    return success ? 1 : 0;
  }

  /**
   * Search clients
   */
  async searchClients(searchTerm: string, options: ServiceOptions = {}): Promise<Client[]> {
    if (!searchTerm || typeof searchTerm !== 'string') {
      return [];
    }

    const { limit = 50, offset = 0 } = options;
    const searchPattern = `%${searchTerm}%`;

    return databaseService.getMany<Client>(`
      SELECT * FROM clients
      WHERE (name LIKE ? OR email LIKE ? OR company LIKE ? OR phone LIKE ?)
        AND deleted_at IS NULL
      ORDER BY 
        CASE 
          WHEN name = ? THEN 1
          WHEN email = ? THEN 2
          WHEN company = ? THEN 3
          ELSE 4
        END,
        created_at DESC
      LIMIT ? OFFSET ?
    `, [
      searchPattern, searchPattern, searchPattern, searchPattern,
      searchTerm, searchTerm, searchTerm,
      limit, offset
    ]);
  }

  /**
   * Get active clients
   */
  async getActiveClients(options: ServiceOptions = {}): Promise<Client[]> {
    const { limit = 100, offset = 0 } = options;

    return databaseService.getMany<Client>(`
      SELECT * FROM clients 
      ORDER BY name ASC
      LIMIT ? OFFSET ?
    `, [limit, offset]);
  }

  /**
   * Archive/Unarchive client
   */
  async toggleClientStatus(_id: number, _isActive: boolean): Promise<number> {
    // This function is kept for API compatibility but doesn't do anything
    // since we removed is_active column. Returns success.
    return 1;
  }

  /**
   * Get clients by country
   */
  async getClientsByCountry(country: string, options: ServiceOptions = {}): Promise<Client[]> {
    if (!country || typeof country !== 'string') {
      throw new Error('Valid country is required');
    }

    const { limit = 100, offset = 0 } = options;

    return databaseService.getMany<Client>(`
      SELECT * FROM clients 
      WHERE country = ?
      ORDER BY name ASC
      LIMIT ? OFFSET ?
    `, [country, limit, offset]);
  }

  /**
   * Get client statistics
   */
  async getClientStats(): Promise<{
    total: number;
    active: number;
    inactive: number;
    withEmail: number;
    withPhone: number;
    byCountry: Record<string, number>;
  }> {
    const total = databaseService.getOne<{count: number}>(
      'SELECT COUNT(*) as count FROM clients'
    )?.count || 0;

    const active = total; // All clients are considered active now
    const inactive = 0;

    const withEmail = databaseService.getOne<{count: number}>(
      'SELECT COUNT(*) as count FROM clients WHERE email IS NOT NULL'
    )?.count || 0;

    const withPhone = databaseService.getOne<{count: number}>(
      'SELECT COUNT(*) as count FROM clients WHERE phone IS NOT NULL'
    )?.count || 0;

    // Get country distribution
    const countryData = databaseService.getMany<{country: string; count: number}>(
      'SELECT country, COUNT(*) as count FROM clients WHERE country IS NOT NULL GROUP BY country ORDER BY count DESC'
    );

    const byCountry: Record<string, number> = {};
    countryData.forEach(row => {
      if (row.country) {
        byCountry[row.country] = row.count;
      }
    });

    return {
      total,
      active,
      inactive,
      withEmail,
      withPhone,
      byCountry
    };
  }

  /**
   * Get clients with recent invoices
   */
  async getClientsWithRecentActivity(days: number = 30, options: ServiceOptions = {}): Promise<Client[]> {
    const { limit = 50, offset = 0 } = options;

    return databaseService.getMany<Client>(`
      SELECT DISTINCT c.* FROM clients c
      INNER JOIN invoices i ON c.id = i.client_id
      WHERE i.created_at > datetime('now', '-${days} days')
      ORDER BY c.name ASC
      LIMIT ? OFFSET ?
    `, [limit, offset]);
  }

  /**
   * Check if client exists
   */
  async clientExists(id: number): Promise<boolean> {
    if (!id || typeof id !== 'number') {
      return false;
    }

    return databaseService.exists('clients', 'id', id);
  }

  /**
   * Check if email is already in use
   */
  async emailExists(email: string, excludeId?: number): Promise<boolean> {
    if (!email || typeof email !== 'string') {
      return false;
    }

    if (excludeId) {
      const client = databaseService.getOne<{id: number}>(
        'SELECT id FROM clients WHERE email = ? AND id != ?', 
        [email, excludeId]
      );
      return !!client;
    }

    return databaseService.exists('clients', 'email', email);
  }

  /**
   * Validate email format
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}

// Export singleton instance
export const clientService = new ClientService();