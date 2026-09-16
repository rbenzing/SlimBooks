// Database routes - handles database backup and restore operations
import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import * as databaseController from '../controllers/databaseController.js';

const router: Router = Router();

// Admin-only, both of them. Export hands the caller every bcrypt hash and
// stored credential in the install; import replaces the live database wholesale,
// so a non-admin who could call it would simply upload a database in which they
// are the administrator.

// Export database
router.get('/export', requireAuth, requireAdmin, databaseController.exportDatabase);

// Import database
router.post('/import', requireAuth, requireAdmin, databaseController.importDatabase);

export default router;