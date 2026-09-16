// Migration 017: the audit log
//
// Security-relevant events had no persistent record at all. `securityLogger`
// and `userActivityLogger` existed, were exported, and were called from nowhere;
// their bodies were a console.log and a "TODO: Store in audit log table" against
// a table that was never created. `audit_log` was even whitelisted in
// TableValidator, which made the gap look closed from the outside.
//
// Dialect-neutral by construction: no PRAGMA, no engine-specific types.
// AUTOINCREMENT is deliberately absent from the DDL here — SQLite gives an
// INTEGER PRIMARY KEY rowid semantics automatically, and MySQL needs
// AUTO_INCREMENT, so the baseline builder (which renders per dialect from
// tables.schema.ts) owns that difference. This migration only has to bring an
// existing SQLite install up to the same shape.

import type { IDatabase } from '../../types/database.types.js';

export const up = async (db: IDatabase): Promise<void> => {
  console.log('Running migration 017: Add audit_log');

  await db.executeQuery(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      occurred_at INTEGER NOT NULL,
      action TEXT NOT NULL,
      outcome TEXT NOT NULL,
      actor_user_id INTEGER,
      actor_email TEXT,
      target_type TEXT,
      target_id TEXT,
      ip_address TEXT,
      details TEXT
    )
  `);

  await db.executeQuery(
    'CREATE INDEX IF NOT EXISTS idx_audit_log_occurred_at ON audit_log (occurred_at)'
  );
  await db.executeQuery(
    'CREATE INDEX IF NOT EXISTS idx_audit_log_actor_user_id ON audit_log (actor_user_id)'
  );
  await db.executeQuery(
    'CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log (action)'
  );

  console.log('Migration 017 completed successfully');
};

export const down = async (db: IDatabase): Promise<void> => {
  await db.executeQuery('DROP TABLE IF EXISTS audit_log');
};
