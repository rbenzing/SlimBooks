// Migration 009: Add the expense approval status column
//
// The UI has always had an expense status filter, per-status counts and a CSV
// import that defaults rows to 'pending', but the expenses table had no `status`
// column — so the filter matched nothing and every count read zero.
//
// 'pending' is a constant default, so SQLite can add the column NOT NULL and
// backfill existing rows in one step.

import type { IDatabase } from '../../types/database.types.js';

/** Mirrors ExpenseStatus in src/types/constants/enums.types.ts. */
const DEFAULT_STATUS = 'pending';

const getColumnNames = (db: IDatabase, table: string): string[] => {
  if (!db.tableExists(table)) {
    return [];
  }

  return db.getMany<{ name: string }>(`PRAGMA table_info(${table})`).map(column => column.name);
};

export const up = (db: IDatabase): void => {
  console.log('Running migration 009: Add status to expenses');

  try {
    const columns = getColumnNames(db, 'expenses');

    if (columns.length === 0) {
      console.log('Skipping - expenses table does not exist');
      return;
    }

    if (columns.includes('status')) {
      console.log('✓ expenses.status already present');
    } else {
      db.executeQuery(
        `ALTER TABLE expenses ADD COLUMN status TEXT NOT NULL DEFAULT '${DEFAULT_STATUS}'`
      );
      console.log('✓ Added expenses.status');
    }

    // Guard against rows that predate the NOT NULL default.
    db.executeQuery(
      `UPDATE expenses SET status = '${DEFAULT_STATUS}' WHERE status IS NULL OR trim(status) = ''`
    );

    db.executeQuery('CREATE INDEX IF NOT EXISTS idx_expenses_status ON expenses (status)');

    console.log('Migration 009 completed successfully');
  } catch (error) {
    console.error('Migration 009 failed:', error);
    throw error;
  }
};

export const down = (db: IDatabase): void => {
  const columns = getColumnNames(db, 'expenses');

  if (columns.includes('status')) {
    db.executeQuery('DROP INDEX IF EXISTS idx_expenses_status');
    db.executeQuery('ALTER TABLE expenses DROP COLUMN status');
  }
};
