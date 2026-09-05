// Setup controller for Slimbooks
// Bootstraps the first administrator on an empty install, replacing the
// ADMIN_PASSWORD-seeded admin this project used to create automatically.

import { type Request, type Response } from 'express';
import bcrypt from 'bcryptjs';
import { databaseService } from '../core/DatabaseService.js';
import { authConfig, validationConfig } from '../config/index.js';
import { userService } from '../services/UserService.js';
import { asyncHandler, generateToken, ValidationError } from '../middleware/index.js';
import { utcNow } from '../utils/utcTime.util.js';

/** Thrown when a concurrent request already claimed the first-admin slot. */
class SetupAlreadyCompletedError extends Error {}

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
 * Create the first administrator.
 *
 * Guarded by a claim row in `settings` rather than a count-then-insert: two
 * concurrent submissions (two browser tabs) both reading a count of zero and
 * both proceeding is exactly the race a plain count check cannot close.
 * `dialect.insertIgnore` makes the claim a single statement that at most one
 * of two concurrent callers can win — the loser's insert reports zero rows
 * changed rather than throwing, on both engines. See `insertIgnoreLive.test.ts`
 * for proof against SQLite and MySQL/MariaDB.
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

  // Length-only for now. Task 5 points this at the live, DB-backed password
  // policy, alongside every other password-creating call site.
  const { minLength, maxLength } = validationConfig.password;
  if (password.length < minLength || password.length > maxLength) {
    throw new ValidationError(`Password must be between ${minLength} and ${maxLength} characters`);
  }

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
        ['setup.admin_created', JSON.stringify(true), 'setup', now, now]
      );

      if (claim.changes === 0) {
        throw new SetupAlreadyCompletedError();
      }

      const insert = await databaseService.executeQuery(
        `INSERT INTO users (name, email, username, password_hash, role, email_verified, failed_login_attempts, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'admin', 1, 0, ?, ?)`,
        [name.trim(), email.trim(), username.trim(), hashedPassword, now, now]
      );

      return insert.lastInsertRowid;
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
