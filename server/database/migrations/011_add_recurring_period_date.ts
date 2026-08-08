// Migration 011: Make recurring invoice generation idempotent
//
// The processor created an invoice and then advanced the template's
// next_invoice_date in two separate statements. A process killed between them —
// which an ephemeral host does on every redeploy — re-created the same invoice
// on the next boot, and nothing rejected it.
//
// `recurring_period_date` records which billing period an invoice covers, and a
// unique index over (recurring_template_id, recurring_period_date) makes a
// duplicate a database error rather than a matter of timing. Existing rows are
// backfilled from issue_date; any duplicates that already exist are collapsed
// first, because the index cannot be created over them.

import type { IDatabase } from '../../types/database.types.js';

const hasColumn = async (db: IDatabase, table: string, column: string): Promise<boolean> => {
  if (!(await db.tableExists(table))) return false;

  return (await db
    .getMany<{ name: string }>(`PRAGMA table_info(${table})`))
    .some(info => info.name === column);
};

export const up = async (db: IDatabase): Promise<void> => {
  console.log('Running migration 011: Add recurring_period_date to invoices');

  if (!(await db.tableExists('invoices'))) {
    console.log('Skipping - invoices table does not exist');
    return;
  }

  if (!(await hasColumn(db, 'invoices', 'recurring_period_date'))) {
    await db.executeQuery('ALTER TABLE invoices ADD COLUMN recurring_period_date TEXT');
    console.log('✓ Added invoices.recurring_period_date');
  }

  // Backfill: an existing recurring invoice covers the period it was issued in.
  await db.executeQuery(`
    UPDATE invoices
       SET recurring_period_date = issue_date
     WHERE recurring_template_id IS NOT NULL
       AND recurring_period_date IS NULL
  `);

  // Collapse pre-existing duplicates, keeping the earliest row of each pair.
  // Without this the unique index below fails on any live database that already
  // double-generated.
  const duplicates = await db.executeQuery(`
    DELETE FROM invoices
     WHERE recurring_template_id IS NOT NULL
       AND id NOT IN (
         SELECT MIN(id) FROM invoices
          WHERE recurring_template_id IS NOT NULL
          GROUP BY recurring_template_id, recurring_period_date
       )
  `);

  if (duplicates.changes > 0) {
    console.log(`✓ Collapsed ${duplicates.changes} duplicate recurring invoice(s)`);
  }

  // Belongs here rather than in tables.schema.ts: createTables() runs before
  // migrations and would not find the column yet.
  await db.executeQuery(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_recurring_period
      ON invoices (recurring_template_id, recurring_period_date)
      WHERE recurring_template_id IS NOT NULL
  `);

  console.log('Migration 011 completed successfully');
};

export const down = async (db: IDatabase): Promise<void> => {
  await db.executeQuery('DROP INDEX IF EXISTS idx_invoices_recurring_period');

  if (await hasColumn(db, 'invoices', 'recurring_period_date')) {
    await db.executeQuery('ALTER TABLE invoices DROP COLUMN recurring_period_date');
  }
};
