/**
 * CounterService tests.
 *
 * These counters hand out primary keys, so the only property that really
 * matters is that a value is never issued twice. The failure mode to guard is a
 * missing counter row: an UPDATE that matches nothing must not be reported as a
 * successful increment, or every caller receives the same id forever.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createDatabaseMock, flattenSql } from './databaseMock.test-helper.js';

const db = createDatabaseMock();
vi.mock('../core/DatabaseService.js', () => ({ databaseService: db }));

const { counterService } = await import('./CounterService.js');

/** The counters the seed creates; the service must serve all of them. */
const SEEDED_COUNTERS = ['clients', 'invoices', 'templates', 'expenses', 'reports', 'payments'];

beforeEach(() => db.reset());

describe('getNextCounterId', () => {
  it('increments from the stored value', async () => {
    db.getOne.mockReturnValue({ value: 41 });

    await expect(counterService.getNextCounterId('invoices')).resolves.toBe(42);
    expect(db.queries[0].params).toEqual([42, 'invoices']);
  });

  it('issues consecutive ids as the stored value advances', async () => {
    for (const [stored, expected] of [[0, 1], [1, 2], [2, 3]]) {
      db.reset();
      db.getOne.mockReturnValue({ value: stored });
      await expect(counterService.getNextCounterId('invoices')).resolves.toBe(expected);
    }
  });

  it('creates a missing counter instead of handing out 1 forever', async () => {
    // An UPDATE against a row that does not exist changes nothing, so without
    // an INSERT every caller would receive id 1 and collide.
    db.getOne.mockReturnValue(undefined);

    await expect(counterService.getNextCounterId('invoices')).resolves.toBe(1);

    const wrote = db.queries.some(q => /INSERT INTO counters/i.test(flattenSql(q.sql)));
    expect(wrote).toBe(true);
  });

  it('persists the issued id so the next call moves on', async () => {
    db.getOne.mockReturnValue(undefined);

    await counterService.getNextCounterId('invoices');

    const write = db.queries[db.queries.length - 1];
    expect(write.params).toContain(1);
    expect(write.params).toContain('invoices');
  });

  it('serves every counter the seed creates', async () => {
    // A counter the seed writes but the service rejects is unreachable.
    db.getOne.mockReturnValue({ value: 0 });

    for (const name of SEEDED_COUNTERS) {
      await expect(counterService.getNextCounterId(name)).resolves.toBe(1);
    }
  });

  it('rejects an unknown counter rather than creating one', async () => {
    await expect(counterService.getNextCounterId('users')).rejects.toThrow(/invalid counter name/i);
    expect(db.queries).toHaveLength(0);
  });

  it('names the valid counters in the error', async () => {
    await expect(counterService.getNextCounterId('users')).rejects.toThrow(/invoices/);
  });

  it('rejects a blank counter name', async () => {
    await expect(counterService.getNextCounterId('')).rejects.toThrow(/name is required/i);
  });
});

describe('getCurrentCounterValue', () => {
  it('reads without incrementing', async () => {
    db.getOne.mockReturnValue({ value: 12 });

    await expect(counterService.getCurrentCounterValue('invoices'))
      .resolves.toEqual({ name: 'invoices', value: 12 });
    expect(db.queries).toHaveLength(0);
  });

  it('returns null for a counter that does not exist', async () => {
    db.getOne.mockReturnValue(undefined);

    await expect(counterService.getCurrentCounterValue('invoices')).resolves.toBeNull();
  });

  it('rejects a blank counter name', async () => {
    await expect(counterService.getCurrentCounterValue('')).rejects.toThrow(/name is required/i);
  });
});

