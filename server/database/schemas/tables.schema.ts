// Database table schema definitions for Slimbooks
// Optimized for better-sqlite3: correct soft-delete physics, FK indexes,
// WAL-friendly pragmas, and structural integrity for concurrent load.

import type { IDatabase, TableSchema } from '../../types/database.types.js';
import { createTokenTables } from './tokenTables.schema.js';

/**
 * User authentication and management table
 */
const usersSchema: TableSchema = {
  name: 'users',
  columns: [
    { name: 'id', type: 'INTEGER', constraints: ['PRIMARY KEY AUTOINCREMENT'] },
    { name: 'name', type: 'TEXT', constraints: ['NOT NULL'] },
    { name: 'email', type: 'TEXT', constraints: ['UNIQUE NOT NULL'] },
    { name: 'username', type: 'TEXT', constraints: ['UNIQUE NOT NULL'] },
    { name: 'password_hash', type: 'TEXT' },
    { name: 'role', type: 'TEXT', constraints: ["DEFAULT 'user'"] },
    { name: 'email_verified', type: 'INTEGER', constraints: ['DEFAULT 0'] },
    { name: 'google_id', type: 'TEXT', constraints: ['UNIQUE'] },
    { name: 'two_factor_secret', type: 'TEXT' },
    { name: 'backup_codes', type: 'TEXT' },
    { name: 'last_login', type: 'TEXT' },
    { name: 'failed_login_attempts', type: 'INTEGER', constraints: ['DEFAULT 0'] },
    { name: 'account_locked_until', type: 'TEXT' },
    { name: 'password_updated_at', type: 'TEXT' },
    { name: 'email_verified_at', type: 'TEXT' },
    { name: 'created_at', type: 'TEXT', constraints: ['NOT NULL DEFAULT (datetime(\'now\'))'] },
    { name: 'updated_at', type: 'TEXT', constraints: ['NOT NULL DEFAULT (datetime(\'now\'))'] },
    { name: 'deleted_at', type: 'TEXT' }
  ]
};

/**
 * Client/customer management table
 */
const clientsSchema: TableSchema = {
  name: 'clients',
  columns: [
    { name: 'id', type: 'INTEGER', constraints: ['PRIMARY KEY AUTOINCREMENT'] },
    { name: 'name', type: 'TEXT', constraints: ['NOT NULL'] },
    { name: 'first_name', type: 'TEXT' },
    { name: 'last_name', type: 'TEXT' },
    { name: 'email', type: 'TEXT' },
    { name: 'phone', type: 'TEXT' },
    { name: 'company', type: 'TEXT' },
    { name: 'address', type: 'TEXT' },
    { name: 'city', type: 'TEXT' },
    { name: 'state', type: 'TEXT' },
    { name: 'zipCode', type: 'TEXT' },
    { name: 'country', type: 'TEXT' },
    { name: 'tax_id', type: 'TEXT' },
    { name: 'notes', type: 'TEXT' },
    { name: 'stripe_customer_id', type: 'TEXT' },
    { name: 'is_active', type: 'INTEGER', constraints: ['DEFAULT 1'] },
    { name: 'created_at', type: 'TEXT', constraints: ['NOT NULL DEFAULT (datetime(\'now\'))'] },
    { name: 'updated_at', type: 'TEXT', constraints: ['NOT NULL DEFAULT (datetime(\'now\'))'] },
    { name: 'deleted_at', type: 'TEXT' } // nullable soft-delete terrain
  ]
};

/**
 * Invoice management table
 */
