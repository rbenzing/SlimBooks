/**
 * Drives the route over real HTTP on an ephemeral port.
 *
 * The project has no supertest, and adding one for a single router is not worth
 * a dependency — an express app on a listening socket exercises the same path
 * with fewer assumptions, including the header and status behaviour a stub
 * response object would let pass.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import { get, type IncomingHttpHeaders, type Server } from 'node:http';
import { Readable } from 'node:stream';
import type { AddressInfo } from 'node:net';
import { createUploadsRoute } from './uploadsRoute.js';
import type { Runtime } from '../runtime/types.js';
import type { StorageProvider } from '../runtime/storage.js';

const objects = new Map<string, string>([
  ['logos/a.png', 'png-bytes'],
  ['logos/b.svg', '<svg/>']
]);

/** Every key the route actually asked the provider for. */
const seenKeys: string[] = [];

const storage: StorageProvider = {
  async put() {
    throw new Error('not used');
  },
  async get(key: string) {
    seenKeys.push(key);

    if (key.includes('..')) throw new Error('Storage key must not contain a path traversal segment.');
    if (key.startsWith('/')) throw new Error('Storage key must be relative, not absolute.');
    if (key === 'logos/broken.png') return Readable.from([]).map(() => { throw new Error('boom'); });

    const body = objects.get(key);
    return body === undefined ? null : Readable.from(Buffer.from(body));
  },
  async delete() {},
  async exists(key: string) {
    return objects.has(key);
  },
  publicUrl(key: string) {
    return `/uploads/${key}`;
  }
};

interface Fetched {
  status: number;
  headers: IncomingHttpHeaders;
  body: string;
}

/**
 * node:http rather than fetch: the shared test setup replaces global.fetch with
 * a mock for the frontend suite, so a test using it here would silently receive
 * undefined instead of a response.
 */
const request = (url: string): Promise<Fetched> =>
  new Promise((resolve, reject) => {
    get(url, response => {
      const chunks: Buffer[] = [];

      response.on('data', chunk => chunks.push(Buffer.from(chunk as Buffer)));
      response.on('end', () =>
        resolve({
          status: response.statusCode ?? 0,
          headers: response.headers,
          body: Buffer.concat(chunks).toString()
        })
      );
    }).on('error', reject);
  });

let server: Server;
let origin: string;

beforeAll(async () => {
  const app = express();
  app.use('/uploads', createUploadsRoute({ storage } as unknown as Runtime));

  await new Promise<void>(resolve => {
    server = app.listen(0, '127.0.0.1', resolve);
  });

  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>(resolve => {
    server.close(() => resolve());
  });
});

describe('GET /uploads/:key', () => {
  it('streams an object the provider holds', async () => {
    const response = await request(`${origin}/uploads/logos/a.png`);

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toBe('image/png');
    expect(response.body).toBe('png-bytes');
  });

  it('404s a missing object', async () => {
    expect((await request(`${origin}/uploads/logos/missing.png`)).status).toBe(404);
  });

  it('caches immutably, because every uncached request is now a database read', async () => {
    // Safe because filenames are UUIDs and are never reused.
    const response = await request(`${origin}/uploads/logos/a.png`);

    expect(response.headers['cache-control']).toBe('public, max-age=31536000, immutable');
  });

  it('404s a traversal attempt rather than 500ing', async () => {
    // The provider throws on an unsafe key. Reporting that as a server error
    // would put a stack trace in the response and tell a prober which keys are
    // merely absent and which are rejected outright.
    const response = await request(`${origin}/uploads/..%2F..%2Fetc%2Fpasswd`);

    expect(response.status).toBe(404);
    expect(response.body).toBe('');
  });

  it('rejects a malformed percent-escape', async () => {
    // Express decodes route parameters itself and answers 400 before the
    // handler runs. The handler must therefore NOT decode again — see below.
    expect((await request(`${origin}/uploads/logos/%E0%A4%A.png`)).status).toBe(400);
  });

  it('does not decode the key a second time', async () => {
    // Express has already decoded req.params. A second pass would turn
    // %252e%252e%252f into ../ and walk straight past the provider's traversal
    // check, which is the textbook double-decode bypass.
    const response = await request(`${origin}/uploads/%252e%252e%252fetc%252fpasswd`);

    expect(response.status).toBe(404);
    expect(seenKeys).toContain('%2e%2e%2fetc%2fpasswd');
    expect(seenKeys).not.toContain('../etc/passwd');
  });

  it('sends nosniff, so an uploaded SVG cannot become stored XSS', async () => {
    // An SVG is a script host, and logos are served from the application's own
    // origin.
    const response = await request(`${origin}/uploads/logos/b.svg`);

    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  it('falls back to a neutral content type for an unknown extension', async () => {
    objects.set('logos/c.bin', 'raw');

    expect((await request(`${origin}/uploads/logos/c.bin`)).headers['content-type'])
      .toBe('application/octet-stream');
  });
});
