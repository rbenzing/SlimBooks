// Adds the stored_objects table to an existing database.
//
// tables.schema.ts declares it too, so a fresh database already has it and this
// migration finds nothing to do — which is what the schema-drift test requires.

import type { IDatabase } from '../../types/database.types.js';

export const up = async (db: IDatabase): Promise<void> => {
  if (await db.tableExists('stored_objects')) {
    console.log('Migration 013: stored_objects already present, nothing to do');
    return;
  }

  // VARCHAR rather than TEXT for the key: MySQL cannot make a TEXT column a
  // primary key without a prefix length, and SQLite reads VARCHAR as TEXT
  // affinity. The default comes from the dialect for the same reason.
  await db.executeQuery(`
    CREATE TABLE IF NOT EXISTS stored_objects (
      \`key\` VARCHAR(255) PRIMARY KEY,
      content_type TEXT,
      size INTEGER NOT NULL,
      data BLOB NOT NULL,
      created_at TEXT NOT NULL DEFAULT (${db.dialect.now()})
    )
  `);

  console.log('Migration 013: created stored_objects');
};
