// Migration: Add category column to settings table
// This migration adds the missing category column to support proper settings categorization

import type { IDatabase, TableColumnInfo } from '../../types/database.types.js';

export const up = (db: IDatabase): void => {
  try {
    // Check if column already exists (defensive programming)
    const result = db.getMany<TableColumnInfo>(`PRAGMA table_info(settings)`);
    const hasCategory = result.some((column) => column.name === 'category');
    
    if (!hasCategory) {
      // Add category column with default value
      db.executeQuery(`ALTER TABLE settings ADD COLUMN category TEXT NOT NULL DEFAULT 'general'`);
      
      // Update existing records to have proper categories based on their keys
      db.executeQuery(`UPDATE settings SET category = 'company' WHERE key LIKE 'company%' OR key = 'company_settings'`);
      db.executeQuery(`UPDATE settings SET category = 'email' WHERE key LIKE 'email%' OR key = 'email_settings'`);
      db.executeQuery(`UPDATE settings SET category = 'notification' WHERE key LIKE 'notification%' OR key = 'notification_settings'`);
      db.executeQuery(`UPDATE settings SET category = 'appearance' WHERE key LIKE 'appearance%' OR key LIKE 'theme%' OR key = 'invoice_template' OR key = 'pdf_format'`);
      db.executeQuery(`UPDATE settings SET category = 'tax' WHERE key LIKE 'tax%' OR key = 'tax_rates'`);
      db.executeQuery(`UPDATE settings SET category = 'shipping' WHERE key LIKE 'shipping%' OR key = 'shipping_rates'`);
      
      console.log('✓ Added category column to settings table and updated existing records');
    } else {
      console.log('✓ Category column already exists in settings table');
    }
  } catch (error) {
    console.error('❌ Failed to add category column to settings table:', error);
    throw error;
  }
};