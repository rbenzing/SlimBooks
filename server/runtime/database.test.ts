import { describe, it, expect } from 'vitest';
import { resolveDatabase, resolveStorageDriver } from './database.js';
import { ConfigError } from './env.js';
import type { RuntimePaths } from './types.js';

const PATHS: RuntimePaths = {
  root: '/app',
  dataDir: '/app/data',
  uploadsDir: '/app/uploads',
  staticDir: '/app/dist/client',
  dbFile: '/app/data/slimbooks.db'
};

const MYSQL_ENV = {
  DB_DRIVER: 'mysql',
  DB_HOST: 'db.internal',
  DB_NAME: 'slimbooks',
  DB_USER: 'app',
  DB_PASSWORD: 'secret'
};

describe('resolveDatabase', () => {
  it('defaults to SQLite at the resolved path, so existing installs need no config', () => {
    expect(resolveDatabase({}, PATHS)).toEqual({
      driver: 'sqlite',
      file: '/app/data/slimbooks.db',
      timeoutMs: 30_000
    });
  });

  it('takes the SQLite path from resolvePaths rather than re-reading DB_PATH', () => {
    // DB_PATH and DATA_DIR are read once, in paths.ts. Reading them a second
    // time here is how the database ended up in two places at once before.
    const settings = resolveDatabase({ DB_PATH: '/somewhere/else.db' }, PATHS);

    expect(settings).toMatchObject({ file: '/app/data/slimbooks.db' });
  });

  it('rejects an unknown driver rather than falling back', () => {
    expect(() => resolveDatabase({ DB_DRIVER: 'postgres' }, PATHS)).toThrow(ConfigError);
  });

  it('accepts a driver in any case', () => {
    expect(resolveDatabase({ ...MYSQL_ENV, DB_DRIVER: 'MySQL' }, PATHS).driver).toBe('mysql');
  });

  it('resolves MySQL settings', () => {
    expect(resolveDatabase(MYSQL_ENV, PATHS)).toEqual({
      driver: 'mysql',
      host: 'db.internal',
      port: 3306,
      database: 'slimbooks',
      user: 'app',
      password: 'secret',
      ssl: false,
      poolSize: 10
    });
  });

  it('fails the boot when a required MySQL variable is missing', () => {
    // The alternative is a connection error on the first request that touches
    // the database, by which point the process is listening and looks healthy.
    expect(() => resolveDatabase({ DB_DRIVER: 'mysql', DB_HOST: 'h', DB_USER: 'u' }, PATHS))
      .toThrow(/DB_NAME/);
  });

  it('names every missing variable at once, not just the first', () => {
    // An operator fixing them one boot at a time is a bad afternoon.
    try {
      resolveDatabase({ DB_DRIVER: 'mysql' }, PATHS);
      expect.unreachable('should have thrown');
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain('DB_HOST');
      expect(message).toContain('DB_NAME');
      expect(message).toContain('DB_USER');
      expect(message).toContain('DB_PASSWORD');
    }
  });

  it('rejects a non-numeric port', () => {
    expect(() => resolveDatabase({ ...MYSQL_ENV, DB_PORT: 'abc' }, PATHS)).toThrow(ConfigError);
  });

  it('accepts an empty password, which is distinct from an absent one', () => {
    // readRequired treats an empty string as absent, which is right for a
    // hostname and wrong for a password.
    expect(resolveDatabase({ ...MYSQL_ENV, DB_PASSWORD: '' }, PATHS)).toMatchObject({
      password: ''
    });
  });

  it('reads the optional MySQL settings', () => {
    expect(
      resolveDatabase({ ...MYSQL_ENV, DB_PORT: '3307', DB_SSL: 'true', DB_POOL_SIZE: '4' }, PATHS)
    ).toMatchObject({ port: 3307, ssl: true, poolSize: 4 });
  });

  it('ignores MySQL settings entirely when the driver is sqlite', () => {
    expect(resolveDatabase({ ...MYSQL_ENV, DB_DRIVER: 'sqlite' }, PATHS).driver).toBe('sqlite');
  });
});

describe('resolveStorageDriver', () => {
  it('defaults to disk, so existing installs keep serving their logos', () => {
    expect(resolveStorageDriver({})).toBe('disk');
  });

  it('resolves the database driver', () => {
    expect(resolveStorageDriver({ STORAGE_DRIVER: 'database' })).toBe('database');
  });

  it('rejects anything else rather than falling back to disk', () => {
    // Falling back would silently put uploads on an ephemeral filesystem.
    expect(() => resolveStorageDriver({ STORAGE_DRIVER: 's3' })).toThrow(ConfigError);
  });
});
