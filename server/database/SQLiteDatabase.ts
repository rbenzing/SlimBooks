// SQLite Database Implementation
// Implements the abstract database interface with SQLite-specific functionality

import Database from 'better-sqlite3';
import type { 
  IDatabase, 
  DatabaseConfig, 
  QueryResult, 
  SelectResult, 
  QueryOptions,
  TransactionCallback
} from '../types/database.types.js';
import { getSQLitePragmas } from './config/sqlite.config.js';

/**
 * SQLite implementation of the abstract database interface
 */
export class SQLiteDatabase implements IDatabase {
  private db: Database.Database | null = null;
  private _connected = false;
  private queryCount = 0;
  private connectionTime = 0;

  constructor() {
    // Don't auto-connect in constructor - let it be explicit
  }

  /**
   * Connect to the SQLite database
   */
  async connect(config: DatabaseConfig): Promise<void> {
    try {
      if (this._connected && this.db) {
        return; // Already connected
      }

      console.log(`Attempting to connect to database: ${config.path}`);
      console.log('Database options:', JSON.stringify(config.options));

      this.connectionTime = Date.now();
      this.db = new Database(config.path, config.options);
      this._connected = true; // Set as connected before applying pragmas
      
      // Apply SQLite-specific pragmas for optimization
      const pragmas = getSQLitePragmas();
      Object.entries(pragmas).forEach(([key, value]) => {
        this.pragma(key, value);
      });
      
      if (process.env.NODE_ENV === 'development') {
        console.log(`✓ Database connected: ${config.path}`);
      }
    } catch (error) {
      this._connected = false;
      console.error('Database connection error:', error);
      throw new Error(`Failed to connect to database: ${(error as Error).message}`);
    }
  }

  /**
   * Disconnect from the database
   */
  async disconnect(): Promise<void> {
    if (this.db && this._connected) {
      try {
        this.db.close();
        this._connected = false;
        this.db = null;
        
        if (process.env.NODE_ENV === 'development') {
          console.log('✓ Database disconnected');
        }
      } catch (error) {
        throw new Error(`Failed to disconnect from database: ${(error as Error).message}`);
      }
    }
  }

  /**
   * Check if database is connected
   */
  isConnected(): boolean {
    return this._connected && this.db !== null;
  }

  /**
   * Execute a query with parameters and return result metadata
   */
  async executeQuery(query: string, params: unknown[] = []): Promise<QueryResult> {
    this.ensureConnected();
    
    try {
      this.queryCount++;
      const stmt = this.db!.prepare(query);
      const result = stmt.run(params) as Database.RunResult;
      
      return {
        changes: result.changes,
        lastInsertRowid: Number(result.lastInsertRowid)
      };
    } catch (error) {
      console.error('Database query execution error:', error);
      console.error('Query:', query);
      console.error('Params:', params);
      throw new Error(`Database operation failed: ${(error as Error).message}`);
    }
  }

  /**
   * Get a single record
   */
  async getOne<T = Record<string, unknown>>(query: string, params: unknown[] = []): Promise<T | null> {
    this.ensureConnected();
    
    try {
      this.queryCount++;
      const stmt = this.db!.prepare(query);
      return (stmt.get(params) as T) || null;
    } catch (error) {
      console.error('Database get one error:', error);
      console.error('Query:', query);
      console.error('Params:', params);
      throw new Error(`Database fetch operation failed: ${(error as Error).message}`);
    }
  }

  /**
   * Get multiple records
   */
  async getMany<T = Record<string, unknown>>(query: string, params: unknown[] = []): Promise<T[]> {
    this.ensureConnected();
    
    try {
      this.queryCount++;
      const stmt = this.db!.prepare(query);
      return stmt.all(params) as T[];
    } catch (error) {
      console.error('Database get many error:', error);
      console.error('Query:', query);
      console.error('Params:', params);
      throw new Error(`Database fetch operation failed: ${(error as Error).message}`);
    }
  }

  /**
   * Get records with pagination support
   */
  async getWithPagination<T = Record<string, unknown>>(query: string, params: unknown[] = [], options: QueryOptions = {}): Promise<SelectResult<T>> {
    this.ensureConnected();

    try {
      const { limit = 50, offset = 0, page, sort = [] } = options;

      // Calculate offset from page if provided
      const actualOffset = page ? (page - 1) * limit : offset;

      // Add sorting to query
      let finalQuery = query;
      if (sort.length > 0) {
        const sortClause = sort
          .map(s => `${s.column} ${s.direction}`)
          .join(', ');
        finalQuery += ` ORDER BY ${sortClause}`;
      }

      // Add pagination
      finalQuery += ` LIMIT ${limit} OFFSET ${actualOffset}`;

      const data = await this.getMany<T>(finalQuery, params);

      // Get total count for pagination metadata
      const countQuery = `SELECT COUNT(*) as total FROM (${query}) as count_query`;
      const totalResult = await this.getOne<{ total: number }>(countQuery, params);
      const total = totalResult?.total || 0;
      
      return {
        data,
        total
      };
    } catch (error) {
      console.error('Database paginated query error:', error);
      throw new Error(`Database paginated fetch failed: ${(error as Error).message}`);
    }
  }

