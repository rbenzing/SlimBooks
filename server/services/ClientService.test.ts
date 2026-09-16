/**
 * ClientService tests — the surface beyond create/update, which
 * ClientPaymentService.test.ts already covers.
 *
 * Two properties are asserted across every read: soft-deleted clients stay
 * hidden (a client "deleted" from one screen must not reappear in another),
 * and no query interpolates a value into its SQL text.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createDatabaseMock, flattenSql } from './databaseMock.test-helper.js';
import { isEpochMillis } from '../utils/utcTime.util.js';

const db = createDatabaseMock();
vi.mock('../core/DatabaseService.js', () => ({ databaseService: db }));

const { clientService } = await import('./ClientService.js');

/** Every read that lists or counts clients, with the call that triggers it. */
const CLIENT_READS = [
  { name: 'getAllClients', run: () => clientService.getAllClients() },
  { name: 'getActiveClients', run: () => clientService.getActiveClients() },
  { name: 'searchClients', run: () => clientService.searchClients('acme') },
  { name: 'getClientsByCountry', run: () => clientService.getClientsByCountry('US') },
  { name: 'getClientsWithRecentActivity', run: () => clientService.getClientsWithRecentActivity(30) }
];

beforeEach(() => db.reset());

describe('soft-deleted clients stay hidden', () => {
  it.each(CLIENT_READS)('$name excludes deleted rows', async ({ run }) => {
    // Soft delete is a setting, so any read that forgets this filter resurrects
    // a client the user believes they removed.
    await run();

    expect(flattenSql(db.getMany.mock.calls[0][0] as string)).toMatch(/deleted_at IS NULL/);
  });

  it('reads one client only while it is live', async () => {
    db.getOne.mockReturnValue({ id: 1 });

    await clientService.getClientById(1);

    expect(flattenSql(db.getOne.mock.calls[0][0] as string)).toMatch(/deleted_at IS NULL/);
  });

  it('counts only live clients in the statistics', async () => {
    db.getOne.mockReturnValue({ count: 3 });
    db.getMany.mockReturnValue([]);

    await clientService.getClientStats();

    for (const [sql] of db.getOne.mock.calls) {
      expect(flattenSql(sql as string)).toMatch(/deleted_at IS NULL/);
    }
    expect(flattenSql(db.getMany.mock.calls[0][0] as string)).toMatch(/deleted_at IS NULL/);
  });
});

