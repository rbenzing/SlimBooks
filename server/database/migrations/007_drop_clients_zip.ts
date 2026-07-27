// Migration 007: Make `zipCode` the only postal-code column on clients
//
// The live table carried both `zip` (the original column) and `zipCode` (added
// by migration 006 because the schema file declares it), holding duplicate
// values. `zipCode` is the name the API, the types and the UI all use, so it
// wins and `zip` is dropped.
//
// Ordering matters: backfill any row where `zip` still holds the only value
// BEFORE dropping the column, otherwise a client whose postal code predates
// migration 006 would lose it.

import type { IDatabase } from '../../types/database.types.js';

/**
 * Read the current column names of a table (empty when the table does not exist).
 */
const getColumnNames = (db: IDatabase, table: string): string[] => {
  if (!db.tableExists(table)) {
    return [];
  }

  const tableInfo = db.getMany<{ name: string }>(`PRAGMA table_info(${table})`);
  return tableInfo.map(column => column.name);
};

export const up = (db: IDatabase): void => {
  console.log('Running migration 007: Drop clients.zip in favour of clients.zipCode');

  try {
    const columns = getColumnNames(db, 'clients');

    if (columns.length === 0) {
      console.log('Skipping - clients table does not exist');
      return;
    }

    if (!columns.includes('zip')) {
      console.log('✓ clients.zip already dropped - nothing to do');
      return;
    }

    if (!columns.includes('zipCode')) {
      // Migration 006 should have added it; add it here so 007 stands alone.
      db.executeQuery('ALTER TABLE clients ADD COLUMN zipCode TEXT');
      console.log('✓ Added clients.zipCode');
    }

    // Carry across anything that only exists under the old name.
    db.executeQuery(
      'UPDATE clients SET zipCode = zip WHERE zipCode IS NULL AND zip IS NOT NULL'
    );

    const stranded = db.getOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM clients WHERE zipCode IS NULL AND zip IS NOT NULL'
    );

    if (stranded && stranded.count > 0) {
      throw new Error(
        `Refusing to drop clients.zip: ${stranded.count} row(s) still hold a value only under the old column`
      );
    }

    db.executeQuery('DROP INDEX IF EXISTS idx_clients_zip');
    db.executeQuery('ALTER TABLE clients DROP COLUMN zip');
    console.log('✓ Dropped clients.zip');

    console.log('Migration 007 completed successfully');
  } catch (error) {
    console.error('Migration 007 failed:', error);
    throw error;
  }
};

export const down = (): void => {
  // Re-adding `zip` would recreate the duplicate column this migration removes.
  throw new Error('Migration 007 is not reversible');
};
