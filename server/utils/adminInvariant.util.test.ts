/**
 * The last-administrator guard, as text.
 *
 * These assertions are about shape only. Whether an engine ACCEPTS the SQL is a
 * different question, answered by userInvariantLive.test.ts — a test over
 * generated SQL proves the string, not that a database takes it.
 */

import { describe, it, expect } from 'vitest';
import {
  LAST_ADMIN_GUARD,
  deleteUserSql,
  guardedUpdateSql
} from './adminInvariant.util.js';

describe('LAST_ADMIN_GUARD', () => {
  it('excludes soft-deleted administrators from the count', () => {
    // A soft-deleted admin cannot administer anything, so counting one would
    // let the last live administrator be removed.
    expect(LAST_ADMIN_GUARD).toMatch(/deleted_at IS NULL/);
  });

  it('wraps the subquery in a derived table', () => {
    // MySQL raises ER_UPDATE_TABLE_USED (1093) for a bare subquery over the
    // table being mutated. MariaDB and SQLite accept both forms, so this is
    // the assertion that stops someone "simplifying" it on a MariaDB box.
    expect(LAST_ADMIN_GUARD).toMatch(/FROM \(SELECT COUNT\(\*\)/);
  });
});

describe('deleteUserSql', () => {
  it('guards the delete by id', () => {
    const sql = deleteUserSql();

    expect(sql).toMatch(/^DELETE FROM users WHERE id = \?/);
    expect(sql).toContain(LAST_ADMIN_GUARD);
  });
});

describe('guardedUpdateSql', () => {
  it('sets every named column, in order', () => {
    expect(guardedUpdateSql(['name', 'email'], false)).toBe(
      'UPDATE users SET name = ?, email = ? WHERE id = ?'
    );
  });

  it('appends the guard when the update demotes', () => {
    const sql = guardedUpdateSql(['role'], true);

    expect(sql).toBe(`UPDATE users SET role = ? WHERE id = ? AND ${LAST_ADMIN_GUARD}`);
  });

  it('refuses an empty column list rather than emitting invalid SQL', () => {
    expect(() => guardedUpdateSql([], false)).toThrow(/at least one column/i);
  });

  it('refuses a column name that is not a plain identifier', () => {
    // Column names are interpolated, not bound, so this is the only thing
    // standing between a caller mistake and injected SQL.
    expect(() => guardedUpdateSql(['name; DROP TABLE users'], false)).toThrow(/identifier/i);
  });

  it('refuses a table name that is not a plain identifier', () => {
    expect(() => guardedUpdateSql(['role'], true, 'users; DROP TABLE users')).toThrow(/identifier/i);
  });
});

describe('the table parameter', () => {
  it('targets the named table everywhere, including inside the guard', () => {
    // The live suite needs its own fixture table: baselineLive.test.ts drops
    // `users` in the same database and vitest runs files in parallel.
    const sql = deleteUserSql('invariant_probe');

    expect(sql).toMatch(/^DELETE FROM invariant_probe /);
    expect(sql).toContain('FROM invariant_probe WHERE');
    expect(sql).not.toContain(' users ');
  });

  it('defaults to users, so production call sites pass nothing', () => {
    expect(deleteUserSql()).toBe(deleteUserSql('users'));
  });
});
