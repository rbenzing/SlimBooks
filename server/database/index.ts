// Database Module - Main entry point for all database operations
// Provides unified database access and initialization

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

  // Boot lock. Two instances starting against a shared volume must not race
  // migrations. `BEGIN IMMEDIATE` takes SQLite's single writer slot for the
  // whole sequence, so the second instance blocks until the first commits and
  // then finds every step already done — which is safe precisely because
  // createTables, runMigrations and the seeds are all idempotent.
  //
  // No lock table is used: one would have to exist before it could be read,
  // which is the bootstrapping problem this avoids entirely.
  db.executeQuery('BEGIN IMMEDIATE');

  try {
    createTables(db);
    runMigrations(db);
    db.executeQuery('COMMIT');
  } catch (error) {
    db.executeQuery('ROLLBACK');
    throw error;
  }

  // Seeding runs outside the lock: it is idempotent on its own, and it is async,
  // which a SQLite write transaction must not span.
  await initializeAllSeeds(db, includeSampleData);
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