import { describe, it, expect } from 'vitest';
import { sqliteDialect } from './sqlite.dialect.js';

const flat = (sql: string): string => sql.replace(/\s+/g, ' ').trim();

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

  it('builds a conditional upsert with a WHERE clause on the conflict path', () => {
    const built = sqliteDialect.conditionalUpsert({
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
        'ON CONFLICT (`job_name`) DO UPDATE SET `owner` = excluded.`owner`, ' +
        '`expires_at` = excluded.`expires_at` WHERE scheduler_leases.expires_at <= ?'
    );
    expect(built.params).toEqual(['recurring', 'me', 'T2', 'T1']);
  });

  it('ignores conflictGuardColumn, since its WHERE clause is evaluated once', () => {
    // SQLite needs no reordering: the predicate is tested against the existing
    // row before any assignment happens. Accepting the field and doing nothing
    // with it keeps the two dialects interchangeable at the call site.
    const built = sqliteDialect.conditionalUpsert({
      table: 'scheduler_leases',
      columns: ['job_name', 'expires_at', 'owner'],
      values: ['recurring', 'T2', 'me'],
      conflictColumn: 'job_name',
      updateColumns: ['expires_at', 'owner'],
      conflictGuardColumn: 'expires_at',
      condition: 'scheduler_leases.expires_at <= ?',
      conditionParams: ['T1']
    });

    expect(flat(built.sql)).toContain('SET `expires_at` = excluded.`expires_at`, `owner` = excluded.`owner`');
    expect(built.params).toEqual(['recurring', 'T2', 'me', 'T1']);
  });

  it('supports partial indexes and self-updating triggers', () => {
    expect(sqliteDialect.supportsPartialIndex).toBe(true);
    expect(sqliteDialect.supportsSelfUpdatingTrigger).toBe(true);
  });
});
