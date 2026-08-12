/**
 * TokenService tests.
 *
 * Password-reset and email-verification tokens are bearer credentials: the
 * plaintext is returned once and only a bcrypt hash is stored, each token is
 * single-use, and an expired one must never verify. Those properties are what
 * stop a leaked database row from becoming an account takeover.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import { createDatabaseMock, flattenSql } from './databaseMock.test-helper.js';
import { sqliteDialect } from '../database/dialects/sqlite.dialect.js';

const db = createDatabaseMock();
vi.mock('../core/DatabaseService.js', () => ({ databaseService: db }));

const { tokenService } = await import('./TokenService.js');

const HOUR = 60 * 60 * 1000;

/** A stored row for a token the service should accept. */
const storedRow = async (token: string, over: Record<string, unknown> = {}) => ({
  id: 7,
  user_id: 42,
  token_hash: await bcrypt.hash(token, 10),
  expires_at: new Date(Date.now() + HOUR).toISOString(),
  used_at: null,
  created_at: new Date().toISOString(),
  ...over
});

beforeEach(() => db.reset());

const flows = [
  {
    kind: 'password reset',
    table: 'password_reset_tokens',
    create: (userId: number, ms: number) => tokenService.createPasswordResetToken(userId, ms),
    verify: (token: string) => tokenService.verifyPasswordResetToken(token)
  },
  {
    kind: 'email verification',
    table: 'email_verification_tokens',
    create: (userId: number, ms: number) => tokenService.createEmailVerificationToken(userId, ms),
    verify: (token: string) => tokenService.verifyEmailVerificationToken(token)
  }
];

describe.each(flows)('$kind tokens', ({ table, create, verify }) => {
  const insertOf = () => db.queries.find(q => /INSERT INTO/.test(q.sql));

  it('returns a high-entropy token to the caller', async () => {
    const token = await create(42, HOUR);

    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it('issues a different token every time', async () => {
    const first = await create(42, HOUR);
    const second = await create(42, HOUR);

    expect(first).not.toBe(second);
  });

  it('stores only a hash, never the token itself', async () => {
    // A readable token in the database is a standing account takeover.
    const token = await create(42, HOUR);

    expect(insertOf()?.params).not.toContain(token);
    expect(String(insertOf()?.params[1])).toMatch(/^\$2[aby]\$/);
  });

  it('stores a hash that verifies against the issued token', async () => {
    const token = await create(42, HOUR);

    await expect(bcrypt.compare(token, String(insertOf()?.params[1]))).resolves.toBe(true);
  });

  it('invalidates the previous unused token first', async () => {
    // Otherwise an older emailed link keeps working after a re-request.
    await create(42, HOUR);

    const [first, second] = db.queries;
    expect(flattenSql(first.sql)).toBe(
      `DELETE FROM ${table} WHERE user_id = ? AND used_at IS NULL`
    );
    expect(first.params).toEqual([42]);
    expect(flattenSql(second.sql)).toMatch(new RegExp(`INSERT INTO ${table}`));
  });

  it('records the expiry the caller asked for', async () => {
    const before = Date.now();

    await create(42, HOUR);

    const expiresAt = new Date(String(insertOf()?.params[2])).getTime();
    // A second of slack: stored timestamps carry whole seconds, so an expiry
    // computed from a sub-second `before` truncates down by up to 999ms.
    expect(expiresAt).toBeGreaterThanOrEqual(before + HOUR - 1000);
    expect(expiresAt).toBeLessThan(before + HOUR + 5000);
  });

  it('resolves a valid token to its user', async () => {
    const token = 'a'.repeat(64);
    db.getMany.mockReturnValue([await storedRow(token)]);

    await expect(verify(token)).resolves.toBe(42);
  });

  it('only considers unused, unexpired rows', async () => {
    db.getMany.mockReturnValue([]);

    await verify('anything');

    const sql = flattenSql(db.getMany.mock.calls[0][0] as string);
    expect(sql).toMatch(new RegExp(`FROM ${table}`));
    expect(sql).toMatch(/used_at IS NULL/);
    expect(sql).toContain(`expires_at > ${sqliteDialect.now()}`);
  });

  it('burns the token on use so it cannot be replayed', async () => {
    const token = 'b'.repeat(64);
    db.getMany.mockReturnValue([await storedRow(token)]);

    await verify(token);

    const update = db.queries.find(q => /UPDATE/.test(q.sql));
    expect(flattenSql(update?.sql ?? '')).toBe(
      `UPDATE ${table} SET used_at = ${sqliteDialect.now()} WHERE id = ?`
    );
    expect(update?.params).toEqual([7]);
  });

  it('rejects a token that matches no stored hash', async () => {
    db.getMany.mockReturnValue([await storedRow('c'.repeat(64))]);

    await expect(verify('d'.repeat(64))).resolves.toBeNull();
    expect(db.queries).toHaveLength(0);
  });

  it('rejects any token when nothing is outstanding', async () => {
    db.getMany.mockReturnValue([]);

    await expect(verify('e'.repeat(64))).resolves.toBeNull();
  });

  it('rejects an empty token', async () => {
    db.getMany.mockReturnValue([await storedRow('f'.repeat(64))]);

    await expect(verify('')).resolves.toBeNull();
  });

  it('picks the matching row when several are outstanding', async () => {
    const mine = 'g'.repeat(64);
    db.getMany.mockReturnValue([
      await storedRow('h'.repeat(64), { id: 1, user_id: 1 }),
      await storedRow(mine, { id: 2, user_id: 42 }),
      await storedRow('i'.repeat(64), { id: 3, user_id: 3 })
    ]);

    await expect(verify(mine)).resolves.toBe(42);
    expect(db.queries[0].params).toEqual([2]);
  });
});

describe('cleanupExpiredTokens', () => {
  it('purges both token tables', async () => {
    await tokenService.cleanupExpiredTokens();

    const statements = db.queries.map(q => flattenSql(q.sql));
    expect(statements).toEqual([
      `DELETE FROM password_reset_tokens WHERE expires_at < ${sqliteDialect.now()}`,
      `DELETE FROM email_verification_tokens WHERE expires_at < ${sqliteDialect.now()}`
    ]);
  });

  it('only removes rows that have already expired', async () => {
    await tokenService.cleanupExpiredTokens();

    for (const { sql } of db.queries) {
      expect(flattenSql(sql)).toContain(`expires_at < ${sqliteDialect.now()}`);
    }
  });
});
