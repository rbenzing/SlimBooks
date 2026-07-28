// Database Migration System
// Handles running migrations in order and tracking migration state

import type { IDatabase } from '../../types/database.types.js';
import { up as migration001 } from './001_add_deleted_at_to_clients.js';
import { up as migration002 } from './002_add_category_to_settings.js';
import { up as migration003 } from './003_separate_template_tables.js';
import { up as migration004 } from './004_fix_expenses_table_schema.js';
import { up as migration006 } from './006_align_tables_with_schema.js';
import { up as migration007 } from './007_drop_clients_zip.js';
import { up as migration008 } from './008_collapse_payment_columns.js';
import { up as migration009 } from './009_add_status_to_expenses.js';

interface Migration {
  id: string;
  name: string;
  up: (db: IDatabase) => void;
}

/**
 * List of all migrations in order
 */
const migrations: Migration[] = [
  {
    id: '001',
    name: 'add_deleted_at_to_clients',
    up: migration001
  },
  {
    id: '002',
    name: 'add_category_to_settings',
    up: migration002
  },
  {
    id: '003',
    name: 'separate_template_tables',
    up: migration003
  },
  {
    id: '004',
    name: 'fix_expenses_table_schema',
    up: migration004
  },
  {
    id: '006',
    name: 'align_tables_with_schema',
    up: migration006
  },
  {
    id: '007',
    name: 'drop_clients_zip',
    up: migration007
  },
  {
    id: '008',
    name: 'collapse_payment_columns',
    up: migration008
  },
  {
    id: '009',
    name: 'add_status_to_expenses',
    up: migration009
  }
];

/**
 * Create migrations tracking table if it doesn't exist
 */
const createMigrationsTable = (db: IDatabase): void => {
  db.executeQuery(`
    CREATE TABLE IF NOT EXISTS migrations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
};

/**
 * Check if a migration has been applied
 */
const isMigrationApplied = (db: IDatabase, migrationId: string): boolean => {
  try {
    const result = db.getMany('SELECT id FROM migrations WHERE id = ?', [migrationId]);
    return result.length > 0;
  } catch {
    return false;
  }
};

/**
 * Mark a migration as applied
 */
const markMigrationApplied = (db: IDatabase, migration: Migration): void => {
  db.executeQuery(
    'INSERT INTO migrations (id, name) VALUES (?, ?)',
    [migration.id, migration.name]
  );
};

/**
 * Run all pending migrations
 */
export const runMigrations = (db: IDatabase): void => {
  try {
    console.log('Running database migrations...');
    
    // Create migrations table if it doesn't exist
    createMigrationsTable(db);
    
    let migrationsRun = 0;
    
    // Run each migration if not already applied
    for (const migration of migrations) {
      if (!isMigrationApplied(db, migration.id)) {
        console.log(`Running migration ${migration.id}: ${migration.name}`);
        migration.up(db);
        markMigrationApplied(db, migration);
        migrationsRun++;
      }
    }
    
    if (migrationsRun > 0) {
      console.log(`✓ Applied ${migrationsRun} migration(s)`);
    } else {
      console.log('✓ All migrations up to date');
    }
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
};

/**
 * Get migration status
 */
export const getMigrationStatus = (db: IDatabase): Array<{id: string, name: string, applied: boolean}> => {
  createMigrationsTable(db);
  
  return migrations.map(migration => ({
    id: migration.id,
    name: migration.name,
    applied: isMigrationApplied(db, migration.id)
  }));
};