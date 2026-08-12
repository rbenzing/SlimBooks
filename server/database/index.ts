// Database Module - Main entry point for all database operations
// Provides unified database access and initialization

import { randomUUID } from 'node:crypto';
import { database, SQLiteDatabase } from './SQLiteDatabase.js';
import { createTables } from './schemas/tables.schema.js';
import { initializeAllSeeds } from './seeds/initial.seed.js';
import { getDatabaseConfig } from './config/sqlite.config.js';
import { runMigrations } from './migrations/index.js';
import { claimExclusive } from './claim.util.js';
import { MySQLDatabase } from './MySQLDatabase.js';
import { buildMysqlBaseline } from './baseline.js';
import type { IDatabase } from '../types/database.types.js';
import type { DatabaseSettings } from '../runtime/database.js';
import { utcTimestamp } from '../utils/utcTime.util.js';

/**
 * The active database.
 *
 * Mutable because the driver is not known until the runtime resolves, and
 * exported as a live binding rather than a value so the modules that import it
 * observe the swap. Defaults to the SQLite singleton, which is what every
 * existing install and every test gets without configuring anything.
 *
 * Anything capturing this at module load — a class field initialised from it,
 * for instance — pins whichever object existed before the driver was chosen.
 * Read it at call time, or go through `activeDatabase()`.
 */
export let db: IDatabase = database;

/** The active database, read at call time. Safe to hold a reference to. */
export const activeDatabase = (): IDatabase => db;

/**
 * Get a fresh database instance (for testing or specific use cases)
 */
export const createDatabase = (): SQLiteDatabase => {
  return new SQLiteDatabase();
};

/** How long a boot lock stays valid if the process holding it disappears. */
const BOOT_LOCK_TTL_MS = 60_000;

/** How long to wait for another instance's boot to finish before proceeding. */
const BOOT_LOCK_WAIT_MS = 30_000;
const BOOT_LOCK_POLL_MS = 250;

const sleep = (ms: number): Promise<void> =>
  new Promise(resolve => { setTimeout(resolve, ms); });

/**
 * Claim the right to run schema setup.
 *
 * The lock row expires, so an instance killed mid-boot does not block the next
 * one forever — the property an ephemeral host requires.
 *
 * @returns true if this process holds the lock, false if it gave up waiting.
 */
const acquireBootLock = async (owner: string): Promise<boolean> => {
  // Safe to race: concurrent CREATE TABLE IF NOT EXISTS is a no-op for the loser.
  // VARCHAR rather than TEXT because MySQL cannot index TEXT without a prefix
  // length, and SQLite treats VARCHAR as TEXT affinity — one statement, both
  // backends.
  await db.executeQuery(`
    CREATE TABLE IF NOT EXISTS boot_locks (
      name VARCHAR(190) PRIMARY KEY,
      owner VARCHAR(190) NOT NULL,
      expires_at VARCHAR(64) NOT NULL
    )
  `);

  const deadline = Date.now() + BOOT_LOCK_WAIT_MS;

  do {
    const now = new Date();
    const expiresAt = utcTimestamp(new Date(now.getTime() + BOOT_LOCK_TTL_MS));

    // Only expiry releases this lock — there is no "I already hold it" branch,
    // because each boot takes a fresh owner id.
    const claimed = await claimExclusive(db, {
      table: 'boot_locks',
      keyColumn: 'name',
      keyValue: 'schema',
      ownerColumn: 'owner',
      owner,
      values: { owner, expires_at: expiresAt },
      takeoverCondition: 'expires_at <= ?',
      takeoverParams: [utcTimestamp(now)]
    });

    if (claimed) return true;

    await sleep(BOOT_LOCK_POLL_MS);
  } while (Date.now() < deadline);

  console.warn(
    'Timed out waiting for another instance to finish database setup; continuing. ' +
      'Every step is idempotent, so this is safe.'
  );

  return false;
};

const releaseBootLock = async (owner: string): Promise<void> => {
  await db.executeQuery('DELETE FROM boot_locks WHERE name = ? AND owner = ?', ['schema', owner]);
};

