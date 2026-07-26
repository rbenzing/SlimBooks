// User controller for Slimbooks
// Handles all user-related business logic

import { type Request, type Response } from 'express';
import { userService } from '../services/UserService.js';
import { 
  NotFoundError, 
  ValidationError,
  asyncHandler
} from '../middleware/index.js';
import { type CreateUserRequest, type UpdateUserRequest, type UpdateUserResponse } from '../types/api.types.js';

/**
 * Get all users
 */
export const getAllUsers = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const users = await userService.getAllUsers();
  
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

  try {
    const userId = await userService.createUser(userData);

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

  try {
    // Convert and validate user data for service layer
    const convertedUserData: Partial<{
      name: string;
      email: string;
      username: string;
      role: 'user' | 'admin';
      email_verified: boolean;
      google_id: string;
      password_hash: string;
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
    
    const changes = await userService.updateUser(userId, convertedUserData);

    res.json({ 
      success: true, 
      data: { changes },
      message: 'User updated successfully'
    });
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
  
  try {
    const changes = await userService.deleteUser(userId);

    res.json({ 
      success: true, 
      data: { changes },
      message: 'User deleted successfully'
    });
  } catch (error) {
    const errorMessage = (error as Error).message;
    if (errorMessage === 'User not found') {
      throw new NotFoundError('User');
    } else if (errorMessage === 'Cannot delete the last administrator') {
      throw new ValidationError('Cannot delete the last administrator');
    }
    throw error;
  }
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