// User controller for Slimbooks
// Handles all user-related business logic

import { type Request, type Response } from 'express';
import bcrypt from 'bcryptjs';
import { userService } from '../services/UserService.js';
import { authService } from '../services/AuthService.js';
import { authConfig, validationConfig } from '../config/index.js';
import {
  NotFoundError,
  ValidationError,
  asyncHandler
} from '../middleware/index.js';
import {
  type CreateUserRequest,
  type UpdateUserRequest,
  type UpdateUserResponse,
  type ResetUserPasswordRequest,
  type ResetUserPasswordResponse,
  type UnlockUserResponse
} from '../types/api.types.js';
import { type MutationOutcome } from '../types/index.js';

/**
 * How many accounts the management screen may see.
 *
 * `getAllUsers` defaults to 100 and the screen paginates in the browser, so an
 * install with more than 100 accounts simply lost the rest: invisible, and
 * unmanageable, including in the administrator count the screen computes from
 * what it received. Server-side pagination is the right answer and a larger
 * change; this stops the silent truncation.
 */
const USER_LIST_LIMIT = 10_000;

/**
 * Get all users
 */
export const getAllUsers = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const users = await userService.getAllUsers({ limit: USER_LIST_LIMIT });

  res.json({ success: true, data: users });
});

/**
 * Get user by ID
 */
export const getUserById = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  
  if (!id) {
    throw new ValidationError('User ID is required');
  }
  
  const userId = parseInt(id, 10);
  
  if (isNaN(userId)) {
    throw new ValidationError('Invalid user ID');
  }

  const user = await userService.getUserById(userId);

  if (!user) {
    throw new NotFoundError('User');
  }

  res.json({ success: true, data: user });
});

/**
 * Get user by email
 */
export const getUserByEmail = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { email } = req.params;
  
  if (!email) {
    throw new ValidationError('Valid email is required');
  }

  const user = await userService.getUserByEmail(email);

  if (!user) {
    throw new NotFoundError('User');
  }

  res.json({ success: true, data: user });
});

/**
 * Get user by Google ID
 */
export const getUserByGoogleId = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { googleId } = req.params;
  
  if (!googleId) {
    throw new ValidationError('Valid Google ID is required');
  }

  const user = await userService.getUserByGoogleId(googleId);

  if (!user) {
    throw new NotFoundError('User');
  }

  res.json({ success: true, data: user });
});

/**
 * Create new user
 */
export const createUser = asyncHandler(async (req: Request<object, object, CreateUserRequest>, res: Response): Promise<void> => {
  const { userData } = req.body;

  // The service stores a hash; the API takes a password. Hashing here is what
  // keeps the cost factor a server decision and stops a hash ever crossing the
  // wire. A caller-supplied hash is refused outright rather than trusted.
  if ('password_hash' in userData) {
    throw new ValidationError('Send a password, not a hash');
  }

  const { password, ...rest } = userData as typeof userData & { password?: string };
  const created = { ...rest } as Parameters<typeof userService.createUser>[0];

  if (typeof password === 'string' && password.length > 0) {
    const { minLength, maxLength } = validationConfig.password;

    if (password.length < minLength || password.length > maxLength) {
      throw new ValidationError(
        `Password must be between ${minLength} and ${maxLength} characters`
      );
    }

    created.password_hash = await bcrypt.hash(password, authConfig.bcryptRounds);
  }

  try {
    const userId = await userService.createUser(created);

    res.status(201).json({
      success: true, 
      data: { id: userId },
      message: 'User created successfully'
    });
  } catch (error) {
    const errorMessage = (error as Error).message;
    if (errorMessage.includes('name and email are required')) {
      throw new ValidationError('Invalid user data - name and email are required');
    } else if (errorMessage.includes('already exists')) {
      throw new ValidationError('User with this email already exists');
    }
    throw error;
  }
});

/**
 * Update user
 */
