// Database Service Layer
// Provides high-level database service operations built on the abstract database interface

import type { IDatabase, QueryOptions, ServiceOptions } from '../types/database.types.js';
import type { SqlDialect } from '../database/dialect.types.js';
import { activeDatabase } from '../database/index.js';
import { validateTableName } from './TableValidator.js';

/**
 * Base Database Service
 * Provides common database operations with proper error handling and business logic
 * This replaces the old Database.ts core service
 */
export class DatabaseService {
  private readonly injected: IDatabase | null;

  /**
   * @param dbInstance A specific backend, or omitted for whichever the runtime
   *                   selected.
   *
   * Omitting it must NOT capture the current database here: this module is
   * imported, and the shared `databaseService` below constructed, before
   * initializeDatabase has chosen a driver. Capturing would pin the unconnected
   * SQLite singleton and every query under DB_DRIVER=mysql would fail with
   * "Database not connected".
   */
  constructor(dbInstance?: IDatabase) {
    this.injected = dbInstance ?? null;
  }

  /** The backend this service talks to, resolved at call time. */
  protected get database(): IDatabase {
    return this.injected ?? activeDatabase();
  }

  /**
   * The dialect of the underlying backend, for services that build SQL.
   *
   * Services reach it through the service they already hold rather than
   * importing a dialect directly, so a service pointed at a different database
   * builds statements for that database.
   */
  public get dialect(): SqlDialect {
    return this.database.dialect;
  }

  /**
   * Execute a query with parameters
   */
  public async executeQuery(query: string, params: unknown[] = []) {
    return await this.database.executeQuery(query, params);
  }

  /**
   * Get single record with prepared statement
   */
  public async getOne<T = Record<string, unknown>>(query: string, params: unknown[] = []): Promise<T | null> {
    return await this.database.getOne<T>(query, params);
  }

  /**
   * Get multiple records with prepared statement
   */
  public async getMany<T = Record<string, unknown>>(query: string, params: unknown[] = []): Promise<T[]> {
    return await this.database.getMany<T>(query, params);
  }

  /**
   * Get records with pagination and filtering
   */
  public async getPaginated<T = Record<string, unknown>>(
    query: string,
    params: unknown[] = [],
    options: ServiceOptions = {}
  ) {
    const { limit = 50, offset = 0, page, sort, filters, includeDeleted = false } = options;

    let finalQuery = query;
    const finalParams = [...params];
    
    // Add soft delete filter if not explicitly including deleted records
    if (!includeDeleted && !query.toLowerCase().includes('where')) {
      finalQuery += ' WHERE deleted_at IS NULL';
    } else if (!includeDeleted && query.toLowerCase().includes('where')) {
      finalQuery += ' AND deleted_at IS NULL';
    }
    
    // Apply additional filters
    if (filters && Object.keys(filters).length > 0) {
      const filterConditions = Object.entries(filters)
        .map(([key, value]) => {
          if (value === null || value === undefined) {
            return `${key} IS NULL`;
          }
          finalParams.push(value);
          return `${key} = ?`;
        });
      
      const whereClause = query.toLowerCase().includes('where') ? ' AND ' : ' WHERE ';
      finalQuery += whereClause + filterConditions.join(' AND ');
    }
    
    const queryOptions: QueryOptions = {
      limit,
      offset
    };
    
    if (page) queryOptions.page = page;
    if (sort) queryOptions.sort = sort;

    return await this.database.getWithPagination<T>(finalQuery, finalParams, queryOptions);
  }

  /**
   * Execute operations within a transaction
   */
  public async withTransaction<T>(callback: () => Promise<T>): Promise<T> {
    return await this.database.transaction(callback);
  }

  /**
   * Soft delete a record (if table has deleted_at column)
   */
  public async softDelete(table: string, id: number): Promise<boolean> {
    validateTableName(table);
    const now = this.dialect.now();
    try {
      const result = await this.executeQuery(
        `UPDATE ${table} SET deleted_at = ${now}, updated_at = ${now} WHERE id = ?`,
        [id]
      );
      return result.changes > 0;
    } catch (error) {
      // If deleted_at column doesn't exist, fall back to hard delete
      console.warn(`Soft delete failed for ${table}, attempting hard delete:`, error);
      return await this.hardDelete(table, id);
    }
  }

