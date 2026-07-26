// Invoice routes for Slimbooks API
// Handles all invoice-related endpoints

import { Router } from 'express';
import {
  getAllInvoices,
  getInvoiceById,
  getPublicInvoiceById,
  generatePublicInvoiceToken,
  createInvoice,
  updateInvoice,
  deleteInvoice,
  getInvoiceStats,
  updateInvoiceStatus,
  markInvoiceAsSent,
  getOverdueInvoices,
  generateInvoiceNumber,
  previewNextInvoiceNumber
} from '../controllers/index.js';
import {
  requireAuth,
  validateRequest,
  validationSets
} from '../middleware/index.js';

const router: Router = Router();

// Public routes (no authentication required) - MUST come before requireAuth middleware
// Get public invoice by ID with token validation
router.get('/public/:id', getPublicInvoiceById);

// All other invoice routes require authentication
router.use(requireAuth);

// Get all invoices
router.get('/', getAllInvoices);

// Get invoice statistics
router.get('/stats', getInvoiceStats);

// Get overdue invoices
router.get('/overdue', getOverdueInvoices);

// Preview next invoice number (without incrementing counter)
// MUST stay above '/:id' so the literal path is not captured by the ID param route
router.get('/preview-number', previewNextInvoiceNumber);

// Get invoice by ID
router.get('/:id', 
  validationSets.updateInvoice.slice(0, 1), // Just ID validation
  validateRequest,
  getInvoiceById
);

// Generate next invoice number
// MUST stay above '/:id' style POST routes for the same reason
router.post('/generate-number', generateInvoiceNumber);

// Create new invoice
router.post('/',
  validationSets.createInvoice,
  validateRequest,
  createInvoice
);

// Update invoice
router.put('/:id', 
  validationSets.updateInvoice,
  validateRequest,
  updateInvoice
);

// Update invoice status
router.patch('/:id/status', 
  validationSets.updateInvoice.slice(0, 1), // Just ID validation
  validateRequest,
  updateInvoiceStatus
);

// Mark invoice as sent
router.patch('/:id/sent', 
  validationSets.updateInvoice.slice(0, 1), // Just ID validation
  validateRequest,
  markInvoiceAsSent
);

// Delete invoice
router.delete('/:id',
  validationSets.updateInvoice.slice(0, 1), // Just ID validation
  validateRequest,
  deleteInvoice
);

// Generate public token for invoice (requires authentication)
router.post('/:id/public-token',
  validationSets.updateInvoice.slice(0, 1), // Just ID validation
  validateRequest,
  requireAuth,
  generatePublicInvoiceToken
);

export default router;