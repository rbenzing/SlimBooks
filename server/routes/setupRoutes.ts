// Setup routes for Slimbooks — bootstraps the first administrator.

import { Router } from 'express';
import { getSetupStatus, completeSetup } from '../controllers/setupController.js';

const router: Router = Router();

router.get('/status', getSetupStatus);
router.post('/', completeSetup);

export default router;