export const updateUser = asyncHandler(async (req: Request<{id: string}, UpdateUserResponse, UpdateUserRequest>, res: Response): Promise<void> => {
  const { id } = req.params;
  const { userData } = req.body;
  const userId = parseInt(id, 10);

  if (isNaN(userId)) {
    throw new ValidationError('Invalid user ID');
  }

  // A caller-supplied hash bypasses the configured cost factor and the
  // password policy, and resetting a password is an operation rather than a
  // field assignment. `createUser` refuses it outright; so does this, rather
  // than accepting it and silently dropping it as it used to.
  if ('password_hash' in userData) {
    throw new ValidationError('Send a password to /api/users/:id/password, not a hash');
  }

  // Convert and validate user data for service layer
  const convertedUserData: Partial<{
    name: string;
    email: string;
    username: string;
    role: 'user' | 'admin';
    email_verified: boolean;
    google_id: string;
  }> = {};

  // Copy all defined properties except email_verified
  Object.keys(userData).forEach(key => {
    if (key !== 'email_verified' && userData[key as keyof typeof userData] !== undefined) {
      (convertedUserData as Record<string, unknown>)[key] = userData[key as keyof typeof userData];
    }
  });

  // Handle email_verified conversion separately
  if (userData.email_verified !== undefined) {
    convertedUserData.email_verified = userData.email_verified === 1;
  }

  let outcome: MutationOutcome;

  try {
    outcome = await userService.updateUser(userId, convertedUserData);
  } catch (error) {
    const errorMessage = (error as Error).message;
    if (errorMessage === 'User data is required') {
      throw new ValidationError('User data is required');
    } else if (errorMessage === 'User not found') {
      throw new NotFoundError('User');
    } else if (errorMessage === 'No valid fields to update') {
      throw new ValidationError('No valid fields to update');
    } else if (errorMessage === 'Email is already in use') {
      throw new ValidationError('Email is already in use');
    }
    throw error;
  }

  if (outcome === 'missing') {
    throw new NotFoundError('User');
  }

  if (outcome === 'refused') {
    // 409, not 400: the request is well-formed and the caller is permitted;
    // it conflicts with the state of the install.
    res.status(409).json({
      success: false,
      error: 'This is the only administrator. Promote another account before changing this one’s role.'
    });
    return;
  }

  res.json({
    success: true,
    message: 'User updated successfully'
  });
});

/**
 * Delete user
 */
export const deleteUser = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  if (!id) {
    throw new ValidationError('User ID is required');
  }

  const userId = parseInt(id, 10);

  if (isNaN(userId)) {
    throw new ValidationError('Invalid user ID');
  }

  const outcome = await userService.deleteUser(userId);

  if (outcome === 'missing') {
    throw new NotFoundError('User');
  }

  if (outcome === 'refused') {
    // 409, not 400: the request is well-formed and the caller is permitted;
    // it conflicts with the state of the install.
    res.status(409).json({
      success: false,
      error: 'This is the only administrator. Promote another account first.'
    });
    return;
  }

  res.json({ success: true, message: 'User deleted successfully' });
});

/**
 * Update user login attempts
 */
export const updateUserLoginAttempts = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { userId, attempts, lockedUntil } = req.body;

  if (!userId || typeof userId !== 'number' || typeof attempts !== 'number') {
    throw new ValidationError('Valid userId and attempts are required');
  }

  try {
    const success = await userService.updateUserLoginAttempts(userId, attempts, lockedUntil);
    res.json({ success: true, data: { success } });
  } catch (error) {
    const errorMessage = (error as Error).message;
    if (errorMessage.includes('Invalid parameters') || errorMessage.includes('required')) {
      throw new ValidationError('Invalid parameters - userId and attempts are required');
    }
    throw error;
  }
});

/**
 * Update user last login
 */
