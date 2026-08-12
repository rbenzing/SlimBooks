// Auth Service - Domain-specific service for authentication operations
// Handles all user authentication business logic and database operations

import { databaseService } from '../core/DatabaseService.js';
import { settingsService } from './SettingsService.js';
import { type User, type UserPublic } from '../types/index.js';
import { utcNow, utcTimestamp } from '../utils/utcTime.util.js';

/**
 * Authentication Service
 * Manages user authentication, login attempts, and account security
 */
export class AuthService {
  /**
   * Get user by email
   */
  async getUserByEmail(email: string): Promise<User | null> {
    if (!email || typeof email !== 'string') {
      throw new Error('Valid email is required');
    }
    return databaseService.getOne<User>('SELECT * FROM users WHERE email = ?', [email]);
  }

  /**
   * Get user by ID
   */
  async getUserById(userId: number): Promise<UserPublic | null> {
    if (!userId || typeof userId !== 'number') {
      throw new Error('Valid user ID is required');
    }
    return databaseService.getOne<UserPublic>(
      'SELECT id, name, email, username, role, email_verified FROM users WHERE id = ?', 
      [userId]
    );
  }

  /**
   * Create new user
   */
  async createUser(userData: {
    name: string;
    email: string;
    username?: string;
    password_hash: string;
    role?: 'user' | 'admin';
    email_verified?: number;
  }): Promise<number> {
    const { name, email, username, password_hash, role = 'user', email_verified = 0 } = userData;
    
    if (!name || !email || !password_hash) {
      throw new Error('Name, email, and password hash are required');
    }

    // Check if user already exists
    if (await databaseService.exists('users', 'email', email)) {
      throw new Error('User with this email already exists');
    }

    // Get next user ID from counter
    const nextId = await databaseService.getNextSequence('users');

    // Create user
    const now = utcNow();
    await databaseService.executeQuery(`
      INSERT INTO users (
        id, name, email, username, password_hash, role, email_verified,
        failed_login_attempts, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [nextId, name, email, username || email, password_hash, role, email_verified, 0, now, now]);

    return nextId;
  }

  /**
   * Update user login attempts and lock account if necessary
   */
  async updateLoginAttempts(userId: number, success = false): Promise<boolean> {
    if (!userId || typeof userId !== 'number') {
      throw new Error('Valid user ID is required');
    }

    if (success) {
      // Reset failed attempts on successful login
      const now = databaseService.dialect.now();
      await databaseService.executeQuery(`
        UPDATE users
        SET failed_login_attempts = 0, account_locked_until = NULL, last_login = ${now}, updated_at = ${now}
        WHERE id = ?
      `, [userId]);
      return true;
    }

    // Increment failed attempts
    const user = await databaseService.getOne<{failed_login_attempts: number}>(
      'SELECT failed_login_attempts FROM users WHERE id = ?',
      [userId]
    );
    const newAttempts = (user?.failed_login_attempts || 0) + 1;

    // Get current lockout settings
    const maxAttempts = await settingsService.getSecuritySetting('max_failed_login_attempts') as number;
    const lockoutDuration = await settingsService.getSecuritySetting('account_lockout_duration') as number;

    let lockedUntil: number | null = null;
    if (newAttempts >= maxAttempts) {
      lockedUntil = utcTimestamp(new Date(Date.now() + lockoutDuration));
    }

    await databaseService.executeQuery(`
      UPDATE users
      SET failed_login_attempts = ?, account_locked_until = ?, updated_at = ${databaseService.dialect.now()}
      WHERE id = ?
    `, [newAttempts, lockedUntil, userId]);

    return true;
  }

  /**
   * Check if user account is locked
   */
  isAccountLocked(user: User | UserPublic): boolean {
    if (!user) return false;
    return !!(user.account_locked_until && new Date(user.account_locked_until) > new Date());
  }

  /**
   * Check if email verification is required
   */
  async isEmailVerificationRequired(): Promise<boolean> {
    return await settingsService.getSecuritySetting('require_email_verification') as boolean;
  }

  /**
   * Verify user email
   */
  async verifyUserEmail(userId: number): Promise<boolean> {
    if (!userId || typeof userId !== 'number') {
      throw new Error('Valid user ID is required');
    }

    const changes = databaseService.updateRecord('users', userId, { 
      email_verified: 1,
      email_verified_at: utcNow()
    });
    return changes;
  }

  /**
   * Update user password
   */
  async updateUserPassword(userId: number, passwordHash: string): Promise<boolean> {
    if (!userId || typeof userId !== 'number') {
      throw new Error('Valid user ID is required');
    }
    
    if (!passwordHash || typeof passwordHash !== 'string') {
      throw new Error('Valid password hash is required');
    }

    const changes = databaseService.updateRecord('users', userId, { 
      password_hash: passwordHash,
      password_updated_at: utcNow()
    });
    return changes;
  }

  /**
   * Get user with security info (for authentication)
   */
  async getUserForAuthentication(email: string): Promise<User | null> {
    if (!email || typeof email !== 'string') {
      throw new Error('Valid email is required');
    }

    return databaseService.getOne<User>(`
      SELECT id, name, email, username, password_hash, role, email_verified, 
             failed_login_attempts, account_locked_until, last_login
      FROM users WHERE email = ?
    `, [email]);
  }

  /**
   * Update user profile
   */
  async updateUserProfile(userId: number, profileData: {
    name?: string;
    username?: string;
    email?: string;
  }): Promise<boolean> {
    if (!userId || typeof userId !== 'number') {
      throw new Error('Valid user ID is required');
    }

    const allowedFields = ['name', 'username', 'email'];
    const updateData: Record<string, unknown> = {};
    
    // Filter to only allowed fields
    for (const field of allowedFields) {
      if (profileData[field as keyof typeof profileData] !== undefined) {
        updateData[field] = profileData[field as keyof typeof profileData];
      }
    }

    if (Object.keys(updateData).length === 0) {
      throw new Error('No valid fields to update');
    }

    // Check email uniqueness if email is being updated
    if (updateData.email) {
      const existingUser = await databaseService.getOne<{id: number}>(
        'SELECT id FROM users WHERE email = ? AND id != ?',
        [updateData.email, userId]
      );
      if (existingUser) {
        throw new Error('Email is already in use');
      }
    }

    const changes = databaseService.updateRecord('users', userId, updateData);
    return changes;
  }

  /**
   * Get all users (admin only)
   */
  async getAllUsers(options: { limit?: number; offset?: number } = {}): Promise<UserPublic[]> {
    const { limit = 100, offset = 0 } = options;
    
    return databaseService.getMany<UserPublic>(`
      SELECT id, name, email, username, role, email_verified, 
             failed_login_attempts, account_locked_until, created_at, last_login
      FROM users 
      ORDER BY created_at DESC 
      LIMIT ? OFFSET ?
    `, [limit, offset]);
  }

  /**
   * Delete user (admin only)
   */
  async deleteUser(userId: number): Promise<boolean> {
    if (!userId || typeof userId !== 'number') {
      throw new Error('Valid user ID is required');
    }

    // Don't allow deletion of the last admin
    const adminCount = await databaseService.getOne<{count: number}>(
      "SELECT COUNT(*) as count FROM users WHERE role = 'admin'"
    );
    const userToDelete = await databaseService.getOne<UserPublic>('SELECT * FROM users WHERE id = ?', [userId]);
    
    if (userToDelete?.role === 'admin' && (adminCount?.count || 0) <= 1) {
      throw new Error('Cannot delete the last administrator');
    }

    const changes = databaseService.deleteById('users', userId);
    return changes;
  }

  /**
   * Get user by username
   */
  async getUserByUsername(username: string): Promise<User | null> {
    if (!username || typeof username !== 'string') {
      throw new Error('Valid username is required');
    }
    return databaseService.getOne<User>('SELECT * FROM users WHERE username = ?', [username]);
  }

  /**
   * Check if user exists by ID
   */
  async userExists(userId: number): Promise<boolean> {
    if (!userId || typeof userId !== 'number') {
      return false;
    }
    return databaseService.exists('users', 'id', userId);
  }

  /**
   * Check if email exists
   */
  async emailExists(email: string, excludeUserId?: number): Promise<boolean> {
    if (!email || typeof email !== 'string') {
      return false;
    }

    if (excludeUserId) {
      const user = await databaseService.getOne<{id: number}>(
        'SELECT id FROM users WHERE email = ? AND id != ?',
        [email, excludeUserId]
      );
      return !!user;
    }

    return databaseService.exists('users', 'email', email);
  }

  /**
   * Lock user account
   */
  async lockUser(userId: number, lockDuration: number): Promise<boolean> {
    if (!userId || typeof userId !== 'number') {
      throw new Error('Valid user ID is required');
    }

    const lockedUntil = utcTimestamp(new Date(Date.now() + lockDuration));
    const changes = databaseService.updateRecord('users', userId, {
      account_locked_until: lockedUntil
    });
    return changes;
  }

  /**
   * Unlock user account
   */
  async unlockUser(userId: number): Promise<boolean> {
    if (!userId || typeof userId !== 'number') {
      throw new Error('Valid user ID is required');
    }

    const changes = databaseService.updateRecord('users', userId, {
      failed_login_attempts: 0,
      account_locked_until: null
    });
    return changes;
  }

  /**
   * Get user login statistics
   */
  async getUserLoginStats(userId: number): Promise<{
    lastLogin: number | null;
    failedAttempts: number;
    isLocked: boolean;
    lockedUntil: number | null;
  }> {
    if (!userId || typeof userId !== 'number') {
      throw new Error('Valid user ID is required');
    }

    const user = await databaseService.getOne<{
      last_login: number | null;
      failed_login_attempts: number;
      account_locked_until: number | null;
    }>(`
      SELECT last_login, failed_login_attempts, account_locked_until
      FROM users WHERE id = ?
    `, [userId]);

    if (!user) {
      throw new Error('User not found');
    }

    return {
      lastLogin: user.last_login,
      failedAttempts: user.failed_login_attempts,
      isLocked: this.isAccountLocked(user as User),
      lockedUntil: user.account_locked_until
    };
  }
}

// Export singleton instance
export const authService = new AuthService();