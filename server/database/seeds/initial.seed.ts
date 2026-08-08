// Initial seed data for Slimbooks
// Handles initialization of counters, admin user, and sample data

import bcrypt from 'bcryptjs';
import type { IDatabase, SeedData } from '../../types/database.types.js';
import { appConfig } from '../../config/index.js';

/**
 * Initialize application counters
 */
export const initializeCounters = (db: IDatabase): void => {
  const counterCheck = db.getOne<{ count: number }>('SELECT COUNT(*) as count FROM counters');
  
  if (!counterCheck || counterCheck.count === 0) {
    const counters: SeedData = {
      table: 'counters',
      data: [
        { name: 'clients', value: 0 },
        { name: 'invoices', value: 0 },
        { name: 'templates', value: 0 },
        { name: 'expenses', value: 0 },
        { name: 'reports', value: 0 },
        { name: 'payments', value: 0 }
      ]
    };
    
    seedData(db, counters);
  }
};

/**
 * Initialize admin user if none exists
 */
export const initializeAdminUser = async (db: IDatabase): Promise<void> => {
  const userCheck = db.getOne<{ count: number }>('SELECT COUNT(*) as count FROM users');
  
  if (!userCheck || userCheck.count === 0) {
    const defaultPassword = process.env.ADMIN_PASSWORD || 'password';
    const hashedPassword = await bcrypt.hash(defaultPassword, 12);
    
    const adminUser: SeedData = {
      table: 'users',
      data: [{
        name: 'Administrator',
        email: 'admin@slimbooks.app',
        username: 'admin',
        password_hash: hashedPassword,
        role: 'admin',
        email_verified: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }]
    };
    
    seedData(db, adminUser);
    console.log('✓ Admin user created with email: admin@slimbooks.app');
  }
};

/**
 * Initialize default application settings
 */
export const initializeSettings = (db: IDatabase): void => {
  const settingsCheck = db.getOne<{ count: number }>('SELECT COUNT(*) as count FROM settings');
  
  if (!settingsCheck || settingsCheck.count === 0) {
    const defaultSettings: SeedData = {
      table: 'settings',
      data: [
        {
          key: 'app_name',
          value: 'Slimbooks',
          type: 'string',
          description: 'Application name',
          is_public: 1
        },
        {
          key: 'app_version',
          value: appConfig.version,
          type: 'string',
          description: 'Application version',
          is_public: 1
        },
        {
          key: 'default_currency',
          value: 'USD',
          type: 'string',
          description: 'Default currency code',
          is_public: 1
        },
        {
          key: 'tax_rate',
          value: '0',
          type: 'number',
          description: 'Default tax rate percentage',
          is_public: 0
        },
        {
          key: 'invoice_terms',
          value: 'Payment is due within 30 days of invoice date.',
          type: 'text',
          description: 'Default invoice terms',
          is_public: 0
        },
        {
          key: 'company_name',
          value: 'Your Company Name',
          type: 'string',
          description: 'Company name for invoices',
          is_public: 0
        },
        {
          key: 'company_email',
          value: 'contact@yourcompany.com',
          type: 'string',
          description: 'Company email address',
          is_public: 0
        }
      ]
    };
    
    seedData(db, defaultSettings);
  }
};

/**
 * Initialize sample clients for development
 */
