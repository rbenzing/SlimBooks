// Authentication middleware for Slimbooks
// Handles JWT verification, role-based access control, and session management

import jwt from 'jsonwebtoken';
import { type Request, type Response, type NextFunction } from 'express';
import { authConfig } from '../config/index.js';
import { authService } from '../services/AuthService.js';
import { type User, type UserPublic, type UserRole } from '../types/index.js';

// Extend the Request interface to include user property
declare global {
  namespace Express {
    interface Request {
      user?: UserPublic;
    }
  }
}

interface JWTPayload {
  userId: number;
  email: string;
  role: UserRole;
  type: string;
  iat: number;
}

interface TokenGenerationUser {
  id: number;
  email: string;
  role: UserRole;
}

/**
 * Middleware to require authentication
 * Verifies JWT token and attaches user to request
 */
export const requireAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
      return;
    }
    
    // Verify JWT token
    try {
      const decoded = jwt.verify(token, authConfig.jwtSecret) as JWTPayload;

      // Get user from database via service
      const user = await authService.getUserById(decoded.userId);

      if (!user) {
        res.status(401).json({
          success: false,
          error: 'Invalid token - user not found'
        });
        return;
      }
      
      // Check if user account is locked
      if (user.account_locked_until && new Date(user.account_locked_until) > new Date()) {
        res.status(423).json({
          success: false,
          error: 'Account is temporarily locked'
        });
        return;
      }
      
      // Check if email verification is required
      try {
        const requireEmailVerification = await authService.isEmailVerificationRequired();
        
        if (requireEmailVerification && !user.email_verified) {
          res.status(403).json({
            success: false,
            error: 'Email verification required',
            requires_email_verification: true
          });
          return;
        }
      } catch (error) {
        console.error('Error checking email verification setting:', error);
        // Continue with default behavior if setting check fails
      }
      
      // Attach user to request
      req.user = user;
      next();
      
    } catch {
      res.status(401).json({
        success: false,
        error: 'Invalid or expired token'
      });
      return;
    }
    
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({
      success: false,
      error: 'Authentication service error'
    });
    return;
  }
};

/**
 * Middleware to require admin role
 * Must be used after requireAuth
 */
export const requireAdmin = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Authentication required'
    });
    return;
  }
  
  if (req.user.role !== 'admin') {
    res.status(403).json({
      success: false,
      error: 'Admin access required'
    });
    return;
  }
  
  next();
};

/**
 * Middleware to require specific role
 * @param roles - Required role(s)
 */
export const requireRole = (roles: UserRole | UserRole[]) => {
  const allowedRoles = Array.isArray(roles) ? roles : [roles];
  
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
      return;
    }
    
    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        error: `Access denied. Required role: ${allowedRoles.join(' or ')}`
      });
      return;
    }
    
    next();
  };
};

/**
 * Middleware to require email verification
 * Must be used after requireAuth
 */
export const requireEmailVerified = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Authentication required'
    });
    return;
  }
  
  if (!req.user.email_verified) {
    res.status(403).json({
      success: false,
      error: 'Email verification required'
    });
    return;
  }
  
  next();
};

/**
 * Optional authentication middleware
 * Attaches user to request if token is valid, but doesn't require it
 */
export const optionalAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (token) {
      try {
        const decoded = jwt.verify(token, authConfig.jwtSecret) as JWTPayload;
        const user = await authService.getUserById(decoded.userId);
        
        if (user && (!user.account_locked_until || new Date(user.account_locked_until) <= new Date())) {
          req.user = user;
        }
      } catch {
        // Invalid token, but that's okay for optional auth
        console.log('Optional auth: Invalid token provided');
      }
    }
    
    next();
  } catch (error) {
    console.error('Optional authentication error:', error);
    next(); // Continue without authentication
  }
};

/**
 * Generate JWT token for user
 * @param user - User object
 * @returns JWT token
 */
export const generateToken = (user: TokenGenerationUser): string => {
  const payload: JWTPayload = {
    userId: user.id,
    email: user.email,
    role: user.role,
    type: 'access',
    iat: Math.floor(Date.now() / 1000)
  };

  return jwt.sign(payload, authConfig.jwtSecret, {
    expiresIn: Math.floor(authConfig.accessTokenExpiry / 1000) // Convert ms to seconds
  });
};

/**
 * Verify JWT token
 * @param token - JWT token
 * @returns Decoded token payload
 */
export const verifyToken = (token: string): JWTPayload => {
  return jwt.verify(token, authConfig.jwtSecret) as JWTPayload;
};

/**
 * Check if user account is locked
 * @param user - User object
 * @returns True if account is locked
 */
export const isAccountLocked = (user: User | UserPublic): boolean => {
  return user.account_locked_until ? new Date(user.account_locked_until) > new Date() : false;
};

// updateLoginAttempts has been removed - use authService.updateLoginAttempts directly