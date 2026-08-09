/**
 * Composition root tests.
 *
 * These are the tests that prove all four hosting targets resolve correctly
 * without deploying to any of them. Each profile below is the environment its
 * deployment artifact will actually set, so a regression here is a regression
 * on that host.
 */

import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { ConfigError } from './env.js';
import { assertNoLegacyData, resolveRuntime } from './index.js';
import { findProjectRoot } from './paths.js';

const REPO_ROOT = findProjectRoot(join(process.cwd(), 'server', 'runtime'));
const MODULE_DIR = join(REPO_ROOT, 'server', 'runtime');

const BASE = { CLIENT_URL: 'https://books.example.com' };

const HOST_PROFILES = {
  docker: { ...BASE, PORT: '3002', TLS_MODE: 'self', TLS_KEY_PATH: 'certs/server.key', TLS_CERT_PATH: 'certs/server.crt' },
  bareLinux: { ...BASE, PORT: '3002', TLS_MODE: 'proxy', HOST: '127.0.0.1' },
  iis: { ...BASE, PORT: '\\\\.\\pipe\\7f3a-node', TLS_MODE: 'proxy' },
  hostinger: { ...BASE, PORT: '8080', TLS_MODE: 'proxy', FEATURE_PDF: 'off' }
} as const;

describe('resolveRuntime - host profiles', () => {
  it('resolves the Docker profile with its own TLS', () => {
    const runtime = resolveRuntime(HOST_PROFILES.docker, MODULE_DIR);

    expect(runtime.listener.target).toBe(3002);
    expect(runtime.listener.tls).toBe('self');
    expect(runtime.listener.trustProxyHops).toBe(0);
  });

  it('resolves the bare-Linux profile behind a local reverse proxy', () => {
    const runtime = resolveRuntime(HOST_PROFILES.bareLinux, MODULE_DIR);

    expect(runtime.listener.host).toBe('127.0.0.1');
    expect(runtime.listener.trustProxyHops).toBe(1);
  });

  it('resolves the IIS profile onto a named pipe with no host binding', () => {
    const runtime = resolveRuntime(HOST_PROFILES.iis, MODULE_DIR);

    expect(runtime.listener.target).toBe('\\\\.\\pipe\\7f3a-node');
    expect(runtime.listener.host).toBeNull();
    expect(runtime.listener.tls).toBe('proxy');
  });

  it('resolves the Hostinger profile with PDF disabled', () => {
    const runtime = resolveRuntime(HOST_PROFILES.hostinger, MODULE_DIR);

    expect(runtime.listener.target).toBe(8080);
    expect(runtime.features.pdf).toBe(false);
    expect(runtime.pdf).toBeNull();
  });

  it('resolves identical paths for every profile', () => {
    const resolved = Object.values(HOST_PROFILES).map(env => resolveRuntime(env, MODULE_DIR).paths);

    for (const paths of resolved) {
      expect(paths).toEqual(resolved[0]);
    }
  });
});

describe('resolveRuntime - validation', () => {
  it('requires CLIENT_URL, so no customer is emailed an undefined link', () => {
    expect(() => resolveRuntime({}, MODULE_DIR)).toThrow(/CLIENT_URL/);
  });

  it('rejects a removed variable before anything else is resolved', () => {
    expect(() => resolveRuntime({ ...BASE, ENABLE_HTTPS: 'true' }, MODULE_DIR))
      .toThrow(ConfigError);
  });

  it('strips a trailing slash from the public URL', () => {
    const runtime = resolveRuntime({ CLIENT_URL: 'https://books.example.com/' }, MODULE_DIR);

    expect(runtime.urls.publicUrl).toBe('https://books.example.com');
  });

  it('freezes the resolved runtime so nothing can mutate it later', () => {
    const runtime = resolveRuntime(BASE, MODULE_DIR);

    expect(Object.isFrozen(runtime)).toBe(true);
  });

  it('describes the resolved decisions for the startup log', () => {
    const summary = resolveRuntime(HOST_PROFILES.iis, MODULE_DIR).describe();

    expect(summary).toMatch(/pipe/);
    expect(summary).toMatch(/proxy/);
  });
});

describe('describe()', () => {
  it('names the SQLite file when that is the active backend', () => {
    expect(resolveRuntime(BASE, MODULE_DIR).describe()).toMatch(/database\s+sqlite .*slimbooks\.db/);
  });

  it('names the MySQL server without its password', () => {
    // This string is printed at every boot and ends up wherever stdout is
    // collected, which on a PaaS is a log service the credentials must not reach.
    const summary = resolveRuntime(
      {
        ...BASE,
        DB_DRIVER: 'mysql',
        DB_HOST: 'db.internal',
        DB_NAME: 'books',
        DB_USER: 'app',
        DB_PASSWORD: 'hunter2'
      },
      MODULE_DIR
    ).describe();

    expect(summary).toContain('mysql app@db.internal:3306/books');
    expect(summary).not.toContain('hunter2');
  });
});

describe('assertNoLegacyData', () => {
  const paths = {
    root: REPO_ROOT,
    dataDir: join(REPO_ROOT, 'data'),
    uploadsDir: join(REPO_ROOT, 'uploads'),
    staticDir: join(REPO_ROOT, 'dist', 'client'),
    dbFile: join(REPO_ROOT, 'data', 'slimbooks.db')
  };

  it('passes when no legacy database exists', () => {
    expect(() => assertNoLegacyData(paths, () => false)).not.toThrow();
  });

  it('refuses to start when only the legacy database exists', () => {
    const onlyLegacy = (candidate: string): boolean => candidate.includes(join('server', 'data'));

    expect(() => assertNoLegacyData(paths, onlyLegacy)).toThrow(/server[\\/]data/);
  });

  it('names both paths so the operator knows what to move', () => {
    const onlyLegacy = (candidate: string): boolean => candidate.includes(join('server', 'data'));

    expect(() => assertNoLegacyData(paths, onlyLegacy)).toThrow(/slimbooks\.db/);
  });

  it('allows startup once the resolved database exists, legacy file or not', () => {
    expect(() => assertNoLegacyData(paths, () => true)).not.toThrow();
  });

  it('refuses to start when only the legacy logo directory exists', () => {
    const dbPresentLogosLegacy = (candidate: string): boolean =>
      candidate === paths.dbFile || candidate.includes(join('server', 'public', 'uploads'));

    expect(() => assertNoLegacyData(paths, dbPresentLogosLegacy)).toThrow(/uploads/i);
  });

  it('allows startup when the configured logo directory exists', () => {
    const configuredPresent = (candidate: string): boolean =>
      candidate === paths.dbFile || candidate === join(paths.uploadsDir, 'logos');

    expect(() => assertNoLegacyData(paths, configuredPresent)).not.toThrow();
  });

  it('ignores a missing SQLite file under MySQL, where none is expected', () => {
    // The resolved file never exists on a MySQL install, so keeping this check
    // active would refuse to start a perfectly healthy one — and strand the
    // operator over a file the process no longer reads.
    const onlyLegacy = (candidate: string): boolean => candidate.includes(join('server', 'data'));

    expect(() => assertNoLegacyData(paths, onlyLegacy, 'mysql')).not.toThrow();
  });

  it('still checks stranded uploads under MySQL, since logos may be on disk', () => {
    // STORAGE_DRIVER is independent of DB_DRIVER: a MySQL install can still
    // serve its logos from the filesystem.
    const logosLegacy = (candidate: string): boolean =>
      candidate.includes(join('server', 'public', 'uploads'));

    expect(() => assertNoLegacyData(paths, logosLegacy, 'mysql')).toThrow(/uploads/i);
  });
});
