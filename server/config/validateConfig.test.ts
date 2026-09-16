/**
 * `validateConfig()` must refuse to start on a publicly-known signing secret.
 *
 * The version this replaces could not do that. It collected the offending
 * variable names into `requiredVars` and then filtered that list with
 * `!process.env[name]` — so a secret explicitly *set* to the placeholder
 * published in this repository was filtered straight back out and the boot
 * continued. The check also ran only under `NODE_ENV=production`, while
 * `.env.example` — the file it tells operators to copy — ships `development`.
 *
 * Each test reloads the module, because `authConfig` reads `process.env` once at
 * import time.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const PLACEHOLDER = 'your-secret-key-change-in-production';
const REAL = 'S7Tqv0pZ0m9y5tR2wX8cN4kL6bV1aH3jD5fG7hJ9kM=';

const env = { ...process.env };

beforeEach(() => {
  vi.resetModules();
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  process.env = { ...env };
  vi.restoreAllMocks();
});

/** Load a fresh copy of the config module under the current environment. */
const loadValidate = async (): Promise<() => void> => {
  const module = await import('./index.js');
  return module.validateConfig;
};

describe('validateConfig', () => {
  it('refuses the published placeholder in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = PLACEHOLDER;

    const validateConfig = await loadValidate();

    expect(() => validateConfig()).toThrow(/JWT_SECRET/);
  });

  it('refuses the published placeholder in development too, which is where most installs actually run', async () => {
    // .env.example ships NODE_ENV=development, so this is the common case and
    // the one the previous check let through silently.
    process.env.NODE_ENV = 'development';
    process.env.JWT_SECRET = PLACEHOLDER;

    const validateConfig = await loadValidate();

    expect(() => validateConfig()).toThrow(/JWT_SECRET/);
  });

  it('refuses a blank JWT_SECRET, which is exactly what .env.example ships', async () => {
    // Left blank, the value falls back to the published placeholder. Blank
    // rather than deleted because the config module loads `.env` from disk on
    // import, and dotenv fills in any key that is absent — a deleted key would
    // be silently repopulated on a developer machine and pass for the wrong
    // reason, while an empty one is left alone.
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = '';

    const validateConfig = await loadValidate();

    expect(() => validateConfig()).toThrow(/JWT_SECRET/);
  });

  it('accepts a real secret', async () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = REAL;

    const validateConfig = await loadValidate();

    expect(() => validateConfig()).not.toThrow();
  });

  it('refuses a refresh secret explicitly set to its placeholder', async () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = REAL;
    process.env.JWT_REFRESH_SECRET = 'your-refresh-secret-change-in-production';

    const validateConfig = await loadValidate();

    expect(() => validateConfig()).toThrow(/JWT_REFRESH_SECRET/);
  });

  it('does not demand the refresh and session secrets be present, since nothing reads them', async () => {
    // Requiring them would turn a working install into a failed boot over a
    // variable that signs nothing.
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = REAL;
    delete process.env.JWT_REFRESH_SECRET;
    delete process.env.SESSION_SECRET;

    const validateConfig = await loadValidate();

    expect(() => validateConfig()).not.toThrow();
  });
});
