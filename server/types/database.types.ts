import type { SqlDialect } from '../database/dialect.types.js';

// Database types for server use
// Note: These types are duplicated from src/types/shared/database.types.ts
// This is intentional to avoid cross-directory imports between client and server code
// The server extends these types with additional database-specific interfaces

// Database connection configuration
export interface DatabaseConfig {
  path: string;
  options?: DatabaseOptions;
}

export interface DatabaseOptions {
  readonly?: boolean;
  fileMustExist?: boolean;
  timeout?: number;
  verbose?: ((message?: unknown, ...additionalArgs: unknown[]) => void) | undefined;
}

// Query result interfaces
export interface QueryResult {
  changes: number;
  lastInsertRowid: number;
}

export interface SelectResult<T = Record<string, unknown>> {
  data: T[];
  total?: number;
}

// Pagination and filtering
export interface PaginationOptions {
  limit?: number;
  offset?: number;
  page?: number;
}

export interface SortOptions {
  column: string;
  direction: 'ASC' | 'DESC';
}

export interface FilterOptions {
  [key: string]: SQLParameter | undefined;
}

export interface QueryOptions extends PaginationOptions {
  sort?: SortOptions[];
  filters?: FilterOptions;
}

// Transaction interface
export type TransactionCallback<T = unknown> = () => Promise<T>;

// Abstract database interface
export interface IDatabase {
  /**
   * How this backend spells the things the two dialects disagree about.
   *
   * On the interface rather than imported directly, so a caller holding an
   * IDatabase always has the right spelling for the database it is actually
   * talking to — including inside a test that swaps the implementation.
   */
  readonly dialect: SqlDialect;

  // Connection management
  connect(config: DatabaseConfig): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;

  // Query execution
  executeQuery(query: string, params?: unknown[]): Promise<QueryResult>;
  getOne<T = Record<string, unknown>>(query: string, params?: unknown[]): Promise<T | null>;
  getMany<T = Record<string, unknown>>(query: string, params?: unknown[]): Promise<T[]>;
  getWithPagination<T = Record<string, unknown>>(
    query: string,
    params?: unknown[],
    options?: QueryOptions
  ): Promise<SelectResult<T>>;

  // Transaction support
  transaction<T>(callback: TransactionCallback<T>): Promise<T>;

  // Schema operations
  createTable(tableName: string, definition: string): Promise<void>;
  dropTable(tableName: string): Promise<void>;
  tableExists(tableName: string): Promise<boolean>;

  // Utility operations — not query paths, so these stay synchronous
  backup(path: string): void;
  vacuum(): void;
  pragma(setting: string, value?: string | number): unknown;
}

// Database service options
export interface ServiceOptions extends QueryOptions {
  includeDeleted?: boolean;
  includeArchived?: boolean;
}

// Schema definition interfaces
export interface TableSchema {
  name: string;
  columns: ColumnDefinition[];
  constraints?: string[];
  indexes?: IndexDefinition[];
}

export interface ColumnDefinition {
  name: string;
  type: 'TEXT' | 'INTEGER' | 'REAL' | 'BLOB' | 'NUMERIC';
  constraints?: string[];
}

export interface IndexDefinition {
  name: string;
  columns: string[];
  unique?: boolean;
}

// Seed data interface
export interface SeedData {
  table: string;
  data: Record<string, SQLParameter>[];
  truncate?: boolean;
}

// Row shape returned by `PRAGMA table_info(<table>)`
export interface TableColumnInfo {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

// SQL parameter types for query safety
export type SQLParameter = string | number | null | boolean;
export type SQLParams = SQLParameter[];