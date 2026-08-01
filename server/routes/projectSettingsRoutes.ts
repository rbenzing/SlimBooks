// Project settings routes for Slimbooks
// Handles project configuration endpoints

import { Router } from 'express';
import {
  getProjectSettings,
  updateProjectSettings
} from '../controllers/settingsController.js';
import { requireAuth, requireAdmin, optionalAuth } from '../middleware/index.js';

const router: Router = Router();

// Get project configuration (combines .env defaults with database overrides).
// The login screen calls this before anyone has signed in, so the route stays
// open; `optionalAuth` identifies the caller so the controller can answer with
// the settings-screen view rather than the pre-login one.
router.get('/', optionalAuth, getProjectSettings);

// Update project settings
router.put('/', requireAuth, requireAdmin, updateProjectSettings);

export default router;