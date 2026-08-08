/**
 * Storage provider tests.
 *
 * Logos were written to `<root>/public/uploads/logos` and served from
 * `server/public/uploads`, so an uploaded logo 404'd in development and landed
 * in a third place in production. Routing every read and write through one
 * resolved root removes the possibility.
 *
 * The traversal tests matter because the delete path previously resolved a
 * filename read back out of stored settings.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertSafeKey, LocalDiskStorage } from './storage.js';

let root: string;
let storage: LocalDiskStorage;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'slimbooks-storage-'));
  storage = new LocalDiskStorage(root);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('assertSafeKey', () => {
  it('accepts a simple nested key', () => {
    expect(() => assertSafeKey('logos/logo-1.png')).not.toThrow();
  });

  it('rejects a parent-directory traversal', () => {
    expect(() => assertSafeKey('../etc/passwd')).toThrow(/traversal/i);
  });

  it('rejects a traversal buried mid-key', () => {
    expect(() => assertSafeKey('logos/../../etc/passwd')).toThrow(/traversal/i);
  });

  it('rejects an absolute POSIX path', () => {
    expect(() => assertSafeKey('/etc/passwd')).toThrow(/absolute/i);
  });

  it('rejects a Windows drive path', () => {
    expect(() => assertSafeKey('C:\\Windows\\system32')).toThrow();
  });

  it('rejects a backslash separator', () => {
    expect(() => assertSafeKey('logos\\logo.png')).toThrow(/backslash/i);
  });

  it('rejects an empty key', () => {
    expect(() => assertSafeKey('')).toThrow();
  });

  it('rejects a NUL byte', () => {
    expect(() => assertSafeKey('logos/a\u0000.png')).toThrow();
  });
});

describe('LocalDiskStorage', () => {
  it('round-trips a stored object', async () => {
    await storage.put('logos/a.png', Buffer.from('image-bytes'));

    expect(await storage.exists('logos/a.png')).toBe(true);
    expect(readFileSync(join(root, 'logos', 'a.png'), 'utf8')).toBe('image-bytes');
  });

  it('creates intermediate directories', async () => {
    await storage.put('deeply/nested/a.png', Buffer.from('x'));

    expect(existsSync(join(root, 'deeply', 'nested', 'a.png'))).toBe(true);
  });

  it('reports a missing object as absent', async () => {
    expect(await storage.exists('logos/missing.png')).toBe(false);
    expect(await storage.get('logos/missing.png')).toBeNull();
  });

  it('deletes an object', async () => {
    await storage.put('logos/a.png', Buffer.from('x'));
    await storage.delete('logos/a.png');

    expect(await storage.exists('logos/a.png')).toBe(false);
  });

  it('treats deleting a missing object as success, so cleanup is idempotent', async () => {
    await expect(storage.delete('logos/missing.png')).resolves.toBeUndefined();
  });

  it('leaves no temporary file behind after a successful write', async () => {
    await storage.put('logos/a.png', Buffer.from('x'));

    const stray = readdirSync(join(root, 'logos')).filter(name => name.includes('.tmp-'));
    expect(stray).toEqual([]);
  });

  it('refuses a traversal key on write', async () => {
    await expect(storage.put('../escape.png', Buffer.from('x'))).rejects.toThrow(/traversal/i);
  });

  it('refuses a traversal key on delete', async () => {
    await expect(storage.delete('../escape.png')).rejects.toThrow(/traversal/i);
  });

  it('builds a public URL under the uploads prefix', () => {
    expect(storage.publicUrl('logos/a.png')).toBe('/uploads/logos/a.png');
  });

  it('honours a custom URL prefix', () => {
    const custom = new LocalDiskStorage(root, '/files');

    expect(custom.publicUrl('logos/a.png')).toBe('/files/logos/a.png');
  });
});
