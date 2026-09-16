// Authentication routes for Slimbooks API
// Handles login, registration, password reset, and email verification

import { Router } from 'express';
import {
  login,
  register,
  resetPassword,
  verifyEmail,
  refreshToken,
  getProfile,
  updateProfile,
  changePassword
} from '../controllers/index.js';
import {
  requireAuth,
  createLoginRateLimit,
  validateRequest,
  validationSets
} from '../middleware/index.js';
import type { Runtime } from '../runtime/types.js';

/**
 * Build the authentication router.
 *
 * A factory because registration is feature-gated, and the gate lives on the
 * runtime. `FEATURE_SIGNUP` and its tri-state resolution already existed;
 * nothing read the answer, so an operator who set `FEATURE_SIGNUP=off` still
 * had an open registration form. Under ADR-0003, `off` means the route is not
 * mounted at all rather than mounted and refusing.
 */
export const createAuthRoutes = (runtime: Runtime): Router => {
  const router: Router = Router();

  // Apply login rate limiting to authentication endpoints
  const loginRateLimit = createLoginRateLimit();

  // User login
  router.post('/login',
    loginRateLimit,
    validationSets.login,
    validateRequest,
    login
  );

  // User registration
  if (runtime.features.signup) {
    router.post('/register',
      loginRateLimit,
      validationSets.register,
      validateRequest,
      register
    );
  }

  // Reset password with token
  router.post('/reset-password',
    loginRateLimit,
    validationSets.resetPassword,
    validateRequest,
    resetPassword
  );

  // Verify email with token
  router.post('/verify-email',
    loginRateLimit,
    verifyEmail
  );

  // Refresh JWT token
  router.post('/refresh-token',
    loginRateLimit,
    refreshToken
  );

  // Get current user profile (requires authentication)
  router.get('/profile',
    requireAuth,
    getProfile
  );

  // Update user profile (requires authentication)
  router.put('/profile',
    requireAuth,
    updateProfile
  );

  // Change password (requires authentication)
  router.post('/change-password',
    requireAuth,
    validationSets.changePassword,
    validateRequest,
    changePassword
  );

  return router;
};
