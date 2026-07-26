// Recurring Invoice Template routes for Slimbooks API
// Handles all recurring invoice template-related endpoints

import { Router } from 'express';
import {
  getAllRecurringTemplates,
  getActiveRecurringTemplates,
  getTemplatesDueForProcessing,
  getRecurringTemplateById,
  getRecurringTemplatesByClientId,
  createRecurringTemplate,
  updateRecurringTemplate,
  deleteRecurringTemplate,
  toggleRecurringTemplate,
  processRecurringTemplates,
  processSingleTemplate,
  getProcessingStats
} from '../controllers/recurringInvoiceTemplateController.js';
import {
  requireAuth
} from '../middleware/index.js';

const router: Router = Router();

// All recurring invoice template routes require authentication
router.use(requireAuth);

// Get all recurring templates
router.get('/', getAllRecurringTemplates);

// Get active recurring templates
router.get('/active', getActiveRecurringTemplates);

// Get templates due for processing
router.get('/due', getTemplatesDueForProcessing);

// Get processing statistics
router.get('/stats', getProcessingStats);

// Process recurring templates (manual trigger)
router.post('/process', processRecurringTemplates);

// Process a single recurring template
router.post('/:id/process', processSingleTemplate);

// Get recurring templates by client ID
router.get('/client/:clientId', 
  // TODO: Add validation for client ID
  getRecurringTemplatesByClientId
);

// Get recurring template by ID
router.get('/:id', 
  // TODO: Add validation for template ID
  getRecurringTemplateById
);

// Create new recurring template
router.post('/', 
  // TODO: Add validation for recurring template creation
  createRecurringTemplate
);

// Update recurring template
router.put('/:id', 
  // TODO: Add validation for recurring template update
  updateRecurringTemplate
);

// Toggle recurring template active/inactive
router.patch('/:id/toggle', 
  // TODO: Add validation for toggle action
  toggleRecurringTemplate
);

// Delete recurring template
router.delete('/:id', 
  // TODO: Add validation for recurring template deletion
  deleteRecurringTemplate
);

export default router;