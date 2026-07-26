// Main database model module for Slimbooks
// Exports database instance and initialization functions

import type Database from 'better-sqlite3';
import { createTables } from '../database/schemas/tables.schema.js';
import { 
  initializeCounters, 
  initializeAdminUser, 
  initializeSampleClients, 
  initializeSampleInvoices, 
  initializeSamplePayments 
} from '../database/seeds/initial.seed.js';

// Initialize database instance
import { database } from '../database/SQLiteDatabase.js';
export const db: Database.Database = database.getRawConnection();

/**
 * Initialize the complete database setup
 */
export const initializeCompleteDatabase = async (includeSampleData = false): Promise<void> => {
  try {
    // Get the IDatabase interface for the seed functions
    const idb = database;
    
    // Create tables using the new schema function
    createTables(idb);

    // Initialize counters
    initializeCounters(idb);

    // Initialize admin user
    await initializeAdminUser(idb);

    // Add sample data if requested (typically for development)
    if (includeSampleData && process.env.NODE_ENV !== 'production') {
      initializeSampleClients(idb);
      initializeSampleInvoices(idb);
      initializeSamplePayments(idb);
    }
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    throw error;
  }
};

// Export individual functions for specific use cases
export {
  createTables,
  initializeCounters,
  initializeAdminUser,
  initializeSampleClients,
  initializeSampleInvoices,
  initializeSamplePayments
};