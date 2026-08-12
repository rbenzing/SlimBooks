import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { sqliteDialect } from './sqlite.dialect.js';
import { isUtcTimestamp, utcNow } from '../../utils/utcTime.util.js';

/**
 * Evaluated by SQLite, not compared as text.
 *
 * A pinned string proves the expression was spelled as expected, which is a
 * weaker claim than it looks: `datetime('now')` and `strftime('%Y-%m-%dT…')`
 * are both perfectly plausible-looking text, and only one of them produces a
 * value JavaScript can parse. Running it is the only way to assert the shape
 * that actually reaches the column.
 */
const sqlite = new Database(':memory:');
const evaluate = (expression: string): string =>
  (sqlite.prepare(`SELECT ${expression} AS value`).get() as { value: string }).value;

describe('sqliteDialect', () => {
  it('names itself', () => {
    expect(sqliteDialect.name).toBe('sqlite');
  });

  it('produces the canonical timestamp, not SQLite\'s default spelling', () => {
    expect(isUtcTimestamp(evaluate(sqliteDialect.now()))).toBe(true);
    expect(evaluate(sqliteDialect.today())).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('agrees with utcNow() to the second', () => {
    // Same instant, same shape, whichever side of the wire writes it. If these
    // two ever diverge, a column holds two formats and compares wrongly.
    const fromSql = evaluate(sqliteDialect.now());
    const fromNode = utcNow();

    expect(Math.abs(Date.parse(fromSql) - Date.parse(fromNode))).toBeLessThanOrEqual(1000);
    expect(fromSql).toHaveLength(fromNode.length);
  });

  it('parses back to the instant SQLite meant', () => {
    // The reason for the format: this is what the browser does with the value.
    const utc = evaluate("strftime('%s','now')");

    expect(Math.abs(new Date(evaluate(sqliteDialect.now())).getTime() - Number(utc) * 1000))
      .toBeLessThanOrEqual(1000);
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
    const cutoff = evaluate(sqliteDialect.nowMinus(7, 'day'));

    expect(isUtcTimestamp(cutoff)).toBe(true);
    // Seven days back, within a second of the clock ticking mid-test.
    expect(Date.now() - Date.parse(cutoff)).toBeGreaterThan(7 * 86_400_000 - 1000);
    expect(Date.now() - Date.parse(cutoff)).toBeLessThan(7 * 86_400_000 + 1000);

    expect(sqliteDialect.todayMinus(12, 'month')).toBe("date('now', '-12 months')");
    expect(evaluate(sqliteDialect.todayMinus(12, 'month'))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('makes a cutoff that compares correctly against a stored timestamp', () => {
    // The whole reason the shapes have to match: these columns are TEXT, so
    // this comparison is lexicographic.
    const recent = utcNow();
    const ancient = '2000-01-01T00:00:00Z';
    const cutoff = sqliteDialect.nowMinus(7, 'day');

    expect(evaluate(`('${recent}' > ${cutoff})`)).toBe(1 as unknown as string);
    expect(evaluate(`('${ancient}' > ${cutoff})`)).toBe(0 as unknown as string);
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