const invoicesSchema: TableSchema = {
  name: 'invoices',
  columns: [
    { name: 'id', type: 'INTEGER', constraints: ['PRIMARY KEY AUTOINCREMENT'] },
    { name: 'invoice_number', type: 'TEXT', constraints: ['UNIQUE NOT NULL'] },
    { name: 'client_id', type: 'INTEGER', constraints: ['NOT NULL'] },
    { name: 'design_template_id', type: 'INTEGER' },
    { name: 'recurring_template_id', type: 'INTEGER' },
    { name: 'amount', type: 'REAL', constraints: ['NOT NULL DEFAULT 0'] },
    { name: 'tax_amount', type: 'REAL', constraints: ['DEFAULT 0'] },
    { name: 'total_amount', type: 'REAL', constraints: ['NOT NULL DEFAULT 0'] },
    { name: 'currency', type: 'TEXT', constraints: ["DEFAULT 'USD'"] },
    { name: 'status', type: 'TEXT', constraints: ["DEFAULT 'draft'"] },
    { name: 'due_date', type: 'TEXT' },
    { name: 'issue_date', type: 'TEXT' },
    { name: 'paid_date', type: 'TEXT' },
    { name: 'description', type: 'TEXT' },
    { name: 'items', type: 'TEXT' },
    { name: 'notes', type: 'TEXT' },
    { name: 'terms', type: 'TEXT' },
    { name: 'footer', type: 'TEXT' },
    { name: 'payment_terms', type: 'TEXT' },
    { name: 'stripe_invoice_id', type: 'TEXT' },
    { name: 'stripe_payment_intent_id', type: 'TEXT' },
    { name: 'stripe_payment_link_id', type: 'TEXT' },
    { name: 'stripe_payment_link_url', type: 'TEXT' },
    { name: 'stripe_checkout_session_id', type: 'TEXT' },
    { name: 'type', type: 'TEXT', constraints: ["NOT NULL DEFAULT 'one-time'"] },
    { name: 'client_name', type: 'TEXT' },
    { name: 'client_email', type: 'TEXT' },
    { name: 'client_phone', type: 'TEXT' },
    { name: 'client_address', type: 'TEXT' },
    { name: 'line_items', type: 'TEXT' },
    { name: 'tax_rate_id', type: 'TEXT' },
    { name: 'shipping_amount', type: 'REAL', constraints: ['NOT NULL DEFAULT 0'] },
    { name: 'shipping_rate_id', type: 'TEXT' },
    { name: 'email_status', type: 'TEXT', constraints: ["NOT NULL DEFAULT 'not_sent'"] },
    { name: 'email_sent_at', type: 'TEXT' },
    { name: 'email_error', type: 'TEXT' },
    { name: 'last_email_attempt', type: 'TEXT' },
    { name: 'is_recurring', type: 'INTEGER', constraints: ['DEFAULT 0'] },
    { name: 'recurring_frequency', type: 'TEXT' },
    { name: 'next_due_date', type: 'TEXT' },
    { name: 'recurring_period_date', type: 'TEXT' },
    { name: 'created_at', type: 'TEXT', constraints: ['NOT NULL DEFAULT (datetime(\'now\'))'] },
    { name: 'updated_at', type: 'TEXT', constraints: ['NOT NULL DEFAULT (datetime(\'now\'))'] },
    { name: 'deleted_at', type: 'TEXT' }
  ],
  constraints: [
    'FOREIGN KEY (client_id) REFERENCES clients (id) ON DELETE CASCADE',
    'FOREIGN KEY (design_template_id) REFERENCES invoice_design_templates (id) ON DELETE SET NULL',
    'FOREIGN KEY (recurring_template_id) REFERENCES recurring_invoice_templates (id) ON DELETE SET NULL'
  ]
};

/**
 * Invoice line items table
 */
const invoiceItemsSchema: TableSchema = {
  name: 'invoice_items',
  columns: [
    { name: 'id', type: 'INTEGER', constraints: ['PRIMARY KEY AUTOINCREMENT'] },
    { name: 'invoice_id', type: 'INTEGER', constraints: ['NOT NULL'] },
    { name: 'description', type: 'TEXT', constraints: ['NOT NULL'] },
    { name: 'quantity', type: 'REAL', constraints: ['NOT NULL DEFAULT 1'] },
    { name: 'unit_price', type: 'REAL', constraints: ['NOT NULL DEFAULT 0'] },
    { name: 'total', type: 'REAL', constraints: ['NOT NULL DEFAULT 0'] },
    { name: 'tax_rate', type: 'REAL', constraints: ['DEFAULT 0'] },
    { name: 'sort_order', type: 'INTEGER', constraints: ['DEFAULT 0'] },
    { name: 'created_at', type: 'TEXT', constraints: ['NOT NULL DEFAULT (datetime(\'now\'))'] },
    { name: 'updated_at', type: 'TEXT', constraints: ['NOT NULL DEFAULT (datetime(\'now\'))'] },
    { name: 'deleted_at', type: 'TEXT' }
  ],
  constraints: [
    'FOREIGN KEY (invoice_id) REFERENCES invoices (id) ON DELETE CASCADE'
  ]
};

