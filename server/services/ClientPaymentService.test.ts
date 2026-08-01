/**
 * ClientService and PaymentService tests.
 *
 * Both are thin over SQL, so the assertions that matter are the guards that run
 * before a write and the exact columns each statement names. `clients.zipCode`
 * and the payment column collapse both shipped bugs in these statements.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createDatabaseMock, insertColumnsOf, flattenSql } from './databaseMock.test-helper.js';

const db = createDatabaseMock();
vi.mock('../core/DatabaseService.js', () => ({ databaseService: db }));

const { clientService } = await import('./ClientService.js');
const { paymentService } = await import('./PaymentService.js');

beforeEach(() => db.reset());

const validClient = {
  name: 'Acme Corporation',
  email: 'contact@acme.com',
  phone: '(555) 123-4567',
  address: '123 Business St',
  city: 'Business City',
  state: 'CA',
  zipCode: '90210',
  country: 'US'
};

describe('ClientService.createClient', () => {
  it('writes the postal code to the zipCode column', async () => {
    await clientService.createClient(validClient);

    const { sql, params } = db.queries[0];
    const columns = insertColumnsOf(sql);
    expect(columns).toContain('zipCode');
    expect(columns).not.toContain('zip');
    expect(params[columns.indexOf('zipCode')]).toBe('90210');
  });

  it('binds one parameter per column', async () => {
    await clientService.createClient(validClient);

    const { sql, params } = db.queries[0];
    expect(params).toHaveLength(insertColumnsOf(sql).length);
  });

  it('requires a name', async () => {
    await expect(clientService.createClient({ ...validClient, name: '' })).rejects.toThrow(/name/i);
  });

  it('rejects a malformed email', async () => {
    await expect(
      clientService.createClient({ ...validClient, email: 'not-an-email' })
    ).rejects.toThrow(/email/i);
  });

  it('rejects a duplicate email', async () => {
    db.getOne.mockReturnValue({ id: 7 });
    await expect(clientService.createClient(validClient)).rejects.toThrow(/already exists/i);
  });

  it('allows a client with no email at all', async () => {
    await expect(clientService.createClient({ ...validClient, email: undefined })).resolves.toBeDefined();
  });

  it('writes nothing when validation fails', async () => {
    await expect(clientService.createClient({ ...validClient, name: '' })).rejects.toThrow();
    expect(db.queries).toHaveLength(0);
  });
});

describe('ClientService.updateClient', () => {
  beforeEach(() => {
    db.getOne.mockReturnValue({ id: 1, name: 'Acme', email: 'contact@acme.com' });
  });

  it('lets zipCode through the allowed-fields whitelist', async () => {
    // A field missing from this list is silently discarded.
    await clientService.updateClient(1, { zipCode: '10001' });

    expect(db.updateRecord).toHaveBeenCalledWith(
      'clients',
      1,
      expect.objectContaining({ zipCode: '10001' })
    );
  });

  it('rejects an update to a missing client', async () => {
    db.getOne.mockReturnValue(undefined);
    await expect(clientService.updateClient(1, { name: 'New' })).rejects.toThrow(/not found/i);
  });

  it('rejects an invalid id', async () => {
    await expect(clientService.updateClient(0, { name: 'New' })).rejects.toThrow(/id/i);
  });
});

describe('PaymentService.createPayment', () => {
  const validPayment = {
    date: '2026-07-01',
    client_name: 'Tech Solutions LLC',
    amount: 2700,
    method: 'bank_transfer',
    reference: 'TXN-12345',
    description: 'Payment received'
  };

  it('writes the collapsed column set, not the retired duplicates', async () => {
    await paymentService.createPayment(validPayment);

    const columns = insertColumnsOf(db.queries[0].sql);
    expect(columns).toEqual(expect.arrayContaining(['client_name', 'reference', 'description']));
    // These were merged away by migration 008.
    expect(columns).not.toContain('client_id');
    expect(columns).not.toContain('transaction_id');
    expect(columns).not.toContain('notes');
  });

  it('binds one parameter per column', async () => {
    await paymentService.createPayment(validPayment);

    const { sql, params } = db.queries[0];
    expect(params).toHaveLength(insertColumnsOf(sql).length);
  });

  it('requires date, client_name, amount and method', async () => {
    for (const missing of ['date', 'client_name', 'amount', 'method'] as const) {
      const payload = { ...validPayment, [missing]: undefined };
      await expect(paymentService.createPayment(payload as never)).rejects.toThrow();
    }
  });

  it('rejects a non-positive amount', async () => {
    await expect(paymentService.createPayment({ ...validPayment, amount: 0 })).rejects.toThrow(/amount|required/i);
    await expect(paymentService.createPayment({ ...validPayment, amount: -5 })).rejects.toThrow(/positive/i);
  });

  it('rejects a malformed date', async () => {
    await expect(
      paymentService.createPayment({ ...validPayment, date: 'yesterday' })
    ).rejects.toThrow(/date/i);
  });

  it('rejects an invoice_id that does not exist', async () => {
    db.exists.mockReturnValue(false);
    await expect(
      paymentService.createPayment({ ...validPayment, invoice_id: 999 })
    ).rejects.toThrow(/invoice/i);
  });

  it('accepts an invoice_id that does exist', async () => {
    db.exists.mockReturnValue(true);
    await expect(
      paymentService.createPayment({ ...validPayment, invoice_id: 2 })
    ).resolves.toBeDefined();
  });

  it('writes nothing when validation fails', async () => {
    await expect(paymentService.createPayment({ ...validPayment, amount: -1 })).rejects.toThrow();
    expect(db.queries).toHaveLength(0);
  });
});

describe('PaymentService.getAllPayments', () => {
  it('queries without a WHERE clause when unfiltered', async () => {
    await paymentService.getAllPayments();
    expect(flattenSql(db.getMany.mock.calls[0][0] as string)).not.toMatch(/WHERE/);
  });

  it('filters by status', async () => {
    await paymentService.getAllPayments({ status: 'received' });

    const [sql, params] = db.getMany.mock.calls[0];
    expect(flattenSql(sql as string)).toMatch(/WHERE/);
    expect(params).toContain('received');
  });
});
