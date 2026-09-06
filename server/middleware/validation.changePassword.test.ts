/**
 * `POST /api/auth/change-password` validation tests.
 *
 * The route used to run no validation middleware at all: any non-empty
 * `newPassword` reached the controller, bypassing the DB-backed password
 * policy that every other password-setting path enforces. These tests
 * exercise `validationSets.changePassword` directly against a stubbed
 * policy, run through the real express-validator chain the same way
 * templateValidation.test.ts does, and stub `SettingsService` the same way
 * userController.password.test.ts does for `resetUserPassword`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

const getPasswordPolicy = vi.fn();

vi.mock('../services/SettingsService.js', () => ({ settingsService: { getPasswordPolicy } }));

const { validationSets, validateRequest } = await import('./validation.js');

/** Runs a validation set against a request and reports the resulting errors. */
const runValidation = async (
  set: typeof validationSets.changePassword,
  req: Partial<Request>
): Promise<{ ok: boolean; fields: string[] }> => {
  const request = { body: {}, params: {}, query: {}, headers: {}, ...req } as Request;

  for (const chain of set) {
    await chain.run(request);
  }

  let status: number | null = null;
  let payload: { details?: Array<{ path?: string; param?: string }> } | null = null;

  const res = {
    status(code: number) { status = code; return res; },
    json(body: unknown) { payload = body as typeof payload; return res; }
  } as unknown as Response;

  validateRequest(request, res, () => { status = null; });

  return {
    ok: status === null,
    fields: (payload?.details ?? []).map(d => d.path ?? d.param ?? '')
  };
};

beforeEach(() => {
  vi.clearAllMocks();
  getPasswordPolicy.mockResolvedValue({
    min_length: 8,
    require_uppercase: true,
    require_lowercase: true,
    require_numbers: true,
    require_special: true
  });
});

describe('changePassword validation', () => {
  it('rejects a newPassword that violates the configured policy', async () => {
    const result = await runValidation(validationSets.changePassword, {
      body: { currentPassword: 'whatever-the-current-one-is', newPassword: 'alllowercase' }
    });

    expect(result.ok).toBe(false);
    expect(result.fields.join(',')).toContain('newPassword');
  });

  it('accepts a newPassword that satisfies the configured policy', async () => {
    const result = await runValidation(validationSets.changePassword, {
      body: { currentPassword: 'whatever-the-current-one-is', newPassword: 'Str0ng!Passphrase' }
    });

    expect(result.ok).toBe(true);
  });
});
