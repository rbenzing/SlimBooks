// Payment controller for Slimbooks
// Handles all payment-related business logic

import { type Request, type Response } from 'express';
import { paymentService } from '../services/PaymentService.js';
import { 
  AppError, 
  NotFoundError, 
  ValidationError,
  asyncHandler
} from '../middleware/index.js';
import { type PaymentMethod, type PaymentStatus } from '../types/index.js';
import { type PaymentRequest } from '../types/api.types.js';

/**
 * Get all payments
 */
export const getAllPayments = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { status, method, date_from, date_to, limit = '50', offset = '0' } = req.query;
  
  const parsedLimit = parseInt(limit as string, 10);
  const parsedOffset = parseInt(offset as string, 10);

  if (isNaN(parsedLimit) || isNaN(parsedOffset)) {
    throw new ValidationError('Invalid limit or offset');
  }

  const filters = {
    status: status as PaymentStatus,
    method: method as PaymentMethod,
    date_from: date_from as string,
    date_to: date_to as string
  };

  const results = await paymentService.getAllPayments(filters, { 
    limit: parsedLimit, 
    offset: parsedOffset 
  });
  
  res.json({ 
    success: true, 
    data: results
  });
});

/**
 * Get payment by ID
 */
export const getPaymentById = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  if (typeof id !== 'string') {
    throw new ValidationError('Invalid payment ID');
  }

  const paymentId = parseInt(id, 10);

  if (isNaN(paymentId)) {
    throw new ValidationError('Invalid payment ID');
  }
  
  const payment = await paymentService.getPaymentById(paymentId);

  if (!payment) {
    throw new NotFoundError('Payment');
  }

  res.json({ success: true, data: payment });
});

/**
 * Create new payment
 */
export const createPayment = asyncHandler(async (req: Request<object, object, { paymentData: PaymentRequest }>, res: Response): Promise<void> => {
  const { paymentData } = req.body;

  if (!paymentData) {
    throw new ValidationError('Payment data is required');
  }

  try {
    const paymentId = await paymentService.createPayment(paymentData);
    
    res.status(201).json({ 
      success: true, 
      data: { id: paymentId },
      message: 'Payment created successfully'
    });
  } catch (error) {
    const errorMessage = (error as Error).message;
    if (errorMessage.includes('date') && errorMessage.includes('required')) {
      throw new ValidationError('Payment date, client name, amount, and method are required');
    } else if (errorMessage.includes('positive')) {
      throw new ValidationError('Amount must be a positive number');
    } else if (errorMessage.includes('Valid client name')) {
      throw new ValidationError('Valid client name is required');
    } else if (errorMessage.includes('Valid payment date')) {
      throw new ValidationError('Valid payment date is required');
    } else if (errorMessage.includes('Invalid date format')) {
      throw new ValidationError('Invalid date format');
    } else if (errorMessage.includes('does not exist')) {
      throw new ValidationError('Specified invoice does not exist');
    }
    throw new ValidationError(errorMessage);
  }
});

/**
 * Update payment
 */
export const updatePayment = asyncHandler(async (req: Request<{ id: string }, Record<string, unknown>, { paymentData: Partial<PaymentRequest> }>, res: Response): Promise<void> => {
  const { id } = req.params;
  const { paymentData } = req.body;
  const paymentId = parseInt(id, 10);

  if (isNaN(paymentId)) {
    throw new ValidationError('Invalid payment ID');
  }

  if (!paymentData) {
    throw new ValidationError('Payment data is required');
  }

  try {
    const changes = await paymentService.updatePayment(paymentId, paymentData);
    
    res.json({ 
      success: true, 
      data: { changes },
      message: 'Payment updated successfully'
    });
  } catch (error) {
    const errorMessage = (error as Error).message;
    if (errorMessage === 'Payment not found') {
      throw new NotFoundError('Payment');
    } else if (errorMessage === 'No valid fields to update') {
      throw new ValidationError('No valid fields to update');
    } else if (errorMessage.includes('positive number')) {
      throw new ValidationError('Amount must be a positive number');
    } else if (errorMessage.includes('Invalid date format')) {
      throw new ValidationError('Invalid date format');
    } else if (errorMessage.includes('does not exist')) {
      throw new ValidationError('Specified invoice does not exist');
    }
    throw new ValidationError(errorMessage);
  }
});

/**
 * Delete payment
 */
export const deletePayment = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  if (typeof id !== 'string') {
    throw new ValidationError('Invalid payment ID');
  }

  const paymentId = parseInt(id, 10);

  if (isNaN(paymentId)) {
    throw new ValidationError('Invalid payment ID');
  }
  
  try {
    const changes = await paymentService.deletePayment(paymentId);
    
    res.json({ 
      success: true, 
      data: { changes },
      message: 'Payment deleted successfully'
    });
  } catch (error) {
    const errorMessage = (error as Error).message;
    if (errorMessage === 'Payment not found') {
      throw new NotFoundError('Payment');
    }
    throw new AppError(errorMessage, 500);
  }
});

/**
 * Bulk delete payments
 */
