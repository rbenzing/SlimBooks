import { describe, it, expect } from 'vitest';
import { mysqlDialect } from './mysql.dialect.js';
import { sqliteDialect } from './sqlite.dialect.js';

describe('mysqlDialect', () => {
  it('names itself', () => {
    expect(mysqlDialect.name).toBe('mysql');
  });

  it('formats timestamps identically to SQLite', () => {
    // The columns are TEXT on both backends. NOW() would render in the session
    // timezone, without a T or a Z, and with possible fractional seconds, so
    // values written by one backend would not sort or compare against the
    // other's.
    //
    // Pinned as text only because there is no server here. What the server
    // actually returns for these is asserted in baselineLive.test.ts and
    // twoDriver.test.ts, which is the assertion that matters.
    expect(mysqlDialect.now()).toBe('CAST(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000 AS SIGNED)');
    expect(mysqlDialect.today()).toBe("DATE_FORMAT(UTC_TIMESTAMP(),'%Y-%m-%d')");
  });

  it('uses INSERT IGNORE', () => {
    expect(mysqlDialect.insertIgnore('counters', ['name', 'value'])).toBe(
      'INSERT IGNORE INTO counters (`name`, `value`) VALUES (?, ?)'
    );
  });

  it('uses REPLACE INTO', () => {
    expect(mysqlDialect.insertOrReplace('settings', ['key', 'value'])).toBe(
      'REPLACE INTO settings (`key`, `value`) VALUES (?, ?)'
    );
  });

  it('builds relative-date cutoffs, formatted to match the stored shape', () => {
    // The compared columns are TEXT on both backends, so a raw DATE_SUB would
    // compare a MySQL datetime against a string in a different format.
    expect(mysqlDialect.nowMinus(7, 'day')).toBe(
      'CAST(UNIX_TIMESTAMP(DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL 7 DAY)) * 1000 AS SIGNED)'
    );
    expect(mysqlDialect.todayMinus(12, 'month')).toBe(
      "DATE_FORMAT(DATE_SUB(UTC_TIMESTAMP(), INTERVAL 12 MONTH),'%Y-%m-%d')"
    );
  });

  it('rejects an interval count that is not a whole number', () => {
    // INTERVAL ? DAY is a syntax error in MySQL, so the count is interpolated
    // and must be validated rather than trusted.
    expect(() => mysqlDialect.nowMinus(1.5, 'day')).toThrow(/whole number/);
    expect(() => mysqlDialect.nowMinus(-3, 'day')).toThrow(/whole number/);
    expect(() => mysqlDialect.todayMinus(Number.NaN, 'month')).toThrow(/whole number/);
  });

  it('replaces strftime, which MySQL does not have at all', () => {
    expect(mysqlDialect.formatMonth('date')).toBe("DATE_FORMAT(date, '%Y-%m')");
    expect(mysqlDialect.formatYear('date')).toBe("DATE_FORMAT(date, '%Y')");
  });

  it('uses the same format mask as SQLite, so both bucket a row identically', () => {
    // Both render 2026-08-09 as "2026-08". A monthly report grouped on one
    // backend must produce the same keys as the other, because the frontend
    // indexes the payload by them.
    const mask = (sql: string): string => /'([^']+)'/.exec(sql)?.[1] ?? '';

    expect(mask(mysqlDialect.formatMonth('date'))).toBe(mask(sqliteDialect.formatMonth('date')));
    expect(mask(mysqlDialect.formatYear('date'))).toBe(mask(sqliteDialect.formatYear('date')));
  });

  it('has neither partial indexes nor self-updating triggers', () => {
    expect(mysqlDialect.supportsPartialIndex).toBe(false);
    expect(mysqlDialect.supportsSelfUpdatingTrigger).toBe(false);
  });
});
