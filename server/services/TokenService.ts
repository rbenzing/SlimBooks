import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { databaseService } from '../core/DatabaseService.js';

export interface TokenRecord {
  id: number;
  user_id: number;
  token_hash: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

export class TokenService {
  /**
   * Generate a cryptographically secure random token
   */
  private generateToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Hash a token for storage
   */
  private async hashToken(token: string): Promise<string> {
    return bcrypt.hash(token, 10);
  }

  /**
   * Verify a token against its hash
   */
  private async verifyToken(token: string, hash: string): Promise<boolean> {
    return bcrypt.compare(token, hash);
  }

  /**
   * Create a password reset token
   */
  async createPasswordResetToken(userId: number, expiryMs: number): Promise<string> {
    const token = this.generateToken();
    const tokenHash = await this.hashToken(token);
    const expiresAt = new Date(Date.now() + expiryMs).toISOString();

    // Delete any existing unused tokens for this user
    await databaseService.executeQuery(
      'DELETE FROM password_reset_tokens WHERE user_id = ? AND used_at IS NULL',
      [userId]
    );

    // Insert new token
    await databaseService.executeQuery(
      'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
      [userId, tokenHash, expiresAt]
    );

    return token;
  }

  /**
   * Verify and consume a password reset token
   * Returns userId if valid, null if invalid
   */
  async verifyPasswordResetToken(token: string): Promise<number | null> {
    const records = await databaseService.getMany<TokenRecord>(
      `SELECT * FROM password_reset_tokens
       WHERE used_at IS NULL
       AND expires_at > datetime('now')
       ORDER BY created_at DESC`
    );

    for (const record of records) {
      const isValid = await this.verifyToken(token, record.token_hash);
      if (isValid) {
        // Mark token as used
        await databaseService.executeQuery(
          'UPDATE password_reset_tokens SET used_at = datetime(\'now\') WHERE id = ?',
          [record.id]
        );
        return record.user_id;
      }
    }

    return null;
  }

  /**
   * Create an email verification token
   */
  async createEmailVerificationToken(userId: number, expiryMs: number): Promise<string> {
    const token = this.generateToken();
    const tokenHash = await this.hashToken(token);
    const expiresAt = new Date(Date.now() + expiryMs).toISOString();

    // Delete any existing unused tokens for this user
    await databaseService.executeQuery(
      'DELETE FROM email_verification_tokens WHERE user_id = ? AND used_at IS NULL',
      [userId]
    );

    // Insert new token
    await databaseService.executeQuery(
      'INSERT INTO email_verification_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
      [userId, tokenHash, expiresAt]
    );

    return token;
  }

  /**
   * Verify and consume an email verification token
   * Returns userId if valid, null if invalid
   */
  async verifyEmailVerificationToken(token: string): Promise<number | null> {
    const records = await databaseService.getMany<TokenRecord>(
      `SELECT * FROM email_verification_tokens
       WHERE used_at IS NULL
       AND expires_at > datetime('now')
       ORDER BY created_at DESC`
    );

    for (const record of records) {
      const isValid = await this.verifyToken(token, record.token_hash);
      if (isValid) {
        // Mark token as used
        await databaseService.executeQuery(
          'UPDATE email_verification_tokens SET used_at = datetime(\'now\') WHERE id = ?',
          [record.id]
        );
        return record.user_id;
      }
    }

    return null;
  }

  /**
   * Clean up expired tokens (should be run periodically)
   */
  async cleanupExpiredTokens(): Promise<void> {
    await databaseService.executeQuery(
      'DELETE FROM password_reset_tokens WHERE expires_at < datetime(\'now\')'
    );
    await databaseService.executeQuery(
      'DELETE FROM email_verification_tokens WHERE expires_at < datetime(\'now\')'
    );
  }
}

export const tokenService = new TokenService();
