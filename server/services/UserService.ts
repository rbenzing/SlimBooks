// User Service - Domain-specific service for user management operations
// Handles user CRUD operations and user profile management

import { databaseService } from '../core/DatabaseService.js';
import {
  type User,
  type UserPublic,
  type ServiceOptions,
  type MutationOutcome,
  type SQLParameter
} from '../types/index.js';
import { utcNow } from '../utils/utcTime.util.js';
import { deleteUserSql, guardedUpdateSql } from '../utils/adminInvariant.util.js';

/**
 * User Management Service
 * Handles user lifecycle management, profile updates, and administrative operations
 */
export class UserService {
  /**
   * Get all users with pagination
   */
  async getAllUsers(options: ServiceOptions = {}): Promise<UserPublic[]> {
    const { limit = 100, offset = 0 } = options;
    
    return databaseService.getMany<UserPublic>(`
      SELECT id, name, email, username, role, email_verified,
             last_login, failed_login_attempts, account_locked_until, created_at, updated_at
      FROM users
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `, [limit, offset]);
  }

  /**
   * Get user by ID
   */
  async getUserById(id: number): Promise<UserPublic | null> {
    if (!id || typeof id !== 'number') {
      throw new Error('Valid user ID is required');
    }

    return databaseService.getOne<UserPublic>(`
      SELECT id, name, email, username, role, email_verified,
             last_login, failed_login_attempts, account_locked_until, created_at, updated_at
      FROM users
      WHERE id = ?
    `, [id]);
  }

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
   * Get user by Google ID
   */
  async getUserByGoogleId(googleId: string): Promise<User | null> {
    if (!googleId || typeof googleId !== 'string') {
      throw new Error('Valid Google ID is required');
    }

    return databaseService.getOne<User>(
      'SELECT * FROM users WHERE google_id = ?', 
      [decodeURIComponent(googleId)]
    );
  }

  /**
   * Create new user
   */
  async createUser(userData: {
    name: string;
    email: string;
    username?: string;
    password_hash?: string;
    role?: 'user' | 'admin';
    email_verified?: boolean;
    google_id?: string;
    last_login?: number;
    failed_login_attempts?: number;
    account_locked_until?: number;
  }): Promise<number> {
    const { 
      name, 
      email, 
      username, 
      password_hash, 
      role = 'user', 
      email_verified = false, 
      google_id, 
      last_login, 
      failed_login_attempts = 0, 
      account_locked_until 
    } = userData;
    
    // Validate required fields
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      throw new Error('Valid name is required');
    }
    
