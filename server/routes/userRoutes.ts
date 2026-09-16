// User routes for Slimbooks API
// Handles all user-related endpoints

import { Router, type Request, type Response } from 'express';
import {
  getAllUsers,
  getUserById,
  getUserByEmail,
  createUser,
  updateUser,
  deleteUser,
  verifyUserEmail,
  resetUserPassword,
  unlockUserAccount
} from '../controllers/index.js';
import {
  requireAuth,
  requireAdmin,
  validateRequest,
  validationSets
} from '../middleware/index.js';

const router: Router = Router();

// Check if admin user exists (public endpoint for initialization)
router.get('/admin-exists', async (req: Request, res: Response) => {
  try {
    const { userService } = await import('../services/UserService.js');
    const adminUser = await userService.getUserByEmail('admin@slimbooks.app');
    const adminExists = adminUser && adminUser.role === 'admin';
    res.json({
      success: true,
      exists: !!adminExists,
      adminConfigured: !!adminExists
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
      exists: false,
      adminConfigured: false
    });
  }
});

// Get all users (admin only)
router.get('/',
  requireAuth,
  requireAdmin,
  getAllUsers
);

// Get user by ID (admin only)
router.get('/:id', 
  requireAuth, 
  requireAdmin, 
  validationSets.updateUser.slice(0, 1), // Just ID validation
  validateRequest,
  getUserById
);

// Get user by email (admin only)
//
// This used to serve `admin@slimbooks.app` to anyone, unauthenticated, "for
// admin user check during initialization" — and `getUserByEmail` is a
// `SELECT *`, so the response carried that account's bcrypt hash, 2FA secret
// and backup codes to any caller who asked. The question it existed to answer
// ("does this install still need an administrator?") is what
// `GET /api/setup/status` answers now, without disclosing anything, and no
// caller in the SPA ever used this route.
router.get('/email/:email',
  requireAuth,
  requireAdmin,
  getUserByEmail
);

// Create new user (admin only)
router.post('/', 
  requireAuth, 
  requireAdmin, 
  validationSets.createUser,
  validateRequest,
  createUser
);

// Update user (admin only)
router.put('/:id', 
  requireAuth, 
  requireAdmin, 
  validationSets.updateUser,
  validateRequest,
  updateUser
);

// Delete user (admin only)
router.delete('/:id',
  requireAuth,
  requireAdmin,
  validationSets.updateUser.slice(0, 1), // Just ID validation
  validateRequest,
  deleteUser
);

// Set another user's password (admin only)
// `parseInt('0')` is not NaN, so without the id rule /api/users/0/password
// reached the service and came back 500 instead of 400.
router.post('/:id/password',
  requireAuth,
  requireAdmin,
  validationSets.updateUser.slice(0, 1), // Just ID validation
  validateRequest,
  resetUserPassword
);

// Clear an account lockout (admin only)
router.post('/:id/unlock',
  requireAuth,
  requireAdmin,
  validationSets.updateUser.slice(0, 1), // Just ID validation
  validateRequest,
  unlockUserAccount
);

// The four lockout/last-login endpoints that used to sit here are gone. They
// were labelled "internal use" and "public for login process" but carried no
// authentication and had no caller anywhere in the server or the SPA — the
// login flow writes these columns through UserService directly. Exposed, they
// let anyone clear any account's lockout (`{attempts: 0}`), which made the
// brute-force protection decorative, and forge last-login history.

// Verify user email (admin only)
router.put('/:id/verify-email', 
  requireAuth, 
  requireAdmin, 
  verifyUserEmail
);

export default router;