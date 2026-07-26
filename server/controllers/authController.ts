// Authentication controller for Slimbooks
// Handles login, registration, password reset, and email verification

import { type Request, type Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { authConfig } from '../config/index.js';
import { authService } from '../services/AuthService.js';
import { tokenService } from '../services/TokenService.js';
import {
  NotFoundError,
  ValidationError,
  AuthenticationError,
  asyncHandler,
  generateToken
} from '../middleware/index.js';
import { 
  type LoginRequest, 
  type LoginResponse, 
  type RegisterRequest, 
  type RegisterResponse,
  type RefreshTokenRequest,
  type RefreshTokenResponse 
} from '../types/api.types.js';
import { type User, type UserPublic } from '../types/index.js';

interface DecodedToken {
  userId: number;
  email: string;
  exp?: number;
  iat?: number;
}

/**
 * User login
 */
export const login = asyncHandler(async (req: Request<object, LoginResponse, LoginRequest>, res: Response): Promise<void> => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new ValidationError('Email and password are required');
  }

  // Get user for authentication
  const user = await authService.getUserForAuthentication(email);
  
  if (!user) {
    throw new AuthenticationError('Invalid email or password');
  }

  // Check if account is locked
  if (authService.isAccountLocked(user)) {
    throw new AuthenticationError('Account is temporarily locked due to too many failed login attempts');
  }

  // Verify password
  if (!user.password_hash) {
    throw new AuthenticationError('Invalid email or password');
  }
  const isValidPassword = await bcrypt.compare(password, user.password_hash);
  
  if (!isValidPassword) {
    // Update failed login attempts
    await authService.updateLoginAttempts(user.id, false);
    throw new AuthenticationError('Invalid email or password');
  }

  // Reset failed login attempts and update last login
  await authService.updateLoginAttempts(user.id, true);

  // Check if email verification is required
  const requireEmailVerification = await authService.isEmailVerificationRequired();
  if (requireEmailVerification && !user.email_verified) {
    res.status(403).json({
      success: false,
      error: 'Email verification required',
      requires_email_verification: true,
      message: 'Please verify your email address before logging in'
    });
    return;
  }

  // Generate JWT token
  const token = generateToken(user);

  // Remove sensitive data from response
  const { password_hash, two_factor_secret, backup_codes, ...userResponse } = user;

  res.json({
    success: true,
    data: {
      user: userResponse as UserPublic, // Cast to correct type
      token
    },
    requires_email_verification: false,
    message: 'Login successful'
  });
});

/**
 * User registration
 */
export const register = asyncHandler(async (req: Request<object, RegisterResponse, RegisterRequest>, res: Response): Promise<void> => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    throw new ValidationError('Name, email, and password are required');
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(password, authConfig.bcryptRounds);

  // Create user using service
  const userId = await authService.createUser({
    name,
    email,
    password_hash: hashedPassword,
    role: 'user',
    email_verified: 0
  });

  res.status(201).json({
    success: true,
    data: { id: userId },
    message: 'User registered successfully'
  });
});

/**
 * Request password reset
 */
export const requestPasswordReset = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { email } = req.body;

  if (!email) {
    throw new ValidationError('Email is required');
  }

  const user = await authService.getUserByEmail(email);

  if (!user) {
    // Don't reveal if user exists or not for security
    res.json({
      success: true,
      message: 'If an account with that email exists, we have sent a password reset link.'
    });
    return;
  }

  // Generate cryptographically secure password reset token
  const token = await tokenService.createPasswordResetToken(
    user.id,
    authConfig.passwordResetExpiry
  );

  // TODO: Send password reset email here
  // For now, we'll just return success

  res.json({
    success: true,
    message: 'If an account with that email exists, we have sent a password reset link.',
    // In development, include the token for testing
    ...(process.env.NODE_ENV === 'development' && { token })
  });
});

/**
 * Reset password with token
 */
export const resetPassword = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { token, password } = req.body;

  if (!token || !password) {
    throw new ValidationError('Token and password are required');
  }

  // Verify token using secure token service
  const userId = await tokenService.verifyPasswordResetToken(token);

  if (!userId) {
    throw new ValidationError('Invalid or expired reset token');
  }

  // Get user
  const user = await authService.getUserById(userId);
  if (!user) {
    throw new NotFoundError('User');
  }

  // Hash the new password
  const hashedPassword = await bcrypt.hash(password, authConfig.bcryptRounds);

  // Update user password using service (this also resets failed login attempts)
  await authService.updateUserPassword(user.id, hashedPassword);
  await authService.updateLoginAttempts(user.id, true); // Reset failed attempts

  res.json({
    success: true,
    message: 'Password reset successfully'
  });
});

