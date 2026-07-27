// Migration 004: Fix expenses table schema
// Align the expenses table with the ExpenseService requirements

import type { IDatabase, TableColumnInfo } from '../../types/database.types.js';

export const up = (db: IDatabase): void => {
  console.log('Running migration 004: Fix expenses table schema');

  try {
    // First, check if expenses table exists and what columns it has
    const tableInfo = db.getMany<TableColumnInfo>("PRAGMA table_info(expenses)");
    console.log('Current expenses table structure:', tableInfo);

    // Check if the table has the old structure (merchant, status) or new structure (vendor, is_billable)
    const hasOldStructure = tableInfo.some((col) => col.name === 'merchant' || col.name === 'status');
    const hasNewStructure = tableInfo.some((col) => col.name === 'vendor' || col.name === 'is_billable');

    if (hasOldStructure && !hasNewStructure) {
      console.log('Converting from old expenses structure to new structure');
      
      // Rename old table
      db.executeQuery('ALTER TABLE expenses RENAME TO expenses_old');

      // Create new expenses table with correct structure
      db.executeQuery(`
        CREATE TABLE expenses (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          description TEXT NOT NULL,
          amount REAL NOT NULL CHECK (amount > 0),
          currency TEXT DEFAULT 'USD',
          category TEXT,
          date TEXT NOT NULL,
          vendor TEXT,
          notes TEXT,
          receipt_url TEXT,
          is_billable INTEGER DEFAULT 0 CHECK (is_billable IN (0, 1)),
          client_id INTEGER,
          project TEXT,
          created_at TEXT NOT NULL DEFAULT (DATETIME('now')),
          updated_at TEXT NOT NULL DEFAULT (DATETIME('now')),
          FOREIGN KEY (client_id) REFERENCES clients (id) ON DELETE SET NULL
        )
      `);

      // Migrate data from old table to new table
      db.executeQuery(`
        INSERT INTO expenses (
          id, description, amount, category, date, vendor, receipt_url, created_at, updated_at
        )
        SELECT 
          id,
          COALESCE(description, 'Expense'),
          amount,
          category,
          date,
          merchant, -- merchant becomes vendor
          receipt_url,
          created_at,
          updated_at
        FROM expenses_old
      `);

      // Drop old table
      db.executeQuery('DROP TABLE expenses_old');

      console.log('Successfully migrated expenses table structure');
      
    } else if (!hasNewStructure) {
      console.log('Creating new expenses table with correct structure');
      
      // Create the table if it doesn't exist or has no structure
      db.executeQuery(`
        CREATE TABLE IF NOT EXISTS expenses (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          description TEXT NOT NULL,
          amount REAL NOT NULL CHECK (amount > 0),
          currency TEXT DEFAULT 'USD',
          category TEXT,
          date TEXT NOT NULL,
          vendor TEXT,
          notes TEXT,
          receipt_url TEXT,
          is_billable INTEGER DEFAULT 0 CHECK (is_billable IN (0, 1)),
          client_id INTEGER,
          project TEXT,
          created_at TEXT NOT NULL DEFAULT (DATETIME('now')),
          updated_at TEXT NOT NULL DEFAULT (DATETIME('now')),
          FOREIGN KEY (client_id) REFERENCES clients (id) ON DELETE SET NULL
        )
      `);
      
    } else {
      console.log('Expenses table already has correct structure');
    }

    // Create indexes for performance
    db.executeQuery('CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date)');
    db.executeQuery('CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category)');
    db.executeQuery('CREATE INDEX IF NOT EXISTS idx_expenses_vendor ON expenses(vendor)');
    db.executeQuery('CREATE INDEX IF NOT EXISTS idx_expenses_client_id ON expenses(client_id)');
    db.executeQuery('CREATE INDEX IF NOT EXISTS idx_expenses_is_billable ON expenses(is_billable)');
    db.executeQuery('CREATE INDEX IF NOT EXISTS idx_expenses_date_category ON expenses(date, category)');

    // Create trigger for automatic timestamp updates
    db.executeQuery(`
      CREATE TRIGGER IF NOT EXISTS update_expenses_timestamp 
        AFTER UPDATE ON expenses
        FOR EACH ROW
        BEGIN
          UPDATE expenses SET updated_at = DATETIME('now') WHERE id = NEW.id;
        END
    `);

  } catch (error) {
    console.error('Error in migration 004:', error);
    throw error;
  }
};

export const down = (db: IDatabase): void => {
  console.log('Rolling back migration 004: Fix expenses table schema');
  
  // Note: This is a destructive rollback - data may be lost
  db.executeQuery('DROP TABLE IF EXISTS expenses');
  
  // Recreate old structure (if needed for rollback)
  db.executeQuery(`
    CREATE TABLE expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      merchant TEXT NOT NULL DEFAULT 'Unknown Merchant',
      category TEXT NOT NULL,
      amount REAL NOT NULL CHECK (amount > 0),
      description TEXT,
      receipt_url TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT (DATETIME('now')),
      updated_at TEXT NOT NULL DEFAULT (DATETIME('now'))
    )
  `);
};