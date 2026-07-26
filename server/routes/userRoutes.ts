// User routes for Slimbooks API
// Handles all user-related endpoints

import { Router, type Request, type Response, type NextFunction } from 'express';
import {
  getAllUsers,
  getUserById,
  getUserByEmail,
  getUserByGoogleId,
  createUser,
  updateUser,
  deleteUser,
  updateUserLoginAttempts,
  updateUserLastLogin,
  updateLoginAttemptsByUserId,
  updateLastLoginByUserId,
  verifyUserEmail
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

// Get user by email (public for admin check, otherwise admin only)
router.get('/email/:email', async (req: Request, res: Response, next: NextFunction): Promise<Response | void> => {
  const { email } = req.params;

  // Allow public access for admin user check during initialization
  if (email === 'admin@slimbooks.app') {
    try {
      const { userService } = await import('../services/UserService.js');
      const user = await userService.getUserByEmail(email);

      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found',
          exists: false
        });
      }

      return res.json({
        success: true,
        data: user,
        exists: true
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: (error as Error).message,
        exists: false
      });
    }
  } else {
    // For all other emails, require authentication and admin privileges
    requireAuth(req, res, (err?: unknown) => {
      if (err) return next(err);
      requireAdmin(req, res, (err?: unknown) => {
        if (err) return next(err);
        getUserByEmail(req, res, next);
      });
    });
  }
});

// Get user by Google ID (admin only)
router.get('/google/:googleId', 
  requireAuth, 
  requireAdmin, 
  getUserByGoogleId
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

// Update user login attempts (internal use)
router.post('/update-login-attempts', 
  updateUserLoginAttempts
);

// Update user last login (internal use)
router.post('/update-last-login', 
  updateUserLastLogin
);

// Update user login attempts by ID (public for login process)
router.put('/:id/login-attempts',
  updateLoginAttemptsByUserId
);

// Update user last login by ID (public for login process)
router.put('/:id/last-login',
  updateLastLoginByUserId
);

// Verify user email (admin only)
router.put('/:id/verify-email', 
  requireAuth, 
  requireAdmin, 
  verifyUserEmail
);

export default router;