/**
 * Payment tracking table
 */
const paymentsSchema: TableSchema = {
  name: 'payments',
  columns: [
    { name: 'id', type: 'INTEGER', constraints: ['PRIMARY KEY AUTOINCREMENT'] },
    { name: 'invoice_id', type: 'INTEGER' },
    // The client is denormalised onto the payment as `client_name`; there is no
    // client_id column. It was declared NOT NULL while PaymentService never
    // inserted it, which made every payment insert fail on a fresh database.
    { name: 'client_name', type: 'TEXT' },
    { name: 'amount', type: 'REAL', constraints: ['NOT NULL'] },
    { name: 'currency', type: 'TEXT', constraints: ["DEFAULT 'USD'"] },
    { name: 'method', type: 'TEXT', constraints: ['NOT NULL'] },
    { name: 'status', type: 'TEXT', constraints: ["DEFAULT 'pending'"] },
    { name: 'reference', type: 'TEXT' },
    { name: 'description', type: 'TEXT' },
    { name: 'stripe_payment_id', type: 'TEXT' },
    { name: 'date', type: 'TEXT', constraints: ['NOT NULL'] },
    { name: 'created_at', type: 'TEXT', constraints: ['NOT NULL DEFAULT (datetime(\'now\'))'] },
    { name: 'updated_at', type: 'TEXT', constraints: ['NOT NULL DEFAULT (datetime(\'now\'))'] },
    { name: 'deleted_at', type: 'TEXT' }
  ],
  constraints: [
    'FOREIGN KEY (invoice_id) REFERENCES invoices (id) ON DELETE SET NULL'
  ]
};

/**
 * Expense tracking table
 */
const expensesSchema: TableSchema = {
  name: 'expenses',
  columns: [
    { name: 'id', type: 'INTEGER', constraints: ['PRIMARY KEY AUTOINCREMENT'] },
    { name: 'description', type: 'TEXT', constraints: ['NOT NULL'] },
    { name: 'amount', type: 'REAL', constraints: ['NOT NULL'] },
    { name: 'currency', type: 'TEXT', constraints: ["DEFAULT 'USD'"] },
    { name: 'category', type: 'TEXT' },
    { name: 'date', type: 'TEXT', constraints: ['NOT NULL'] },
    { name: 'vendor', type: 'TEXT' },
    // Approval workflow: pending | approved | rejected | reimbursed
    { name: 'status', type: 'TEXT', constraints: ["NOT NULL DEFAULT 'pending'"] },
    { name: 'notes', type: 'TEXT' },
    { name: 'receipt_url', type: 'TEXT' },
    { name: 'is_billable', type: 'INTEGER', constraints: ['DEFAULT 0'] },
    { name: 'client_id', type: 'INTEGER' },
    { name: 'project', type: 'TEXT' },
    { name: 'created_at', type: 'TEXT', constraints: ['NOT NULL DEFAULT (datetime(\'now\'))'] },
    { name: 'updated_at', type: 'TEXT', constraints: ['NOT NULL DEFAULT (datetime(\'now\'))'] },
    { name: 'deleted_at', type: 'TEXT' }
  ],
  constraints: [
    'FOREIGN KEY (client_id) REFERENCES clients (id) ON DELETE SET NULL'
  ]
};

/**
 * Invoice design templates table
 */
