// Migration 006: Align live tables with sqlite-optimized-schema.sql
// The live database was created from an older `CREATE TABLE IF NOT EXISTS` definition,
// so tables never picked up the columns later added to the schema. This migration
// additively closes that gap - it only ever ADDs columns and backfills NULLs.
//
// SQLite constraints honoured here:
//  - ALTER TABLE ... ADD COLUMN cannot use a non-constant default, so per-row values
//    (issue_date, client_*, zipCode) are added nullable then backfilled with UPDATE.
//  - NOT NULL is only used where a constant default exists (type, email_status,
//    shipping_amount), which SQLite fills in for existing rows.

import type { IDatabase } from '../../types/database.types.js';

interface ColumnAddition {
  table: string;
  column: string;
  /** Column definition appended after the column name (type + constant default only) */
  definition: string;
  /** Optional UPDATE run after the column exists; must be guarded so re-running is a no-op */
  backfill?: string;
  /**
   * Columns the backfill reads. It is skipped unless all of them exist.
   *
   * A backfill that sources data from another column cannot assume that column
   * is present: `payments.client_name` was backfilled from `payments.client_id`,
   * which some databases never had and which migration 008 drops from the rest.
   * On those the statement fails with "no such column" and takes the whole boot
   * down — a migration that only ever ADDs columns must not be able to do that.
   */
  backfillRequires?: string[];
}

/**
 * Every column the schema file declares that older databases are missing.
 * Ordered by table so the intent stays readable.
 */
const columnAdditions: ColumnAddition[] = [
  // ---------- users ----------
  { table: 'users', column: 'deleted_at', definition: 'TEXT' },

  // ---------- clients ----------
  { table: 'clients', column: 'first_name', definition: 'TEXT' },
  { table: 'clients', column: 'last_name', definition: 'TEXT' },
  // Backfilling zipCode from the old `zip` column is migration 007's job — it
  // owns the copy-then-drop. Doing it here would break on a fresh database,
  // where the table is built from tables.schema.ts and `zip` never exists.
  { table: 'clients', column: 'zipCode', definition: 'TEXT' },

  // ---------- invoices ----------
  {
    table: 'invoices',
    column: 'issue_date',
    definition: 'TEXT',
    backfill: "UPDATE invoices SET issue_date = date(created_at) WHERE issue_date IS NULL AND created_at IS NOT NULL"
  },
  { table: 'invoices', column: 'description', definition: 'TEXT' },
  { table: 'invoices', column: 'items', definition: 'TEXT' },
  { table: 'invoices', column: 'payment_terms', definition: 'TEXT' },
  { table: 'invoices', column: 'stripe_invoice_id', definition: 'TEXT' },
  { table: 'invoices', column: 'stripe_payment_intent_id', definition: 'TEXT' },
  {
    table: 'invoices',
    column: 'type',
    definition: "TEXT NOT NULL DEFAULT 'one-time'"
  },
  {
    table: 'invoices',
    column: 'client_name',
    definition: 'TEXT',
    backfill: `UPDATE invoices SET client_name = (
        SELECT c.name FROM clients c WHERE c.id = invoices.client_id
      ) WHERE client_name IS NULL`,
    backfillRequires: ['client_id']
  },
  {
    table: 'invoices',
    column: 'client_email',
    definition: 'TEXT',
    backfill: `UPDATE invoices SET client_email = (
        SELECT c.email FROM clients c WHERE c.id = invoices.client_id
      ) WHERE client_email IS NULL`,
    backfillRequires: ['client_id']
  },
  {
    table: 'invoices',
    column: 'client_phone',
    definition: 'TEXT',
    backfill: `UPDATE invoices SET client_phone = (
        SELECT c.phone FROM clients c WHERE c.id = invoices.client_id
      ) WHERE client_phone IS NULL`,
    backfillRequires: ['client_id']
  },
  {
    table: 'invoices',
    column: 'client_address',
    definition: 'TEXT',
    backfill: `UPDATE invoices SET client_address = (
        SELECT c.address FROM clients c WHERE c.id = invoices.client_id
      ) WHERE client_address IS NULL`,
    backfillRequires: ['client_id']
  },
  { table: 'invoices', column: 'line_items', definition: 'TEXT' },
  { table: 'invoices', column: 'tax_rate_id', definition: 'TEXT' },
  { table: 'invoices', column: 'shipping_amount', definition: 'REAL NOT NULL DEFAULT 0' },
  { table: 'invoices', column: 'shipping_rate_id', definition: 'TEXT' },
  { table: 'invoices', column: 'email_status', definition: "TEXT NOT NULL DEFAULT 'not_sent'" },
  { table: 'invoices', column: 'email_sent_at', definition: 'TEXT' },
  { table: 'invoices', column: 'email_error', definition: 'TEXT' },
  { table: 'invoices', column: 'last_email_attempt', definition: 'TEXT' },

  // ---------- payments ----------
  {
    table: 'payments',
    column: 'client_name',
    definition: 'TEXT',
    backfill: `UPDATE payments SET client_name = (
        SELECT c.name FROM clients c WHERE c.id = payments.client_id
      ) WHERE client_name IS NULL`,
    backfillRequires: ['client_id']
  },
  { table: 'payments', column: 'reference', definition: 'TEXT' },
  { table: 'payments', column: 'description', definition: 'TEXT' }
];

