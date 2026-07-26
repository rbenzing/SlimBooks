// Template routes for Slimbooks API
// Handles all template-related endpoints

import { Router } from 'express';
import {
  getAllTemplates,
  getTemplateById,
  createTemplate,
  updateTemplate,
  deleteTemplate
} from '../controllers/templateController.js';
import {
  requireAuth
} from '../middleware/index.js';

const router: Router = Router();

// All template routes require authentication
router.use(requireAuth);

// Get all templates
router.get('/', getAllTemplates);

// Get template by ID
router.get('/:id', 
  // TODO: Add validation for template ID
  getTemplateById
);

// Create new template
router.post('/', 
  // TODO: Add validation for template creation
  createTemplate
);

// Update template
router.put('/:id', 
  // TODO: Add validation for template update
  updateTemplate
);

// Delete template
router.delete('/:id', 
  // TODO: Add validation for template deletion
  deleteTemplate
);

export default router;