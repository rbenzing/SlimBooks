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
export interface TransactionCallback<T = unknown> {
  (): T;
}

// Abstract database interface
export interface IDatabase {
  // Connection management
  connect(config: DatabaseConfig): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  
  // Query execution
  executeQuery(query: string, params?: unknown[]): QueryResult;
  getOne<T = Record<string, unknown>>(query: string, params?: unknown[]): T | null;
  getMany<T = Record<string, unknown>>(query: string, params?: unknown[]): T[];
  getWithPagination<T = Record<string, unknown>>(query: string, params?: unknown[], options?: QueryOptions): SelectResult<T>;
  
  // Transaction support
  beginTransaction(): void;
  commit(): void;
  rollback(): void;
  transaction<T>(callback: TransactionCallback<T>): T;
  
  // Schema operations
  createTable(tableName: string, definition: string): void;
  dropTable(tableName: string): void;
  tableExists(tableName: string): boolean;
  
  // Utility operations
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