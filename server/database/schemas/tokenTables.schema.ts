import type { IDatabase } from '../../types/database.types.js';

/**
 * Create token tables for password reset and email verification.
 * These are short-lived access corridors — designed for fast lookup,
 * automatic expiry, and clean cascade demolition when a user is removed.
 */
export function createTokenTables(db: IDatabase): void {
  // Password reset tokens
  db.executeQuery(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL,
      token_hash  TEXT    NOT NULL UNIQUE,
      expires_at  TEXT    NOT NULL,
      used_at     TEXT    DEFAULT NULL,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    )
  `);

  // Arterial indexes
  db.executeQuery(`
    CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id
    ON password_reset_tokens (user_id)
  `);

  db.executeQuery(`
    CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires_at
    ON password_reset_tokens (expires_at)
  `);

  // Fast path for “still-valid & unused” lookups
  db.executeQuery(`
    CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_active
    ON password_reset_tokens (token_hash, expires_at, used_at)
    WHERE used_at IS NULL
  `);

  // Email verification tokens
  db.executeQuery(`
    CREATE TABLE IF NOT EXISTS email_verification_tokens (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL,
      token_hash  TEXT    NOT NULL UNIQUE,
      expires_at  TEXT    NOT NULL,
      used_at     TEXT    DEFAULT NULL,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    )
  `);

  db.executeQuery(`
    CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_user_id
    ON email_verification_tokens (user_id)
  `);

  db.executeQuery(`
    CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_expires_at
    ON email_verification_tokens (expires_at)
  `);

  db.executeQuery(`
    CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_active
    ON email_verification_tokens (token_hash, expires_at, used_at)
    WHERE used_at IS NULL
  `);
}