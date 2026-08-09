import { describe, it, expect } from 'vitest';
import { sqliteDialect } from './sqlite.dialect.js';

describe('sqliteDialect', () => {
  it('names itself', () => {
    expect(sqliteDialect.name).toBe('sqlite');
  });

  it('produces SQLite timestamp expressions', () => {
    expect(sqliteDialect.now()).toBe("datetime('now')");
    expect(sqliteDialect.today()).toBe("date('now')");
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
    expect(sqliteDialect.nowMinus(7, 'day')).toBe("datetime('now', '-7 days')");
    expect(sqliteDialect.todayMinus(12, 'month')).toBe("date('now', '-12 months')");
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
