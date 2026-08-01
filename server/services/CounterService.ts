// Counter Service - Domain-specific service for ID counter management operations
// Handles counter management, next ID generation, and administrative operations

import { databaseService } from '../core/DatabaseService.js';

export interface Counter {
  name: string;
  value: number;
}

/**
 * Counter Management Service
 * Handles ID counter operations for various entities in the system
 */
export class CounterService {
  // Valid counter names
  // Must match the counters seeded by `initializeCounters`; one the seed writes
  // but this list omits is unreachable through the counter endpoints.
  private readonly validCounters = ['clients', 'invoices', 'expenses', 'templates', 'reports', 'payments'];

  /**
   * Get next ID for a counter and increment it
   */
  async getNextCounterId(counterName: string): Promise<number> {
    if (!counterName || typeof counterName !== 'string') {
      throw new Error('Counter name is required');
    }

    // Validate counter name
    if (!this.validCounters.includes(counterName)) {
      throw new Error(`Invalid counter name. Valid counters: ${this.validCounters.join(', ')}`);
    }

    // Get current counter value
    const counterResult = databaseService.getOne<{value: number}>(
      'SELECT value FROM counters WHERE name = ?',
      [counterName]
    );

    if (!counterResult) {
      // An UPDATE against a missing row changes nothing, so every caller would
      // keep receiving 1. Create the counter at the value being issued.
      databaseService.executeQuery(
        'INSERT INTO counters (name, value) VALUES (?, ?)',
        [counterName, 1]
      );
      return 1;
    }

    const nextId = counterResult.value + 1;

    // Update counter in database
    databaseService.executeQuery(
      'UPDATE counters SET value = ? WHERE name = ?',
      [nextId, counterName]
    );

    return nextId;
  }

  /**
   * Get current counter value without incrementing
   */
  async getCurrentCounterValue(counterName: string): Promise<Counter | null> {
    if (!counterName || typeof counterName !== 'string') {
      throw new Error('Counter name is required');
    }

    const counterResult = databaseService.getOne<{value: number}>(
      'SELECT value FROM counters WHERE name = ?', 
      [counterName]
    );
    
    if (!counterResult) {
      return null;
    }
    
    return {
      name: counterName,
      value: counterResult.value
    };
  }

  /**
   * Reset counter value (admin operation)
   */
  async resetCounter(counterName: string, value: number = 0): Promise<boolean> {
    if (!counterName || typeof counterName !== 'string') {
      throw new Error('Counter name is required');
    }

    if (typeof value !== 'number' || value < 0) {
      throw new Error('Valid counter value is required');
    }

    // Validate counter name
    if (!this.validCounters.includes(counterName)) {
      throw new Error(`Invalid counter name. Valid counters: ${this.validCounters.join(', ')}`);
    }

    const result = databaseService.executeQuery(
      'UPDATE counters SET value = ? WHERE name = ?', 
      [value, counterName]
    );
    
    if (result.changes === 0) {
      throw new Error('Counter not found');
    }
    
    return true;
  }

  /**
   * Initialize counter if it doesn't exist
   */
  async initializeCounter(counterName: string, initialValue: number = 0): Promise<boolean> {
    if (!counterName || typeof counterName !== 'string') {
      throw new Error('Counter name is required');
    }

    if (typeof initialValue !== 'number' || initialValue < 0) {
      throw new Error('Valid initial value is required');
    }

    // Validate counter name
    if (!this.validCounters.includes(counterName)) {
      throw new Error(`Invalid counter name. Valid counters: ${this.validCounters.join(', ')}`);
    }

    // Check if counter already exists
    const exists = await this.counterExists(counterName);
    if (exists) {
      return false; // Counter already exists
    }

    // Create new counter
    databaseService.executeQuery(
      'INSERT INTO counters (name, value) VALUES (?, ?)', 
      [counterName, initialValue]
    );
    
    return true;
  }

  /**
   * Check if counter exists
   */
  async counterExists(counterName: string): Promise<boolean> {
    if (!counterName || typeof counterName !== 'string') {
      return false;
    }

    return databaseService.exists('counters', 'name', counterName);
  }

  /**
   * Get all counters
   */
  async getAllCounters(): Promise<Counter[]> {
    const results = databaseService.getMany<{name: string; value: number}>(
      'SELECT name, value FROM counters ORDER BY name'
    );
    
    return results.map(row => ({
      name: row.name,
      value: row.value
    }));
  }

  /**
   * Get valid counter names
   */
  getValidCounterNames(): string[] {
    return [...this.validCounters];
  }

  /**
   * Validate counter name
   */
  isValidCounterName(counterName: string): boolean {
    return this.validCounters.includes(counterName);
  }

  /**
   * Set counter value (admin operation)
   */
  async setCounterValue(counterName: string, value: number): Promise<boolean> {
    if (!counterName || typeof counterName !== 'string') {
      throw new Error('Counter name is required');
    }

    if (typeof value !== 'number' || value < 0) {
      throw new Error('Valid counter value is required');
    }

    // Validate counter name
    if (!this.validCounters.includes(counterName)) {
      throw new Error(`Invalid counter name. Valid counters: ${this.validCounters.join(', ')}`);
    }

    const result = databaseService.executeQuery(
      'UPDATE counters SET value = ? WHERE name = ?', 
      [value, counterName]
    );
    
    if (result.changes === 0) {
      throw new Error('Counter not found');
    }
    
    return true;
  }

  /**
   * Initialize all standard counters if they don't exist
   */
  async initializeStandardCounters(): Promise<boolean> {
    const operations = () => {
      for (const counterName of this.validCounters) {
        // Use INSERT OR IGNORE to avoid errors if counter already exists
        databaseService.executeQuery(
          'INSERT OR IGNORE INTO counters (name, value) VALUES (?, ?)', 
          [counterName, 0]
        );
      }
    };

    databaseService.executeTransaction(operations);
    return true;
  }
}

// Export singleton instance
export const counterService = new CounterService();