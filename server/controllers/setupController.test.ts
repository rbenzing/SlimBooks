/**
 * The setup bootstrap, over real HTTP against a real, freshly built database.
 *
 * `initializeAllSeeds` no longer creates an admin — the whole point of this
 * feature. This proves the replacement end to end: a fresh install reports
 * `needsSetup: true`, `POST /api/setup` creates the admin and returns a
 * working token, `needsSetup` flips to `false`, and a second submission is
 * refused rather than creating a second admin.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import { request as httpRequest, type Server } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { initializeDatabase, db } from '../database/index.js';
import setupRoutes from '../routes/setupRoutes.js';
import authRoutes from '../routes/authRoutes.js';
import { errorHandler, notFoundHandler } from '../middleware/index.js';

interface Fetched {
  status: number;
  body: Record<string, unknown>;
}

const postJson = (url: string, payload: unknown): Promise<Fetched> =>
  new Promise((resolve, reject) => {
    const data = Buffer.from(JSON.stringify(payload));
    const req = httpRequest(
      url,
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': data.length } },
      response => {
        const chunks: Buffer[] = [];
        response.on('data', chunk => chunks.push(Buffer.from(chunk as Buffer)));
        response.on('end', () =>
          resolve({ status: response.statusCode ?? 0, body: JSON.parse(Buffer.concat(chunks).toString() || '{}') })
        );
      }
    );
    req.on('error', reject);
    req.end(data);
  });

const getJson = (url: string, headers: Record<string, string> = {}): Promise<Fetched> =>
  new Promise((resolve, reject) => {
    const req = httpRequest(url, { headers }, response => {
      const chunks: Buffer[] = [];
      response.on('data', chunk => chunks.push(Buffer.from(chunk as Buffer)));
      response.on('end', () =>
        resolve({ status: response.statusCode ?? 0, body: JSON.parse(Buffer.concat(chunks).toString() || '{}') })
      );
    });
    req.on('error', reject);
    req.end();
  });

let server: Server;
let origin: string;
let dataDir: string;

beforeEach(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'slimbooks-setup-'));
  const dbFile = join(dataDir, 'test.db');

  await initializeDatabase({
    paths: { dataDir, dbFile },
    database: { driver: 'sqlite', file: dbFile, timeoutMs: 5000 }
  });

  const app = express();
  app.use(express.json());
  app.use('/api/setup', setupRoutes);
  app.use('/api/auth', authRoutes);
  // Without these, a thrown ValidationError falls through to Express's
  // default HTML error page — asyncHandler forwards it via next(error), and
  // nothing here would turn it back into the JSON 400 the controller intends.
  // Mirrors the mount order in app.ts.
  app.use(notFoundHandler);
  app.use(errorHandler);

  await new Promise<void>(resolve => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()));
  await db.disconnect();
  rmSync(dataDir, { recursive: true, force: true });
});

describe('GET /api/setup/status', () => {
  it('reports needsSetup: true on a fresh database', async () => {
    const res = await getJson(`${origin}/api/setup/status`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, data: { needsSetup: true } });
  });
});

describe('POST /api/setup', () => {
  const validPayload = {
    name: 'Ada Admin',
    email: 'ada@example.com',
    username: 'ada',
    password: 'correct horse battery staple'
  };

  it('creates the first administrator and returns a usable token', async () => {
    const res = await postJson(`${origin}/api/setup`, validPayload);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);

    const data = res.body.data as { user: { role: string; email: string }; token: string };
    expect(data.user.role).toBe('admin');
    expect(data.user.email).toBe('ada@example.com');
    expect(typeof data.token).toBe('string');

    const profile = await getJson(`${origin}/api/auth/profile`, { Authorization: `Bearer ${data.token}` });
    expect(profile.status).toBe(200);
  });

  it('flips needsSetup to false after the first admin is created', async () => {
    await postJson(`${origin}/api/setup`, validPayload);

    const status = await getJson(`${origin}/api/setup/status`);
    expect(status.body).toMatchObject({ data: { needsSetup: false } });
  });

  it('refuses a second submission rather than creating a second admin', async () => {
    await postJson(`${origin}/api/setup`, validPayload);

    const second = await postJson(`${origin}/api/setup`, {
      name: 'Grace Admin', email: 'grace@example.com', username: 'grace', password: 'correct horse battery staple'
    });

    expect(second.status).toBe(409);

    const count = await db.getOne<{ count: number }>('SELECT COUNT(*) as count FROM users');
    expect(count?.count).toBe(1);
  });

  it('rejects a missing field with 400 and creates nothing', async () => {
    const res = await postJson(`${origin}/api/setup`, { name: 'Ada Admin', email: 'ada@example.com' });

    expect(res.status).toBe(400);

    const status = await getJson(`${origin}/api/setup/status`);
    expect(status.body).toMatchObject({ data: { needsSetup: true } });
  });
});
