/**
 * Template route validation tests.
 *
 * Both template route files carried `// TODO: Add validation` on every handler,
 * so an authenticated caller could post any shape at them. These tests run the
 * real express-validator chains against representative payloads.
 *
 * Note `recurring_invoice_templates` has `is_active` (0/1) and no `status`
 * column, so the recurring set validates `is_active` and ignores `status`.
 */

import { describe, it, expect } from 'vitest';
import type { Request, Response } from 'express';
import { validationSets, validateRequest } from './validation.js';

/** Runs a validation set against a request and reports the resulting errors. */
const runValidation = async (
  set: ReturnType<() => typeof validationSets.createRecurringTemplate>,
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

const validRecurring = {
  name: 'Monthly retainer',
  client_id: 7,
  amount: 1200,
  frequency: 'monthly',
  payment_terms: 'net_30',
  next_invoice_date: '2026-09-01'
};

describe('createRecurringTemplate validation', () => {
  it('accepts a well-formed template', async () => {
    const result = await runValidation(validationSets.createRecurringTemplate, {
      body: { templateData: validRecurring }
    });

    expect(result.ok).toBe(true);
  });

  it('rejects a missing name', async () => {
    const { name: _omitted, ...rest } = validRecurring;
    const result = await runValidation(validationSets.createRecurringTemplate, {
      body: { templateData: rest }
    });

    expect(result.ok).toBe(false);
    expect(result.fields.join(',')).toContain('name');
  });

  it('rejects an unsupported frequency', async () => {
    const result = await runValidation(validationSets.createRecurringTemplate, {
      body: { templateData: { ...validRecurring, frequency: 'fortnightly' } }
    });

    expect(result.ok).toBe(false);
    expect(result.fields.join(',')).toContain('frequency');
  });

  it('rejects a zero or negative amount', async () => {
    for (const amount of [0, -5]) {
      const result = await runValidation(validationSets.createRecurringTemplate, {
        body: { templateData: { ...validRecurring, amount } }
      });
      expect(result.ok).toBe(false);
    }
  });

  it('rejects a non-numeric client id', async () => {
    const result = await runValidation(validationSets.createRecurringTemplate, {
      body: { templateData: { ...validRecurring, client_id: 'seven' } }
    });

    expect(result.ok).toBe(false);
    expect(result.fields.join(',')).toContain('client_id');
  });

  it('rejects a malformed next invoice date', async () => {
    const result = await runValidation(validationSets.createRecurringTemplate, {
      body: { templateData: { ...validRecurring, next_invoice_date: 'next tuesday' } }
    });

    expect(result.ok).toBe(false);
    expect(result.fields.join(',')).toContain('next_invoice_date');
  });

  it('accepts is_active as the schedule flag', async () => {
    const result = await runValidation(validationSets.createRecurringTemplate, {
      body: { templateData: { ...validRecurring, is_active: false } }
    });

    expect(result.ok).toBe(true);
  });

  it('rejects a non-boolean is_active', async () => {
    const result = await runValidation(validationSets.createRecurringTemplate, {
      body: { templateData: { ...validRecurring, is_active: 'active' } }
    });

    expect(result.ok).toBe(false);
  });
});

describe('updateRecurringTemplate validation', () => {
  it('accepts a partial update with a valid id', async () => {
    const result = await runValidation(validationSets.updateRecurringTemplate, {
      params: { id: '3' },
      body: { templateData: { amount: 1500 } }
    });

    expect(result.ok).toBe(true);
  });

  it('rejects a non-numeric id', async () => {
    const result = await runValidation(validationSets.updateRecurringTemplate, {
      params: { id: 'abc' },
      body: { templateData: { amount: 1500 } }
    });

    expect(result.ok).toBe(false);
    expect(result.fields.join(',')).toContain('id');
  });

  it('still rejects an invalid field in a partial update', async () => {
    const result = await runValidation(validationSets.updateRecurringTemplate, {
      params: { id: '3' },
      body: { templateData: { frequency: 'hourly' } }
    });

    expect(result.ok).toBe(false);
  });
});

describe('design template validation', () => {
  it('accepts a well-formed design template', async () => {
    const result = await runValidation(validationSets.createTemplate, {
      body: { templateData: { name: 'Modern Blue', content: '<html></html>' } }
    });

    expect(result.ok).toBe(true);
  });

  it('rejects empty content', async () => {
    const result = await runValidation(validationSets.createTemplate, {
      body: { templateData: { name: 'Modern Blue', content: '' } }
    });

    expect(result.ok).toBe(false);
    expect(result.fields.join(',')).toContain('content');
  });

  it('rejects a one-character name', async () => {
    const result = await runValidation(validationSets.createTemplate, {
      body: { templateData: { name: 'X', content: '<html></html>' } }
    });

    expect(result.ok).toBe(false);
  });

  it('rejects a non-numeric id on delete', async () => {
    const result = await runValidation(validationSets.deleteTemplate, {
      params: { id: 'not-an-id' }
    });

    expect(result.ok).toBe(false);
  });
});
