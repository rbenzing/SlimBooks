/**
 * Listener resolution tests.
 *
 * Two live defects motivate these. Under iisnode PORT is a named pipe path, so
 * `parseInt` produced NaN and the server could not bind. And behind IIS or
 * Hostinger, without `trust proxy`, express-rate-limit attributes every request
 * to the proxy's single address — so the 100-per-15-minute budget is shared by
 * every user at once and the whole install locks out.
 */

import { describe, it, expect } from 'vitest';
import { isAbsolute, join } from 'node:path';
import { ConfigError } from './env.js';
import { resolveListener } from './listener.js';

const ROOT = join(process.cwd());

describe('resolveListener - target', () => {
  it('defaults to port 3002', () => {
    expect(resolveListener({}, ROOT).target).toBe(3002);
  });

  it('reads a numeric PORT as a number', () => {
    expect(resolveListener({ PORT: '8080' }, ROOT).target).toBe(8080);
  });

  it('passes a named pipe through as a string', () => {
    const pipe = '\\\\.\\pipe\\1a2b3c4d-node';

    expect(resolveListener({ PORT: pipe }, ROOT).target).toBe(pipe);
  });

  it('does not bind a host when listening on a named pipe', () => {
    const pipe = '\\\\.\\pipe\\1a2b3c4d-node';

    expect(resolveListener({ PORT: pipe, HOST: '0.0.0.0' }, ROOT).host).toBeNull();
  });

  it('binds the configured host for a numeric port', () => {
    expect(resolveListener({ PORT: '8080', HOST: '127.0.0.1' }, ROOT).host).toBe('127.0.0.1');
  });

  it('defaults the host to 0.0.0.0 for a numeric port', () => {
    expect(resolveListener({ PORT: '8080' }, ROOT).host).toBe('0.0.0.0');
  });

  it('rejects a port outside the valid range', () => {
    expect(() => resolveListener({ PORT: '70000' }, ROOT)).toThrow(ConfigError);
  });
});

describe('resolveListener - TLS', () => {
  it('defaults to off', () => {
    expect(resolveListener({}, ROOT).tls).toBe('off');
  });

  it('reads each supported mode', () => {
    expect(resolveListener({ TLS_MODE: 'proxy' }, ROOT).tls).toBe('proxy');
    expect(resolveListener({ TLS_MODE: 'off' }, ROOT).tls).toBe('off');
  });

  it('rejects an unknown mode', () => {
    expect(() => resolveListener({ TLS_MODE: 'yes' }, ROOT)).toThrow(/off, self, proxy/);
  });

  it('requires both certificate paths in self mode', () => {
    expect(() => resolveListener({ TLS_MODE: 'self' }, ROOT)).toThrow(/TLS_KEY_PATH/);
  });

  it('resolves certificate paths against the project root in self mode', () => {
    const listener = resolveListener(
      { TLS_MODE: 'self', TLS_KEY_PATH: 'certs/server.key', TLS_CERT_PATH: 'certs/server.crt' },
      ROOT
    );

    expect(listener.tlsKeyPath).toBe(join(ROOT, 'certs', 'server.key'));
    expect(isAbsolute(listener.tlsCertPath ?? '')).toBe(true);
  });

  it('leaves certificate paths null outside self mode', () => {
    const listener = resolveListener({ TLS_MODE: 'proxy' }, ROOT);

    expect(listener.tlsKeyPath).toBeNull();
    expect(listener.tlsCertPath).toBeNull();
  });
});

describe('resolveListener - trust proxy', () => {
  it('trusts no hops when not behind a proxy', () => {
    expect(resolveListener({ TLS_MODE: 'off' }, ROOT).trustProxyHops).toBe(0);
  });

  it('trusts one hop by default in proxy mode', () => {
    expect(resolveListener({ TLS_MODE: 'proxy' }, ROOT).trustProxyHops).toBe(1);
  });

  it('honours an explicit hop count', () => {
    const listener = resolveListener({ TLS_MODE: 'proxy', TRUST_PROXY_HOPS: '2' }, ROOT);

    expect(listener.trustProxyHops).toBe(2);
  });

  it('rejects a negative hop count', () => {
    expect(() => resolveListener({ TLS_MODE: 'proxy', TRUST_PROXY_HOPS: '-1' }, ROOT))
      .toThrow(ConfigError);
  });
});