export interface InitializeOptions {
  /** Development-only demo rows. Never in production. */
  includeSampleData?: boolean;
  /**
   * Whether to seed at all.
   *
   * `db:import` sets this false. Seeding creates the administrator account and
   * the default settings, which would make `users` and `settings` non-empty —
   * and import refuses a non-empty target, so with seeding on there is no way
   * to load a dump into a database this process has just prepared.
   */
  seed?: boolean;
}

/**
 * Initialize the complete database setup
 * This includes creating tables and seeding initial data
 */
export const initializeDatabase = async (
  runtime: { paths: { dataDir: string; dbFile: string }; database: DatabaseSettings },
  options: InitializeOptions = {}
): Promise<void> => {
  const { includeSampleData = false, seed = true } = options;

  if (runtime.database.driver === 'mysql') {
    // Replaces the SQLite singleton for the life of the process. Every importer
    // of `db` sees the swap because it is a live binding.
    const mysql = new MySQLDatabase();
    await mysql.connect({ driver: 'mysql', settings: runtime.database });
    db = mysql;
  } else if (!db.isConnected()) {
    await db.connect(getDatabaseConfig(runtime.paths));
  }

  // Boot lock, so two instances starting against a shared volume do not race
  // the migrations.
  //
  // Deliberately NOT a transaction: createTables() sets PRAGMA synchronous, and
  // SQLite rejects a safety-level change inside one ("Safety level may not be
  // changed inside a transaction"). An advisory row avoids wrapping anything.
  //
  // The lock is an optimisation. Every step below is independently idempotent —
  // CREATE TABLE IF NOT EXISTS, migrations tracked in their own table and
  // guarded with PRAGMA table_info, seeds that check before inserting — so
  // proceeding without the lock is safe, merely wasteful. That is why timing
  // out falls through rather than failing the boot.
  const owner = randomUUID();
  const holder = await acquireBootLock(owner);

  try {
    if (runtime.database.driver === 'mysql') {
      // MySQL never replays SQLite's history — the migrations are PRAGMA
      // archaeology. See baseline.ts.
      await buildMysqlBaseline(db);
    } else {
      await createTables(db);
      await runMigrations(db);
    }

    if (seed) {
      await initializeAllSeeds(db, includeSampleData);
    }
  } finally {
    if (holder) await releaseBootLock(owner);
  }
};

/**
 * Gracefully close database connection
 */
export const closeDatabase = async (): Promise<void> => {
  try {
    await db.disconnect();
    console.log('✓ Database connection closed');
  } catch (error) {
    console.error('❌ Error closing database connection:', error);
    throw error;
  }
};

/**
 * Check database health and connectivity
 */
export const checkDatabaseHealth = () => {
  if (db instanceof SQLiteDatabase) {
    return db.getHealth();
  }
  
  return {
    isConnected: db.isConnected(),
    uptime: 0,
    totalQueries: 0,
    avgQueryTime: 0,
    diskUsage: 0
  };
};

/**
 * Create a database backup
 */
export const backupDatabase = (backupPath: string): void => {
  try {
    db.backup(backupPath);
    console.log(`✓ Database backup created: ${backupPath}`);
  } catch (error) {
    console.error('❌ Database backup failed:', error);
    throw error;
  }
};

/**
 * Optimize database performance
 */
export const optimizeDatabase = (): void => {
  try {
    db.vacuum();
    db.pragma('optimize');
    console.log('✓ Database optimization complete');
  } catch (error) {
    console.error('❌ Database optimization failed:', error);
    throw error;
  }
};

// Re-export types and utilities
export type { IDatabase } from '../types/database.types.js';
export { createTables } from './schemas/tables.schema.js';
export { initializeAllSeeds } from './seeds/initial.seed.js';
export { getDatabaseConfig } from './config/sqlite.config.js';

// Re-export the SQLite implementation for advanced usage
export { SQLiteDatabase } from './SQLiteDatabase.js';