describe('admin writes', () => {
  it('resets a counter to zero by default', async () => {
    await expect(counterService.resetCounter('invoices')).resolves.toBe(true);
    expect(db.queries[0].params).toEqual([0, 'invoices']);
  });

  it('sets an explicit value', async () => {
    await expect(counterService.setCounterValue('invoices', 500)).resolves.toBe(true);
    expect(db.queries[0].params).toEqual([500, 'invoices']);
  });

  it('reports a counter that was never created', async () => {
    db.executeQuery.mockReturnValue({ changes: 0, lastInsertRowid: 0 });

    await expect(counterService.resetCounter('invoices')).rejects.toThrow(/not found/i);
    await expect(counterService.setCounterValue('invoices', 5)).rejects.toThrow(/not found/i);
  });

  it('refuses a negative value that would re-issue existing ids', async () => {
    await expect(counterService.resetCounter('invoices', -1)).rejects.toThrow(/value/i);
    await expect(counterService.setCounterValue('invoices', -1)).rejects.toThrow(/value/i);
    expect(db.queries).toHaveLength(0);
  });

  it('refuses an unknown counter', async () => {
    await expect(counterService.resetCounter('users')).rejects.toThrow(/invalid counter name/i);
    await expect(counterService.setCounterValue('users', 1)).rejects.toThrow(/invalid counter name/i);
  });
});

describe('initialization', () => {
  it('creates a counter that does not exist yet', async () => {
    db.exists.mockReturnValue(false);

    await expect(counterService.initializeCounter('invoices', 100)).resolves.toBe(true);
    expect(db.queries[0].params).toEqual(['invoices', 100]);
  });

  it('leaves an existing counter alone', async () => {
    // Re-initialising must never rewind a counter that is already issuing ids.
    db.exists.mockReturnValue(true);

    await expect(counterService.initializeCounter('invoices', 0)).resolves.toBe(false);
    expect(db.queries).toHaveLength(0);
  });

  it('seeds every standard counter in one transaction', async () => {
    await counterService.initializeStandardCounters();

    expect(db.executeTransaction).toHaveBeenCalledTimes(1);
    expect(db.queries.map(q => q.params[0])).toEqual(counterService.getValidCounterNames());
  });

  it('uses INSERT OR IGNORE so re-seeding cannot reset a live counter', async () => {
    await counterService.initializeStandardCounters();

    for (const { sql } of db.queries) {
      expect(flattenSql(sql)).toMatch(/INSERT OR IGNORE INTO counters/i);
    }
  });

  it('refuses a negative initial value', async () => {
    await expect(counterService.initializeCounter('invoices', -1)).rejects.toThrow(/value/i);
  });

  it('refuses an unknown counter', async () => {
    await expect(counterService.initializeCounter('users')).rejects.toThrow(/invalid counter name/i);
  });
});

describe('counter names', () => {
  it('accepts every counter the seed creates', () => {
    for (const name of SEEDED_COUNTERS) {
      expect(counterService.isValidCounterName(name)).toBe(true);
    }
  });

  it('rejects a table that has no counter', () => {
    expect(counterService.isValidCounterName('users')).toBe(false);
    expect(counterService.isValidCounterName('')).toBe(false);
  });

  it('hands out a copy so callers cannot mutate the list', () => {
    const names = counterService.getValidCounterNames();
    names.push('hacked');

    expect(counterService.getValidCounterNames()).not.toContain('hacked');
  });

  it('answers false for a blank name rather than querying', async () => {
    await expect(counterService.counterExists('')).resolves.toBe(false);
    expect(db.exists).not.toHaveBeenCalled();
  });
});

describe('getAllCounters', () => {
  it('lists counters by name', async () => {
    db.getMany.mockReturnValue([
      { name: 'clients', value: 3 },
      { name: 'invoices', value: 12 }
    ]);

    await expect(counterService.getAllCounters()).resolves.toEqual([
      { name: 'clients', value: 3 },
      { name: 'invoices', value: 12 }
    ]);
    expect(flattenSql(db.getMany.mock.calls[0][0] as string))
      .toBe('SELECT name, value FROM counters ORDER BY name');
  });

  it('returns an empty list on a fresh database', async () => {
    db.getMany.mockReturnValue([]);

    await expect(counterService.getAllCounters()).resolves.toEqual([]);
  });
});
