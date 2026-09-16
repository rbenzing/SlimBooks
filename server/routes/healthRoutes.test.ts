/**
 * Health endpoint status codes, over real HTTP.
 *
 * The body always said whether the database was reachable; the status code did
 * not. Every consumer of this endpoint reads the code and not the body — the
 * Dockerfile healthcheck compares against 200, deploy.sh uses `curl -f`, and
 * the SPA's connection monitor checks `response.ok` — so an unreachable
 * database returned a cheerful 200 and traffic kept arriving at an instance
 * that could not serve a request.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express, { type Express } from 'express';
import { request as httpRequest, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Runtime } from '../runtime/types.js';

/** What the stubbed health service reports on the next request. */
let databaseReachable = true;

vi.mock('../services/DatabaseHealthService.js', () => ({
  databaseHealthService: {
    checkDatabaseHealth: () => Promise.resolve(databaseReachable),
    getDetailedHealthData: () => Promise.resolve({
      status: databaseReachable ? 'ok' : 'error',
      database: {
        status: databaseReachable ? 'connected' : 'disconnected',
        counts: { users: 1, clients: 0, invoices: 0, expenses: 0 }
      }
    })
  }
}));

const { createHealthRoutes } = await import('./healthRoutes.js');

const runtime = {
  features: { pdf: true, email: false, stripe: false, scheduler: true },
  pdf: { name: 'puppeteer' },
  listener: { tls: 'off' }
} as unknown as Runtime;

interface Fetched { status: number; body: Record<string, unknown>; }

const call = (url: string): Promise<Fetched> =>
  new Promise((resolve, reject) => {
    const req = httpRequest(url, { method: 'GET' }, response => {
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
  app.use('/api/health', createHealthRoutes(runtime));

  await new Promise<void>(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>(resolve => { server.close(() => resolve()); });
});

describe('GET /api/health', () => {
  it('answers 200 while the database is reachable', async () => {
    databaseReachable = true;

    const response = await call(`${origin}/api/health`);

    expect(response.status).toBe(200);
    expect(response.body.database).toBe('connected');
  });

  it('answers 503 when the database is unreachable, so a load balancer stops routing here', async () => {
    databaseReachable = false;

    const response = await call(`${origin}/api/health`);

    expect(response.status).toBe(503);
    expect(response.body.database).toBe('disconnected');
    expect(response.body.status).toBe('error');
  });
});

describe('GET /api/health/detailed', () => {
  it('answers 200 while the database is reachable', async () => {
    databaseReachable = true;

    expect((await call(`${origin}/api/health/detailed`)).status).toBe(200);
  });

  it('answers 503 when the database is unreachable', async () => {
    databaseReachable = false;

    expect((await call(`${origin}/api/health/detailed`)).status).toBe(503);
  });
});
