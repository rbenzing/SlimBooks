// Listener resolution: what to bind, and how TLS is terminated.
//
// PORT is deliberately not parsed as a number. iisnode supplies a named pipe
// path, and `parseInt` on it yields NaN — the process then cannot bind at all.
// A non-numeric value is passed through to `server.listen()` verbatim, which is
// exactly what Node expects for a pipe.

import { ConfigError, readInt, readString, type RawEnv } from './env.js';
import { isAbsolute, resolve } from 'node:path';
import type { ListenerConfig, TlsMode } from './types.js';

const TLS_MODES: readonly TlsMode[] = ['off', 'self', 'proxy'];

const isTlsMode = (value: string): value is TlsMode =>
  (TLS_MODES as readonly string[]).includes(value);

const readTlsMode = (env: RawEnv): TlsMode => {
  const raw = readString(env, 'TLS_MODE', 'off').toLowerCase();

  if (!isTlsMode(raw)) {
    throw new ConfigError(`TLS_MODE must be one of: off, self, proxy — got "${raw}".`);
  }

  return raw;
};

/** A port if the value is numeric, otherwise a named pipe path passed through. */
const readTarget = (env: RawEnv): number | string => {
  const raw = readString(env, 'PORT', '3002');
  const numeric = Number(raw);

  if (!Number.isInteger(numeric)) {
    return raw;
  }

  if (numeric < 1 || numeric > 65535) {
    throw new ConfigError(`PORT must be between 1 and 65535, got ${numeric}.`);
  }

  return numeric;
};

const requireCertPath = (env: RawEnv, key: string, root: string): string => {
  const raw = readString(env, key, '');

  if (raw.length === 0) {
    throw new ConfigError(`TLS_MODE is "self" but ${key} is not set.`);
  }

  return isAbsolute(raw) ? resolve(raw) : resolve(root, raw);
};

/**
 * Resolve how this process should listen.
 *
 * @param env  Raw environment.
 * @param root Project root, used to resolve relative certificate paths.
 */
export const resolveListener = (env: RawEnv, root: string): ListenerConfig => {
  const target = readTarget(env);
  const tls = readTlsMode(env);

  // A named pipe carries its own identity; binding a host alongside it is an
  // error rather than a refinement.
  const host = typeof target === 'number' ? readString(env, 'HOST', '0.0.0.0') : null;

  // Only trust forwarded headers when something is actually in front of us.
  // Trusting them otherwise lets any client spoof its own address and defeat
  // the rate limiter.
  const trustProxyHops = tls === 'proxy' ? readInt(env, 'TRUST_PROXY_HOPS', 1) : 0;

  if (trustProxyHops < 0) {
    throw new ConfigError(`TRUST_PROXY_HOPS must be zero or greater, got ${trustProxyHops}.`);
  }

  const tlsKeyPath = tls === 'self' ? requireCertPath(env, 'TLS_KEY_PATH', root) : null;
  const tlsCertPath = tls === 'self' ? requireCertPath(env, 'TLS_CERT_PATH', root) : null;

  return { target, host, tls, trustProxyHops, tlsKeyPath, tlsCertPath };
};
