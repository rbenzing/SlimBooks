/**
 * `POST /api/pdf/page` origin restriction, over real HTTP.
 *
 * This endpoint hands a URL from the request body to a real headless browser
 * and returns what it rendered. Unrestricted, that is server-side request
 * forgery any signed-in user could drive: the browser runs inside the network
 * perimeter, so cloud instance metadata, internal admin panels and anything
 * else the host can reach came back as a downloadable PDF.
 *
 * The only URL the application itself ever sends is a report page on its own
 * origin, so that is all the route accepts.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express, { type Express } from 'express';
import { request as httpRequest, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Runtime } from '../runtime/types.js';

vi.mock('../middleware/auth.js', () => ({
  requireAuth: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (req as express.Request & { user?: unknown }).user = { id: 7, role: 'user' };
    next();
  },
  requireAdmin: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next()
}));

const generatePagePDF = vi.fn((_req: express.Request, res: express.Response) =>
  res.json({ success: true, reached: 'generate' })
);

vi.mock('../controllers/pdfController.js', () => ({
  downloadInvoicePDF: (_req: express.Request, res: express.Response) => res.json({ ok: true }),
  downloadPublicInvoicePDF: (_req: express.Request, res: express.Response) => res.json({ ok: true }),
  generatePagePDF: (req: express.Request, res: express.Response) => generatePagePDF(req, res),
  getPDFServiceStatus: (_req: express.Request, res: express.Response) => res.json({ ok: true }),
  initializePDFService: (_req: express.Request, res: express.Response) => res.json({ ok: true }),
  updatePDFFormat: (_req: express.Request, res: express.Response) => res.json({ ok: true }),
  getPDFFormat: (_req: express.Request, res: express.Response) => res.json({ ok: true })
}));

const { createPdfRoutes } = await import('./pdfRoutes.js');

const runtime = { urls: { publicUrl: 'https://books.example.com' } } as unknown as Runtime;

interface Fetched { status: number; body: Record<string, unknown>; }

const postPage = (origin: string, url: unknown): Promise<Fetched> =>
  new Promise((resolve, reject) => {
    const payload = JSON.stringify({ url });
    const req = httpRequest(
      `${origin}/api/pdf/page`,
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } },
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
    req.end(payload);
  });

let server: Server;
let origin: string;

beforeAll(async () => {
  const app: Express = express();
  app.use(express.json());
  app.use('/api/pdf', createPdfRoutes(runtime));

  await new Promise<void>(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>(resolve => { server.close(() => resolve()); });
});

describe('POST /api/pdf/page refuses anything but this installation', () => {
  const refused: ReadonlyArray<[string, string]> = [
    ['cloud instance metadata', 'http://169.254.169.254/latest/meta-data/iam/security-credentials/'],
    ['a bare metadata IP with no scheme', '169.254.169.254'],
    ['an internal service', 'http://127.0.0.1:6379/'],
    ['an arbitrary external site', 'https://attacker.example/collect'],
    ['a local file', 'file:///etc/passwd'],
    ['a lookalike host with the origin as a prefix', 'https://books.example.com.attacker.example/x'],
    ['the right host on another port', 'https://books.example.com:8443/reports'],
    ['the right host over plain http', 'http://books.example.com/reports']
  ];

  for (const [what, url] of refused) {
    it(`refuses ${what}`, async () => {
      generatePagePDF.mockClear();

      const response = await postPage(origin, url);

      expect(response.status).toBe(400);
      expect(generatePagePDF).not.toHaveBeenCalled();
    });
  }

  it('refuses a lookalike host even when it is a valid public hostname', async () => {
    generatePagePDF.mockClear();

    const response = await postPage(origin, 'https://books.example.com.attacker.example/reports');

    expect(response.status).toBe(400);
    expect(generatePagePDF).not.toHaveBeenCalled();
  });

  it('still renders a report page on this installation', async () => {
    generatePagePDF.mockClear();

    const response = await postPage(
      origin,
      'https://books.example.com/reports/profit-loss?start=2026-01-01&end=2026-12-31'
    );

    expect(response.status).toBe(200);
    expect(response.body.reached).toBe('generate');
  });
});

/**
 * A development install, and any deployment reached by bare hostname.
 *
 * The origin check was first written with express-validator's isURL defaults,
 * which include `require_tld: true` — and `localhost` has no TLD. Every test
 * above passed, because they all use a public hostname, while the feature was
 * broken for exactly the installs most likely to use it. A live boot against
 * CLIENT_URL=http://localhost:3099 is what caught it.
 */
describe('POST /api/pdf/page on an installation reached by bare hostname', () => {
  let localServer: Server;
  let localOrigin: string;

  beforeAll(async () => {
    const app: Express = express();
    app.use(express.json());
    app.use('/api/pdf', createPdfRoutes(
      { urls: { publicUrl: 'http://localhost:3099' } } as unknown as Runtime
    ));

    await new Promise<void>(resolve => { localServer = app.listen(0, '127.0.0.1', resolve); });
    localOrigin = `http://127.0.0.1:${(localServer.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>(resolve => { localServer.close(() => resolve()); });
  });

  it('renders its own report page', async () => {
    generatePagePDF.mockClear();

    const response = await postPage(localOrigin, 'http://localhost:3099/reports/profit-loss');

    expect(response.status).toBe(200);
    expect(generatePagePDF).toHaveBeenCalled();
  });

  it('still refuses instance metadata', async () => {
    generatePagePDF.mockClear();

    const response = await postPage(localOrigin, 'http://169.254.169.254/latest/meta-data/');

    expect(response.status).toBe(400);
    expect(generatePagePDF).not.toHaveBeenCalled();
  });

  it('still refuses another port on the same host', async () => {
    generatePagePDF.mockClear();

    const response = await postPage(localOrigin, 'http://localhost:6379/');

    expect(response.status).toBe(400);
    expect(generatePagePDF).not.toHaveBeenCalled();
  });
});
