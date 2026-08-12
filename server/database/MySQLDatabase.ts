// IDatabase over a mysql2 connection pool.
//
// The one structurally hard part is transactions. IDatabase.transaction() runs
// a callback that issues further queries through the SAME object, so those
// queries must reach the connection holding the open transaction. A pool hands
// out an arbitrary connection per query, so without pinning, BEGIN, the writes
// and COMMIT can each land somewhere different: the writes autocommit, the
// rollback rolls back nothing, and the atomicity the recurring-invoice
// processor depends on is gone with no error anywhere. AsyncLocalStorage
// carries the pinned connection through the callback without changing a single
// signature.

import { AsyncLocalStorage } from 'node:async_hooks';
import mysql from 'mysql2/promise';
import type {
  DatabaseConfig,
  IDatabase,
  QueryOptions,
  QueryResult,
  SelectResult,
  TransactionCallback
} from '../types/database.types.js';
import type { SqlDialect } from './dialect.types.js';
import { mysqlDialect } from './dialects/mysql.dialect.js';

type Executor = mysql.Pool | mysql.PoolConnection;

export class MySQLDatabase implements IDatabase {
  readonly dialect: SqlDialect = mysqlDialect;

  private pool: mysql.Pool | null = null;
  private readonly pinned = new AsyncLocalStorage<mysql.PoolConnection>();
  private queryCount = 0;
  private connectionTime = 0;

  async connect(config: DatabaseConfig): Promise<void> {
    if (config.driver !== 'mysql') {
      throw new Error(`MySQLDatabase cannot connect with a ${config.driver} configuration.`);
    }

    if (this.pool !== null) return;

    const { settings } = config;

    this.connectionTime = Date.now();

    this.pool = mysql.createPool({
      host: settings.host,
      port: settings.port,
      database: settings.database,
      user: settings.user,
      password: settings.password,
      connectionLimit: settings.poolSize,
      waitForConnections: true,
      // No column is DATE or DATETIME: instants are BIGINT epoch milliseconds
      // and calendar days are text. This stays as a standing guard — mysql2
      // hands back a `Date` object for those types, and a future column
      // declared as one would then return a different JavaScript type here than
      // on SQLite, for the same row.
      //
      // BIGINT needs no option: mysql2 returns it as a Number unless
      // `supportBigNumbers` is set, and epoch milliseconds (~1.7e12) are three
      // orders of magnitude below the safe-integer limit. Turning that option on
      // would be the harmful choice — it returns a String past 2^53, so the type
      // would depend on the value.
      dateStrings: true,
      // Nothing in this codebase issues multi-statement SQL, and enabling it
      // would turn any missed parameterisation into a full injection.
      multipleStatements: false,
      charset: 'utf8mb4_general_ci',
      ...(settings.ssl ? { ssl: { rejectUnauthorized: true } } : {})
    });

    try {
      // Fail here rather than on the first request: a pool is created lazily
      // and would otherwise report a healthy boot against an unreachable server.
      const probe = await this.pool.getConnection();
      probe.release();
    } catch (error) {
      await this.pool.end().catch(() => undefined);
      this.pool = null;

      throw new Error(
        `Failed to connect to MySQL at ${settings.user}@${settings.host}:${settings.port}/` +
          `${settings.database}: ${(error as Error).message}`
      );
    }
  }

  async disconnect(): Promise<void> {
    if (this.pool === null) return;

    const pool = this.pool;
    this.pool = null;
    await pool.end();
  }

  isConnected(): boolean {
    return this.pool !== null;
  }

  /** The pinned transaction connection when inside one, the pool otherwise. */
  private executor(): Executor {
    if (this.pool === null) throw new Error('Database not connected');

    return this.pinned.getStore() ?? this.pool;
  }

  async executeQuery(query: string, params: unknown[] = []): Promise<QueryResult> {
    try {
      this.queryCount++;
      const [result] = await this.executor().query(query, params);
      const header = result as mysql.ResultSetHeader;

      return {
        changes: header.affectedRows ?? 0,
        lastInsertRowid: Number(header.insertId ?? 0)
      };
    } catch (error) {
      console.error('Database query execution error:', error);
      console.error('Query:', query);
      console.error('Params:', params);
      throw new Error(`Database operation failed: ${(error as Error).message}`);
    }
  }

