// Abstract database types and interfaces
// Provides database-agnostic interfaces for SQLite operations

// Values that can be bound to a prepared statement or stored in a column
export type SQLParameter = string | number | boolean | null;

// Raw row as returned by the driver, before it is mapped onto a domain entity
export type DatabaseRow = Record<string, SQLParameter>;

// Database connection configuration
export interface DatabaseConfig {
  path: string;
  options?: DatabaseOptions;
}

export interface DatabaseOptions {
  readonly?: boolean;
  fileMustExist?: boolean;
  timeout?: number;
  verbose?: (message?: unknown, ...additionalArgs: unknown[]) => void;
}

// Query result interfaces
export interface QueryResult {
  changes: number;
  lastInsertRowid: number;
}

export interface SelectResult<T = DatabaseRow> {
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
  [key: string]: string | number | boolean | Date | null | undefined;
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
  executeQuery(query: string, params?: SQLParameter[]): QueryResult;
  getOne<T = DatabaseRow>(query: string, params?: SQLParameter[]): T | null;
  getMany<T = DatabaseRow>(query: string, params?: SQLParameter[]): T[];
  getWithPagination<T = DatabaseRow>(query: string, params?: SQLParameter[], options?: QueryOptions): SelectResult<T>;
  
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

// Migration interface
export interface Migration {
  version: number;
  name: string;
  up: (db: IDatabase) => void;
  down: (db: IDatabase) => void;
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
  data: DatabaseRow[];
  truncate?: boolean;
}

// Database health and monitoring
export interface DatabaseHealth {
  isConnected: boolean;
  uptime: number;
  totalQueries: number;
  avgQueryTime: number;
  lastBackup?: string;
  diskUsage: number;
}