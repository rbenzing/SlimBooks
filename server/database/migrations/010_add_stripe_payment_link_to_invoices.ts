// Migration 010: Record the Stripe payment link on the invoice it pays
//
// The invoices table already carried `stripe_invoice_id` and
// `stripe_payment_intent_id`, but a payment link is neither of those — it is a
// separate object with its own id and a URL to hand to the client. Without
// somewhere to keep it, every "send a payment link" would mint a new link for
// an invoice that already had one, and nothing could show the link again after
// the response was closed.
//
// `stripe_checkout_session_id` is what the webhook reconciles against: the
// payment link itself is reusable, the checkout session is the individual
// attempt to pay.

import type { IDatabase } from '../../types/database.types.js';

const NEW_COLUMNS = [
  'stripe_payment_link_id',
  'stripe_payment_link_url',
  'stripe_checkout_session_id'
] as const;

const getColumnNames = async (db: IDatabase, table: string): Promise<string[]> => {
  if (!(await db.tableExists(table))) {
    return [];
  }

  return (await db.getMany<{ name: string }>(`PRAGMA table_info(${table})`)).map(column => column.name);
};

export const up = async (db: IDatabase): Promise<void> => {
  console.log('Running migration 010: Add Stripe payment link columns to invoices');

  try {
    const columns = await getColumnNames(db, 'invoices');

    if (columns.length === 0) {
      console.log('Skipping - invoices table does not exist');
      return;
    }

    for (const column of NEW_COLUMNS) {
      if (columns.includes(column)) {
        console.log(`✓ invoices.${column} already present`);
        continue;
      }

      await db.executeQuery(`ALTER TABLE invoices ADD COLUMN ${column} TEXT`);
      console.log(`✓ Added invoices.${column}`);
    }

    // The webhook looks an invoice up by session id on every payment, and the
    // reconciliation guard looks a payment up by the Stripe payment id. Both
    // indexes belong here rather than in tables.schema.ts, because createTables()
    // runs before migrations and would not find the columns yet.
    await db.executeQuery(
      'CREATE INDEX IF NOT EXISTS idx_invoices_stripe_checkout_session ON invoices (stripe_checkout_session_id)'
    );
    await db.executeQuery(
      'CREATE INDEX IF NOT EXISTS idx_payments_stripe_payment_id ON payments (stripe_payment_id)'
    );

    console.log('Migration 010 completed successfully');
  } catch (error) {
    console.error('Migration 010 failed:', error);
    throw error;
  }
};

export const down = async (db: IDatabase): Promise<void> => {
  const columns = await getColumnNames(db, 'invoices');

  await db.executeQuery('DROP INDEX IF EXISTS idx_invoices_stripe_checkout_session');
  await db.executeQuery('DROP INDEX IF EXISTS idx_payments_stripe_payment_id');

  for (const column of NEW_COLUMNS) {
    if (columns.includes(column)) {
      await db.executeQuery(`ALTER TABLE invoices DROP COLUMN ${column}`);
    }
  }
};