const invoiceDesignTemplatesSchema: TableSchema = {
  name: 'invoice_design_templates',
  columns: [
    { name: 'id', type: 'INTEGER', constraints: ['PRIMARY KEY AUTOINCREMENT'] },
    { name: 'name', type: 'TEXT', constraints: ['NOT NULL'] },
    { name: 'content', type: 'TEXT', constraints: ['NOT NULL'] },
    { name: 'is_default', type: 'INTEGER', constraints: ['DEFAULT 0'] },
    { name: 'variables', type: 'TEXT' },
    { name: 'created_at', type: 'TEXT', constraints: ['NOT NULL DEFAULT (datetime(\'now\'))'] },
    { name: 'updated_at', type: 'TEXT', constraints: ['NOT NULL DEFAULT (datetime(\'now\'))'] },
    { name: 'deleted_at', type: 'TEXT' }
  ]
};

/**
 * Recurring invoice templates table
 */
const recurringInvoiceTemplatesSchema: TableSchema = {
  name: 'recurring_invoice_templates',
  columns: [
    { name: 'id', type: 'INTEGER', constraints: ['PRIMARY KEY AUTOINCREMENT'] },
    { name: 'name', type: 'TEXT', constraints: ['NOT NULL'] },
    { name: 'client_id', type: 'INTEGER', constraints: ['NOT NULL'] },
    { name: 'amount', type: 'REAL', constraints: ['NOT NULL'] },
    { name: 'description', type: 'TEXT' },
    { name: 'frequency', type: 'TEXT', constraints: ['NOT NULL'] },
    { name: 'payment_terms', type: 'TEXT', constraints: ['NOT NULL'] },
    { name: 'next_invoice_date', type: 'TEXT', constraints: ['NOT NULL'] },
    { name: 'is_active', type: 'INTEGER', constraints: ['DEFAULT 1'] },
    { name: 'line_items', type: 'TEXT' },
    { name: 'tax_amount', type: 'REAL', constraints: ['DEFAULT 0'] },
    { name: 'tax_rate_id', type: 'TEXT' },
    { name: 'shipping_amount', type: 'REAL', constraints: ['DEFAULT 0'] },
    { name: 'shipping_rate_id', type: 'TEXT' },
    { name: 'notes', type: 'TEXT' },
    { name: 'created_at', type: 'TEXT', constraints: ['NOT NULL DEFAULT (datetime(\'now\'))'] },
    { name: 'updated_at', type: 'TEXT', constraints: ['NOT NULL DEFAULT (datetime(\'now\'))'] },
    { name: 'deleted_at', type: 'TEXT' }
  ],
  constraints: [
    'FOREIGN KEY (client_id) REFERENCES clients (id) ON DELETE CASCADE'
  ]
};

/**
 * Application settings table
 */
const settingsSchema: TableSchema = {
  name: 'settings',
  columns: [
    { name: 'id', type: 'INTEGER', constraints: ['PRIMARY KEY AUTOINCREMENT'] },
    { name: 'key', type: 'TEXT', constraints: ['UNIQUE NOT NULL'] },
    { name: 'value', type: 'TEXT' },
    { name: 'type', type: 'TEXT', constraints: ["DEFAULT 'string'"] },
    { name: 'description', type: 'TEXT' },
    { name: 'is_public', type: 'INTEGER', constraints: ['DEFAULT 0'] },
    // Added by migration 002; declared here so a fresh database matches an
    // upgraded one.
    { name: 'category', type: 'TEXT' },
    { name: 'created_at', type: 'TEXT', constraints: ['NOT NULL DEFAULT (datetime(\'now\'))'] },
    { name: 'updated_at', type: 'TEXT', constraints: ['NOT NULL DEFAULT (datetime(\'now\'))'] }
  ]
};

/**
 * Project-specific settings table
 */
const projectSettingsSchema: TableSchema = {
  name: 'project_settings',
  columns: [
    { name: 'id', type: 'INTEGER', constraints: ['PRIMARY KEY AUTOINCREMENT'] },
    { name: 'key', type: 'TEXT', constraints: ['UNIQUE NOT NULL'] },
    { name: 'value', type: 'TEXT' },
    { name: 'enabled', type: 'INTEGER', constraints: ['DEFAULT 1'] },
    { name: 'created_at', type: 'TEXT', constraints: ['NOT NULL DEFAULT (datetime(\'now\'))'] },
    { name: 'updated_at', type: 'TEXT', constraints: ['NOT NULL DEFAULT (datetime(\'now\'))'] }
  ]
};

