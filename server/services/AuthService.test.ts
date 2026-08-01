/**
 * AuthService tests.
 *
 * This is the account-security surface: the failed-attempt counter, the lockout
 * window, and the guard that stops the last administrator being deleted. The
 * lockout maths is the part worth pinning — an off-by-one either locks people
 * out a try early or never locks anyone out at all.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createDatabaseMock, insertColumnsOf, flattenSql } from './databaseMock.test-helper.js';

const db = createDatabaseMock();
vi.mock('../core/DatabaseService.js', () => ({ databaseService: db }));

const getSecuritySetting = vi.fn();
vi.mock('./SettingsService.js', () => ({ settingsService: { getSecuritySetting } }));

const { authService } = await import('./AuthService.js');

const securitySettings: Record<string, unknown> = {
  max_failed_login_attempts: 5,
  account_lockout_duration: 1_800_000,
  require_email_verification: false
};

beforeEach(() => {
  db.reset();
  getSecuritySetting.mockImplementation(async (name: string) => securitySettings[name]);
});

describe('createUser', () => {
  const newUser = { name: 'Ada', email: 'ada@example.com', password_hash: 'hashed' };

  it('writes the columns an account needs to log in', async () => {
    await authService.createUser(newUser);

    const columns = insertColumnsOf(db.queries[0].sql);
    for (const column of [
      'id', 'name', 'email', 'username', 'password_hash', 'role',
      'email_verified', 'failed_login_attempts', 'created_at', 'updated_at'
    ]) {
      expect(columns).toContain(column);
    }
    expect(db.queries[0].params).toHaveLength(columns.length);
  });

  it('starts the account unverified with a clean attempt counter', async () => {
    await authService.createUser(newUser);

    const columns = insertColumnsOf(db.queries[0].sql);
    const { params } = db.queries[0];
    expect(params[columns.indexOf('role')]).toBe('user');
    expect(params[columns.indexOf('email_verified')]).toBe(0);
    expect(params[columns.indexOf('failed_login_attempts')]).toBe(0);
  });

  it('refuses to create an account with no password hash', async () => {
    // A blank hash would make every password comparison fail open-ended.
    await expect(
      authService.createUser({ ...newUser, password_hash: '' })
    ).rejects.toThrow(/required/i);
    expect(db.queries).toHaveLength(0);
  });

  it('refuses a duplicate email', async () => {
    db.exists.mockReturnValue(true);

    await expect(authService.createUser(newUser)).rejects.toThrow(/already exists/i);
    expect(db.queries).toHaveLength(0);
  });
});

describe('updateLoginAttempts', () => {
  it('clears the counter and stamps the login on success', async () => {
    await authService.updateLoginAttempts(1, true);

    const sql = flattenSql(db.queries[0].sql);
    expect(sql).toMatch(/failed_login_attempts = 0/);
    expect(sql).toMatch(/account_locked_until = NULL/);
    expect(sql).toMatch(/last_login = datetime\('now'\)/);
  });

  it('increments the counter on failure without locking early', async () => {
    db.getOne.mockReturnValue({ failed_login_attempts: 2 });

    await authService.updateLoginAttempts(1, false);

    const [attempts, lockedUntil] = db.queries[0].params;
    expect(attempts).toBe(3);
    expect(lockedUntil).toBeNull();
  });

  it('locks the account exactly on the configured attempt', async () => {
    db.getOne.mockReturnValue({ failed_login_attempts: 4 });

    await authService.updateLoginAttempts(1, false);

    const [attempts, lockedUntil] = db.queries[0].params;
    expect(attempts).toBe(5);
    expect(lockedUntil).toBeTruthy();
  });

  it('sets the lockout expiry to now plus the configured duration', async () => {
    db.getOne.mockReturnValue({ failed_login_attempts: 4 });
    const before = Date.now();

    await authService.updateLoginAttempts(1, false);

    const lockedUntil = new Date(db.queries[0].params[1] as string).getTime();
    expect(lockedUntil).toBeGreaterThanOrEqual(before + 1_800_000);
    expect(lockedUntil).toBeLessThan(before + 1_800_000 + 5000);
  });

  it('counts a first failure from zero for a user who has never failed', async () => {
    db.getOne.mockReturnValue(undefined);

    await authService.updateLoginAttempts(1, false);

    expect(db.queries[0].params[0]).toBe(1);
  });

  it('honours a lowered attempt limit from settings', async () => {
    securitySettings.max_failed_login_attempts = 2;
    db.getOne.mockReturnValue({ failed_login_attempts: 1 });

    await authService.updateLoginAttempts(1, false);

    expect(db.queries[0].params[1]).toBeTruthy();
    securitySettings.max_failed_login_attempts = 5;
  });

  it('rejects an invalid id', async () => {
    await expect(authService.updateLoginAttempts(0)).rejects.toThrow(/id/i);
  });
});

describe('isAccountLocked', () => {
  it('reports a lock that has not yet expired', () => {
    const future = new Date(Date.now() + 60_000).toISOString();

    expect(authService.isAccountLocked({ account_locked_until: future } as never)).toBe(true);
  });

  it('reports an expired lock as clear', () => {
    const past = new Date(Date.now() - 60_000).toISOString();

    expect(authService.isAccountLocked({ account_locked_until: past } as never)).toBe(false);
  });

  it('reports an unlocked account as clear', () => {
    expect(authService.isAccountLocked({ account_locked_until: null } as never)).toBe(false);
    expect(authService.isAccountLocked(null as never)).toBe(false);
  });
});

describe('password and profile updates', () => {
  it('stamps the change time alongside a new password hash', async () => {
    await authService.updateUserPassword(1, 'new-hash');

    const [, , updateData] = db.updateRecord.mock.calls[0];
    expect(updateData).toMatchObject({ password_hash: 'new-hash' });
    expect(updateData.password_updated_at).toBeTruthy();
  });

  it('refuses to set an empty password hash', async () => {
    await expect(authService.updateUserPassword(1, '')).rejects.toThrow(/password hash/i);
    expect(db.updateRecord).not.toHaveBeenCalled();
  });

  it('stamps the verification time when verifying an email', async () => {
    await authService.verifyUserEmail(1);

    const [, , updateData] = db.updateRecord.mock.calls[0];
    expect(updateData).toMatchObject({ email_verified: 1 });
    expect(updateData.email_verified_at).toBeTruthy();
  });

  it('writes only whitelisted profile fields', async () => {
    await authService.updateUserProfile(1, { name: 'Ada L.', role: 'admin' } as never);

    const [, , updateData] = db.updateRecord.mock.calls[0];
    expect(updateData).toEqual({ name: 'Ada L.' });
  });

  it('will not let a profile update escalate a role', async () => {
    // `role` outside the whitelist is the difference between a profile edit and
    // a privilege escalation.
    await expect(
      authService.updateUserProfile(1, { role: 'admin' } as never)
    ).rejects.toThrow(/no valid fields/i);
    expect(db.updateRecord).not.toHaveBeenCalled();
  });

  it('rejects an email already in use by someone else', async () => {
    db.getOne.mockReturnValue({ id: 2 });

    await expect(authService.updateUserProfile(1, { email: 'taken@example.com' }))
      .rejects.toThrow(/already in use/i);
  });

  it('excludes the user themselves from the email check', async () => {
    db.getOne.mockReturnValue(undefined);

    await authService.updateUserProfile(1, { email: 'ada@example.com' });

    expect(db.getOne.mock.calls[0][1]).toEqual(['ada@example.com', 1]);
  });

  it('rejects an invalid id', async () => {
    await expect(authService.updateUserPassword(0, 'h')).rejects.toThrow(/id/i);
    await expect(authService.verifyUserEmail(0)).rejects.toThrow(/id/i);
    await expect(authService.updateUserProfile(0, { name: 'x' })).rejects.toThrow(/id/i);
  });
});

describe('locking', () => {
  it('locks for the requested duration', async () => {
    const before = Date.now();

    await authService.lockUser(1, 60_000);

    const [, , updateData] = db.updateRecord.mock.calls[0];
    const lockedUntil = new Date(updateData.account_locked_until as string).getTime();
    expect(lockedUntil).toBeGreaterThanOrEqual(before + 60_000);
  });

  it('unlocking clears both the counter and the window', async () => {
    await authService.unlockUser(1);

    const [, , updateData] = db.updateRecord.mock.calls[0];
    expect(updateData).toEqual({ failed_login_attempts: 0, account_locked_until: null });
  });

  it('rejects an invalid id', async () => {
    await expect(authService.lockUser(0, 1000)).rejects.toThrow(/id/i);
    await expect(authService.unlockUser(0)).rejects.toThrow(/id/i);
  });
});

describe('deleteUser', () => {
  it('will not delete the last administrator', async () => {
    db.getOne.mockImplementation((sql: string) =>
      /COUNT/.test(sql) ? { count: 1 } : { id: 1, role: 'admin' }
    );

    await expect(authService.deleteUser(1)).rejects.toThrow(/last administrator/i);
    expect(db.deleteById).not.toHaveBeenCalled();
  });

  it('deletes an administrator while another remains', async () => {
    db.getOne.mockImplementation((sql: string) =>
      /COUNT/.test(sql) ? { count: 3 } : { id: 1, role: 'admin' }
    );

    await expect(authService.deleteUser(1)).resolves.toBe(true);
  });

  it('rejects an invalid id', async () => {
    await expect(authService.deleteUser(0)).rejects.toThrow(/id/i);
  });
});

describe('authentication lookups', () => {
  it('selects the password hash only for the authentication query', async () => {
    db.getOne.mockReturnValue({ id: 1 });

    await authService.getUserForAuthentication('ada@example.com');
    expect(flattenSql(db.getOne.mock.calls[0][0] as string)).toMatch(/password_hash/);

    db.reset();
    db.getOne.mockReturnValue({ id: 1 });
    await authService.getUserById(1);
    expect(flattenSql(db.getOne.mock.calls[0][0] as string)).not.toMatch(/password_hash/);
  });

  it('selects the lockout fields the login flow branches on', async () => {
    db.getOne.mockReturnValue({ id: 1 });

    await authService.getUserForAuthentication('ada@example.com');

    const sql = flattenSql(db.getOne.mock.calls[0][0] as string);
    expect(sql).toMatch(/failed_login_attempts/);
    expect(sql).toMatch(/account_locked_until/);
  });

  it('reports login statistics with the lock state resolved', async () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    db.getOne.mockReturnValue({
      last_login: '2026-07-01T00:00:00.000Z',
      failed_login_attempts: 3,
      account_locked_until: future
    });

    await expect(authService.getUserLoginStats(1)).resolves.toEqual({
      lastLogin: '2026-07-01T00:00:00.000Z',
      failedAttempts: 3,
      isLocked: true,
      lockedUntil: future
    });
  });

  it('rejects statistics for a user that does not exist', async () => {
    db.getOne.mockReturnValue(undefined);

    await expect(authService.getUserLoginStats(1)).rejects.toThrow(/not found/i);
  });

  it('reads the email-verification requirement from settings', async () => {
    securitySettings.require_email_verification = true;

    await expect(authService.isEmailVerificationRequired()).resolves.toBe(true);
    securitySettings.require_email_verification = false;
  });

  it('rejects a blank email or username', async () => {
    await expect(authService.getUserByEmail('')).rejects.toThrow(/email/i);
    await expect(authService.getUserForAuthentication('')).rejects.toThrow(/email/i);
    await expect(authService.getUserByUsername('')).rejects.toThrow(/username/i);
  });

  it('answers false for an invalid id or blank email rather than querying', async () => {
    await expect(authService.userExists(0)).resolves.toBe(false);
    await expect(authService.emailExists('')).resolves.toBe(false);
    expect(db.exists).not.toHaveBeenCalled();
  });

  it('pages the admin user list', async () => {
    await authService.getAllUsers({ limit: 20, offset: 40 });

    expect(db.getMany.mock.calls[0][1]).toEqual([20, 40]);
    expect(flattenSql(db.getMany.mock.calls[0][0] as string)).not.toMatch(/password_hash/);
  });
});
