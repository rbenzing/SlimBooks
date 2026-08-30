// Payment routes for Slimbooks API
// Handles all payment-related endpoints

import { Router, type Request, type Response } from 'express';
import { type BulkImportPaymentsRequest, type BulkImportResult, type PaymentRequest } from '../types/api.types.js';
import {
  getAllPayments,
  getPaymentById,
  createPayment,
  updatePayment,
  deletePayment,
  getPaymentStats,
  bulkDeletePayments
} from '../controllers/index.js';
import {
  requireAuth,
  validateRequest,
  validationSets
} from '../middleware/index.js';

const router: Router = Router();

// All payment routes require authentication
router.use(requireAuth);

// GET /api/payments - Get all payments with optional filtering
router.get('/', getAllPayments);

// GET /api/payments/stats - Get payment statistics
router.get('/stats', getPaymentStats);

// POST /api/payments - Create a new payment
router.post('/',
  validationSets.createPayment,
  validateRequest,
  createPayment
);

// POST /api/payments/bulk-delete - Bulk delete payments
router.post('/bulk-delete',
  validationSets.bulkDeletePayments,
  validateRequest,
  bulkDeletePayments
);

// POST /api/payments/bulk-import - Bulk import payments
router.post('/bulk-import',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { payments } = req.body as BulkImportPaymentsRequest;

      if (!payments || !Array.isArray(payments)) {
        res.status(400).json({
          success: false,
          error: 'Payments array is required'
        });
        return;
      }

      let successCount = 0;
      let errorCount = 0;
      const errors: string[] = [];
      const importedDays: string[] = [];

      // Import the payment service
      const { paymentService } = await import('../services/PaymentService.js');

      for (let i = 0; i < payments.length; i++) {
        const paymentData = payments[i] as PaymentRequest;
        try {
          // Use the payment service directly instead of the controller
          await paymentService.createPayment(paymentData);
          successCount++;
          if (paymentData.date) importedDays.push(paymentData.date);
        } catch (error) {
          errorCount++;
          const errorMessage = (error as Error).message;
          errors.push(`Payment ${i + 1}: ${errorMessage}`);
        }
      }

      const span = importedDays.length > 0
        ? {
            earliest: importedDays.reduce((a, b) => (a < b ? a : b)),
            latest: importedDays.reduce((a, b) => (a > b ? a : b))
          }
        : null;

      const data: BulkImportResult = { imported: successCount, failed: errorCount, errors, span };

      res.status(errorCount > 0 && successCount === 0 ? 422 : 200).json({
        success: successCount > 0,
        data,
        message: `Import completed: ${successCount} payments imported, ${errorCount} failed`
      });
    } catch (error) {
      console.error('Bulk import error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to import payments'
      });
    }
  }
);

// GET /api/payments/:id - Get payment by ID
router.get('/:id', getPaymentById);

// PUT /api/payments/:id - Update payment
router.put('/:id',
  validationSets.updatePayment,
  validateRequest,
  updatePayment
);

// DELETE /api/payments/:id - Delete payment
router.delete('/:id', deletePayment);

export default router;