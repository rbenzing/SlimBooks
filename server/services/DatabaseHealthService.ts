// Database Health Service - Service for database health monitoring and diagnostics
// Handles database health checks, statistics, and schema information

import { databaseService } from '../core/DatabaseService.js';

interface TableInfo {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

/**
 * Database Health Service
 * Provides database health monitoring, statistics, and schema information
 */
export class DatabaseHealthService {
  /**
   * Perform basic database health check
   */
  async performHealthCheck(): Promise<{
    status: 'healthy' | 'error';
    connectivity: boolean;
    timestamp: string;
  }> {
    try {
      // Test basic database connectivity
      const testResult = databaseService.getOne<{test: number}>('SELECT 1 as test');
      
      if (!testResult || testResult.test !== 1) {
        throw new Error('Database connectivity test failed');
      }

      return {
        status: 'healthy',
        connectivity: true,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Database health check error:', error);
      throw new Error('Database health check failed: ' + (error as Error).message);
    }
  }

  /**
   * Get database statistics (record counts)
   */
  async getDatabaseStatistics(): Promise<{
    clients: number;
    invoices: number;
    templates: number;
    expenses: number;
    payments: number;
    users: number;
  }> {
    try {
      const stats = {
        clients: this.getTableCount('clients'),
        invoices: this.getTableCount('invoices'),
        templates: this.getTableCount('templates'),
        expenses: this.getTableCount('expenses'),
        payments: this.getTableCount('payments'),
        users: this.getTableCount('users')
      };

      return stats;
    } catch (error) {
      console.error('Error getting database statistics:', error);
      throw new Error('Failed to retrieve database statistics: ' + (error as Error).message);
    }
  }

  /**
   * Get record count for a specific table
   */
  getTableCount(tableName: string): number {
    try {
      if (!this.isValidTableName(tableName)) {
        throw new Error('Invalid table name');
      }

      const result = databaseService.getOne<{count: number}>(`SELECT COUNT(*) as count FROM ${tableName}`);
      return result ? result.count : 0;
    } catch (error) {
      console.error(`Error getting count for table ${tableName}:`, error);
      return 0; // Return 0 if table doesn't exist or error occurs
    }
  }

  /**
   * Get database schema information
   */
  async getDatabaseSchema(): Promise<{
    tables: string[];
    tableCount: number;
    tableInfo: Record<string, {
      columns: number;
      columnNames: string[];
      columnDetails: TableInfo[];
    }>;
  }> {
    try {
      // Get all tables (excluding SQLite system tables)
      const tables = databaseService.getMany<{name: string; type: string}>(`
        SELECT name, type
        FROM sqlite_master
        WHERE type='table' AND name NOT LIKE 'sqlite_%'
        ORDER BY name
      `);

      const tableInfo: Record<string, {
        columns: number;
        columnNames: string[];
        columnDetails: TableInfo[];
      }> = {};

      for (const table of tables) {
        const columns = this.getTableColumns(table.name);
        tableInfo[table.name] = {
          columns: columns.length,
          columnNames: columns.map(col => col.name),
          columnDetails: columns
        };
      }

      return {
        tables: tables.map(t => t.name),
        tableCount: tables.length,
        tableInfo
      };
    } catch (error) {
      console.error('Error getting database schema:', error);
      throw new Error('Failed to retrieve database schema: ' + (error as Error).message);
    }
  }

  /**
   * Get column information for a table
   */
  getTableColumns(tableName: string): TableInfo[] {
    try {
      if (!this.isValidTableName(tableName)) {
        throw new Error('Invalid table name');
      }

      return databaseService.getMany<TableInfo>(`PRAGMA table_info(${tableName})`);
    } catch (error) {
      console.error(`Error getting columns for table ${tableName}:`, error);
      return [];
    }
  }

  /**
   * Get database file size and other metadata
   */
  async getDatabaseMetadata(): Promise<{
    pageCount: number;
    pageSize: number;
    estimatedSizeBytes: number;
    estimatedSizeMB: number;
    userVersion: number;
    applicationId: number;
  }> {
    try {
      // Get database page count and page size
      const pageCount = databaseService.getOne<{page_count: number}>('PRAGMA page_count');
      const pageSize = databaseService.getOne<{page_size: number}>('PRAGMA page_size');
      
      const estimatedSize = pageCount && pageSize ? 
        (pageCount.page_count * pageSize.page_size) : 0;

      // Get database version info
      const userVersion = databaseService.getOne<{user_version: number}>('PRAGMA user_version');
      const applicationId = databaseService.getOne<{application_id: number}>('PRAGMA application_id');

      return {
        pageCount: pageCount?.page_count || 0,
        pageSize: pageSize?.page_size || 0,
        estimatedSizeBytes: estimatedSize,
        estimatedSizeMB: Math.round(estimatedSize / (1024 * 1024) * 100) / 100,
        userVersion: userVersion?.user_version || 0,
        applicationId: applicationId?.application_id || 0
      };
    } catch (error) {
      console.error('Error getting database metadata:', error);
      return {
        pageCount: 0,
        pageSize: 0,
        estimatedSizeBytes: 0,
        estimatedSizeMB: 0,
        userVersion: 0,
        applicationId: 0
      };
    }
  }

  /**
   * Validate table name to prevent SQL injection
   */
  isValidTableName(tableName: string): boolean {
    if (!tableName || typeof tableName !== 'string') {
      return false;
    }

    // Allow only alphanumeric characters and underscores
    const validPattern = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
    return validPattern.test(tableName);
  }

  /**
   * Check if a table exists
   */
  tableExists(tableName: string): boolean {
    try {
      if (!this.isValidTableName(tableName)) {
        return false;
      }

      const result = databaseService.getOne<{name: string}>(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name=?
      `, [tableName]);

      return !!result;
    } catch (error) {
      console.error(`Error checking if table ${tableName} exists:`, error);
      return false;
    }
  }

  /**
   * Get comprehensive database health report
   */
  async getComprehensiveHealthReport(): Promise<{
    health: {
      status: 'healthy' | 'error';
      connectivity: boolean;
      timestamp: string;
    };
    statistics: {
      clients: number;
      invoices: number;
      templates: number;
      expenses: number;
      payments: number;
      users: number;
    };
    schema: {
      tables: string[];
      tableCount: number;
      tableInfo: Record<string, {
        columns: number;
        columnNames: string[];
        columnDetails: TableInfo[];
      }>;
    };
    metadata: {
      pageCount: number;
      pageSize: number;
      estimatedSizeBytes: number;
      estimatedSizeMB: number;
      userVersion: number;
      applicationId: number;
    };
    reportTimestamp: string;
  }> {
    try {
      const [healthCheck, statistics, schema, metadata] = await Promise.all([
        this.performHealthCheck(),
        this.getDatabaseStatistics(),
        this.getDatabaseSchema(),
        this.getDatabaseMetadata()
      ]);

      return {
        health: healthCheck,
        statistics,
        schema,
        metadata,
        reportTimestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error generating comprehensive health report:', error);
      throw new Error('Failed to generate health report: ' + (error as Error).message);
    }
  }

  /**
   * Check database integrity
   */
  async checkDatabaseIntegrity(): Promise<{
    status: 'ok' | 'error';
    result: string;
    timestamp: string;
  }> {
    try {
      const result = databaseService.getOne<{integrity_check: string}>('PRAGMA integrity_check');
      
      const isHealthy = result && (result.integrity_check === 'ok' || 
                                   (typeof result.integrity_check === 'string' && 
                                    result.integrity_check.toLowerCase() === 'ok'));

      return {
        status: isHealthy ? 'ok' : 'error',
        result: result?.integrity_check || 'unknown',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Database integrity check error:', error);
      return {
        status: 'error',
        result: (error as Error).message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Get database connection info
   */
  async getConnectionInfo(): Promise<{
    journalMode: string;
    synchronous: string;
    foreignKeysEnabled: boolean;
    timestamp: string;
  }> {
    try {
      // Get various database settings
      const journalMode = databaseService.getOne<{journal_mode: string}>('PRAGMA journal_mode');
      const synchronous = databaseService.getOne<{synchronous: number}>('PRAGMA synchronous');
      const foreignKeys = databaseService.getOne<{foreign_keys: number}>('PRAGMA foreign_keys');
      
      return {
        journalMode: journalMode?.journal_mode || 'unknown',
        synchronous: synchronous?.synchronous?.toString() || 'unknown',
        foreignKeysEnabled: foreignKeys?.foreign_keys === 1,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error getting connection info:', error);
      return {
        journalMode: 'unknown',
        synchronous: 'unknown',
        foreignKeysEnabled: false,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Simple health check for route usage
   */
  async checkDatabaseHealth(): Promise<boolean> {
    try {
      const result = await this.performHealthCheck();
      return result.status === 'healthy' && result.connectivity;
    } catch (error) {
      console.error('Health check failed:', error);
      return false;
    }
  }

  /**
   * Get detailed health data for routes
   */
  async getDetailedHealthData(): Promise<{
    status: 'ok' | 'error';
    database: {
      status: 'connected' | 'disconnected';
      counts: {
        users: number;
        clients: number;
        invoices: number;
        expenses: number;
      };
    };
  }> {
    try {
      const healthCheck = await this.performHealthCheck();
      const statistics = await this.getDatabaseStatistics();
      
      return {
        status: healthCheck.status === 'healthy' ? 'ok' : 'error',
        database: {
          status: healthCheck.connectivity ? 'connected' : 'disconnected',
          counts: {
            users: statistics.users,
            clients: statistics.clients,
            invoices: statistics.invoices,
            expenses: statistics.expenses
          }
        }
      };
    } catch (error) {
      console.error('Error getting detailed health data:', error);
      return {
        status: 'error',
        database: {
          status: 'disconnected',
          counts: {
            users: 0,
            clients: 0,
            invoices: 0,
            expenses: 0
          }
        }
      };
    }
  }
}

// Export singleton instance
export const databaseHealthService = new DatabaseHealthService();