export const initializeSampleClients = (db: IDatabase): void => {
  if (process.env.NODE_ENV === 'production') return;

  const clientCheck = db.getOne<{ count: number }>('SELECT COUNT(*) as count FROM clients');
  if (clientCheck && clientCheck.count > 0) return;

  const sampleClients: SeedData = {
    table: 'clients',
    data: [
      {
        name: 'Acme Corporation',
        email: 'contact@acme.com',
        phone: '(555) 123-4567',
        company: 'Acme Corporation',
        address: '123 Business St',
        city: 'Business City',
        state: 'CA',
        zipCode: '90210',
        country: 'USA',
        tax_id: 'TAX123456',
        is_active: 1
      },
      {
        name: 'Tech Solutions LLC',
        email: 'info@techsolutions.com',
        phone: '(555) 987-6543',
        company: 'Tech Solutions LLC',
        address: '456 Innovation Ave',
        city: 'Tech Town',
        state: 'NY',
        zipCode: '10001',
        country: 'USA',
        is_active: 1
      },
      {
        name: 'Global Enterprises',
        email: 'admin@global.com',
        phone: '(555) 456-7890',
        company: 'Global Enterprises Inc.',
        address: '789 Corporate Blvd',
        city: 'Metro City',
        state: 'TX',
        zipCode: '75201',
        country: 'USA',
        is_active: 1
      }
    ]
  };
  
  seedData(db, sampleClients);
};

/**
 * Initialize sample invoices for development
 */
export const initializeSampleInvoices = (db: IDatabase): void => {
  if (process.env.NODE_ENV === 'production') return;

  const invoiceCheck = db.getOne<{ count: number }>('SELECT COUNT(*) as count FROM invoices');
  if (invoiceCheck && invoiceCheck.count > 0) return;

  const sampleInvoices: SeedData = {
    table: 'invoices',
    data: [
      {
        invoice_number: 'INV-001',
        client_id: 1,
        amount: 1500.00,
        tax_amount: 120.00,
        total_amount: 1620.00,
        status: 'sent',
        due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        notes: 'Sample invoice for development',
        terms: 'Payment due within 30 days'
      },
      {
        invoice_number: 'INV-002',
        client_id: 2,
        amount: 2500.00,
        tax_amount: 200.00,
        total_amount: 2700.00,
        status: 'paid',
        due_date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        paid_date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        notes: 'Paid invoice sample'
      }
    ]
  };
  
  seedData(db, sampleInvoices);
};

/**
 * Initialize sample payments for development
 */
export const initializeSamplePayments = (db: IDatabase): void => {
  if (process.env.NODE_ENV === 'production') return;

  const paymentCheck = db.getOne<{ count: number }>('SELECT COUNT(*) as count FROM payments');
  if (paymentCheck && paymentCheck.count > 0) return;

  const samplePayments: SeedData = {
    table: 'payments',
    data: [
      // Column names must match the payments table as migration 008 left it:
      // client_name (not client_id), reference (not transaction_id) and
      // description (not notes). The seed was never updated when 008 collapsed
      // those columns, so enabling sample data failed the boot outright.
      {
        invoice_id: 2,
        client_name: 'Sample Client',
        amount: 2700.00,
        method: 'bank_transfer',
        status: 'received',
        reference: 'TXN-12345',
        date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        description: 'Payment received via bank transfer'
      }
    ]
  };
  
  seedData(db, samplePayments);
};

/**
 * Generic seed data insertion function
 */
export const seedData = (db: IDatabase, seed: SeedData): void => {
  if (seed.truncate) {
    db.executeQuery(`DELETE FROM ${seed.table}`);
  }
  
  if (seed.data.length === 0) return;
  
  const firstRow = seed.data[0];
  if (!firstRow) return;
  
  const columns = Object.keys(firstRow);
  const placeholders = columns.map(() => '?').join(', ');
  const query = `INSERT INTO ${seed.table} (${columns.join(', ')}) VALUES (${placeholders})`;
  
  seed.data.forEach(row => {
    const values = columns.map(col => row[col]);
    db.executeQuery(query, values);
  });
};

/**
 * Initialize all seed data
 */
export const initializeAllSeeds = async (db: IDatabase, includeSampleData = false): Promise<void> => {
  try {
    // Always initialize these
    initializeCounters(db);
    await initializeAdminUser(db);
    initializeSettings(db);
    
    // Only in development
    if (includeSampleData && process.env.NODE_ENV !== 'production') {
      initializeSampleClients(db);
      initializeSampleInvoices(db);
      initializeSamplePayments(db);
    }
  } catch (error) {
    console.error('❌ Seed data initialization failed:', error);
    throw error;
  }
};