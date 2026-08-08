// Typed environment reading for the runtime composition root.
//
// This is the ONLY module permitted to read process.env. Everything else
// receives resolved values through the Runtime object. Readers validate rather
// than coerce: `parseInt` returning NaN is how a named pipe from iisnode became
// an unusable port, and a silent fallback is how a deployment that asked for
// HTTPS served plain HTTP for months.
//
// This module imports nothing from the project except its own types.

import type { ToggleState } from './types.js';

/** A configuration fault that must stop the process before it opens a socket. */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export type RawEnv = Record<string, string | undefined>;

/**
 * Variables this refactor removed, mapped to what replaces them.
 *
 * These are rejected rather than aliased. The project does not write
 * backwards-compatibility shims, and silently ignoring a stale ENABLE_HTTPS
 * would reintroduce exactly the failure that motivated the change.
 */
const REMOVED_VARS: Readonly<Record<string, string>> = Object.freeze({
  ENABLE_HTTPS: 'TLS_MODE (off | self | proxy)',
  SSL_KEY_PATH: 'TLS_KEY_PATH',
  SSL_CERT_PATH: 'TLS_CERT_PATH',
  ENABLE_DEBUG_ENDPOINTS: 'FEATURE_DEBUG (auto | on | off)'
});

const present = (env: RawEnv, key: string): string | null => {
  const raw = env[key];
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
};

/** Refuse to start when the environment still carries a removed variable. */
export const assertNoRemovedVars = (env: RawEnv): void => {
  const found = Object.keys(REMOVED_VARS).filter(key => present(env, key) !== null);

  if (found.length === 0) return;

  const lines = found.map(key => `  ${key} is no longer read — use ${REMOVED_VARS[key]}`);

  throw new ConfigError(
    `Environment contains ${found.length} removed variable(s):\n${lines.join('\n')}\n` +
      'Update your .env (see .env.example) before starting.'
  );
};

export const readString = (env: RawEnv, key: string, fallback: string): string =>
  present(env, key) ?? fallback;

export const readRequired = (env: RawEnv, key: string): string => {
  const value = present(env, key);

  if (value === null) {
    throw new ConfigError(`${key} is required but not set.`);
  }

  return value;
};

export const readInt = (env: RawEnv, key: string, fallback: number): number => {
  const value = present(env, key);
  if (value === null) return fallback;

  const parsed = Number(value);

  if (!Number.isInteger(parsed)) {
    throw new ConfigError(`${key} must be a whole number, got "${value}".`);
  }

  return parsed;
};

export const readBool = (env: RawEnv, key: string, fallback: boolean): boolean => {
  const value = present(env, key);
  if (value === null) return fallback;

  const normalised = value.toLowerCase();
  if (normalised === 'true') return true;
  if (normalised === 'false') return false;

  throw new ConfigError(`${key} must be true or false, got "${value}".`);
};

const TOGGLE_STATES: readonly ToggleState[] = ['auto', 'on', 'off'];

const isToggleState = (value: string): value is ToggleState =>
  (TOGGLE_STATES as readonly string[]).includes(value);

/**
 * Read a tri-state feature toggle.
 *
 * `auto` enables the feature when its dependency resolves, `on` requires it and
 * fails the boot when absent, `off` never mounts it. A boolean cannot express
 * "this host has Chromium and I want a hard failure if it does not", which is
 * why booleans are rejected outright.
 */
export const readToggle = (env: RawEnv, key: string): ToggleState => {
  const value = present(env, key);
  if (value === null) return 'auto';

  const normalised = value.toLowerCase();

  if (!isToggleState(normalised)) {
    throw new ConfigError(`${key} must be one of: auto, on, off — got "${value}".`);
  }

  return normalised;
};
