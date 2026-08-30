// Expense routes for Slimbooks API
// Handles all expense-related endpoints

import { Router, type Request, type Response } from 'express';
import { type BulkImportExpensesRequest, type BulkImportResult, type ExpenseRequest } from '../types/api.types.js';
import {
  getAllExpenses,
  getExpenseById,
  createExpense,
  updateExpense,
  deleteExpense,
  getExpenseStats,
  getExpenseCategories,
  getExpensesByDateRange
} from '../controllers/index.js';
import {
  requireAuth,
  validateRequest,
  validationSets
} from '../middleware/index.js';

const router: Router = Router();

// All expense routes require authentication
router.use(requireAuth);

// Get all expenses
router.get('/', getAllExpenses);

// Get expense statistics
router.get('/stats', getExpenseStats);

// Get expense categories
router.get('/categories', getExpenseCategories);

// Get expenses by date range
router.get('/date-range', getExpensesByDateRange);

// Get expense by ID
router.get('/:id', 
  validationSets.updateExpense.slice(0, 1), // Just ID validation
  validateRequest,
  getExpenseById
);

// Create new expense
router.post('/', 
  validationSets.createExpense,
  validateRequest,
  createExpense
);

// Update expense
router.put('/:id', 
  validationSets.updateExpense,
  validateRequest,
  updateExpense
);

// Delete expense
router.delete('/:id', 
  validationSets.updateExpense.slice(0, 1), // Just ID validation
  validateRequest,
  deleteExpense
);

// Bulk import expenses
router.post('/bulk-import',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { expenses } = req.body as BulkImportExpensesRequest;

      if (!expenses || !Array.isArray(expenses)) {
        res.status(400).json({
          success: false,
          error: 'Expenses array is required'
        });
        return;
      }

      let successCount = 0;
      let errorCount = 0;
      const errors: string[] = [];
      const importedDays: string[] = [];

      // Import the expense service
      const { expenseService } = await import('../services/ExpenseService.js');

      for (let i = 0; i < expenses.length; i++) {
        const expenseData = expenses[i] as ExpenseRequest;
        try {
          // Use the expense service directly instead of the controller
          await expenseService.createExpense(expenseData);
          successCount++;
          if (expenseData.date) importedDays.push(expenseData.date);
        } catch (error) {
          errorCount++;
          const errorMessage = (error as Error).message;
          errors.push(`Expense ${i + 1}: ${errorMessage}`);
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
        message: `Import completed: ${successCount} expenses imported, ${errorCount} failed`
      });
    } catch (error) {
      console.error('Bulk import error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to import expenses'
      });
    }
  }
);

export default router;