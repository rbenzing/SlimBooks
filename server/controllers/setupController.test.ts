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
import { createAuthRoutes } from '../routes/authRoutes.js';
import type { Runtime } from '../runtime/types.js';
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
  // Registration is feature-gated, so the router is a factory now. These tests
  // exercise login rather than registration; signup on keeps the mount identical
  // to a default install.
  app.use('/api/auth', createAuthRoutes({ features: { signup: true } } as Runtime));
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

  it('repairs an orphaned claim left by a deleted admin, and creates a new one', async () => {
    await postJson(`${origin}/api/setup`, validPayload);

    // Simulate an operator deleting the users table directly while the claim
    // row survives — the exact scenario that used to strand an install.
    await db.executeQuery('DELETE FROM users');

    const res = await postJson(`${origin}/api/setup`, {
      name: 'Grace Admin', email: 'grace@example.com', username: 'grace', password: 'correct horse battery staple'
    });

    expect(res.status).toBe(201);
    const data = res.body.data as { user: { email: string } };
    expect(data.user.email).toBe('grace@example.com');

    const count = await db.getOne<{ count: number }>('SELECT COUNT(*) as count FROM users');
    expect(count?.count).toBe(1);
  });

  it('treats a legacy true-valued claim on an empty users table as orphaned', async () => {
    // 2.4.0's claim row stored the literal string "true", not a user id.
    // A pre-existing install upgrading into this code must not be stranded
    // by its own old claim row.
    await db.executeQuery(
      "INSERT INTO settings (`key`, value, category, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      ['setup.admin_created', JSON.stringify(true), 'setup', Date.now(), Date.now()]
    );

    const res = await postJson(`${origin}/api/setup`, validPayload);

    expect(res.status).toBe(201);
  });

  it('treats a persisted "pending" claim as in-flight, never orphaned', async () => {
    // 'pending' is the placeholder completeSetup's transaction writes before
    // it inserts the admin and overwrites it with the real user id. It can
    // only be *read back* by another request while that transaction is
    // genuinely still open on the process's single shared SQLite connection
    // — a crash rolls the whole transaction back, taking the placeholder
    // with it, so a persisted 'pending' always means someone else is mid-claim
    // right now. This test drives repairOrphanedClaim to that exact durable
    // state directly (rather than timing two real concurrent requests, which
    // would be flaky) to prove it no longer treats 'pending' the same as an
    // orphaned claim: before the fix, Number('pending') is NaN, the users
    // table is still empty, and the claim was deleted out from under the
    // in-progress request — opening the door to a second admin. With the
    // fix, the claim survives, so the INSERT IGNORE below collides with it
    // and the request is refused with a clean 409, exactly as if the first
    // request's transaction were still genuinely in flight.
    await db.executeQuery(
      "INSERT INTO settings (`key`, value, category, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      ['setup.admin_created', 'pending', 'setup', Date.now(), Date.now()]
    );

    const res = await postJson(`${origin}/api/setup`, validPayload);

    expect(res.status).toBe(409);
    const count = await db.getOne<{ count: number }>('SELECT COUNT(*) as count FROM users');
    expect(count?.count).toBe(0);
  });

  it('still refuses a second submission when the claimed admin genuinely exists', async () => {
    await postJson(`${origin}/api/setup`, validPayload);

    const second = await postJson(`${origin}/api/setup`, {
      name: 'Grace Admin', email: 'grace@example.com', username: 'grace', password: 'correct horse battery staple'
    });

    expect(second.status).toBe(409);
    const count = await db.getOne<{ count: number }>('SELECT COUNT(*) as count FROM users');
    expect(count?.count).toBe(1);
  });

  it('lets exactly one of two simultaneous submissions through', async () => {
    const [first, second] = await Promise.all([
      postJson(`${origin}/api/setup`, validPayload),
      postJson(`${origin}/api/setup`, {
        name: 'Grace Admin', email: 'grace@example.com', username: 'grace', password: 'correct horse battery staple'
      })
    ]);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([201, 409]);

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