/**
 * Reports table for storing generated reports
 */
const reportsSchema: TableSchema = {
  name: 'reports',
  columns: [
    { name: 'id', type: 'INTEGER', constraints: ['PRIMARY KEY AUTOINCREMENT'] },
    { name: 'name', type: 'TEXT', constraints: ['NOT NULL'] },
    { name: 'type', type: 'TEXT', constraints: ['NOT NULL'] },
    { name: 'date_range_start', type: 'TEXT' },
    { name: 'date_range_end', type: 'TEXT' },
    { name: 'data', type: 'TEXT' },
    { name: 'created_at', type: 'TEXT', constraints: ['NOT NULL DEFAULT (datetime(\'now\'))'] },
    { name: 'deleted_at', type: 'TEXT' }
  ]
};

/**
 * Counters for generating sequential numbers
 */
const countersSchema: TableSchema = {
  name: 'counters',
  columns: [
    { name: 'id', type: 'INTEGER', constraints: ['PRIMARY KEY AUTOINCREMENT'] },
    { name: 'name', type: 'TEXT', constraints: ['UNIQUE NOT NULL'] },
    { name: 'value', type: 'INTEGER', constraints: ['NOT NULL DEFAULT 0'] },
    { name: 'created_at', type: 'TEXT', constraints: ['NOT NULL DEFAULT (datetime(\'now\'))'] },
    { name: 'updated_at', type: 'TEXT', constraints: ['NOT NULL DEFAULT (datetime(\'now\'))'] },
    { name: 'deleted_at', type: 'TEXT' }
  ]
};

/**
 * Scheduler leases — lets one runtime instance claim a scheduled job so two
 * instances do not both run it; leases expire so a killed process does not
 * hold its claim forever.
 */
const schedulerLeasesSchema: TableSchema = {
  name: 'scheduler_leases',
  columns: [
    { name: 'job_name', type: 'TEXT', constraints: ['PRIMARY KEY'] },
    { name: 'owner', type: 'TEXT', constraints: ['NOT NULL'] },
    { name: 'acquired_at', type: 'TEXT', constraints: ['NOT NULL'] },
    { name: 'expires_at', type: 'TEXT', constraints: ['NOT NULL'] }
  ]
};

/**
 * Stripe webhook idempotency ledger — records which event ids have already
 * been processed, since Stripe retries on every non-2xx and on timeout.
 */
const stripeEventsSchema: TableSchema = {
  name: 'stripe_events',
  columns: [
    { name: 'event_id', type: 'TEXT', constraints: ['PRIMARY KEY'] },
    { name: 'event_type', type: 'TEXT', constraints: ['NOT NULL'] },
    { name: 'processed_at', type: 'TEXT', constraints: ['NOT NULL DEFAULT (datetime(\'now\'))'] }
  ]
};

// Export all schemas — order respects foreign-key dependency graph
export const tableSchemas: TableSchema[] = [
  usersSchema,
  clientsSchema,
  invoiceDesignTemplatesSchema,
  recurringInvoiceTemplatesSchema,
  invoicesSchema,
  invoiceItemsSchema,
  paymentsSchema,
  expensesSchema,
  reportsSchema,
  settingsSchema,
  projectSettingsSchema,
  countersSchema,
  schedulerLeasesSchema,
  stripeEventsSchema
];

/**
 * Performance indexes — the arterial roads of the data city.
 * SQLite does not auto-index FKs; without these the CASCADE and JOIN physics collapse under load.
 */