export const updateUserLastLogin = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { userId } = req.body;

  if (!userId || typeof userId !== 'number') {
    throw new ValidationError('Valid user ID is required');
  }

  try {
    const success = await userService.updateUserLastLogin(userId);
    res.json({ success: true, data: { success } });
  } catch (error) {
    const errorMessage = (error as Error).message;
    if (errorMessage === 'Valid user ID is required') {
      throw new ValidationError('User ID is required');
    }
    throw error;
  }
});

/**
 * Update user login attempts by ID (alternative endpoint)
 */
export const updateLoginAttemptsByUserId = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { attempts, lockedUntil } = req.body;
  
  if (!id) {
    throw new ValidationError('User ID is required');
  }
  
  const userId = parseInt(id, 10);

  if (isNaN(userId)) {
    throw new ValidationError('Invalid user ID');
  }

  if (typeof attempts !== 'number') {
    throw new ValidationError('Valid attempts count is required');
  }

  const success = await userService.updateUserLoginAttempts(userId, attempts, lockedUntil);
  res.json({ success: true, data: { success } });
});

/**
 * Update user last login by ID (alternative endpoint)
 */
export const updateLastLoginByUserId = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  
  if (!id) {
    throw new ValidationError('User ID is required');
  }
  
  const userId = parseInt(id, 10);

  if (isNaN(userId)) {
    throw new ValidationError('Invalid user ID');
  }

  const success = await userService.updateUserLastLogin(userId);
  res.json({ success: true, data: { success } });
});

/**
 * Verify user email
 */
export const verifyUserEmail = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  
  if (!id) {
    throw new ValidationError('User ID is required');
  }
  
  const userId = parseInt(id, 10);

  if (isNaN(userId)) {
    throw new ValidationError('Invalid user ID');
  }

  await userService.verifyUserEmail(userId);
  res.json({ success: true, message: 'Email verified successfully' });
});

/**
 * Set another user's password.
 *
 * Deliberately not a field on `updateUser`. Taking a plaintext here is what
 * lets the server apply the configured cost factor and the password policy;
 * accepting a caller-supplied hash bypassed both.
 *
 * The plaintext is never logged — the request logger records method, path and
 * timing only, and this handler adds nothing.
 */
export const resetUserPassword = asyncHandler(async (
  req: Request<{ id: string }, ResetUserPasswordResponse, Partial<ResetUserPasswordRequest>>,
  res: Response<ResetUserPasswordResponse>
): Promise<void> => {
  const userId = parseInt(req.params.id ?? '', 10);

  if (isNaN(userId)) {
    throw new ValidationError('Invalid user ID');
  }

  // `Partial` on the body, because a declared shape is what the caller was
  // asked for, not what arrived — the check below is the one that decides.
  const { newPassword } = req.body;

  if (typeof newPassword !== 'string' || newPassword.length === 0) {
    throw new ValidationError('A new password is required');
  }

  const { minLength, maxLength } = validationConfig.password;

  if (newPassword.length < minLength || newPassword.length > maxLength) {
    throw new ValidationError(
      `Password must be between ${minLength} and ${maxLength} characters`
    );
  }

  const target = await userService.getUserById(userId);

  if (!target) {
    throw new NotFoundError('User');
  }

  const hashedPassword = await bcrypt.hash(newPassword, authConfig.bcryptRounds);
  await authService.updateUserPassword(userId, hashedPassword);

  res.json({ success: true, message: 'Password updated' });
});

/** Clear a lockout so the account can be signed into again. */
export const unlockUserAccount = asyncHandler(async (
  req: Request<{ id: string }>,
  res: Response<UnlockUserResponse>
): Promise<void> => {
  const userId = parseInt(req.params.id ?? '', 10);

  if (isNaN(userId)) {
    throw new ValidationError('Invalid user ID');
  }

  const unlocked = await userService.unlockUser(userId);

  if (!unlocked) {
    throw new NotFoundError('User');
  }

  res.json({ success: true, message: 'Account unlocked' });
});