/**
 * Indexes declared by the schema file that depend on the columns added above.
 */
const indexes: string[] = [
  'CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users(deleted_at)',
  'CREATE INDEX IF NOT EXISTS idx_clients_first_last ON clients(first_name, last_name)',
  'CREATE INDEX IF NOT EXISTS idx_invoices_issue_date ON invoices(issue_date)',
  'CREATE INDEX IF NOT EXISTS idx_invoices_stripe_id ON invoices(stripe_invoice_id)',
  'CREATE INDEX IF NOT EXISTS idx_invoices_date_range ON invoices(issue_date, due_date)',
  'CREATE INDEX IF NOT EXISTS idx_payments_client_name ON payments(client_name)'
];

/**
 * Read the current column names of a table (empty when the table does not exist).
 */
const getColumnNames = async (db: IDatabase, table: string): Promise<string[]> => {
  if (!(await db.tableExists(table))) {
    return [];
  }

  const tableInfo = await db.getMany<{ name: string }>(`PRAGMA table_info(${table})`);
  return tableInfo.map(column => column.name);
};

export const up = async (db: IDatabase): Promise<void> => {
  console.log('Running migration 006: Align tables with schema file');

  try {
    // Group by table so PRAGMA is read once per table
    const tables = [...new Set(columnAdditions.map(addition => addition.table))];

    for (const table of tables) {
      const existingColumns = await getColumnNames(db, table);

      if (existingColumns.length === 0) {
        console.log(`Skipping ${table} - table does not exist`);
        continue;
      }

      for (const addition of columnAdditions.filter(item => item.table === table)) {
        if (!existingColumns.includes(addition.column)) {
          await db.executeQuery(`ALTER TABLE ${table} ADD COLUMN ${addition.column} ${addition.definition}`);
          existingColumns.push(addition.column);
          console.log(`✓ Added ${table}.${addition.column}`);
        }

        // Backfills are NULL-guarded, so they are safe to re-run. They are also
        // skipped when a column they read is absent: this migration only ADDs
        // columns, so it must not fail on a database whose shape it did not
        // expect. `payments.client_id` is the case in point — some databases
        // never had it, and migration 008 removes it from the ones that did.
        const sources = addition.backfillRequires ?? [];
        const sourcesPresent = sources.every(column => existingColumns.includes(column));

        if (addition.backfill && sourcesPresent) {
          await db.executeQuery(addition.backfill);
        } else if (addition.backfill) {
          console.log(
            `Skipping ${table}.${addition.column} backfill - ` +
              `source column(s) ${sources.join(', ')} not present`
          );
        }
      }
    }

    for (const sql of indexes) {
      await db.executeQuery(sql);
    }

    console.log('✓ Migration 006 complete');
  } catch (error) {
    console.error('Error in migration 006:', error);
    throw error;
  }
};

export const down = async (_db: IDatabase): Promise<void> => {
  console.log('Warning: SQLite does not support DROP COLUMN. Migration 006 cannot be rolled back automatically.');
};
