// Migration: Add deleted_at column to clients table
// This migration adds soft delete functionality to the clients table

import type { IDatabase, TableColumnInfo } from '../../types/database.types.js';

/**
 * Migration to add deleted_at column to clients table for soft delete functionality
 */
export const up = async (db: IDatabase): Promise<void> => {
  try {
    // Check if column already exists
    const tableInfo = await db.getMany<TableColumnInfo>("PRAGMA table_info(clients)");
    const hasDeletedAt = tableInfo.some((row) => row.name === 'deleted_at');

    if (!hasDeletedAt) {
      console.log('Adding deleted_at column to clients table...');
      await db.executeQuery('ALTER TABLE clients ADD COLUMN deleted_at TEXT');
      console.log('✓ Successfully added deleted_at column to clients table');
    } else {
      console.log('deleted_at column already exists in clients table');
    }
  } catch (error) {
    console.error('❌ Failed to add deleted_at column to clients table:', error);
    throw error;
  }
};

/**
 * Rollback migration - remove deleted_at column
 * Note: SQLite doesn't support DROP COLUMN, so we'd need to recreate the table
 */
export const down = async (_db: IDatabase): Promise<void> => {
  console.log('Warning: SQLite does not support DROP COLUMN. Manual intervention required to rollback this migration.');
  // In a real scenario, you would need to:
  // 1. Create a new table without the deleted_at column
  // 2. Copy data from old table to new table
  // 3. Drop old table
  // 4. Rename new table
};