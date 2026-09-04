/**
 * Drives the real `POST /company` and `GET /company` handlers over real HTTP,
 * on the pattern `uploadsRoute.test.ts` establishes: an express app on a
 * listening socket, not a stub `res` object, so status codes and the JSON body
 * are exercised the way a browser actually receives them.
 *
 * This is the route that lost `fiscalYearStartMonth` and `accountingMethod`.
 * The frontend forwards both (`useSettings.hook.ts`'s `transformSave`), and
 * that half was verified by two separate task reviews on this branch — but
 * `POST /company` destructured only the nine original fields and silently
 * dropped everything else, so a saved fiscal year vanished on the very next
 * reload. Live-clicked in a real browser: set the fiscal year to July, Save,
 * reload — back to January. No unit test caught it because none exercised the
 * server's own request-body handling; every prior check stopped at "the
 * frontend sends the field" or "the frontend blob has a slot for it".
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express from 'express';
import { request as httpRequest, type Server } from 'node:http';
import type * as MiddlewareModule from '../middleware/index.js';
import type { AddressInfo } from 'node:net';

const { saveSetting, getSettingByKey } = vi.hoisted(() => ({
  saveSetting: vi.fn().mockResolvedValue(undefined),
  getSettingByKey: vi.fn().mockResolvedValue(null)
}));

vi.mock('../services/SettingsService.js', () => ({
  settingsService: { saveSetting, getSettingByKey }
}));

// Auth is not what this test is about, and a real JWT round trip would only
// add noise: the route is reached, always, as an authenticated admin. Every
// other export (asyncHandler included — the controller module needs it) is
// passed through untouched.
vi.mock('../middleware/index.js', async (importOriginal) => {
  const actual = await importOriginal<MiddlewareModule>();
  return {
    ...actual,
    requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
    requireAdmin: (_req: unknown, _res: unknown, next: () => void) => next()
  };
});

const { default: settingsRoutes } = await import('./settingsRoutes.js');

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

const getJson = (url: string): Promise<Fetched> =>
  new Promise((resolve, reject) => {
    // Unlike node:http's `get`, `request` never fires on its own — an
    // omitted `.end()` here is a silent hang, not an error, which is what
    // timed out on the first pass at this helper.
    const req = httpRequest(url, response => {
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

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/settings', settingsRoutes);

  await new Promise<void>(resolve => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>(resolve => server.close(() => resolve())));

describe('POST /api/settings/company', () => {
  it('persists fiscalYearStartMonth and accountingMethod in the saved object', async () => {
    saveSetting.mockClear();

    const res = await postJson(`${origin}/api/settings/company`, {
      companyName: 'Verify Co',
      fiscalYearStartMonth: 7,
      accountingMethod: 'cash'
    });

    expect(res.status).toBe(200);
    expect(saveSetting).toHaveBeenCalledTimes(1);

    const [key, savedValue, category] = saveSetting.mock.calls[0] as [string, Record<string, unknown>, string];
    expect(key).toBe('company_settings');
    expect(category).toBe('company');
    expect(savedValue.fiscalYearStartMonth).toBe(7);
    expect(savedValue.accountingMethod).toBe('cash');
  });

  it('falls back to January/accrual for a missing or malformed value, rather than dropping the field', async () => {
    saveSetting.mockClear();

    await postJson(`${origin}/api/settings/company`, { companyName: 'No Fiscal Fields' });

    const [, savedValue] = saveSetting.mock.calls[0] as [string, Record<string, unknown>];
    expect(savedValue.fiscalYearStartMonth).toBe(1);
    expect(savedValue.accountingMethod).toBe('accrual');
  });

  it('rejects a fiscal month outside 1-12 rather than storing it verbatim', async () => {
    saveSetting.mockClear();

    await postJson(`${origin}/api/settings/company`, {
      companyName: 'Bad Month',
      fiscalYearStartMonth: 13,
      accountingMethod: 'cash'
    });

    const [, savedValue] = saveSetting.mock.calls[0] as [string, Record<string, unknown>];
    expect(savedValue.fiscalYearStartMonth).toBe(1);
  });

  it('still requires a company name, unaffected by the fiscal fields', async () => {
    saveSetting.mockClear();

    const res = await postJson(`${origin}/api/settings/company`, { fiscalYearStartMonth: 7 });

    expect(res.status).toBe(400);
    expect(saveSetting).not.toHaveBeenCalled();
  });
});

describe('GET /api/settings/company', () => {
  it('defaults an unconfigured install to January/accrual rather than an absent field', async () => {
    getSettingByKey.mockResolvedValueOnce(null);

    const res = await getJson(`${origin}/api/settings/company`);

    expect(res.status).toBe(200);
    expect(res.body.value).toMatchObject({ fiscalYearStartMonth: 1, accountingMethod: 'accrual' });
  });

  it('returns whatever was actually stored', async () => {
    getSettingByKey.mockResolvedValueOnce({
      companyName: 'Verify Co', fiscalYearStartMonth: 7, accountingMethod: 'cash'
    });

    const res = await getJson(`${origin}/api/settings/company`);

    expect(res.body.value).toMatchObject({ fiscalYearStartMonth: 7, accountingMethod: 'cash' });
  });
});