export const bulkDeletePayments = asyncHandler(async (req: Request<object, object, { payment_ids: number[] }>, res: Response): Promise<void> => {
  const { payment_ids } = req.body;

  if (!payment_ids || !Array.isArray(payment_ids)) {
    throw new ValidationError('payment_ids must be an array');
  }

  try {
    const changes = await paymentService.bulkDeletePayments(payment_ids);
    
    res.json({ 
      success: true, 
      data: { changes },
      message: `${changes} payments deleted successfully`
    });
  } catch (error) {
    throw new ValidationError((error as Error).message);
  }
});

/**
 * Get payment statistics
 */
export const getPaymentStats = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { year, month } = req.query;
  
  const filters = {
    year: year as string,
    month: month as string
  };

  const stats = await paymentService.getPaymentStats(filters);

  res.json({ 
    success: true, 
    data: stats
  });
});

/**
 * Get payments by invoice ID
 */
export const getPaymentsByInvoiceId = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { invoice_id } = req.params;
  const { limit = '100', offset = '0' } = req.query;

  if (typeof invoice_id !== 'string') {
    throw new ValidationError('Invalid invoice ID');
  }

  const invoiceId = parseInt(invoice_id, 10);

  if (isNaN(invoiceId)) {
    throw new ValidationError('Invalid invoice ID');
  }

  const parsedLimit = parseInt(limit as string, 10);
  const parsedOffset = parseInt(offset as string, 10);

  if (isNaN(parsedLimit) || isNaN(parsedOffset)) {
    throw new ValidationError('Invalid limit or offset');
  }

  const payments = await paymentService.getPaymentsByInvoiceId(invoiceId, { 
    limit: parsedLimit, 
    offset: parsedOffset 
  });
  
  res.json({ success: true, data: payments });
});

/**
 * Get payments by client name
 */
export const getPaymentsByClientName = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { client_name } = req.params;
  const { limit = '100', offset = '0' } = req.query;

  if (!client_name) {
    throw new ValidationError('Client name parameter is required');
  }

  const parsedLimit = parseInt(limit as string, 10);
  const parsedOffset = parseInt(offset as string, 10);

  if (isNaN(parsedLimit) || isNaN(parsedOffset)) {
    throw new ValidationError('Invalid limit or offset');
  }

  const payments = await paymentService.getPaymentsByClientName(client_name, { 
    limit: parsedLimit, 
    offset: parsedOffset 
  });
  
  res.json({ success: true, data: payments });
});

/**
 * Get payments by date range
 */
export const getPaymentsByDateRange = asyncHandler(async (req: Request, res: Response): Promise<void> => {
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
    const result = await paymentService.getPaymentsByDateRange(
      start_date as string, 
      end_date as string, 
      { limit: parsedLimit, offset: parsedOffset }
    );
    res.json({ 
      success: true, 
      data: result
    });
  } catch (error) {
    throw new ValidationError((error as Error).message);
  }
});

/**
 * Get recent payments
 */
export const getRecentPayments = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { limit = '10' } = req.query;
  const parsedLimit = parseInt(limit as string, 10);

  if (isNaN(parsedLimit) || parsedLimit < 1) {
    throw new ValidationError('Invalid limit');
  }

  const payments = await paymentService.getRecentPayments(parsedLimit);
  res.json({ success: true, data: payments });
});

/**
 * Get total payments amount
 */
export const getTotalPaymentsAmount = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { status, method, date_from, date_to } = req.query;
  
  const filters = {
    status: status as PaymentStatus,
    method: method as PaymentMethod,
    date_from: date_from as string,
    date_to: date_to as string
  };

  const total = await paymentService.getTotalPaymentsAmount(filters);
  res.json({ success: true, data: { total } });
});

/**
 * Update payment status
 */
export const updatePaymentStatus = asyncHandler(async (req: Request<{ id: string }, Record<string, unknown>, { status: PaymentStatus }>, res: Response): Promise<void> => {
  const { id } = req.params;
  const { status } = req.body;
  const paymentId = parseInt(id, 10);

  if (isNaN(paymentId)) {
    throw new ValidationError('Invalid payment ID');
  }

  if (!status) {
    throw new ValidationError('Status is required');
  }

  try {
    const changes = await paymentService.updatePaymentStatus(paymentId, status);
    
    res.json({ 
      success: true, 
      data: { changes },
      message: `Payment status updated to ${status}`
    });
  } catch (error) {
    const errorMessage = (error as Error).message;
    if (errorMessage === 'Payment not found') {
      throw new NotFoundError('Payment');
    } else if (errorMessage.includes('Invalid status')) {
      throw new ValidationError('Invalid status. Must be received, pending, failed, or refunded');
    }
    throw new ValidationError(errorMessage);
  }
});

/**
 * Get payment methods statistics
 */
export const getPaymentMethodsStats = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const stats = await paymentService.getPaymentMethodsStats();
  res.json({ success: true, data: stats });
});

/**
 * Search payments
 */
export const searchPayments = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { q, limit = '50', offset = '0' } = req.query;

  if (!q || typeof q !== 'string') {
    throw new ValidationError('Search query is required');
  }

  const parsedLimit = parseInt(limit as string, 10);
  const parsedOffset = parseInt(offset as string, 10);

  if (isNaN(parsedLimit) || isNaN(parsedOffset)) {
    throw new ValidationError('Invalid limit or offset');
  }

  const results = await paymentService.searchPayments(q, { 
    limit: parsedLimit, 
    offset: parsedOffset 
  });
  
  res.json({ success: true, data: results });
});