describe('every read is a prepared statement', () => {
  it.each(CLIENT_READS)('$name binds its values rather than interpolating', async ({ run }) => {
    // Interpolated SQL is both an injection surface and a statement-cache miss
    // on every distinct value.
    await run();

    const sql = flattenSql(db.getMany.mock.calls[0][0] as string);
    expect(sql).not.toMatch(/\$\{/);
    expect(sql).not.toMatch(/'-\d+ days'/);
  });

  /**
   * The window used to be bound as a SQLite modifier ('-90 days') consumed by
   * `datetime('now', ?)`. MySQL cannot bind an INTERVAL quantity, so the cutoff
   * is now computed and bound as a timestamp. These tests assert the same two
   * properties the old ones did — the value is bound, and the statement text
   * does not vary with it — against the mechanism that works on both backends.
   */
  const windowParamOf = (call: number): number =>
    (db.getMany.mock.calls[call][1] as unknown[])[0] as number;

  /** Same minute, so a cutoff is comparable even if the clock ticked mid-test. */
  const toMinute = (value: number): number => Math.floor(value / 60_000);

  it('binds the activity window instead of splicing it in', async () => {
    await clientService.getClientsWithRecentActivity(90);

    const [sql] = db.getMany.mock.calls[0];
    expect(flattenSql(sql as string)).toMatch(/i\.created_at > \?/);
    expect(isEpochMillis(windowParamOf(0))).toBe(true);
  });

  it('builds the same SQL text whatever the window', async () => {
    await clientService.getClientsWithRecentActivity(7);
    await clientService.getClientsWithRecentActivity(365);

    const [first, second] = db.getMany.mock.calls.map(call => flattenSql(call[0] as string));
    expect(first).toBe(second);
  });

  it('binds a cutoff that actually moves with the window', async () => {
    // Guards the guard: a constant statement text would also be satisfied by a
    // cutoff that ignored its argument entirely.
    await clientService.getClientsWithRecentActivity(7);
    await clientService.getClientsWithRecentActivity(365);

    expect(windowParamOf(0) > windowParamOf(1)).toBe(true);
  });

  it('coerces a fractional window to whole days', async () => {
    await clientService.getClientsWithRecentActivity(30.7);
    await clientService.getClientsWithRecentActivity(30);

    // Same day, so the two cutoffs agree to the minute even if the clock ticked.
    expect(toMinute(windowParamOf(0))).toBe(toMinute(windowParamOf(1)));
  });

  it('falls back to the default window for a nonsense value', async () => {
    await clientService.getClientsWithRecentActivity(NaN);
    await clientService.getClientsWithRecentActivity(30);

    expect(toMinute(windowParamOf(0))).toBe(toMinute(windowParamOf(1)));
  });

  it('refuses a negative window that would look into the future', async () => {
    await clientService.getClientsWithRecentActivity(-30);
    await clientService.getClientsWithRecentActivity(30);

    expect(toMinute(windowParamOf(0))).toBe(toMinute(windowParamOf(1)));
  });
});

describe('deleteClient', () => {
  it('refuses to delete a client who has invoices', async () => {
    // Deleting them would orphan the invoices and break every report.
    db.getOne.mockImplementation((sql: string) =>
      /COUNT/.test(sql) ? { count: 2 } : { id: 1, name: 'Acme' }
    );

    await expect(clientService.deleteClient(1)).rejects.toThrow(/existing invoices/i);
    expect(db.deleteWithSetting).not.toHaveBeenCalled();
  });

  it('deletes a client with no invoices', async () => {
    db.getOne.mockImplementation((sql: string) =>
      /COUNT/.test(sql) ? { count: 0 } : { id: 1, name: 'Acme' }
    );

    await expect(clientService.deleteClient(1)).resolves.toBe(1);
  });

  it('routes the delete through the soft-delete setting', async () => {
    db.getOne.mockImplementation((sql: string) =>
      /COUNT/.test(sql) ? { count: 0 } : { id: 1 }
    );

    await clientService.deleteClient(1);

    expect(db.deleteWithSetting).toHaveBeenCalledWith('clients', 1, 'clients');
  });

  it('rejects a client that does not exist', async () => {
    db.getOne.mockReturnValue(undefined);

    await expect(clientService.deleteClient(1)).rejects.toThrow(/not found/i);
  });

  it('rejects an invalid id', async () => {
    await expect(clientService.deleteClient(0)).rejects.toThrow(/id/i);
  });
});

describe('searchClients', () => {
  it('matches name, email, company and phone', async () => {
    await clientService.searchClients('acme');

    const [sql, params] = db.getMany.mock.calls[0];
    expect(flattenSql(sql as string))
      .toMatch(/name LIKE \? OR email LIKE \? OR company LIKE \? OR phone LIKE \?/);
    expect((params as unknown[]).slice(0, 4)).toEqual(['%acme%', '%acme%', '%acme%', '%acme%']);
  });

  it('ranks exact matches first', async () => {
    await clientService.searchClients('Acme');

    expect(flattenSql(db.getMany.mock.calls[0][0] as string)).toMatch(/WHEN name = \? THEN 1/);
  });

  it('returns nothing for a blank term rather than every client', async () => {
    await expect(clientService.searchClients('')).resolves.toEqual([]);
    expect(db.getMany).not.toHaveBeenCalled();
  });

  it('pages results', async () => {
    await clientService.searchClients('acme', { limit: 5, offset: 10 });

    const params = db.getMany.mock.calls[0][1] as unknown[];
    expect(params.slice(-2)).toEqual([5, 10]);
  });
});

describe('getClientStats', () => {
  it('reports zeroes on an empty database rather than undefined', async () => {
    db.getOne.mockReturnValue(undefined);
    db.getMany.mockReturnValue([]);

    await expect(clientService.getClientStats()).resolves.toEqual({
      total: 0, active: 0, inactive: 0, withEmail: 0, withPhone: 0, byCountry: {}
    });
  });

  it('builds the country distribution', async () => {
    db.getOne.mockReturnValue({ count: 5 });
    db.getMany.mockReturnValue([
      { country: 'US', count: 3 },
      { country: 'CA', count: 2 }
    ]);

    const stats = await clientService.getClientStats();

    expect(stats.byCountry).toEqual({ US: 3, CA: 2 });
    expect(stats.total).toBe(5);
  });

  it('skips a row with no country rather than keying on undefined', async () => {
    db.getOne.mockReturnValue({ count: 1 });
    db.getMany.mockReturnValue([{ country: null, count: 1 }]);

    const stats = await clientService.getClientStats();

    expect(stats.byCountry).toEqual({});
  });
});

describe('lookups', () => {
  it('pages by country', async () => {
    await clientService.getClientsByCountry('US', { limit: 5, offset: 10 });

    expect(db.getMany.mock.calls[0][1]).toEqual(['US', 5, 10]);
  });

  it('rejects a blank country', async () => {
    await expect(clientService.getClientsByCountry('')).rejects.toThrow(/country/i);
  });

  it('rejects an invalid id', async () => {
    await expect(clientService.getClientById(0)).rejects.toThrow(/id/i);
  });

  it('answers false for an invalid id or blank email rather than querying', async () => {
    await expect(clientService.clientExists(0)).resolves.toBe(false);
    await expect(clientService.emailExists('')).resolves.toBe(false);
    expect(db.exists).not.toHaveBeenCalled();
  });

  it('excludes the client being edited from their own email check', async () => {
    db.getOne.mockReturnValue(undefined);

    await expect(clientService.emailExists('contact@acme.com', 1)).resolves.toBe(false);
    expect(db.getOne.mock.calls[0][1]).toEqual(['contact@acme.com', 1]);
  });

  it('pages the active client list', async () => {
    await clientService.getActiveClients({ limit: 20, offset: 40 });

    const params = db.getMany.mock.calls[0][1] as unknown[];
    expect(params.slice(-2)).toEqual([20, 40]);
  });
});

/**
 * Fields the API accepts and the service used to discard.
 *
 * `tax_id` and `notes` are real columns, `createClient` writes them, and the
 * validation chain for updateClient checks their length — so the API contract
 * advertises them. The UPDATE whitelist did not list them, so a caller setting
 * a tax ID on an existing client got a success response and no change. That is
 * the worst shape this bug takes: not a rejection, an agreement not kept.
 *
 * `is_active` was worse still. toggleClientStatus returned 1 without touching
 * the database, explaining itself with "since we removed is_active column" —
 * a column that is in tables.schema.ts, has its own index, is seeded, is
 * validated on both create and update, and is in the frontend's Client type.
 */
describe('updateClient writes every field the API accepts', () => {
  beforeEach(() => {
    db.getOne.mockResolvedValue({ id: 1, name: 'Acme', email: 'billing@acme.test' });
    db.updateRecord.mockResolvedValue(true);
  });

  it('persists tax_id', async () => {
    await clientService.updateClient(1, { tax_id: 'GB123456789' });

    expect(db.updateRecord).toHaveBeenCalledWith(
      'clients', 1, expect.objectContaining({ tax_id: 'GB123456789' })
    );
  });

  it('persists notes', async () => {
    await clientService.updateClient(1, { notes: 'Net 30, invoices to accounts payable' });

    expect(db.updateRecord).toHaveBeenCalledWith(
      'clients', 1, expect.objectContaining({ notes: 'Net 30, invoices to accounts payable' })
    );
  });

  it('does not treat a tax_id-only update as an empty one', async () => {
    // The whitelist dropped it, leaving updateData empty, so the call failed
    // with "No valid fields to update" rather than silently — but only when
    // tax_id was the *only* field. Sent alongside a name, it vanished quietly.
    await expect(clientService.updateClient(1, { tax_id: 'GB123456789' })).resolves.toBe(1);
  });

  it('keeps an unknown field out of the update', async () => {
    await clientService.updateClient(1, { name: 'Acme', injected: 'x' } as never);

    const [, , updateData] = db.updateRecord.mock.calls[0] as [string, number, Record<string, unknown>];
    expect(updateData).not.toHaveProperty('injected');
  });
});

describe('toggleClientStatus', () => {
  beforeEach(() => {
    db.getOne.mockResolvedValue({ id: 1, name: 'Acme' });
    db.updateRecord.mockResolvedValue(true);
  });

  it('archives a client by writing is_active', async () => {
    await clientService.toggleClientStatus(1, false);

    expect(db.updateRecord).toHaveBeenCalledWith(
      'clients', 1, expect.objectContaining({ is_active: 0 })
    );
  });

  it('unarchives a client', async () => {
    await clientService.toggleClientStatus(1, true);

    expect(db.updateRecord).toHaveBeenCalledWith(
      'clients', 1, expect.objectContaining({ is_active: 1 })
    );
  });

  it('rejects a client that does not exist, rather than reporting success', async () => {
    db.getOne.mockResolvedValue(undefined);

    await expect(clientService.toggleClientStatus(1, false)).rejects.toThrow(/not found/i);
  });

  it('rejects an invalid id', async () => {
    await expect(clientService.toggleClientStatus(0, false)).rejects.toThrow(/id/i);
  });
});
