// Expense controller for Slimbooks
// Handles all expense-related business logic

import { type Request, type Response } from 'express';
import { expenseService } from '../services/ExpenseService.js';
import { 
  AppError, 
  NotFoundError, 
  ValidationError,
  asyncHandler
} from '../middleware/index.js';
// Define ExpenseFilters locally since it's specific to this controller
export interface ExpenseFilters {
  start_date?: string;
  end_date?: string;
  date_from?: string;
  date_to?: string;
  category?: string;
  min_amount?: number;
  max_amount?: number;
  is_billable?: boolean;
  client_id?: number;
}
import { type ExpenseRequest } from '../types/api.types.js';

/**
 * Get all expenses
 */
export const getAllExpenses = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { category, date_from, date_to, is_billable, client_id, limit = '50', offset = '0' } = req.query;
  
  const parsedLimit = parseInt(limit as string, 10);
  const parsedOffset = parseInt(offset as string, 10);

  if (isNaN(parsedLimit) || isNaN(parsedOffset)) {
    throw new ValidationError('Invalid limit or offset');
  }

  const filters: ExpenseFilters = {};
  
  if (category) filters.category = category as string;
  if (date_from) filters.date_from = date_from as string;
  if (date_to) filters.date_to = date_to as string;
  if (is_billable === 'true') filters.is_billable = true;
  else if (is_billable === 'false') filters.is_billable = false;
  if (client_id) filters.client_id = parseInt(client_id as string, 10);

  const results = await expenseService.getAllExpenses(filters, { 
    limit: parsedLimit, 
    offset: parsedOffset 
  });
  
  res.json({ 
    success: true, 
    data: results
  });
});

/**
 * Get expense by ID
 */
export const getExpenseById = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  if (typeof id !== 'string') {
    throw new ValidationError('Invalid expense ID');
  }

  const expenseId = parseInt(id, 10);

  if (isNaN(expenseId)) {
    throw new ValidationError('Invalid expense ID');
  }
  
  const expense = await expenseService.getExpenseById(expenseId);

  if (!expense) {
    throw new NotFoundError('Expense');
  }

  res.json({ success: true, data: expense });
});

/**
 * Create new expense
 */
export const createExpense = asyncHandler(async (req: Request<object, object, { expenseData: ExpenseRequest }>, res: Response): Promise<void> => {
  const { expenseData } = req.body;

  if (!expenseData) {
    throw new ValidationError('Expense data is required');
  }

  try {
    const expenseId = await expenseService.createExpense(expenseData);
    
    res.status(201).json({ 
      success: true, 
      data: { id: expenseId },
      message: 'Expense created successfully'
    });
  } catch (error) {
    const errorMessage = (error as Error).message;
    if (errorMessage.includes('amount') && errorMessage.includes('required')) {
      throw new ValidationError('Valid expense amount is required');
    } else if (errorMessage.includes('description') && errorMessage.includes('required')) {
      throw new ValidationError('Expense description is required');
    } else if (errorMessage.includes('date') && errorMessage.includes('required')) {
      throw new ValidationError('Expense date is required');
    } else if (errorMessage.includes('Invalid date format')) {
      throw new ValidationError('Invalid date format');
    } else if (errorMessage.includes('client does not exist')) {
      throw new ValidationError('Specified client does not exist');
    }
    throw new ValidationError(errorMessage);
  }
});

/**
 * Update expense
 */
export const updateExpense = asyncHandler(async (req: Request<{ id: string }, object, { expenseData: Partial<ExpenseRequest> }>, res: Response): Promise<void> => {
  const { id } = req.params;
  const { expenseData } = req.body;
  const expenseId = parseInt(id, 10);

  if (isNaN(expenseId)) {
    throw new ValidationError('Invalid expense ID');
  }

  if (!expenseData) {
    throw new ValidationError('Expense data is required');
  }

  try {
    // Convert and validate expense data for service layer
    const dbExpenseData: Partial<{
      amount: number;
      description: string;
      category: string;
      date: string;
      vendor: string;
      notes: string;
      receipt_url: string;
      is_billable: boolean;
      client_id: number;
      project: string;
    }> = {};
    
    // Copy all defined properties except is_billable
    Object.keys(expenseData).forEach(key => {
      if (key !== 'is_billable' && expenseData[key as keyof typeof expenseData] !== undefined) {
        (dbExpenseData as Record<string, unknown>)[key] = expenseData[key as keyof typeof expenseData];
      }
    });
    
    // Handle is_billable conversion separately
    if (expenseData.is_billable !== undefined) {
      dbExpenseData.is_billable = !!expenseData.is_billable;
    }
    const changes = await expenseService.updateExpense(expenseId, dbExpenseData);
    
    res.json({ 
      success: true, 
      data: { changes },
      message: 'Expense updated successfully'
    });
  } catch (error) {
    const errorMessage = (error as Error).message;
    if (errorMessage === 'Expense not found') {
      throw new NotFoundError('Expense');
    } else if (errorMessage === 'No valid fields to update') {
      throw new ValidationError('No valid fields to update');
    } else if (errorMessage.includes('Valid expense amount')) {
      throw new ValidationError('Valid expense amount is required');
    } else if (errorMessage.includes('Invalid date format')) {
      throw new ValidationError('Invalid date format');
    } else if (errorMessage.includes('client does not exist')) {
      throw new ValidationError('Specified client does not exist');
    }
    throw new ValidationError(errorMessage);
  }
});