    if (!email || typeof email !== 'string' || !this.isValidEmail(email)) {
      throw new Error('Valid email is required');
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
        google_id, last_login, failed_login_attempts, account_locked_until, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      nextId, 
      name, 
      email, 
      username || email, 
      password_hash || null, 
      role, 
      email_verified ? 1 : 0,
      google_id || null,
      last_login || null,
      failed_login_attempts,
      account_locked_until || null,
      now, 
      now
    ]);

    return nextId;
  }

  /**
   * Update user
   */
  async updateUser(id: number, userData: Partial<{
    name: string;
    email: string;
    username: string;
    role: 'user' | 'admin';
    email_verified: boolean;
    google_id: string;
  }>): Promise<MutationOutcome> {
    if (!id || typeof id !== 'number') {
      throw new Error('Valid user ID is required');
    }

    if (!userData || typeof userData !== 'object') {
      throw new Error('User data is required');
    }

    // Check if user exists
    const existingUser = await this.getUserById(id);
    if (!existingUser) {
      throw new Error('User not found');
    }

    // Filter allowed fields and build update data. `password_hash` is
    // deliberately absent: passwords change through resetPassword, which
    // validates strength and applies the configured cost, and a
    // caller-supplied hash here would bypass both.
    const allowedFields = ['name', 'email', 'username', 'role', 'email_verified', 'google_id'];
    const updateData: Record<string, unknown> = {};

    allowedFields.forEach(field => {
      if (userData[field as keyof typeof userData] !== undefined) {
        updateData[field] = userData[field as keyof typeof userData];
      }
    });

    if (Object.keys(updateData).length === 0) {
      throw new Error('No valid fields to update');
    }

    if (updateData.email) {
      if (!this.isValidEmail(updateData.email as string)) {
        throw new Error('Invalid email format');
      }

      if (updateData.email !== existingUser.email) {
        const emailExists = await databaseService.getOne<{ id: number }>(
          'SELECT id FROM users WHERE email = ? AND id != ?',
          [updateData.email, id]
        );
        if (emailExists) {
          throw new Error('Email is already in use');
        }
      }
    }

    if (updateData.email_verified !== undefined) {
      updateData.email_verified = updateData.email_verified ? 1 : 0;
    }

    updateData.updated_at = utcNow();

    // Only a role change can break the invariant. Changing a name cannot, and
    // promoting to administrator cannot — guarding those would refuse edits to
    // the sole administrator's own profile for no reason.
    //
    // The decision reads the *requested* role, never its type. Deciding from
    // `typeof role === 'string'` is what shipped broken: `{ role: 123 }` is
    // still a role change away from 'admin', it was classified as harmless,
    // and the resulting UPDATE carried no predicate — it demoted the only
    // administrator and left the install with none.
    //
    // Attaching the guard to a row that is not an administrator costs nothing:
    // `NOT('admin' = role AND ...)` is simply true. That also removes the
    // window between reading `existingUser` and writing, in which the row
    // could have been promoted.
    const guarded = updateData.role !== undefined && updateData.role !== 'admin';

    const columns = Object.keys(updateData);
    const params = [...columns.map(column => updateData[column]), id] as SQLParameter[];

    const result = await databaseService.executeQuery(
      guardedUpdateSql(columns, guarded),
      params
    );

    // Zero affected rows only means "refused" when a guard was attached.
    //
    // The engines disagree about the unguarded case: `changes` is mysql2's
    // affectedRows, which counts rows whose values actually CHANGED, while
    // SQLite counts every row the statement wrote. So an update that sets the
    // values a row already holds is 0 on MySQL and 1 on SQLite. Reading 0 as a
    // refusal would turn a harmless no-op into a 409 on one backend only.
    //
    // A guarded update always changes the role — it is only guarded when the
    // role is genuinely moving away from 'admin' — so 0 there is unambiguous.
    //
    // `existingUser.role` belongs here and only here. The guard is attached to
    // every role change, but it can only *fire* on an administrator; on any
    // other row 0 affected rows is the harmless MySQL no-op above, not a
    // refusal.
    return guarded && existingUser.role === 'admin' && result.changes === 0
      ? 'refused'
      : 'applied';
  }

  /**
   * Delete a user, unless that would leave the install without an administrator.
   *
   * The guard is part of the statement, so there is no count to race against;
   * zero affected rows means the database declined. See
   * `server/utils/adminInvariant.util.ts`.
   */
  async deleteUser(id: number): Promise<MutationOutcome> {
    if (!id || typeof id !== 'number') {
      throw new Error('Valid user ID is required');
    }

    const existingUser = await this.getUserById(id);
    if (!existingUser) {
      return 'missing';
    }

    const result = await databaseService.executeQuery(deleteUserSql(), [id]);

    return result.changes > 0 ? 'applied' : 'refused';
  }

  /**
   * Update user login attempts
   */
  async updateUserLoginAttempts(
    userId: number,
    attempts: number,
    lockedUntil: string | null = null
  ): Promise<boolean> {
    if (!userId || typeof userId !== 'number') {
      throw new Error('Valid user ID is required');
    }

    if (typeof attempts !== 'number' || attempts < 0) {
      throw new Error('Valid attempts count is required');
    }

    const now = databaseService.dialect.now();
    const changes = await databaseService.executeQuery(
      `UPDATE users SET failed_login_attempts = ?, account_locked_until = ?, updated_at = ${now} WHERE id = ?`,
      [attempts, lockedUntil, userId]
    );

    return changes.changes > 0;
  }

  /**
   * Update user last login
   */
  async updateUserLastLogin(userId: number): Promise<boolean> {
    if (!userId || typeof userId !== 'number') {
      throw new Error('Valid user ID is required');
    }

    const now = databaseService.dialect.now();
    const changes = await databaseService.executeQuery(
      `UPDATE users SET last_login = ${now}, updated_at = ${now} WHERE id = ?`,
      [userId]
    );

    return changes.changes > 0;
  }

  /**
   * Verify user email
   */
  async verifyUserEmail(userId: number): Promise<boolean> {
    if (!userId || typeof userId !== 'number') {
      throw new Error('Valid user ID is required');
    }

    const now = databaseService.dialect.now();
    const changes = await databaseService.executeQuery(
      `UPDATE users SET email_verified = 1, email_verified_at = ${now}, updated_at = ${now} WHERE id = ?`,
      [userId]
    );

    return changes.changes > 0;
  }

  /**
   * Check if user exists by ID
   */
  async userExists(id: number): Promise<boolean> {
    if (!id || typeof id !== 'number') {
      return false;
    }

    return databaseService.exists('users', 'id', id);
  }

  /**
   * Check if email is already in use
   */
  async emailExists(email: string, excludeId?: number): Promise<boolean> {
    if (!email || typeof email !== 'string') {
      return false;
    }

    if (excludeId) {
      const user = await databaseService.getOne<{id: number}>(
        'SELECT id FROM users WHERE email = ? AND id != ?',
        [email, excludeId]
      );
      return !!user;
    }
    
    return databaseService.exists('users', 'email', email);
  }

  /**
   * Get users by role
   */
  async getUsersByRole(role: 'user' | 'admin', options: ServiceOptions = {}): Promise<UserPublic[]> {
    const { limit = 100, offset = 0 } = options;

    return databaseService.getMany<UserPublic>(`
      SELECT id, name, email, username, role, email_verified,
             last_login, failed_login_attempts, account_locked_until, created_at, updated_at
      FROM users
      WHERE role = ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `, [role, limit, offset]);
  }

  /**
   * Get locked users
   */
  async getLockedUsers(options: ServiceOptions = {}): Promise<UserPublic[]> {
    const { limit = 100, offset = 0 } = options;
    const now = databaseService.dialect.now();

    return databaseService.getMany<UserPublic>(`
      SELECT id, name, email, username, role, email_verified,
             last_login, failed_login_attempts, account_locked_until, created_at, updated_at
      FROM users
      WHERE account_locked_until IS NOT NULL AND account_locked_until > ${now}
      ORDER BY account_locked_until DESC
      LIMIT ? OFFSET ?
    `, [limit, offset]);
  }

  /**
   * Unlock user account
   */
  async unlockUser(userId: number): Promise<boolean> {
    if (!userId || typeof userId !== 'number') {
      throw new Error('Valid user ID is required');
    }

    const now = databaseService.dialect.now();
    const changes = await databaseService.executeQuery(
      `UPDATE users SET failed_login_attempts = 0, account_locked_until = NULL, updated_at = ${now} WHERE id = ?`,
      [userId]
    );

    return changes.changes > 0;
  }

  /**
   * Search users by name or email
   */
  async searchUsers(searchTerm: string, options: ServiceOptions = {}): Promise<UserPublic[]> {
    if (!searchTerm || typeof searchTerm !== 'string') {
      return [];
    }

    const { limit = 50, offset = 0 } = options;
    const searchPattern = `%${searchTerm}%`;

    return databaseService.getMany<UserPublic>(`
      SELECT id, name, email, username, role, email_verified,
             last_login, failed_login_attempts, account_locked_until, created_at, updated_at
      FROM users
      WHERE (name LIKE ? OR email LIKE ? OR username LIKE ?)
      ORDER BY 
        CASE 
          WHEN name = ? THEN 1
          WHEN email = ? THEN 2
          WHEN username = ? THEN 3
          ELSE 4
        END,
        created_at DESC
      LIMIT ? OFFSET ?
    `, [
      searchPattern, searchPattern, searchPattern,
      searchTerm, searchTerm, searchTerm,
      limit, offset
    ]);
  }

  /**
   * Get user statistics
   */
  async getUserStats(): Promise<{
    total: number;
    admins: number;
    regular: number;
    verified: number;
    locked: number;
    recentLogins: number;
  }> {
    const now = databaseService.dialect.now();
    const [totalResult, adminsResult, regularResult, verifiedResult, lockedResult, recentLoginsResult] = await Promise.all([
      databaseService.getOne<{count: number}>(
        'SELECT COUNT(*) as count FROM users'
      ),
      databaseService.getOne<{count: number}>(
        "SELECT COUNT(*) as count FROM users WHERE role = 'admin'"
      ),
      databaseService.getOne<{count: number}>(
        "SELECT COUNT(*) as count FROM users WHERE role = 'user'"
      ),
      databaseService.getOne<{count: number}>(
        'SELECT COUNT(*) as count FROM users WHERE email_verified = 1'
      ),
      databaseService.getOne<{count: number}>(
        `SELECT COUNT(*) as count FROM users WHERE account_locked_until IS NOT NULL AND account_locked_until > ${now}`
      ),
      databaseService.getOne<{count: number}>(
        `SELECT COUNT(*) as count FROM users WHERE last_login > ${databaseService.dialect.nowMinus(7, 'day')}`
      )
    ]);

    const total = totalResult?.count || 0;
    const admins = adminsResult?.count || 0;
    const regular = regularResult?.count || 0;
    const verified = verifiedResult?.count || 0;
    const locked = lockedResult?.count || 0;
    const recentLogins = recentLoginsResult?.count || 0;

    return {
      total,
      admins,
      regular,
      verified,
      locked,
      recentLogins
    };
  }

  /**
   * Validate email format
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}

// Export singleton instance
export const userService = new UserService();