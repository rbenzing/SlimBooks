// Initial seed data for Slimbooks
// Handles initialization of counters and sample data
//
// The admin user is no longer seeded here. It used to be created from
// ADMIN_PASSWORD, defaulting to the literal string "password" when that
// variable was unset — the setup wizard (POST /api/setup) replaces this
// entirely; see docs/adr/0018-setup-wizard-replaces-seeded-admin.md.

import type { IDatabase, SeedData } from '../../types/database.types.js';
import { utcCalendarDay } from '../../utils/utcTime.util.js';

/**
 * A calendar day relative to today, for the sample rows.
 *
 * These used to be full ISO instants written into date columns, so a sample
 * invoice's due date rendered as one day or the next depending on where the
 * reader was. A due date is a day.
 */
const dayOffsetFromToday = (days: number): string =>
  utcCalendarDay(new Date(Date.now() + days * 24 * 60 * 60 * 1000));

/**
 * Initialize application counters
 */
export const initializeCounters = async (db: IDatabase): Promise<void> => {
  const counterCheck = await db.getOne<{ count: number }>('SELECT COUNT(*) as count FROM counters');

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

    await seedData(db, counters);
  }
};

/**
 * Initialize sample clients for development
 */
export const initializeSampleClients = async (db: IDatabase): Promise<void> => {
  if (process.env.NODE_ENV === 'production') return;

  const clientCheck = await db.getOne<{ count: number }>('SELECT COUNT(*) as count FROM clients');
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

  await seedData(db, sampleClients);
};

/**
 * Initialize sample invoices for development
 */
export const initializeSampleInvoices = async (db: IDatabase): Promise<void> => {
  if (process.env.NODE_ENV === 'production') return;

  const invoiceCheck = await db.getOne<{ count: number }>('SELECT COUNT(*) as count FROM invoices');
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
        due_date: dayOffsetFromToday(30),
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
        due_date: dayOffsetFromToday(-5),
        paid_date: dayOffsetFromToday(-2),
        notes: 'Paid invoice sample'
      }
    ]
  };

  await seedData(db, sampleInvoices);
};

/**
 * Initialize sample payments for development
 */
export const initializeSamplePayments = async (db: IDatabase): Promise<void> => {
  if (process.env.NODE_ENV === 'production') return;

  const paymentCheck = await db.getOne<{ count: number }>('SELECT COUNT(*) as count FROM payments');
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
        date: dayOffsetFromToday(-2),
        description: 'Payment received via bank transfer'
      }
    ]
  };

  await seedData(db, samplePayments);
};

/**
 * Generic seed data insertion function
 */
export const seedData = async (db: IDatabase, seed: SeedData): Promise<void> => {
  if (seed.truncate) {
    await db.executeQuery(`DELETE FROM ${seed.table}`);
  }

  if (seed.data.length === 0) return;

  const firstRow = seed.data[0];
  if (!firstRow) return;

  const columns = Object.keys(firstRow);
  const placeholders = columns.map(() => '?').join(', ');
  // Identifiers are quoted because the seed data names arbitrary columns, and
  // `settings.key` is a reserved word in MySQL. SQLite accepts backticks too.
  const columnList = columns.map(column => `\`${column}\``).join(', ');
  const query = `INSERT INTO ${seed.table} (${columnList}) VALUES (${placeholders})`;

  for (const row of seed.data) {
    const values = columns.map(col => row[col]);
    await db.executeQuery(query, values);
  }
};

/**
 * Initialize all seed data
 */
export const initializeAllSeeds = async (db: IDatabase, includeSampleData = false): Promise<void> => {
  try {
    // Always initialize these
    await initializeCounters(db);

    // Only in development
    if (includeSampleData && process.env.NODE_ENV !== 'production') {
      await initializeSampleClients(db);
      await initializeSampleInvoices(db);
      await initializeSamplePayments(db);
    }
  } catch (error) {
    console.error('❌ Seed data initialization failed:', error);
    throw error;
  }
};