const indexes = [
  // clients
  'CREATE INDEX IF NOT EXISTS idx_clients_email ON clients (email)',
  'CREATE INDEX IF NOT EXISTS idx_clients_is_active ON clients (is_active)',
  'CREATE INDEX IF NOT EXISTS idx_clients_deleted_at ON clients (deleted_at)',

  // invoices
  'CREATE INDEX IF NOT EXISTS idx_invoices_client_id ON invoices (client_id)',
  'CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices (status)',
  'CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON invoices (due_date)',
  'CREATE INDEX IF NOT EXISTS idx_invoices_deleted_at ON invoices (deleted_at)',
  'CREATE INDEX IF NOT EXISTS idx_invoices_design_template_id ON invoices (design_template_id)',
  'CREATE INDEX IF NOT EXISTS idx_invoices_recurring_template_id ON invoices (recurring_template_id)',

  // invoice_items
  'CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON invoice_items (invoice_id)',
  'CREATE INDEX IF NOT EXISTS idx_invoice_items_deleted_at ON invoice_items (deleted_at)',

  // payments
  'CREATE INDEX IF NOT EXISTS idx_payments_invoice_id ON payments (invoice_id)',
  'CREATE INDEX IF NOT EXISTS idx_payments_date ON payments (date)',
  'CREATE INDEX IF NOT EXISTS idx_payments_status ON payments (status)',
  'CREATE INDEX IF NOT EXISTS idx_payments_deleted_at ON payments (deleted_at)',

  // expenses
  'CREATE INDEX IF NOT EXISTS idx_expenses_client_id ON expenses (client_id)',
  'CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses (date)',
  'CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses (category)',
  // idx_expenses_status is created by migration 009, not here: createTables()
  // runs BEFORE runMigrations(), so on an existing database this list executes
  // while `status` still does not exist. Indexes over newly-added columns
  // belong to the migration that adds the column.
  'CREATE INDEX IF NOT EXISTS idx_expenses_deleted_at ON expenses (deleted_at)',

  // recurring
  'CREATE INDEX IF NOT EXISTS idx_recurring_client_id ON recurring_invoice_templates (client_id)',
  'CREATE INDEX IF NOT EXISTS idx_recurring_next_invoice_date ON recurring_invoice_templates (next_invoice_date)',
  'CREATE INDEX IF NOT EXISTS idx_recurring_is_active ON recurring_invoice_templates (is_active)',
  'CREATE INDEX IF NOT EXISTS idx_recurring_deleted_at ON recurring_invoice_templates (deleted_at)',

  // reports / counters
  'CREATE INDEX IF NOT EXISTS idx_reports_type ON reports (type)',
  'CREATE INDEX IF NOT EXISTS idx_reports_deleted_at ON reports (deleted_at)',
  'CREATE INDEX IF NOT EXISTS idx_counters_name ON counters (name)',

  // Indexes that migrations 006-011 add. They are declared here too so this
  // file describes the true final shape — which a fresh database, and any
  // future non-SQLite backend built from this file alone, must reach directly.
  // createTables() skips any whose columns are not present yet, so an existing
  // database still picks them up from its migration rather than crashing.
  'CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users (deleted_at)',
  'CREATE INDEX IF NOT EXISTS idx_clients_first_last ON clients (first_name, last_name)',
  'CREATE INDEX IF NOT EXISTS idx_expenses_status ON expenses (status)',
  'CREATE INDEX IF NOT EXISTS idx_expenses_vendor ON expenses (vendor)',
  'CREATE INDEX IF NOT EXISTS idx_expenses_is_billable ON expenses (is_billable)',
  'CREATE INDEX IF NOT EXISTS idx_expenses_date_category ON expenses (date, category)',
  'CREATE INDEX IF NOT EXISTS idx_invoices_issue_date ON invoices (issue_date)',
  'CREATE INDEX IF NOT EXISTS idx_invoices_stripe_id ON invoices (stripe_invoice_id)',
  'CREATE INDEX IF NOT EXISTS idx_invoices_date_range ON invoices (issue_date, due_date)',
  'CREATE INDEX IF NOT EXISTS idx_invoices_stripe_checkout_session ON invoices (stripe_checkout_session_id)',
  'CREATE INDEX IF NOT EXISTS idx_payments_client_name ON payments (client_name)',
  'CREATE INDEX IF NOT EXISTS idx_payments_stripe_payment_id ON payments (stripe_payment_id)',
  // Unique, and partial: manual invoices carry no template and must not collide.
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_recurring_period
     ON invoices (recurring_template_id, recurring_period_date)
     WHERE recurring_template_id IS NOT NULL`
];

/**
 * Triggers the schema declares. Migration 004 creates this one; it is repeated
 * here for the same reason the indexes above are.
 */
const triggers = [
  `CREATE TRIGGER IF NOT EXISTS update_expenses_timestamp
     AFTER UPDATE ON expenses
     FOR EACH ROW
   BEGIN
     UPDATE expenses SET updated_at = datetime('now') WHERE id = NEW.id;
   END`
];

/** Pulls the table and column names out of a CREATE INDEX statement. */
const parseIndexTarget = (sql: string): { table: string; columns: string[] } | null => {
  const match = /ON\s+(\w+)\s*\(([^)]+)\)/i.exec(sql);

  if (!match?.[1] || !match[2]) return null;

  return {
    table: match[1],
    // Strip any WHERE-clause remnant and per-column direction keywords.
    columns: match[2].split(',').map(column => column.trim().split(/\s+/)[0] ?? '')
  };
};

/**
 * Whether every column an index covers exists on its table right now.
 *
 * Returns false rather than throwing for an unparseable statement or a missing
 * table — the point is that a not-yet-ready index is skipped quietly, and the
 * migration that adds the column creates its own index anyway.
 */
const indexIsBuildable = async (db: IDatabase, sql: string): Promise<boolean> => {
  const target = parseIndexTarget(sql);
  if (target === null) return false;

  const info = await db.getMany<{ name: string }>(`PRAGMA table_info(${target.table})`);
  if (info.length === 0) return false;

  const present = new Set(info.map(column => column.name));
  return target.columns.every(column => present.has(column));
};

/**
 * Create all database tables + performance indexes + better-sqlite3 pragmas
 */
export const createTables = async (db: IDatabase): Promise<void> => {
  // Structural integrity first: enforce referential physics
  await db.executeQuery('PRAGMA foreign_keys = ON');

  // Terrain physics for concurrent city traffic (better-sqlite3 recommended)
  await db.executeQuery('PRAGMA journal_mode = WAL');
  await db.executeQuery('PRAGMA synchronous = NORMAL');
  await db.executeQuery('PRAGMA temp_store = MEMORY');
  await db.executeQuery('PRAGMA cache_size = -64000'); // ~64 MB cache

  for (const schema of tableSchemas) {
    const columnDefs = schema.columns
      .map(col => `${col.name} ${col.type} ${col.constraints?.join(' ') || ''}`.trim())
      .join(', ');

    const constraints = schema.constraints
      ? ', ' + schema.constraints.join(', ')
      : '';

    const createTableSQL = `CREATE TABLE IF NOT EXISTS ${schema.name} (${columnDefs}${constraints})`;
    await db.executeQuery(createTableSQL);
  }

  // Lay the arterial roads.
  //
  // Skipped when a column the index covers does not exist yet. createTables()
  // runs BEFORE runMigrations(), so on an existing database an index over a
  // migration-added column would fail with "no such column" and take the whole
  // boot down. Declaring the full final shape here and skipping what is not
  // ready yet means a fresh database gets every index immediately, an upgrading
  // database gets it on the next boot after its migration lands, and the two
  // converge — without the schema file having to lie about the target shape.
  for (const sql of indexes) {
    if (await indexIsBuildable(db, sql)) {
      await db.executeQuery(sql);
    }
  }

  for (const sql of triggers) {
    await db.executeQuery(sql);
  }

  // Token tables (password reset / email verification)
  await createTokenTables(db);
};

/**
 * Drop all tables (useful for testing / clean rebuild)
 * Reverse order respects the dependency graph so the city can be safely demolished.
 */
export const dropAllTables = async (db: IDatabase): Promise<void> => {
  const reverseSchemas = [...tableSchemas].reverse();
  for (const schema of reverseSchemas) {
    await db.executeQuery(`DROP TABLE IF EXISTS ${schema.name}`);
  }
};