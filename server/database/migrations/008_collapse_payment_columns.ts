// Migration 008: Collapse duplicated payment columns onto the names the app uses
//
// The payments table accumulated two parallel vocabularies for the same three
// concepts. Everything that reads or writes payments — PaymentService's INSERT,
// its allowed-update whitelist, the `Payment` domain type and PaymentFormData —
// uses the right-hand column, so that side wins:
//
//     client_id       -> client_name
//     transaction_id  -> reference
//     notes           -> description
//
// `client_id` was also declared NOT NULL while PaymentService never inserts it,
// so on a freshly created database every payment insert failed with
// "NOT NULL constraint failed: payments.client_id". Dropping it fixes that.
//
// `currency` and `stripe_payment_id` are left in place: they are unused today
// but they are orphans rather than duplicates, and stripe_payment_id belongs to
// the in-progress Stripe integration.

import type { IDatabase } from '../../types/database.types.js';

/** Old column -> the column the application actually uses. */
const COLUMN_MERGES: ReadonlyArray<{ from: string; to: string }> = [
  { from: 'transaction_id', to: 'reference' },
  { from: 'notes', to: 'description' }
];

/**
 * The target table, matching tables.schema.ts. `client_id` carries a foreign key,
 * and SQLite refuses ALTER TABLE ... DROP COLUMN for a column named in a table
 * constraint ("unknown column client_id in foreign key definition"), so the
 * table is rebuilt rather than altered.
 */
const REBUILT_TABLE = `
  CREATE TABLE payments_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id INTEGER,
    client_name TEXT,
    amount REAL NOT NULL,
    currency TEXT DEFAULT 'USD',
    method TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    reference TEXT,
    description TEXT,
    stripe_payment_id TEXT,
    date TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT,
    FOREIGN KEY (invoice_id) REFERENCES invoices (id) ON DELETE SET NULL
  )
`;

const REBUILT_INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_payments_invoice_id ON payments (invoice_id)',
  'CREATE INDEX IF NOT EXISTS idx_payments_date ON payments (date)',
  'CREATE INDEX IF NOT EXISTS idx_payments_status ON payments (status)',
  'CREATE INDEX IF NOT EXISTS idx_payments_deleted_at ON payments (deleted_at)',
  'CREATE INDEX IF NOT EXISTS idx_payments_client_name ON payments (client_name)'
];

const getColumnNames = async (db: IDatabase, table: string): Promise<string[]> => {
  if (!(await db.tableExists(table))) {
    return [];
  }

  return (await db.getMany<{ name: string }>(`PRAGMA table_info(${table})`)).map(column => column.name);
};

export const up = async (db: IDatabase): Promise<void> => {
  console.log('Running migration 008: Collapse duplicated payment columns');

  try {
    let columns = await getColumnNames(db, 'payments');

    if (columns.length === 0) {
      console.log('Skipping - payments table does not exist');
      return;
    }

    // client_name is the survivor of the client_id/client_name pair.
    if (columns.includes('client_id') && columns.includes('client_name')) {
      await db.executeQuery(`
        UPDATE payments SET client_name = (
          SELECT c.name FROM clients c WHERE c.id = payments.client_id
        ) WHERE client_name IS NULL AND client_id IS NOT NULL
      `);
    }

    for (const { from, to } of COLUMN_MERGES) {
      if (columns.includes(from) && columns.includes(to)) {
        await db.executeQuery(`UPDATE payments SET ${to} = ${from} WHERE ${to} IS NULL AND ${from} IS NOT NULL`);

        const stranded = await db.getOne<{ count: number }>(
          `SELECT COUNT(*) as count FROM payments WHERE ${to} IS NULL AND ${from} IS NOT NULL`
        );

        if (stranded && stranded.count > 0) {
          throw new Error(
            `Refusing to drop payments.${from}: ${stranded.count} row(s) still hold a value only under the old column`
          );
        }

        console.log(`✓ Merged payments.${from} into payments.${to}`);
      }
    }

    columns = await getColumnNames(db, 'payments');
    const legacy = ['client_id', 'transaction_id', 'notes'].filter(column => columns.includes(column));

    if (legacy.length === 0) {
      console.log('✓ Legacy payment columns already removed');
      console.log('Migration 008 completed successfully');
      return;
    }

    // SQLite's supported table-rebuild procedure. foreign_keys must be toggled
    // outside a transaction, which is why the migration runner does not wrap
    // migrations in one.
    await db.executeQuery('PRAGMA foreign_keys = OFF');
    await db.executeQuery('DROP INDEX IF EXISTS idx_payments_client_id');
    await db.executeQuery('DROP TABLE IF EXISTS payments_new');
    await db.executeQuery(REBUILT_TABLE);

    await db.executeQuery(`
      INSERT INTO payments_new (
        id, invoice_id, client_name, amount, currency, method, status,
        reference, description, stripe_payment_id, date, created_at, updated_at, deleted_at
      )
      SELECT
        id, invoice_id, client_name, amount, currency, method, status,
        reference, description, stripe_payment_id, date, created_at, updated_at, deleted_at
      FROM payments
    `);

    const before = await db.getOne<{ count: number }>('SELECT COUNT(*) as count FROM payments');
    const after = await db.getOne<{ count: number }>('SELECT COUNT(*) as count FROM payments_new');

    if (!before || !after || before.count !== after.count) {
      await db.executeQuery('DROP TABLE IF EXISTS payments_new');
      await db.executeQuery('PRAGMA foreign_keys = ON');
      throw new Error(
        `Row count mismatch rebuilding payments (${before?.count} -> ${after?.count}); aborted without dropping the original`
      );
    }

    await db.executeQuery('DROP TABLE payments');
    await db.executeQuery('ALTER TABLE payments_new RENAME TO payments');

    for (const index of REBUILT_INDEXES) {
      await db.executeQuery(index);
    }

    const violations = await db.getMany('PRAGMA foreign_key_check(payments)');
    await db.executeQuery('PRAGMA foreign_keys = ON');

    if (violations.length > 0) {
      throw new Error(`Foreign key check failed after rebuilding payments: ${JSON.stringify(violations)}`);
    }

    console.log(`✓ Rebuilt payments without ${legacy.join(', ')} (${after.count} row(s) preserved)`);
    console.log('Migration 008 completed successfully');
  } catch (error) {
    console.error('Migration 008 failed:', error);
    throw error;
  }
};

export const down = async (): Promise<void> => {
  // Re-adding these columns would recreate the duplication this migration removes.
  throw new Error('Migration 008 is not reversible');
};