/**
 * Verify email with token
 */
export const verifyEmail = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { token } = req.body;

  if (!token) {
    throw new ValidationError('Token is required');
  }

  // Verify the token
  try {
    // Verify token using secure token service
    const userId = await tokenService.verifyEmailVerificationToken(token);

    if (!userId) {
      throw new ValidationError('Invalid or expired verification token');
    }

    const user = await authService.getUserById(userId);

    if (!user) {
      throw new NotFoundError('User');
    }

    if (user.email_verified) {
      res.json({
        success: true,
        message: 'Email already verified'
      });
      return;
    }

    // Update user as verified using service
    await authService.verifyUserEmail(user.id);

    res.json({
      success: true,
      message: 'Email verified successfully'
    });
  } catch {
    throw new ValidationError('Invalid or expired token');
  }
});

/**
 * Refresh JWT token
 */
export const refreshToken = asyncHandler(async (req: Request<object, RefreshTokenResponse, RefreshTokenRequest>, res: Response): Promise<void> => {
  const { token } = req.body;

  if (!token) {
    throw new ValidationError('Token is required');
  }

  try {
    // Verify the current token (even if expired, we can still decode it)
    const decoded = jwt.decode(token) as DecodedToken | null;
    
    if (!decoded || !decoded.userId) {
      throw new AuthenticationError('Invalid token');
    }

    // Get fresh user data
    const user = await authService.getUserById(decoded.userId);
    
    if (!user) {
      throw new NotFoundError('User');
    }

    // Check if account is locked
    if (authService.isAccountLocked(user as User)) {
      throw new AuthenticationError('Account is locked');
    }

    // Generate new token
    const newToken = generateToken(user as User);

    res.json({
      success: true,
      data: {
        user,
        token: newToken
      },
      message: 'Token refreshed successfully'
    });
  } catch {
    throw new AuthenticationError('Token refresh failed');
  }
});

/**
 * Get current user profile
 */
export const getProfile = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  // User is attached to request by auth middleware
  const user = req.user;

  if (!user) {
    throw new AuthenticationError('User not authenticated');
  }

  res.json({
    success: true,
    data: user
  });
});

/**
 * Update user profile
 */
export const updateProfile = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const user = req.user;
  const { name, email } = req.body;

  if (!user) {
    throw new AuthenticationError('User not authenticated');
  }

  const updateData: { name?: string; email?: string; email_verified?: number } = {};
  
  if (name) updateData.name = name;
  if (email && email !== user.email) {
    updateData.email = email;
    updateData.email_verified = 0; // Reset email verification if email changed
  }

  if (Object.keys(updateData).length === 0) {
    throw new ValidationError('No fields to update');
  }

  // Update user profile using service
  await authService.updateUserProfile(user.id, updateData);

  // Get updated user data
  const updatedUser = await authService.getUserById(user.id);

  res.json({
    success: true,
    data: updatedUser,
    message: 'Profile updated successfully'
  });
});

/**
 * Change password
 */
export const changePassword = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const user = req.user;
  const { currentPassword, newPassword } = req.body;

  if (!user) {
    throw new AuthenticationError('User not authenticated');
  }

  if (!currentPassword || !newPassword) {
    throw new ValidationError('Current password and new password are required');
  }

  // Get user with password hash for verification
  const userForAuth = await authService.getUserForAuthentication(user.email);
  
  if (!userForAuth) {
    throw new AuthenticationError('User not found');
  }

  // Verify current password
  if (!userForAuth.password_hash) {
    throw new AuthenticationError('User authentication data is invalid');
  }
  const isValidPassword = await bcrypt.compare(currentPassword, userForAuth.password_hash);
  
  if (!isValidPassword) {
    throw new AuthenticationError('Current password is incorrect');
  }

  // Hash new password
  const hashedPassword = await bcrypt.hash(newPassword, authConfig.bcryptRounds);

  // Update password using service
  await authService.updateUserPassword(user.id, hashedPassword);

  res.json({
    success: true,
    message: 'Password changed successfully'
  });
});