/**
 * Environment reading tests.
 *
 * Two failures motivate these. `parseInt(process.env.PORT)` yields NaN under
 * iisnode, which passes a named pipe rather than a number. And the TLS settings
 * in docker-compose were never read by anything, so a deployment that asked for
 * HTTPS silently served plain HTTP — which is why removed variables must be
 * rejected rather than ignored.
 */

import { describe, it, expect } from 'vitest';
import {
  ConfigError,
  assertNoRemovedVars,
  readBool,
  readInt,
  readRequired,
  readString,
  readToggle
} from './env.js';

describe('assertNoRemovedVars', () => {
  it('accepts an environment with no removed variables', () => {
    expect(() => assertNoRemovedVars({ PORT: '3002' })).not.toThrow();
  });

  it('rejects ENABLE_HTTPS and names its replacement', () => {
    expect(() => assertNoRemovedVars({ ENABLE_HTTPS: 'true' })).toThrow(/TLS_MODE/);
  });

  it('rejects SSL_KEY_PATH and names its replacement', () => {
    expect(() => assertNoRemovedVars({ SSL_KEY_PATH: 'certs/a.key' })).toThrow(/TLS_KEY_PATH/);
  });

  it('rejects ENABLE_DEBUG_ENDPOINTS and names its replacement', () => {
    expect(() => assertNoRemovedVars({ ENABLE_DEBUG_ENDPOINTS: 'true' })).toThrow(/FEATURE_DEBUG/);
  });

  it('reports every removed variable at once rather than one per restart', () => {
    const call = () => assertNoRemovedVars({ ENABLE_HTTPS: 'true', SSL_CERT_PATH: 'a.crt' });

    expect(call).toThrow(/ENABLE_HTTPS/);
    expect(call).toThrow(/SSL_CERT_PATH/);
  });

  it('ignores a removed variable that is present but blank', () => {
    expect(() => assertNoRemovedVars({ ENABLE_HTTPS: '' })).not.toThrow();
  });

  it('throws ConfigError specifically', () => {
    expect(() => assertNoRemovedVars({ ENABLE_HTTPS: 'true' })).toThrow(ConfigError);
  });
});

describe('readString', () => {
  it('returns the value when set', () => {
    expect(readString({ HOST: '127.0.0.1' }, 'HOST', '0.0.0.0')).toBe('127.0.0.1');
  });

  it('falls back when unset', () => {
    expect(readString({}, 'HOST', '0.0.0.0')).toBe('0.0.0.0');
  });

  it('falls back when blank, since a blank value is a mistake', () => {
    expect(readString({ HOST: '   ' }, 'HOST', '0.0.0.0')).toBe('0.0.0.0');
  });

  it('trims surrounding whitespace', () => {
    expect(readString({ HOST: ' 127.0.0.1 ' }, 'HOST', '0.0.0.0')).toBe('127.0.0.1');
  });
});

describe('readInt', () => {
  it('parses a numeric value', () => {
    expect(readInt({ BCRYPT_ROUNDS: '10' }, 'BCRYPT_ROUNDS', 12)).toBe(10);
  });

  it('falls back when unset', () => {
    expect(readInt({}, 'BCRYPT_ROUNDS', 12)).toBe(12);
  });

  it('rejects a non-numeric value rather than silently yielding NaN', () => {
    expect(() => readInt({ BCRYPT_ROUNDS: 'ten' }, 'BCRYPT_ROUNDS', 12)).toThrow(ConfigError);
  });

  it('rejects a fractional value', () => {
    expect(() => readInt({ BCRYPT_ROUNDS: '1.5' }, 'BCRYPT_ROUNDS', 12)).toThrow(ConfigError);
  });
});

describe('readBool', () => {
  it('reads true', () => {
    expect(readBool({ CORS_CREDENTIALS: 'true' }, 'CORS_CREDENTIALS', false)).toBe(true);
  });

  it('reads false', () => {
    expect(readBool({ CORS_CREDENTIALS: 'false' }, 'CORS_CREDENTIALS', true)).toBe(false);
  });

  it('falls back when unset', () => {
    expect(readBool({}, 'CORS_CREDENTIALS', true)).toBe(true);
  });

  it('rejects a value that is neither true nor false', () => {
    expect(() => readBool({ CORS_CREDENTIALS: 'yes' }, 'CORS_CREDENTIALS', false)).toThrow(ConfigError);
  });
});

describe('readToggle', () => {
  it('defaults to auto', () => {
    expect(readToggle({}, 'FEATURE_PDF')).toBe('auto');
  });

  it('reads each of the three states', () => {
    expect(readToggle({ FEATURE_PDF: 'on' }, 'FEATURE_PDF')).toBe('on');
    expect(readToggle({ FEATURE_PDF: 'off' }, 'FEATURE_PDF')).toBe('off');
    expect(readToggle({ FEATURE_PDF: 'auto' }, 'FEATURE_PDF')).toBe('auto');
  });

  it('is case-insensitive', () => {
    expect(readToggle({ FEATURE_PDF: 'ON' }, 'FEATURE_PDF')).toBe('on');
  });

  it('rejects a boolean, since toggles are deliberately tri-state', () => {
    expect(() => readToggle({ FEATURE_PDF: 'true' }, 'FEATURE_PDF')).toThrow(/auto, on, off/);
  });
});

describe('readRequired', () => {
  it('returns the value when set', () => {
    expect(readRequired({ CLIENT_URL: 'https://books.example.com' }, 'CLIENT_URL'))
      .toBe('https://books.example.com');
  });

  it('throws when unset, rather than letting undefined reach a customer email', () => {
    expect(() => readRequired({}, 'CLIENT_URL')).toThrow(/CLIENT_URL/);
  });
});