  /**
   * Run a callback inside a transaction.
   *
   * Explicit BEGIN/COMMIT/ROLLBACK rather than better-sqlite3's `.transaction()`
   * helper, which rejects async callbacks outright. 2.0.0 already established
   * that the helper could not wrap the boot sequence either, because
   * createTables() sets PRAGMA synchronous and SQLite forbids a safety-level
   * change inside a transaction.
   *
   * The rollback is itself guarded: if the callback failed because the
   * connection is gone, ROLLBACK will fail too, and the original error is the
   * one worth reporting.
   */
  async transaction<T>(callback: TransactionCallback<T>): Promise<T> {
    this.ensureConnected();
    this.db!.prepare('BEGIN').run();

    try {
      const result = await callback();
      this.db!.prepare('COMMIT').run();
      return result;
    } catch (error) {
      try {
        this.db!.prepare('ROLLBACK').run();
      } catch {
        // Preserve the original failure; a failed rollback is a symptom.
      }
      throw error;
    }
  }

  /**
   * Create a table
   */
  async createTable(tableName: string, definition: string): Promise<void> {
    const query = `CREATE TABLE IF NOT EXISTS ${tableName} (${definition})`;
    await this.executeQuery(query);
  }

  /**
   * Drop a table
   */
  async dropTable(tableName: string): Promise<void> {
    await this.executeQuery(`DROP TABLE IF EXISTS ${tableName}`);
  }

  /**
   * Check if a table exists
   */
  async tableExists(tableName: string): Promise<boolean> {
    const result = await this.getOne<{ count: number }>(
      "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name=?",
      [tableName]
    );
    return result ? result.count > 0 : false;
  }

  /**
   * Create a database backup
   */
  backup(path: string): void {
    this.ensureConnected();
    
    try {
      this.db!.backup(path);
      console.log(`✓ Database backed up to: ${path}`);
    } catch (error) {
      throw new Error(`Database backup failed: ${(error as Error).message}`);
    }
  }

  /**
   * Vacuum the database to reclaim space
   */
  vacuum(): void {
    this.ensureConnected();
    this.db!.exec('VACUUM');
  }

  /**
   * Execute a pragma command
   */
  pragma(setting: string, value?: string | number): unknown {
    this.ensureConnected();
    
    const query = value !== undefined ? `PRAGMA ${setting} = ${value}` : `PRAGMA ${setting}`;
    
    if (value !== undefined) {
      this.db!.exec(query);
      return undefined;
    } else {
      return this.db!.pragma(setting);
    }
  }

  /**
   * Read a numeric pragma as a scalar.
   * `pragma()` returns better-sqlite3's row form (`[{ page_count: 73 }]`), which
   * yields NaN in arithmetic — `diskUsage` was computed that way and was always
   * NaN. `{ simple: true }` returns the value itself.
   */
  private numericPragma(setting: string): number {
    this.ensureConnected();

    const value = this.db!.pragma(setting, { simple: true });
    return typeof value === 'number' ? value : Number(value) || 0;
  }

  /**
   * Get database health information
   */
  getHealth() {
    this.ensureConnected();
    
    const uptime = Date.now() - this.connectionTime;
    const avgQueryTime = this.queryCount > 0 ? uptime / this.queryCount : 0;
    
    return {
      isConnected: this._connected,
      uptime,
      totalQueries: this.queryCount,
      avgQueryTime,
      /** Bytes on disk: page count × page size. */
      diskUsage: this.numericPragma('page_count') * this.numericPragma('page_size')
    };
  }

  /**
   * Get the raw better-sqlite3 database instance.
   * Used by graceful shutdown, which needs the handle itself to close it.
   */
  getRawConnection(): Database.Database {
    this.ensureConnected();
    return this.db!;
  }

  /**
   * Ensure database is connected
   */
  private ensureConnected(): void {
    if (!this._connected || !this.db) {
      throw new Error('Database not connected');
    }
  }

  /**
   * Prepare a statement for reuse (SQLite-specific optimization)
   */
  prepare(query: string): Database.Statement {
    this.ensureConnected();
    return this.db!.prepare(query);
  }

  /**
   * Execute multiple statements (SQLite-specific)
   */
  exec(sql: string): void {
    this.ensureConnected();
    this.db!.exec(sql);
  }
}

// Export singleton instance
export const database = new SQLiteDatabase();