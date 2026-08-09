// Database Module - Main entry point for all database operations
// Provides unified database access and initialization

import { randomUUID } from 'node:crypto';
import { database, SQLiteDatabase } from './SQLiteDatabase.js';
import { createTables } from './schemas/tables.schema.js';
import { initializeAllSeeds } from './seeds/initial.seed.js';
import { getDatabaseConfig } from './config/sqlite.config.js';
import { runMigrations } from './migrations/index.js';
import type { IDatabase } from '../types/database.types.js';

/**
 * Main database instance (singleton)
 */
export const db: IDatabase = database;

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
    const expiresAt = new Date(now.getTime() + BOOT_LOCK_TTL_MS).toISOString();

    // One statement, so two instances racing cannot both observe "unheld".
    // `expires_at` is the guard column: the condition reads it and the update
    // writes it, and MySQL evaluates assignments left to right.
    const { sql, params } = db.dialect.conditionalUpsert({
      table: 'boot_locks',
      columns: ['name', 'owner', 'expires_at'],
      values: ['schema', owner, expiresAt],
      conflictColumn: 'name',
      updateColumns: ['owner', 'expires_at'],
      conflictGuardColumn: 'expires_at',
      condition: 'boot_locks.expires_at <= ?',
      conditionParams: [now.toISOString()]
    });

    const result = await db.executeQuery(sql, params);

    if (result.changes > 0) return true;

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

/**
 * Initialize the complete database setup
 * This includes creating tables and seeding initial data
 */
export const initializeDatabase = async (
  paths: { dataDir: string; dbFile: string },
  includeSampleData = false
): Promise<void> => {
  if (!db.isConnected()) {
    await db.connect(getDatabaseConfig(paths));
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
    await createTables(db);
    await runMigrations(db);
    await initializeAllSeeds(db, includeSampleData);
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