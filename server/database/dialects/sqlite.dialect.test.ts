import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { sqliteDialect } from './sqlite.dialect.js';
import { isEpochMillis, utcNow } from '../../utils/utcTime.util.js';

/**
 * Evaluated by SQLite, not compared as text.
 *
 * A pinned string proves the expression was spelled as expected, which is a
 * weaker claim than it looks: text that reads perfectly plausibly can still
 * produce the wrong type or an unparseable value. Running it is the only way to
 * assert what actually reaches the column.
 */
const sqlite = new Database(':memory:');
const evaluate = <T>(expression: string): T =>
  (sqlite.prepare(`SELECT ${expression} AS value`).get() as { value: T }).value;

describe('sqliteDialect', () => {
  it('names itself', () => {
    expect(sqliteDialect.name).toBe('sqlite');
  });

  it('produces an integer instant, not text', () => {
    expect(isEpochMillis(evaluate<number>(sqliteDialect.now()))).toBe(true);
    // A calendar day is still text, and deliberately so.
    expect(evaluate<string>(sqliteDialect.today())).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('agrees with utcNow()', () => {
    // Same instant whichever side of the wire writes it. If these two diverge,
    // a column holds values on two clocks.
    const fromSql = evaluate<number>(sqliteDialect.now());

    expect(Math.abs(fromSql - utcNow())).toBeLessThanOrEqual(1000);
  });

  it('carries millisecond precision, not just seconds', () => {
    // unixepoch() alone returns whole seconds; the 'subsec' modifier is what
    // makes this match Date.now() rather than trailing it by up to a second.
    const seconds = evaluate<number>("strftime('%s','now')") * 1000;
    const millis = evaluate<number>(sqliteDialect.now());

    expect(millis).toBeGreaterThanOrEqual(seconds);
    expect(millis - seconds).toBeLessThan(1000);
  });

  it('uses INSERT OR IGNORE and quotes columns', () => {
    expect(sqliteDialect.insertIgnore('counters', ['name', 'value'])).toBe(
      'INSERT OR IGNORE INTO counters (`name`, `value`) VALUES (?, ?)'
    );
  });

  it('uses INSERT OR REPLACE', () => {
    expect(sqliteDialect.insertOrReplace('settings', ['key', 'value'])).toBe(
      'INSERT OR REPLACE INTO settings (`key`, `value`) VALUES (?, ?)'
    );
  });

  it('builds relative-date cutoffs with SQLite modifiers', () => {
    const cutoff = evaluate<number>(sqliteDialect.nowMinus(7, 'day'));

    expect(isEpochMillis(cutoff)).toBe(true);
    // Seven days back, within a second of the clock ticking mid-test.
    expect(Date.now() - cutoff).toBeGreaterThan(7 * 86_400_000 - 1000);
    expect(Date.now() - cutoff).toBeLessThan(7 * 86_400_000 + 1000);

    expect(sqliteDialect.todayMinus(12, 'month')).toBe("date('now', '-12 months')");
    expect(evaluate<string>(sqliteDialect.todayMinus(12, 'month')))
      .toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('makes a cutoff that compares correctly against a stored timestamp', () => {
    const cutoff = sqliteDialect.nowMinus(7, 'day');
    const ancient = Date.parse('2000-01-01T00:00:00Z');

    expect(evaluate<number>(`(${utcNow()} > ${cutoff})`)).toBe(1);
    expect(evaluate<number>(`(${ancient} > ${cutoff})`)).toBe(0);
  });

  it('converts every stored text shape a pre-2.2 database holds', () => {
    // What migration 015 runs. NULL and unreadable text come back NULL rather
    // than as 1970.
    const of = (stored: string) =>
      evaluate<number | null>(sqliteDialect.epochFromStored(`'${stored}'`));

    expect(of('2026-08-09T14:30:05Z')).toBe(Date.parse('2026-08-09T14:30:05Z'));
    expect(of('2026-08-09 14:30:05')).toBe(Date.parse('2026-08-09T14:30:05Z'));
    expect(of('2026-08-09T14:30:05.241Z')).toBe(Date.parse('2026-08-09T14:30:05Z'));
    expect(of('rubbish')).toBeNull();
  });

  it('passes an already-converted value through, in either storage class', () => {
    // Both arms matter. unixepoch() of a bare number is NULL — it reads it as a
    // Julian day — so re-running the conversion would erase the column. And a
    // column mid-retype still has TEXT affinity, so the integer written into it
    // reads back as text.
    const converted = Date.parse('2026-08-09T14:30:05Z');

    expect(evaluate<number>(sqliteDialect.epochFromStored(String(converted)))).toBe(converted);
    expect(evaluate<number>(sqliteDialect.epochFromStored(`'${converted}'`))).toBe(converted);
  });

  it('rejects an interval count that is not a whole number', () => {
    // The count reaches SQL unparameterised, because MySQL cannot bind an
    // INTERVAL quantity — and getClientsWithRecentActivity takes its window
    // from a request parameter.
    expect(() => sqliteDialect.nowMinus(1.5, 'day')).toThrow(/whole number/);
    expect(() => sqliteDialect.nowMinus(-3, 'day')).toThrow(/whole number/);
    expect(() => sqliteDialect.nowMinus(Number.NaN, 'day')).toThrow(/whole number/);
  });

  it('formats a date column for grouping', () => {
    expect(sqliteDialect.formatMonth('date')).toBe("strftime('%Y-%m', date)");
    expect(sqliteDialect.formatYear('date')).toBe("strftime('%Y', date)");
  });

  it('supports partial indexes and self-updating triggers', () => {
    expect(sqliteDialect.supportsPartialIndex).toBe(true);
    expect(sqliteDialect.supportsSelfUpdatingTrigger).toBe(true);
  });
});