  /**
   * Hard delete a record
   */
  public async hardDelete(table: string, id: number): Promise<boolean> {
    validateTableName(table);
    const result = await this.executeQuery(`DELETE FROM ${table} WHERE id = ?`, [id]);
    return result.changes > 0;
  }

  /**
   * Delete with setting-based behavior (checks soft_delete_enabled setting)
   * @param table - Table name
   * @param id - Record ID
   * @param tableName - Logical name for setting lookup (e.g., 'clients', 'invoices')
   */
  public async deleteWithSetting(table: string, id: number, tableName?: string): Promise<boolean> {
    validateTableName(table);

    // Check if soft delete is enabled for this table
    const settingKey = `data.${tableName || table}_soft_delete_enabled`;
    const setting = await this.getOne<{ value: string }>(
      'SELECT value FROM settings WHERE `key` = ?',
      [settingKey]
    );

    const useSoftDelete = setting?.value === 'true' || setting?.value === '1';

    return useSoftDelete ? await this.softDelete(table, id) : await this.hardDelete(table, id);
  }

  /**
   * Update a record with automatic timestamp
   */
  public async updateRecord(table: string, id: number, data: Record<string, unknown>): Promise<boolean> {
    validateTableName(table);
    const keys = Object.keys(data);
    const values = Object.values(data);

    if (keys.length === 0) {
      throw new Error('No data provided for update');
    }

    // Add updated_at timestamp
    keys.push('updated_at');
    values.push(new Date().toISOString());

    // Every identifier is quoted, because these builders take arbitrary column
    // names and `settings.key` is one of them — a reserved word in MySQL.
    const setClause = keys.map(column => `\`${column}\` = ?`).join(', ');
    const query = `UPDATE ${table} SET ${setClause} WHERE id = ?`;

    values.push(id);

    const result = await this.executeQuery(query, values);
    return result.changes > 0;
  }

  /**
   * Insert a record with automatic timestamps
   */
  public async insertRecord(table: string, data: Record<string, unknown>): Promise<number> {
    validateTableName(table);
    const keys = Object.keys(data);
    const values = Object.values(data);

    // Add timestamps
    const now = new Date().toISOString();
    keys.push('created_at', 'updated_at');
    values.push(now, now);

    const placeholders = keys.map(() => '?').join(', ');
    const columnList = keys.map(column => `\`${column}\``).join(', ');
    const query = `INSERT INTO ${table} (${columnList}) VALUES (${placeholders})`;

    const result = await this.executeQuery(query, values);
    return result.lastInsertRowid;
  }

  /**
   * Get next sequence value for a counter
   */
  public async getNextSequence(counterName: string): Promise<number> {
    const now = this.dialect.now();

    return await this.withTransaction(async () => {
      // Get current value
      const counter = await this.getOne<{ value: number }>(
        'SELECT value FROM counters WHERE name = ?',
        [counterName]
      );

      if (!counter) {
        // Create counter if it doesn't exist
        await this.executeQuery(
          `INSERT INTO counters (name, value, created_at, updated_at) VALUES (?, 1, ${now}, ${now})`,
          [counterName]
        );
        return 1;
      }

      // Increment counter
      const nextValue = counter.value + 1;
      await this.executeQuery(
        `UPDATE counters SET value = ?, updated_at = ${now} WHERE name = ?`,
        [nextValue, counterName]
      );

      return nextValue;
    });
  }

  /**
   * Delete a record by ID (hard delete by default)
   * Use softDelete() method explicitly if soft delete is needed
   */
  public async deleteById(table: string, id: number): Promise<boolean> {
    return await this.hardDelete(table, id);
  }

  /**
   * Check if a table exists
   */
  public async tableExists(tableName: string): Promise<boolean> {
    return await this.database.tableExists(tableName);
  }

  /**
   * Check if a record exists with specific criteria
   */
  public async exists(table: string, column: string, value: unknown): Promise<boolean> {
    validateTableName(table);
    const result = await this.getOne(`SELECT 1 FROM ${table} WHERE \`${column}\` = ?`, [value]);
    return result !== null;
  }

  /**
   * Execute operations within a transaction (alias for withTransaction)
   */
  public async executeTransaction<T>(callback: () => Promise<T>): Promise<T> {
    return await this.withTransaction(callback);
  }

  /**
   * Get database health information
   */
  getHealth() {
    return {
      isConnected: this.database.isConnected(),
      timestamp: new Date().toISOString()
    };
  }
}

// Shared instance used by every service.
export const databaseService = new DatabaseService();