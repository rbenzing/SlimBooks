// Setup controller for Slimbooks
// Bootstraps the first administrator on an empty install, replacing the
// ADMIN_PASSWORD-seeded admin this project used to create automatically.

import { type Request, type Response } from 'express';
import bcrypt from 'bcryptjs';
import { databaseService } from '../core/DatabaseService.js';
import { authConfig } from '../config/index.js';
import { userService } from '../services/UserService.js';
import { asyncHandler, generateToken, ValidationError } from '../middleware/index.js';
import { utcNow } from '../utils/utcTime.util.js';
import { settingsService } from '../services/SettingsService.js';
import { validatePasswordAgainstPolicy } from '../utils/passwordPolicy.util.js';

/** Thrown when a concurrent request already claimed the first-admin slot. */
class SetupAlreadyCompletedError extends Error {}

const CLAIM_KEY = 'setup.admin_created';

/**
 * Whether an install still needs its first administrator.
 *
 * The users table itself is the signal — there is no separate "setup
 * complete" flag — so this can never disagree with whether an admin actually
 * exists.
 */
export const getSetupStatus = asyncHandler(async (_req: Request, res: Response): Promise<void> => {
  const row = await databaseService.getOne<{ count: number }>('SELECT COUNT(*) as count FROM users');
  const needsSetup = !row || row.count === 0;

  res.json({ success: true, data: { needsSetup } });
});

/**
 * Deletes the claim row if it no longer refers to a real admin.
 *
 * The claim's `value` is the id of the user it created. If that user no
 * longer exists — an operator emptied the `users` table while `settings`
 * survived — the claim is orphaned: nothing will ever satisfy it, and
 * `completeSetup` would 409 forever with no way through the UI. A claim
 * written by 2.4.0 stores the literal string `"true"` instead of an id;
 * `Number('true')` is `NaN`, which is treated the same as "no user found"
 * and falls back to the users-count check.
 *
 * A persisted `value` of `'pending'` is never treated as orphaned. `'pending'`
 * is the placeholder `completeSetup`'s transaction writes before it inserts
 * the admin and then overwrites with the real user id — it is only ever
 * observable, by a separate request reading it back, while that transaction
 * is genuinely still in flight on this process's single shared SQLite
 * connection. A crash mid-transaction rolls the whole transaction back via
 * SQLite's own recovery, taking the placeholder row with it — it can never
 * persist as a stale `'pending'` for a later request to find. Without this
 * check, `repairOrphanedClaim` running concurrently with an in-progress
 * `completeSetup` would read `'pending'`, get `NaN` from `Number('pending')`,
 * fall back to the users-count check (still zero, since the in-progress
 * request hasn't committed yet), conclude the claim is orphaned, and delete
 * it — and because SQLite has no per-request connection isolation, that
 * DELETE would execute inside the *other* request's still-open transaction,
 * silently removing the guard while it is mid-write and leaving no claim
 * behind for a later request to collide with.
 *
 * Deliberately outside any transaction: two requests racing through this at
 * once both deleting the same already-orphaned row is harmless (the second
 * DELETE affects zero rows), and neither this function nor its absence
 * decides who wins the claim below — the `INSERT IGNORE`/`INSERT OR IGNORE`
 * does, exactly as it always has.
 */
const repairOrphanedClaim = async (): Promise<void> => {
  const claim = await databaseService.getOne<{ value: string }>(
    "SELECT value FROM settings WHERE `key` = ?",
    [CLAIM_KEY]
  );
  if (!claim) return;
  if (claim.value === 'pending') return; // an in-flight, uncommitted claim — never treat as orphaned

  const claimedUserId = Number(claim.value);
  const claimedUserExists = Number.isInteger(claimedUserId)
    ? !!(await userService.getUserById(claimedUserId))
    : ((await databaseService.getOne<{ count: number }>('SELECT COUNT(*) as count FROM users'))?.count ?? 0) > 0;

  if (!claimedUserExists) {
    await databaseService.executeQuery("DELETE FROM settings WHERE `key` = ?", [CLAIM_KEY]);
  }
};

/**
 * Create the first administrator.
 *
 * Guarded by a claim row in `settings` rather than a count-then-insert: two
 * concurrent submissions (two browser tabs) both reading a count of zero and
 * both proceeding is exactly the race a plain count check cannot close.
 * `dialect.insertIgnore` makes the claim a single statement that at most one
 * of two concurrent callers can win — the loser's insert reports zero rows
 * changed rather than throwing, on both engines. See `insertIgnoreLive.test.ts`
 * for proof against SQLite and MySQL/MariaDB.
 *
 * The claim's value is the created admin's user id, not a bare boolean, so a
 * later request can tell a genuinely completed setup apart from an orphaned
 * claim (see `repairOrphanedClaim`) — a stranded install repairs itself on
 * its next setup attempt.
 */
export const completeSetup = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { name, email, username, password } = req.body as {
    name?: unknown; email?: unknown; username?: unknown; password?: unknown;
  };

  if (typeof name !== 'string' || name.trim().length === 0) {
    throw new ValidationError('Name is required');
  }
  if (typeof email !== 'string' || email.trim().length === 0) {
    throw new ValidationError('Email is required');
  }
  if (typeof username !== 'string' || username.trim().length === 0) {
    throw new ValidationError('Username is required');
  }
  if (typeof password !== 'string' || password.length === 0) {
    throw new ValidationError('Password is required');
  }

  const policy = await settingsService.getPasswordPolicy();
  const violations = validatePasswordAgainstPolicy(password, policy);
  if (violations.length > 0) {
    throw new ValidationError(violations.join(', '));
  }

  await repairOrphanedClaim();

  const existing = await databaseService.getOne<{ count: number }>('SELECT COUNT(*) as count FROM users');
  if (existing && existing.count > 0) {
    res.status(409).json({ success: false, error: 'Setup has already been completed.' });
    return;
  }

  const hashedPassword = await bcrypt.hash(password, authConfig.bcryptRounds);
  const now = utcNow();

  let userId: number;
  try {
    userId = await databaseService.withTransaction(async () => {
      const claim = await databaseService.executeQuery(
        databaseService.dialect.insertIgnore('settings', ['key', 'value', 'category', 'created_at', 'updated_at']),
        [CLAIM_KEY, 'pending', 'setup', now, now]
      );

      if (claim.changes === 0) {
        throw new SetupAlreadyCompletedError();
      }

      const insert = await databaseService.executeQuery(
        `INSERT INTO users (name, email, username, password_hash, role, email_verified, failed_login_attempts, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'admin', 1, 0, ?, ?)`,
        [name.trim(), email.trim(), username.trim(), hashedPassword, now, now]
      );

      const newUserId = insert.lastInsertRowid;

      await databaseService.executeQuery(
        "UPDATE settings SET value = ? WHERE `key` = ?",
        [String(newUserId), CLAIM_KEY]
      );

      return newUserId;
    });
  } catch (error) {
    if (error instanceof SetupAlreadyCompletedError) {
      res.status(409).json({ success: false, error: 'Setup has already been completed.' });
      return;
    }
    throw error;
  }

  const user = await userService.getUserById(userId);
  if (!user) {
    throw new Error('Admin user vanished immediately after creation');
  }

  const token = generateToken(user);

  res.status(201).json({
    success: true,
    data: { user, token },
    message: 'Setup complete'
  });
});
