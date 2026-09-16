// Read access to the audit trail.
//
// Admin-only, and read-only. There is deliberately no endpoint that writes or
// deletes a record: entries are written by the server as a side effect of the
// action they describe, and removal happens only through the scheduled
// retention prune. An API that could delete an audit record would undo the
// point of having one.

import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { listAuditLog } from '../controllers/auditController.js';

const router: Router = Router();

router.get('/', requireAuth, requireAdmin, listAuditLog);

export default router;
