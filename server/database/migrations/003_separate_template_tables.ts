// Migration: Separate template tables
// This migration creates separate tables for invoice design templates and recurring invoice templates

import type { IDatabase, TableColumnInfo } from '../../types/database.types.js';

/**
 * Migration to separate template functionality into design templates and recurring templates
 */
export const up = async (db: IDatabase): Promise<void> => {
  try {
    console.log('Creating separate template tables...');

    // Create invoice design templates table
    console.log('Creating invoice_design_templates table...');
    await db.executeQuery(`
      CREATE TABLE IF NOT EXISTS invoice_design_templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL CHECK (length(trim(name)) >= 2 AND length(name) <= 100),
        content TEXT NOT NULL,
        is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
        variables TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    // Create recurring invoice templates table
    console.log('Creating recurring_invoice_templates table...');
    await db.executeQuery(`
      CREATE TABLE IF NOT EXISTS recurring_invoice_templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL CHECK (length(trim(name)) >= 2 AND length(name) <= 100),
        client_id INTEGER NOT NULL,
        amount REAL NOT NULL CHECK (amount >= 0),
        description TEXT,
        frequency TEXT NOT NULL CHECK (frequency IN ('weekly', 'monthly', 'quarterly', 'yearly', 'custom')),
        payment_terms TEXT NOT NULL CHECK (length(payment_terms) <= 100),
        next_invoice_date TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
        line_items TEXT,
        tax_amount REAL NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
        tax_rate_id TEXT CHECK (tax_rate_id IS NULL OR length(tax_rate_id) <= 50),
        shipping_amount REAL NOT NULL DEFAULT 0 CHECK (shipping_amount >= 0),
        shipping_rate_id TEXT CHECK (shipping_rate_id IS NULL OR length(shipping_rate_id) <= 50),
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        
        FOREIGN KEY (client_id) REFERENCES clients (id) ON DELETE CASCADE
      )
    `);

    // Check if old templates table exists and has recurring template structure
    const tableInfo = await db.getMany<TableColumnInfo>("PRAGMA table_info(templates)");
    const hasClientId = tableInfo.some((row) => row.name === 'client_id');
    const hasFrequency = tableInfo.some((row) => row.name === 'frequency');

    if (hasClientId && hasFrequency) {
      console.log('Migrating existing recurring templates data...');
      // Migrate existing templates to recurring_invoice_templates
      await db.executeQuery(`
        INSERT OR IGNORE INTO recurring_invoice_templates (
          name, client_id, amount, description, frequency, payment_terms, 
          next_invoice_date, is_active, line_items, tax_amount, tax_rate_id, 
          shipping_amount, shipping_rate_id, notes, created_at, updated_at
        )
        SELECT 
          name, client_id, amount, description, frequency, payment_terms,
          next_invoice_date, is_active, line_items, tax_amount, tax_rate_id,
          shipping_amount, shipping_rate_id, notes, created_at, updated_at
        FROM templates
      `);
    }

    // Add default design template if none exists
    const designTemplateCount = await db.getOne<{ count: number }>("SELECT COUNT(*) as count FROM invoice_design_templates");
    if (!designTemplateCount || designTemplateCount.count === 0) {
      console.log('Adding default invoice design template...');
      // The timestamps come from the dialect, not from `datetime('now')`.
      //
      // This is the one statement in 003 that still executes on a database
      // built today: the CREATE TABLEs above are IF NOT EXISTS and createTables()
      // has already made both tables, but a fresh install has no design template
      // yet, so this INSERT runs. Its columns are INTEGER now, and a STRICT
      // table refuses the text — which is how this was found, on the boot of a
      // brand-new database, after the whole unit suite had gone green.
      //
      // Editing shipped migration history is normally wrong. It is right here
      // because this changes nothing for any database that already ran it: 003
      // is recorded as applied, so the only rows this can still write are the
      // ones on installs that do not exist yet.
      await db.executeQuery(`
        INSERT INTO invoice_design_templates (name, content, is_default, created_at, updated_at)
        VALUES (
          'Default Template',
          '<html><body><h1>Invoice #{invoice_number}</h1><p>Client: {client_name}</p><p>Amount: {amount}</p></body></html>',
          1,
          ${db.dialect.now()},
          ${db.dialect.now()}
        )
      `);
    }

    // Add new columns to invoices table if they don't exist
    const invoiceTableInfo = await db.getMany<TableColumnInfo>("PRAGMA table_info(invoices)");
    const hasDesignTemplateId = invoiceTableInfo.some((row) => row.name === 'design_template_id');
    const hasRecurringTemplateId = invoiceTableInfo.some((row) => row.name === 'recurring_template_id');

    if (!hasDesignTemplateId) {
      console.log('Adding design_template_id column to invoices table...');
      await db.executeQuery('ALTER TABLE invoices ADD COLUMN design_template_id INTEGER');
    }

    if (!hasRecurringTemplateId) {
      console.log('Adding recurring_template_id column to invoices table...');
      await db.executeQuery('ALTER TABLE invoices ADD COLUMN recurring_template_id INTEGER');
    }

    // Migrate existing template_id to recurring_template_id if applicable
    const hasTemplateId = invoiceTableInfo.some((row) => row.name === 'template_id');
    if (hasTemplateId && hasClientId && hasFrequency) {
      console.log('Migrating template_id references to recurring_template_id...');
      await db.executeQuery(`
        UPDATE invoices 
        SET recurring_template_id = template_id
        WHERE template_id IS NOT NULL
      `);
    }

    console.log('✓ Successfully created separate template tables');
  } catch (error) {
    console.error('❌ Failed to create separate template tables:', error);
    throw error;
  }
};

/**
 * Rollback migration
 * Note: This is a complex rollback due to data separation
 */
export const down = async (db: IDatabase): Promise<void> => {
  console.log('Warning: Rolling back template separation is complex and may result in data loss.');
  console.log('Manual intervention recommended to preserve data integrity.');

  try {
    // Drop the new tables (this will lose data!)
    await db.executeQuery('DROP TABLE IF EXISTS invoice_design_templates');
    await db.executeQuery('DROP TABLE IF EXISTS recurring_invoice_templates');
    
    console.log('✓ Dropped separated template tables');
  } catch (error) {
    console.error('❌ Failed to rollback template separation:', error);
    throw error;
  }
};