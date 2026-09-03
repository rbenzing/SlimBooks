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
import { up as migration013 } from './013_add_stored_objects.js';
import { up as migration014 } from './014_normalize_timestamps.js';
import { up as migration015 } from './015_epoch_timestamps.js';
import { up as migration016 } from './016_backfill_issue_date.js';

export interface Migration {
  id: string;
  name: string;
  up: (db: IDatabase) => Promise<void>;
  /**
   * Marks this migration as a data repair rather than schema archaeology.
   *
   * Schema archaeology (001-015, the default/omitted case) exists only to
   * replay SQLite's own history of ALTER/PRAGMA steps toward the shape
   * tables.schema.ts already declares; MySQL is built once from that file and
   * never needs to replay it — see baseline.ts. Flag a migration here only
   * when it instead repairs existing ROWS (wrong or missing data left by a
   * bug, not a schema shape). That makes it dialect-neutral by construction,
   * so it must run on every backend a database might already exist on,
   * including a MySQL/MariaDB install that otherwise never replays history.
   * See applyDataRepairsAndMarkMigrationsApplied, which is what actually runs
   * it there.
   */
  repairsData?: true;
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
  },
  {
    id: '013',
    name: 'add_stored_objects',
    up: migration013
  },
  {
    id: '014',
    name: 'normalize_timestamps',
    up: migration014
  },
  {
    id: '015',
    name: 'epoch_timestamps',
    up: migration015
  },
  {
    id: '016',
    name: 'backfill_issue_date',
    up: migration016,
    repairsData: true
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
      applied_at BIGINT NOT NULL DEFAULT (${db.dialect.now()})
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
 * Record every migration as applied, running only the ones flagged
 * `repairsData` first.
 *
 * Used by the MySQL baseline, which builds the fully-migrated shape directly
 * from tables.schema.ts rather than replaying 001-015's SQLite archaeology —
 * PRAGMA guards and rebuild-copy-drop steps that have nothing to do against a
 * dialect with no PRAGMA. Those are still recorded as applied without
 * running, exactly as before.
 *
 * A migration flagged `repairsData` (016, so far) is not schema archaeology —
 * it fixes existing rows, so it is dialect-neutral and must actually run
 * here, or a MySQL/MariaDB install that already has the defect it fixes would
 * be marked as repaired without ever being repaired. Its up() is awaited
 * before it is recorded, so a boot interrupted mid-repair is retried on the
 * next boot rather than marked done it never finished.
 *
 * Idempotent the same way runMigrations() is: an id already present in
 * `migrations` is skipped outright, flagged or not, so a completed repair
 * never runs twice and a second boot touches nothing.
 *
 * `list` defaults to the real registry and exists so tests can substitute
 * small fakes rather than depending on which real migrations happen to be
 * flagged.
 */
export const applyDataRepairsAndMarkMigrationsApplied = async (
  db: IDatabase,
  list: readonly Migration[] = migrations
): Promise<void> => {
  await createMigrationsTable(db);

  for (const migration of list) {
    if (await isMigrationApplied(db, migration.id)) continue;

    if (migration.repairsData === true) {
      console.log(`Running data-repair migration ${migration.id}: ${migration.name}`);
      await migration.up(db);
    }

    await markMigrationApplied(db, migration);
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