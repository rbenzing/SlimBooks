/**
 * `POST /api/auth/refresh-token` must verify the signature it is handed.
 *
 * It used to call `jwt.decode()`, which parses the payload without checking
 * anything. The endpoint is unauthenticated by design — an expired token is the
 * credential — so decoding meant an attacker could hand it a self-made token
 * claiming `userId: 1`, the setup administrator, and receive a genuinely signed
 * one in return. No password, no session.
 *
 * The distinction these tests protect is narrow and easy to regress: reject a
 * bad *signature*, accept an expired but properly signed token.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express from 'express';
import jwt from 'jsonwebtoken';
import { request as httpRequest, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type * as ConfigModule from '../config/index.js';

// `vi.hoisted` because the mock factory below is hoisted above ordinary consts;
// referencing a plain `const SECRET` there is a TDZ error at collection time.
const { SECRET } = vi.hoisted(() => ({ SECRET: 'test-signing-secret-for-refresh-tests' }));

// Partial mock: the middleware this controller pulls in reads other config
// exports (validationConfig among them), so replacing the whole module breaks
// collection. Only the signing key needs to be pinned.
vi.mock('../config/index.js', async importOriginal => {
  const actual = await importOriginal<typeof ConfigModule>();
  return { ...actual, authConfig: { ...actual.authConfig, jwtSecret: SECRET } };
});

const getUserById = vi.fn();
const isAccountLocked = vi.fn(() => false);

vi.mock('../services/AuthService.js', () => ({
  authService: {
    getUserById: (id: number) => getUserById(id),
    isAccountLocked: (u: unknown) => isAccountLocked(u)
  }
}));

vi.mock('../services/TokenService.js', () => ({ tokenService: {} }));

const { refreshToken } = await import('./authController.js');
const { errorHandler } = await import('../middleware/errorHandler.js');

interface Fetched { status: number; body: Record<string, unknown>; }

const post = (url: string, payload: unknown): Promise<Fetched> =>
  new Promise((resolve, reject) => {
    const data = Buffer.from(JSON.stringify(payload));
    const req = httpRequest(
      url,
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': data.length } },
      response => {
        const chunks: Buffer[] = [];
        response.on('data', c => chunks.push(Buffer.from(c as Buffer)));
        response.on('end', () => resolve({
          status: response.statusCode ?? 0,
          body: JSON.parse(Buffer.concat(chunks).toString() || '{}')
        }));
      }
    );
    req.on('error', reject);
    req.end(data);
  });

let server: Server;
let origin: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.post('/api/auth/refresh-token', refreshToken);
  app.use(errorHandler);

  await new Promise<void>(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>(resolve => { server.close(() => resolve()); });
});

describe('POST /api/auth/refresh-token', () => {
  it('refuses a token forged with no signing key at all', async () => {
    // Exactly the 2.5.0 attack: assemble a token by hand, claim to be user 1.
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ userId: 1, role: 'admin' })).toString('base64url');
    const forged = `${header}.${payload}.not-a-real-signature`;

    getUserById.mockResolvedValue({ id: 1, email: 'admin@example.com', role: 'admin' });

    const response = await post(`${origin}/api/auth/refresh-token`, { token: forged });

    expect(response.status).toBe(401);
    expect(response.body.token).toBeUndefined();
    // The forgery must be rejected before the user is ever looked up.
    expect(getUserById).not.toHaveBeenCalled();
  });

  it('refuses a token signed with the wrong key', async () => {
    const wrongKey = jwt.sign({ userId: 1 }, 'a-different-secret', { expiresIn: '1h' });

    getUserById.mockResolvedValue({ id: 1, email: 'admin@example.com', role: 'admin' });

    const response = await post(`${origin}/api/auth/refresh-token`, { token: wrongKey });

    expect(response.status).toBe(401);
    expect(getUserById).not.toHaveBeenCalled();
  });

  it('still refreshes a properly signed token that has expired, which is the whole point of the endpoint', async () => {
    const expired = jwt.sign({ userId: 4 }, SECRET, { expiresIn: '-1h' });

    getUserById.mockResolvedValue({ id: 4, email: 'user@example.com', role: 'user' });

    const response = await post(`${origin}/api/auth/refresh-token`, { token: expired });

    expect(response.status).toBe(200);
    expect(getUserById).toHaveBeenCalledWith(4);
    expect(typeof (response.body.data as { token?: string })?.token).toBe('string');
  });
});
