import { describe, it, expect } from 'vitest';
import { mysqlDialect } from './mysql.dialect.js';
import { sqliteDialect } from './sqlite.dialect.js';

const flat = (sql: string): string => sql.replace(/\s+/g, ' ').trim();

describe('mysqlDialect', () => {
  it('names itself', () => {
    expect(mysqlDialect.name).toBe('mysql');
  });

  it('formats timestamps identically to SQLite', () => {
    // The columns are TEXT on both backends. NOW() would render with a
    // timezone-dependent offset and possible fractional seconds, so values
    // written by one backend would not sort or compare against the other's.
    expect(mysqlDialect.now()).toBe("DATE_FORMAT(UTC_TIMESTAMP(),'%Y-%m-%d %H:%i:%s')");
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

  it('pushes the condition into every assignment', () => {
    const built = mysqlDialect.conditionalUpsert({
      table: 'scheduler_leases',
      columns: ['job_name', 'owner', 'expires_at'],
      values: ['recurring', 'me', 'T2'],
      conflictColumn: 'job_name',
      updateColumns: ['owner', 'expires_at'],
      condition: 'scheduler_leases.expires_at <= ?',
      conditionParams: ['T1']
    });

    expect(flat(built.sql)).toBe(
      'INSERT INTO scheduler_leases (`job_name`, `owner`, `expires_at`) VALUES (?, ?, ?) ' +
        'ON DUPLICATE KEY UPDATE ' +
        '`owner` = IF(scheduler_leases.expires_at <= ?, VALUES(`owner`), `owner`), ' +
        '`expires_at` = IF(scheduler_leases.expires_at <= ?, VALUES(`expires_at`), `expires_at`)'
    );

    // One copy of the condition parameters per assignment, in assignment order.
    expect(built.params).toEqual(['recurring', 'me', 'T2', 'T1', 'T1']);
  });

  it('assigns the guard column after everything that reads it', () => {
    // MySQL evaluates assignments left to right and later ones observe earlier
    // ones. Writing expires_at first would make every subsequent IF() test the
    // value just written, and the lease would stop excluding anyone.
    const built = mysqlDialect.conditionalUpsert({
      table: 'scheduler_leases',
      columns: ['job_name', 'expires_at', 'owner', 'acquired_at'],
      values: ['recurring', 'T2', 'me', 'T2'],
      conflictColumn: 'job_name',
      updateColumns: ['expires_at', 'owner', 'acquired_at'],
      conflictGuardColumn: 'expires_at',
      condition: 'scheduler_leases.expires_at <= ?',
      conditionParams: ['T1']
    });

    const order = ['owner', 'acquired_at', 'expires_at'].map(column =>
      built.sql.indexOf(`\`${column}\` = IF(`)
    );

    expect(order.every(index => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('keeps every update column when reordering the guard', () => {
    // A reorder that dropped a column would silently stop refreshing it.
    const built = mysqlDialect.conditionalUpsert({
      table: 'boot_locks',
      columns: ['name', 'owner', 'expires_at'],
      values: ['schema', 'me', 'T2'],
      conflictColumn: 'name',
      updateColumns: ['expires_at', 'owner'],
      conflictGuardColumn: 'expires_at',
      condition: 'boot_locks.expires_at <= ?',
      conditionParams: ['T1']
    });

    expect(built.sql).toContain('`owner` = IF(');
    expect(built.sql).toContain('`expires_at` = IF(');
    expect(built.params).toEqual(['schema', 'me', 'T2', 'T1', 'T1']);
  });

  it('uses VALUES() rather than a row alias, which MariaDB 10.2 lacks', () => {
    // VALUES() is deprecated in MySQL 8.0.20 in favour of row aliases, but row
    // aliases do not exist in MariaDB 10.2. VALUES() is the form both accept.
    const built = mysqlDialect.conditionalUpsert({
      table: 't',
      columns: ['k', 'v'],
      values: ['a', 'b'],
      conflictColumn: 'k',
      updateColumns: ['v'],
      condition: 't.v <= ?',
      conditionParams: ['x']
    });

    expect(built.sql).toContain('VALUES(`v`)');
    expect(built.sql).not.toContain(' AS new');
  });

  it('builds relative-date cutoffs, formatted to match the stored shape', () => {
    // The compared columns are TEXT on both backends, so a raw DATE_SUB would
    // compare a MySQL datetime against a string in a different format.
    expect(mysqlDialect.nowMinus(7, 'day')).toBe(
      "DATE_FORMAT(DATE_SUB(UTC_TIMESTAMP(), INTERVAL 7 DAY),'%Y-%m-%d %H:%i:%s')"
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