  async getOne<T = Record<string, unknown>>(
    query: string,
    params: unknown[] = []
  ): Promise<T | null> {
    // Null, never undefined: callers test `=== null` and use `??`, and
    // undefined would pass the first while behaving differently in the second.
    return (await this.getMany<T>(query, params))[0] ?? null;
  }

  async getMany<T = Record<string, unknown>>(query: string, params: unknown[] = []): Promise<T[]> {
    try {
      this.queryCount++;
      const [rows] = await this.executor().query(query, params);

      return rows as T[];
    } catch (error) {
      console.error('Database get many error:', error);
      console.error('Query:', query);
      console.error('Params:', params);
      throw new Error(`Database fetch operation failed: ${(error as Error).message}`);
    }
  }

  async getWithPagination<T = Record<string, unknown>>(
    query: string,
    params: unknown[] = [],
    options: QueryOptions = {}
  ): Promise<SelectResult<T>> {
    try {
      const { limit = 50, offset = 0, page, sort = [] } = options;
      const actualOffset = page ? (page - 1) * limit : offset;

      let finalQuery = query;

      if (sort.length > 0) {
        finalQuery += ` ORDER BY ${sort.map(s => `${s.column} ${s.direction}`).join(', ')}`;
      }

      finalQuery += ` LIMIT ${limit} OFFSET ${actualOffset}`;

      const data = await this.getMany<T>(finalQuery, params);

      const totalResult = await this.getOne<{ total: number }>(
        `SELECT COUNT(*) as total FROM (${query}) as count_query`,
        params
      );

      return { data, total: totalResult?.total ?? 0 };
    } catch (error) {
      console.error('Database paginated query error:', error);
      throw new Error(`Database paginated fetch failed: ${(error as Error).message}`);
    }
  }

  /**
   * Run a callback inside a transaction on a single pinned connection.
   *
   * A nested call joins the outer transaction rather than opening a second one,
   * matching SQLite, where BEGIN inside BEGIN is an error — so an inner
   * "commit" does not make anything durable if the outer transaction then fails.
   */
  async transaction<T>(callback: TransactionCallback<T>): Promise<T> {
    if (this.pool === null) throw new Error('Database not connected');

    if (this.pinned.getStore() !== undefined) return callback();

    const connection = await this.pool.getConnection();

    try {
      await connection.beginTransaction();

      const result = await this.pinned.run(connection, callback);

      await connection.commit();

      return result;
    } catch (error) {
      try {
        await connection.rollback();
      } catch {
        // Preserve the original failure; a failed rollback is a symptom.
      }

      throw error;
    } finally {
      connection.release();
    }
  }

  async createTable(tableName: string, definition: string): Promise<void> {
    await this.executeQuery(
      `CREATE TABLE IF NOT EXISTS ${tableName} (${definition}) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    );
  }

  async dropTable(tableName: string): Promise<void> {
    await this.executeQuery(`DROP TABLE IF EXISTS ${tableName}`);
  }

  async tableExists(tableName: string): Promise<boolean> {
    // DATABASE() rather than a wildcard: a server hosting several Slimbooks
    // installs must not report another schema's table as this one's.
    const result = await this.getOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
      [tableName]
    );

    return (result?.count ?? 0) > 0;
  }

  /**
   * These three are SQLite file operations with no MySQL counterpart.
   *
   * They throw rather than no-op: a silent no-op would let the database-admin
   * UI report a successful backup that produced no file, which is worse than
   * an error an operator can read.
   */
  backup(_path: string): void {
    throw new Error(
      'Backup is not available on the MySQL driver. Use mysqldump, or npm run db:export.'
    );
  }

  vacuum(): void {
    throw new Error('Vacuum is not available on the MySQL driver; InnoDB reclaims space itself.');
  }

  pragma(_setting: string, _value?: string | number): unknown {
    throw new Error('PRAGMA is a SQLite statement and has no MySQL equivalent.');
  }

  getHealth() {
    const uptime = Date.now() - this.connectionTime;

    return {
      isConnected: this.isConnected(),
      uptime,
      totalQueries: this.queryCount,
      avgQueryTime: this.queryCount > 0 ? uptime / this.queryCount : 0,
      // Reported by DatabaseHealthService from INFORMATION_SCHEMA instead; the
      // pool has no equivalent of SQLite's page_count × page_size.
      diskUsage: 0
    };
  }
}
