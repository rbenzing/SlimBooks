// Template routes for Slimbooks API
// Invoice DESIGN templates (invoice_design_templates). Recurring billing
// templates live in recurringInvoiceTemplateRoutes.ts behind
// /api/recurring-templates — the two tables share an id space, so calling the
// wrong one silently reads or writes an unrelated row.

import { Router } from 'express';
import {
  getAllTemplates,
  getTemplateById,
  createTemplate,
  updateTemplate,
  deleteTemplate
} from '../controllers/templateController.js';
import {
  requireAuth,
  validateRequest,
  validationSets
} from '../middleware/index.js';

const router: Router = Router();

// All template routes require authentication
router.use(requireAuth);

// Get all templates
router.get('/', getAllTemplates);

// Get template by ID
router.get('/:id',
  validationSets.getTemplateById,
  validateRequest,
  getTemplateById
);

// Create new template
router.post('/',
  validationSets.createTemplate,
  validateRequest,
  createTemplate
);

// Update template
router.put('/:id',
  validationSets.updateTemplate,
  validateRequest,
  updateTemplate
);

// Delete template
router.delete('/:id',
  validationSets.deleteTemplate,
  validateRequest,
  deleteTemplate
);

export default router;
