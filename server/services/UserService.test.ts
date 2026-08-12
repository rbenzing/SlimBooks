/**
 * UserService tests.
 *
 * Two behaviours here are load-bearing for account security: the public
 * projection must never select `password_hash`, and the lockout counters must
 * be writable and clearable. The last-administrator guard is the one that stops
 * an install from locking everybody out.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createDatabaseMock, insertColumnsOf, flattenSql } from './databaseMock.test-helper.js';
import { sqliteDialect } from '../database/dialects/sqlite.dialect.js';

const db = createDatabaseMock();
vi.mock('../core/DatabaseService.js', () => ({ databaseService: db }));

const { userService } = await import('./UserService.js');

const newUser = { name: 'Ada Lovelace', email: 'ada@example.com' };

const insertedValue = (column: string) => {
  const { sql, params } = db.queries[0];
  return params[insertColumnsOf(sql).indexOf(column)];
};

beforeEach(() => db.reset());

describe('createUser', () => {
  it('writes every column the users table needs', async () => {
    await userService.createUser(newUser);

    const columns = insertColumnsOf(db.queries[0].sql);
    for (const column of [
      'id', 'name', 'email', 'username', 'password_hash', 'role', 'email_verified',
      'google_id', 'last_login', 'failed_login_attempts', 'account_locked_until',
      'created_at', 'updated_at'
    ]) {
      expect(columns).toContain(column);
    }
    expect(db.queries[0].params).toHaveLength(columns.length);
  });

  it('creates a regular, unverified account by default', async () => {
    await userService.createUser(newUser);

    expect(insertedValue('role')).toBe('user');
    expect(insertedValue('email_verified')).toBe(0);
    expect(insertedValue('failed_login_attempts')).toBe(0);
  });

  it('falls back to the email as the username', async () => {
    await userService.createUser(newUser);

    expect(insertedValue('username')).toBe('ada@example.com');
  });

  it('stores no password hash for a Google account', async () => {
    await userService.createUser({ ...newUser, google_id: 'g-123' });

    expect(insertedValue('password_hash')).toBeNull();
    expect(insertedValue('google_id')).toBe('g-123');
  });

  it('converts email_verified to the 0/1 SQLite stores', async () => {
    await userService.createUser({ ...newUser, email_verified: true });

    expect(insertedValue('email_verified')).toBe(1);
  });

  it('refuses a duplicate email', async () => {
    db.exists.mockReturnValue(true);

    await expect(userService.createUser(newUser)).rejects.toThrow(/already exists/i);
    expect(db.queries).toHaveLength(0);
  });

  it('rejects a malformed email', async () => {
    for (const email of ['', 'ada', 'ada@', 'ada@example', 'a b@example.com']) {
      await expect(userService.createUser({ ...newUser, email })).rejects.toThrow(/email/i);
    }
  });

  it('rejects a blank name', async () => {
    await expect(userService.createUser({ ...newUser, name: '   ' })).rejects.toThrow(/name/i);
  });

  it('returns the new user id', async () => {
    db.getNextSequence.mockReturnValue(9);

    await expect(userService.createUser(newUser)).resolves.toBe(9);
  });
});

describe('reads', () => {
  it('never selects the password hash into a public projection', async () => {
    db.getOne.mockReturnValue({ id: 1 });
    await userService.getUserById(1);
    await userService.getAllUsers();
    await userService.getUsersByRole('admin');
    await userService.getLockedUsers();
    await userService.searchUsers('ada');

    const projections = [
      db.getOne.mock.calls[0][0] as string,
      ...db.getMany.mock.calls.map(call => call[0] as string)
    ];
    for (const sql of projections) {
      expect(flattenSql(sql)).not.toMatch(/password_hash/);
    }
  });

  it('selects the full row when looking a user up for login', async () => {
    // The auth path needs the hash, so this one query is deliberately SELECT *.
    db.getOne.mockReturnValue({ id: 1, password_hash: 'x' });

    await userService.getUserByEmail('ada@example.com');

    expect(db.getOne.mock.calls[0][0]).toMatch(/SELECT \* FROM users WHERE email = \?/);
  });

  it('decodes a URL-encoded Google id before matching', async () => {
    await userService.getUserByGoogleId('g%2B123');

    expect(db.getOne.mock.calls[0][1]).toEqual(['g+123']);
  });

  it('pages users', async () => {
    await userService.getAllUsers({ limit: 10, offset: 30 });

    expect(db.getMany.mock.calls[0][1]).toEqual([10, 30]);
  });

  it('lists only accounts still inside their lockout window', async () => {
    await userService.getLockedUsers();

    const sql = flattenSql(db.getMany.mock.calls[0][0] as string);
    expect(sql).toMatch(/account_locked_until IS NOT NULL/);
    expect(sql).toContain(`account_locked_until > ${sqliteDialect.now()}`);
  });

  it('matches a search term against name, email and username', async () => {
    await userService.searchUsers('ada', { limit: 5, offset: 0 });

    const [sql, params] = db.getMany.mock.calls[0];
    expect(flattenSql(sql as string)).toMatch(/name LIKE \? OR email LIKE \? OR username LIKE \?/);
    expect((params as unknown[]).slice(0, 3)).toEqual(['%ada%', '%ada%', '%ada%']);
  });

  it('returns nothing for a blank search rather than every user', async () => {
    await expect(userService.searchUsers('')).resolves.toEqual([]);
    expect(db.getMany).not.toHaveBeenCalled();
  });

  it('rejects an invalid id or email', async () => {
    await expect(userService.getUserById(0)).rejects.toThrow(/id/i);
    await expect(userService.getUserByEmail('')).rejects.toThrow(/email/i);
    await expect(userService.getUserByGoogleId('')).rejects.toThrow(/google id/i);
  });

  it('answers false for an invalid id or blank email rather than querying', async () => {
    await expect(userService.userExists(0)).resolves.toBe(false);
    await expect(userService.emailExists('')).resolves.toBe(false);
    expect(db.exists).not.toHaveBeenCalled();
  });

  it('excludes the user being edited from their own email check', async () => {
    db.getOne.mockReturnValue(undefined);

    await expect(userService.emailExists('ada@example.com', 1)).resolves.toBe(false);
    expect(db.getOne.mock.calls[0][1]).toEqual(['ada@example.com', 1]);
  });
});

describe('updateUser', () => {
  beforeEach(() => {
    db.getOne.mockReturnValue({ id: 1, email: 'ada@example.com', role: 'user' });
  });

  it('writes only whitelisted fields', async () => {
    await userService.updateUser(1, { name: 'Ada L.', id: 999, created_at: 'x' } as never);

    const [, , updateData] = db.updateRecord.mock.calls[0];
    expect(updateData).toMatchObject({ name: 'Ada L.' });
    expect(updateData).not.toHaveProperty('id');
    expect(updateData).not.toHaveProperty('created_at');
  });

  it('rejects an update with nothing whitelisted left to write', async () => {
    await expect(userService.updateUser(1, { id: 999 } as never)).rejects.toThrow(/no valid fields/i);
    expect(db.updateRecord).not.toHaveBeenCalled();
  });

  it('rejects a malformed email', async () => {
    await expect(userService.updateUser(1, { email: 'nope' })).rejects.toThrow(/email/i);
  });

  it('rejects an email already taken by someone else', async () => {
    db.getOne.mockImplementation((sql: string) =>
      /id != \?/.test(sql) ? { id: 2 } : { id: 1, email: 'ada@example.com' }
    );

    await expect(userService.updateUser(1, { email: 'grace@example.com' }))
      .rejects.toThrow(/already in use/i);
  });

  it('does not re-check the email a user already owns', async () => {
    await userService.updateUser(1, { email: 'ada@example.com' });

    expect(db.updateRecord).toHaveBeenCalled();
  });

  it('converts email_verified to the 0/1 SQLite stores', async () => {
    await userService.updateUser(1, { email_verified: true });

    const [, , updateData] = db.updateRecord.mock.calls[0];
    expect(updateData.email_verified).toBe(1);
  });

  it('rejects an update to a user that does not exist', async () => {
    db.getOne.mockReturnValue(undefined);

    await expect(userService.updateUser(1, { name: 'x' })).rejects.toThrow(/not found/i);
  });

  it('rejects an invalid id', async () => {
    await expect(userService.updateUser(0, { name: 'x' })).rejects.toThrow(/id/i);
  });
});

describe('deleteUser', () => {
  it('will not delete the last administrator', async () => {
    // Deleting them would leave nobody able to administer the install.
    db.getOne.mockImplementation((sql: string) =>
      /COUNT/.test(sql) ? { count: 1 } : { id: 1, role: 'admin' }
    );

    await expect(userService.deleteUser(1)).rejects.toThrow(/last administrator/i);
    expect(db.deleteById).not.toHaveBeenCalled();
  });

  it('deletes an administrator while another remains', async () => {
    db.getOne.mockImplementation((sql: string) =>
      /COUNT/.test(sql) ? { count: 2 } : { id: 1, role: 'admin' }
    );

    await expect(userService.deleteUser(1)).resolves.toBe(1);
  });

  it('deletes a regular user regardless of the admin count', async () => {
    db.getOne.mockImplementation((sql: string) =>
      /COUNT/.test(sql) ? { count: 1 } : { id: 2, role: 'user' }
    );

    await expect(userService.deleteUser(2)).resolves.toBe(1);
    expect(db.deleteById).toHaveBeenCalledWith('users', 2);
  });

  it('rejects a user that does not exist', async () => {
    db.getOne.mockReturnValue(undefined);

    await expect(userService.deleteUser(1)).rejects.toThrow(/not found/i);
  });

  it('rejects an invalid id', async () => {
    await expect(userService.deleteUser(0)).rejects.toThrow(/id/i);
  });
});

describe('lockout bookkeeping', () => {
  it('records the attempt count and the lockout expiry together', async () => {
    await userService.updateUserLoginAttempts(1, 3, '2026-07-30T12:00:00Z');

    expect(db.queries[0].params).toEqual([3, '2026-07-30T12:00:00Z', 1]);
  });

  it('clears the lockout when no expiry is given', async () => {
    await userService.updateUserLoginAttempts(1, 0);

    expect(db.queries[0].params).toEqual([0, null, 1]);
  });

  it('unlocking resets the counter and the expiry in one statement', async () => {
    await userService.unlockUser(1);

    const sql = flattenSql(db.queries[0].sql);
    expect(sql).toMatch(/failed_login_attempts = 0/);
    expect(sql).toMatch(/account_locked_until = NULL/);
  });

  it('stamps both the verification flag and its timestamp', async () => {
    await userService.verifyUserEmail(1);

    const sql = flattenSql(db.queries[0].sql);
    expect(sql).toMatch(/email_verified = 1/);
    expect(sql).toContain(`email_verified_at = ${sqliteDialect.now()}`);
  });

  it('records the last login', async () => {
    await userService.updateUserLastLogin(1);

    expect(flattenSql(db.queries[0].sql)).toContain(`last_login = ${sqliteDialect.now()}`);
  });

  it('reports false when the update matched no row', async () => {
    db.executeQuery.mockReturnValue({ changes: 0, lastInsertRowid: 0 });

    await expect(userService.updateUserLastLogin(1)).resolves.toBe(false);
    await expect(userService.unlockUser(1)).resolves.toBe(false);
    await expect(userService.verifyUserEmail(1)).resolves.toBe(false);
  });

  it('rejects a negative attempt count', async () => {
    await expect(userService.updateUserLoginAttempts(1, -1)).rejects.toThrow(/attempts/i);
  });

  it('rejects an invalid id everywhere it is taken', async () => {
    await expect(userService.updateUserLoginAttempts(0, 1)).rejects.toThrow(/id/i);
    await expect(userService.updateUserLastLogin(0)).rejects.toThrow(/id/i);
    await expect(userService.verifyUserEmail(0)).rejects.toThrow(/id/i);
    await expect(userService.unlockUser(0)).rejects.toThrow(/id/i);
  });
});

describe('getUserStats', () => {
  it('reports zeroes on an empty table rather than undefined', async () => {
    db.getOne.mockReturnValue(undefined);

    await expect(userService.getUserStats()).resolves.toEqual({
      total: 0, admins: 0, regular: 0, verified: 0, locked: 0, recentLogins: 0
    });
  });

  it('counts each cohort with its own query', async () => {
    db.getOne.mockReturnValue({ count: 4 });

    const stats = await userService.getUserStats();

    expect(stats.total).toBe(4);
    expect(db.getOne).toHaveBeenCalledTimes(6);
  });
});
