/**
 * Access-control regressions, over real HTTP.
 *
 * Every case here corresponds to a defect that was live in 2.5.0. They are
 * grouped in one file because they share a harness, and because the thing worth
 * protecting is the boundary itself: each of these endpoints was reachable by
 * someone who should not have reached it.
 *
 * The router is mounted over a stubbed auth middleware rather than a real
 * database, because what is under test is the middleware *chain* on each route —
 * whether `requireAdmin` is present at all — not what the controller does once
 * it is past the guard.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express, { type Express } from 'express';
import { request as httpRequest, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

/** The role the stubbed auth middleware will attach to the next request. */
let actingRole: 'admin' | 'user' = 'user';

vi.mock('../middleware/auth.js', () => ({
  requireAuth: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (req as express.Request & { user?: unknown }).user = { id: 7, role: actingRole };
    next();
  },
  requireAdmin: (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const user = (req as express.Request & { user?: { role?: string } }).user;
    if (user?.role !== 'admin') {
      res.status(403).json({ success: false, error: 'Admin access required' });
      return;
    }
    next();
  }
}));

const exportDatabase = vi.fn((_req: express.Request, res: express.Response) =>
  res.json({ success: true, reached: 'export' })
);
const importDatabase = vi.fn((_req: express.Request, res: express.Response) =>
  res.json({ success: true, reached: 'import' })
);

vi.mock('../controllers/databaseController.js', () => ({
  exportDatabase: (req: express.Request, res: express.Response) => exportDatabase(req, res),
  importDatabase: (req: express.Request, res: express.Response) => importDatabase(req, res)
}));

const { default: databaseRoutes } = await import('./databaseRoutes.js');

interface Fetched { status: number; body: Record<string, unknown>; }

const call = (url: string, method = 'GET'): Promise<Fetched> =>
  new Promise((resolve, reject) => {
    const req = httpRequest(url, { method }, response => {
      const chunks: Buffer[] = [];
      response.on('data', c => chunks.push(Buffer.from(c as Buffer)));
      response.on('end', () => resolve({
        status: response.statusCode ?? 0,
        body: JSON.parse(Buffer.concat(chunks).toString() || '{}')
      }));
    });
    req.on('error', reject);
    req.end();
  });

let server: Server;
let origin: string;

beforeAll(async () => {
  const app: Express = express();
  app.use(express.json());
  app.use('/api/db', databaseRoutes);

  await new Promise<void>(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>(resolve => { server.close(() => resolve()); });
});

describe('database export/import require admin', () => {
  it('refuses a non-admin export, so a plain user cannot read every bcrypt hash', async () => {
    actingRole = 'user';

    const response = await call(`${origin}/api/db/export`);

    expect(response.status).toBe(403);
    expect(exportDatabase).not.toHaveBeenCalled();
  });

  it('refuses a non-admin import, so a plain user cannot replace the database with one where they are admin', async () => {
    actingRole = 'user';

    const response = await call(`${origin}/api/db/import`, 'POST');

    expect(response.status).toBe(403);
    expect(importDatabase).not.toHaveBeenCalled();
  });

  it('still lets an admin through', async () => {
    actingRole = 'admin';

    const response = await call(`${origin}/api/db/export`);

    expect(response.status).toBe(200);
    expect(response.body.reached).toBe('export');
  });
});
