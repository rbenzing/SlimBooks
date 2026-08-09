// Database and storage settings, resolved once at boot with everything else.
//
// This module returns configuration. It opens no connection, imports no driver,
// and knows nothing about SQL — which is what lets the whole matrix be tested
// without a database.

import { ConfigError, readInt, readString, type RawEnv } from './env.js';
import type { RuntimePaths } from './types.js';

export type DatabaseDriver = 'sqlite' | 'mysql';

export interface SqliteSettings {
  driver: 'sqlite';
  /** Absolute path to the database file, already resolved by resolvePaths(). */
  file: string;
  timeoutMs: number;
}

export interface MysqlSettings {
  driver: 'mysql';
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl: boolean;
  poolSize: number;
}

/**
 * A union rather than an optional-field bag, so a MySQL adapter cannot be
 * handed a file path and a SQLite adapter cannot be handed a host.
 */
export type DatabaseSettings = SqliteSettings | MysqlSettings;

export type StorageDriver = 'disk' | 'database';

const DRIVERS: readonly DatabaseDriver[] = ['sqlite', 'mysql'];

const isDriver = (value: string): value is DatabaseDriver =>
  (DRIVERS as readonly string[]).includes(value);

const trimmed = (env: RawEnv, key: string): string => {
  const raw = env[key];
  return typeof raw === 'string' ? raw.trim() : '';
};

/**
 * Collect every missing MySQL variable before failing.
 *
 * An operator discovering them one boot at a time is a bad afternoon, and the
 * whole point of resolving here rather than on first query is that the failure
 * arrives complete and before the socket opens.
 *
 * DB_PASSWORD is checked for presence rather than content: an empty password is
 * a legitimate configuration, an absent one is not, and that difference is
 * exactly what a trimming reader cannot express.
 */
const assertMysqlComplete = (env: RawEnv): void => {
  const missing = ['DB_HOST', 'DB_NAME', 'DB_USER'].filter(key => trimmed(env, key).length === 0);

  if (typeof env.DB_PASSWORD !== 'string') {
    missing.push('DB_PASSWORD');
  }

  if (missing.length === 0) return;

  throw new ConfigError(
    `DB_DRIVER=mysql requires ${missing.join(', ')}.\n` +
      'Set them in the environment (DB_PASSWORD may be empty, but must be present).'
  );
};

export const resolveDatabase = (env: RawEnv, paths: RuntimePaths): DatabaseSettings => {
  const driver = readString(env, 'DB_DRIVER', 'sqlite').toLowerCase();

  if (!isDriver(driver)) {
    throw new ConfigError(`DB_DRIVER must be one of: ${DRIVERS.join(', ')} — got "${driver}".`);
  }

  if (driver === 'sqlite') {
    // The file path comes from resolvePaths(); DB_PATH and DATA_DIR are read
    // there and must not be read a second time here. Two readers of the same
    // variable is how the database ended up in two places at once.
    return {
      driver: 'sqlite',
      file: paths.dbFile,
      timeoutMs: readInt(env, 'DB_TIMEOUT_MS', 30_000)
    };
  }

  assertMysqlComplete(env);

  return {
    driver: 'mysql',
    host: trimmed(env, 'DB_HOST'),
    port: readInt(env, 'DB_PORT', 3306),
    database: trimmed(env, 'DB_NAME'),
    user: trimmed(env, 'DB_USER'),
    password: env.DB_PASSWORD as string,
    ssl: readString(env, 'DB_SSL', 'false').toLowerCase() === 'true',
    poolSize: readInt(env, 'DB_POOL_SIZE', 10)
  };
};

/**
 * Where uploaded files live.
 *
 * Rejects an unknown value rather than falling back, because falling back to
 * `disk` would silently put uploads on a filesystem that does not survive a
 * redeploy — the exact failure this whole spec exists to remove.
 */
export const resolveStorageDriver = (env: RawEnv): StorageDriver => {
  const value = readString(env, 'STORAGE_DRIVER', 'disk').toLowerCase();

  if (value !== 'disk' && value !== 'database') {
    throw new ConfigError(`STORAGE_DRIVER must be disk or database — got "${value}".`);
  }

  return value;
};
