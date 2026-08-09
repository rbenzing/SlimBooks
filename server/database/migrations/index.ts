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
import { up as migration010 } from './010_add_stripe_payment_link_to_invoices.js';
import { up as migration011 } from './011_add_recurring_period_date.js';
import { up as migration012 } from './012_add_runtime_tables.js';

interface Migration {
  id: string;
  name: string;
  up: (db: IDatabase) => Promise<void>;
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
  },
  {
    id: '010',
    name: 'add_stripe_payment_link_to_invoices',
    up: migration010
  },
  {
    id: '011',
    name: 'add_recurring_period_date',
    up: migration011
  },
  {
    id: '012',
    name: 'add_runtime_tables',
    up: migration012
  }
];

/**
 * Create migrations tracking table if it doesn't exist
 */
const createMigrationsTable = async (db: IDatabase): Promise<void> => {
  // VARCHAR rather than TEXT, because MySQL cannot make a TEXT column a primary
  // key without a prefix length; SQLite treats VARCHAR as TEXT affinity, so one
  // statement serves both. The default comes from the dialect for the same
  // reason. The schema-drift snapshot excludes this table, so the change does
  // not perturb it.
  await db.executeQuery(`
    CREATE TABLE IF NOT EXISTS migrations (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (${db.dialect.now()})
    )
  `);
};

/**
 * Check if a migration has been applied
 */
const isMigrationApplied = async (db: IDatabase, migrationId: string): Promise<boolean> => {
  try {
    const result = await db.getMany('SELECT id FROM migrations WHERE id = ?', [migrationId]);
    return result.length > 0;
  } catch {
    return false;
  }
};

/**
 * Mark a migration as applied
 */
const markMigrationApplied = async (db: IDatabase, migration: Migration): Promise<void> => {
  await db.executeQuery(
    'INSERT INTO migrations (id, name) VALUES (?, ?)',
    [migration.id, migration.name]
  );
};

/**
 * Run all pending migrations
 */
export const runMigrations = async (db: IDatabase): Promise<void> => {
  try {
    console.log('Running database migrations...');

    // Create migrations table if it doesn't exist
    await createMigrationsTable(db);

    let migrationsRun = 0;

    // Run each migration if not already applied
    for (const migration of migrations) {
      if (!(await isMigrationApplied(db, migration.id))) {
        console.log(`Running migration ${migration.id}: ${migration.name}`);
        await migration.up(db);
        await markMigrationApplied(db, migration);
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
 * Record every migration as applied without executing any of them.
 *
 * Used by the MySQL baseline, which builds the fully-migrated shape directly
 * from tables.schema.ts. It writes through the same INSERT path a real run
 * uses, so a migration added later is picked up normally on both backends —
 * this marks history as done, it does not opt the database out of migrations.
 */
export const markAllMigrationsApplied = async (db: IDatabase): Promise<void> => {
  await createMigrationsTable(db);

  for (const migration of migrations) {
    if (!(await isMigrationApplied(db, migration.id))) {
      await markMigrationApplied(db, migration);
    }
  }
};

/**
 * Get migration status
 */
export const getMigrationStatus = async (db: IDatabase): Promise<Array<{id: string, name: string, applied: boolean}>> => {
  await createMigrationsTable(db);

  const status: Array<{id: string, name: string, applied: boolean}> = [];
  for (const migration of migrations) {
    status.push({
      id: migration.id,
      name: migration.name,
      applied: await isMigrationApplied(db, migration.id)
    });
  }

  return status;
};