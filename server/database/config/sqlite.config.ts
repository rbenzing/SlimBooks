// SQLite database configuration for Slimbooks
// Handles database connection setup and configuration

import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import type { DatabaseConfig } from '../../types/database.types.js';

/**
 * Get the database configuration based on the runtime's resolved paths
 */
export const getDatabaseConfig = (paths: { dataDir: string; dbFile: string }): DatabaseConfig => {
  if (!existsSync(paths.dataDir)) {
    mkdirSync(paths.dataDir, { recursive: true });
  }

  return {
    path: paths.dbFile,
    options: {
      verbose: process.env.NODE_ENV === 'development' ? console.log : undefined,
      timeout: 30_000,
      fileMustExist: false
    }
  };
};

/**
 * SQLite pragma settings for optimal performance
 */
export const getSQLitePragmas = (): Record<string, string | number> => {
  return {
    // Enable foreign key constraints
    'foreign_keys': 'ON',
    
    // Use WAL mode for better concurrency
    'journal_mode': 'WAL',
    
    // Synchronization mode for reliability vs performance
    'synchronous': process.env.NODE_ENV === 'production' ? 'FULL' : 'NORMAL',
    
    // Cache size (negative value = KB, positive = pages)
    'cache_size': -64000, // 64MB cache
    
    // Memory-mapped I/O size
    'mmap_size': 268435456, // 256MB
    
    // Temporary storage location
    'temp_store': 'MEMORY',
    
    // Query optimizer settings
    'optimize': 1,
    
    // Auto vacuum for space management
    'auto_vacuum': 'INCREMENTAL'
  };
};

/**
 * Database connection test settings
 */
export interface ConnectionTestResult {
  success: boolean;
  error?: string;
  path: string;
  size?: number;
  writable: boolean;
}

/**
 * Backup configuration
 */
export interface BackupConfig {
  enabled: boolean;
  directory: string;
  retention: number; // days
  schedule: string; // cron expression
}

export const getBackupConfig = (dataDir: string): BackupConfig => {
  return {
    enabled: process.env.BACKUP_ENABLED === 'true',
    directory: process.env.BACKUP_DIR || join(dataDir, 'backups'),
    retention: parseInt(process.env.BACKUP_RETENTION || '30'),
    schedule: process.env.BACKUP_SCHEDULE || '0 2 * * *' // Daily at 2 AM
  };
};