/**
 * Delete expense
 */
export const deleteExpense = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  
  if (typeof id !== 'string') {
    throw new ValidationError('Invalid expense ID');
  }

  const expenseId = parseInt(id, 10);

  if (isNaN(expenseId)) {
    throw new ValidationError('Invalid expense ID');
  }
  
  try {
    const changes = await expenseService.deleteExpense(expenseId);
    
    res.json({ 
      success: true, 
      data: { changes },
      message: 'Expense deleted successfully'
    });
  } catch (error) {
    const errorMessage = (error as Error).message;
    if (errorMessage === 'Expense not found') {
      throw new NotFoundError('Expense');
    }
    throw new AppError(errorMessage, 500);
  }
});

/**
 * Get expense statistics
 */
export const getExpenseStats = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { date_from, date_to } = req.query;
  
  const filters = {
    date_from: date_from as string,
    date_to: date_to as string
  };

  const stats = await expenseService.getExpenseStats(filters);

  res.json({ 
    success: true, 
    data: stats
  });
});

/**
 * Get expense categories
 */
export const getExpenseCategories = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const categories = await expenseService.getExpenseCategories();
  res.json({ success: true, data: categories });
});

/**
 * Get expenses by category
 */
export const getExpensesByCategory = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { category } = req.params;
  const { limit = '100', offset = '0' } = req.query;

  if (!category) {
    throw new ValidationError('Category parameter is required');
  }

  const parsedLimit = parseInt(limit as string, 10);
  const parsedOffset = parseInt(offset as string, 10);

  if (isNaN(parsedLimit) || isNaN(parsedOffset)) {
    throw new ValidationError('Invalid limit or offset');
  }

  try {
    const expenses = await expenseService.getExpensesByCategory(category, { 
      limit: parsedLimit, 
      offset: parsedOffset 
    });
    res.json({ success: true, data: expenses });
  } catch (error) {
    throw new ValidationError((error as Error).message);
  }
});

/**
 * Get billable expenses
 */
export const getBillableExpenses = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { client_id, limit = '100', offset = '0' } = req.query;

  const parsedLimit = parseInt(limit as string, 10);
  const parsedOffset = parseInt(offset as string, 10);

  if (isNaN(parsedLimit) || isNaN(parsedOffset)) {
    throw new ValidationError('Invalid limit or offset');
  }

  const clientId = client_id ? parseInt(client_id as string, 10) : undefined;
  if (client_id && isNaN(clientId as number)) {
    throw new ValidationError('Invalid client ID');
  }

  const expenses = await expenseService.getBillableExpenses(clientId, { 
    limit: parsedLimit, 
    offset: parsedOffset 
  });
  
  res.json({ success: true, data: expenses });
});

/**
 * Get expenses by date range
 */
export const getExpensesByDateRange = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { start_date, end_date, limit = '100', offset = '0' } = req.query;

  if (!start_date || !end_date) {
    throw new ValidationError('start_date and end_date are required');
  }

  const parsedLimit = parseInt(limit as string, 10);
  const parsedOffset = parseInt(offset as string, 10);

  if (isNaN(parsedLimit) || isNaN(parsedOffset)) {
    throw new ValidationError('Invalid limit or offset');
  }

  try {
    const expenses = await expenseService.getExpensesByDateRange(
      start_date as string, 
      end_date as string, 
      { limit: parsedLimit, offset: parsedOffset }
    );
    res.json({ 
      success: true, 
      data: expenses
    });
  } catch (error) {
    throw new ValidationError((error as Error).message);
  }
});

/**
 * Search expenses
 */
export const searchExpenses = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { q, limit = '50', offset = '0' } = req.query;

  if (!q || typeof q !== 'string') {
    throw new ValidationError('Search query is required');
  }

  const parsedLimit = parseInt(limit as string, 10);
  const parsedOffset = parseInt(offset as string, 10);

  if (isNaN(parsedLimit) || isNaN(parsedOffset)) {
    throw new ValidationError('Invalid limit or offset');
  }

  const expenses = await expenseService.searchExpenses(q, { 
    limit: parsedLimit, 
    offset: parsedOffset 
  });
  
  res.json({ success: true, data: expenses });
});