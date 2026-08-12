// Invoice controller for Slimbooks
// Handles all invoice-related business logic

import { type Request, type Response } from 'express';
import { invoiceService } from '../services/InvoiceService.js';
import { invoiceNumberService } from '../services/InvoiceNumberService.js';
import {
  AppError,
  NotFoundError,
  ValidationError,
  asyncHandler
} from '../middleware/index.js';
import { type InvoiceStatus } from '../types/index.js';
import { type InvoiceRequest } from '../types/api.types.js';

/**
 * Get all invoices
 */
export const getAllInvoices = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { status, client_id, limit = '50', offset = '0' } = req.query;
  
  const parsedLimit = parseInt(limit as string, 10);
  const parsedOffset = parseInt(offset as string, 10);

  if (isNaN(parsedLimit) || isNaN(parsedOffset)) {
    throw new ValidationError('Invalid limit or offset');
  }

  const parsedClientId = client_id ? parseInt(client_id as string, 10) : undefined;
  
  const filters: {
    status?: InvoiceStatus;
    client_id?: number;
  } = {
    ...(status && { status: status as InvoiceStatus }),
    ...(parsedClientId && !isNaN(parsedClientId) && { client_id: parsedClientId })
  };

  if (filters.client_id && isNaN(filters.client_id)) {
    throw new ValidationError('Invalid client ID');
  }

  const results = await invoiceService.getAllInvoices(filters, { 
    limit: parsedLimit, 
    offset: parsedOffset 
  });
  
  res.json({ 
    success: true, 
    data: results
  });
});

/**
 * Get invoice by ID
 */
export const getInvoiceById = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  if (typeof id !== 'string') {
    throw new ValidationError('Invalid invoice ID');
  }

  const invoiceId = parseInt(id, 10);

  if (isNaN(invoiceId)) {
    throw new ValidationError('Invalid invoice ID');
  }
  
  const invoice = await invoiceService.getInvoiceById(invoiceId);

  if (!invoice) {
    throw new NotFoundError('Invoice');
  }

  res.json({ success: true, data: invoice });
});

/**
 * Get public invoice by ID with secure token validation
 * Security features:
 * - Cryptographically secure tokens
 * - Token expiration (24 hours)
 * - Rate limiting
 * - Consistent error responses (no information disclosure)
 */
export const getPublicInvoiceById = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { token } = req.query;

  if (typeof id !== 'string') {
    res.status(401).json({
      success: false,
      error: 'Invalid id'
    });
    return;
  }

  const invoiceId = parseInt(id, 10);

  if (isNaN(invoiceId)) {
    res.status(401).json({
      success: false,
      error: 'Invalid or expired invoice link'
    });
    return;
  }

  if (!token || typeof token !== 'string') {
    res.status(401).json({
      success: false,
      error: 'Invalid or expired invoice link'
    });
    return;
  }

  try {
    const invoiceData = await invoiceService.getPublicInvoiceById(invoiceId, token);
    res.status(200).json({ success: true, data: invoiceData });
  } catch {
    // Don't leak error details for security
    res.status(401).json({
      success: false,
      error: 'Invalid or expired invoice link'
    });
  }
});

/**
 * Generate secure public token for invoice
 * Creates a JWT token with 24-hour expiration
 */
export const generatePublicInvoiceToken = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  if (typeof id !== 'string') {
    throw new ValidationError('Invalid invoice ID');
  }

  const invoiceId = parseInt(id, 10);

  if (isNaN(invoiceId)) {
    throw new ValidationError('Invalid invoice ID');
  }

  try {
    const tokenData = await invoiceService.generatePublicInvoiceToken(invoiceId);
    res.json({
      success: true,
      data: tokenData
    });
  } catch (error) {
    const errorMessage = (error as Error).message;
    if (errorMessage === 'Invoice not found') {
      throw new NotFoundError('Invoice');
    }
    throw new AppError(errorMessage, 500);
  }
});

/**
 * Create new invoice
 */
export const createInvoice = asyncHandler(async (req: Request<object, object, { invoiceData: InvoiceRequest }>, res: Response): Promise<void> => {
  const { invoiceData } = req.body;

  if (!invoiceData) {
    throw new ValidationError('Invoice data is required');
  }

  try {
    const invoiceId = await invoiceService.createInvoice(invoiceData);
    
    res.status(201).json({ 
      success: true, 
      data: { id: invoiceId },
      message: 'Invoice created successfully'
    });
  } catch (error) {
    const errorMessage = (error as Error).message;
    if (errorMessage.includes('invoice_number') && errorMessage.includes('required')) {
      throw new ValidationError('Invoice number, client ID, and amount are required');
    } else if (errorMessage.includes('Client not found')) {
      throw new ValidationError('Specified client does not exist');
    } else if (errorMessage.includes('already exists')) {
      throw new ValidationError('Invoice number already exists');
    } else if (errorMessage.includes('Valid invoice amount')) {
      throw new ValidationError('Valid invoice amount is required');
    } else if (errorMessage.includes('Valid client ID')) {
      throw new ValidationError('Valid client ID is required');
    }
    throw new ValidationError(errorMessage);
  }
});

/**
 * Update invoice
 */
export const updateInvoice = asyncHandler(async (req: Request<{ id: string }, Record<string, unknown>, { invoiceData: Partial<InvoiceRequest> }>, res: Response): Promise<void> => {
  const { id } = req.params;
  const { invoiceData } = req.body;
  const invoiceId = parseInt(id, 10);

  if (isNaN(invoiceId)) {
    throw new ValidationError('Invalid invoice ID');
  }

  if (!invoiceData) {
    throw new ValidationError('Invoice data is required');
  }

  try {
    const changes = await invoiceService.updateInvoice(invoiceId, invoiceData);
    
    res.json({ 
      success: true, 
      data: { changes },
      message: 'Invoice updated successfully'
    });
  } catch (error) {
    const errorMessage = (error as Error).message;
    if (errorMessage === 'Invoice not found') {
      throw new NotFoundError('Invoice');
    } else if (errorMessage === 'No valid fields to update') {
      throw new ValidationError('No valid fields to update');
    } else if (errorMessage.includes('already exists')) {
      throw new ValidationError('Another invoice with this number already exists');
    } else if (errorMessage === 'Client not found') {
      throw new ValidationError('Specified client does not exist');
    } else if (errorMessage.includes('Valid invoice amount')) {
      throw new ValidationError('Valid invoice amount is required');
    }
    throw new ValidationError(errorMessage);
  }
});

/**
 * Delete invoice
 */
export const deleteInvoice = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  if (typeof id !== 'string') {
    throw new ValidationError('Invalid invoice ID');
  }

  const invoiceId = parseInt(id, 10);

  if (isNaN(invoiceId)) {
    throw new ValidationError('Invalid invoice ID');
  }
  
  try {
    const changes = await invoiceService.deleteInvoice(invoiceId);
    
    res.json({ 
      success: true, 
      data: { changes },
      message: 'Invoice deleted successfully'
    });
  } catch (error) {
    const errorMessage = (error as Error).message;
    if (errorMessage === 'Invoice not found') {
      throw new NotFoundError('Invoice');
    } else if (errorMessage.includes('Cannot delete paid invoices')) {
      throw new ValidationError('Cannot delete paid invoices');
    }
    throw new ValidationError(errorMessage);
  }
});

/**
 * Get invoice statistics
 */
export const getInvoiceStats = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const stats = await invoiceService.getInvoiceStats();
  res.json({ success: true, data: stats });
});

/**
 * Update invoice status
 */
export const updateInvoiceStatus = asyncHandler(async (req: Request<{ id: string }, Record<string, unknown>, { status: InvoiceStatus }>, res: Response): Promise<void> => {
  const { id } = req.params;
  const { status } = req.body;
  const invoiceId = parseInt(id, 10);

  if (isNaN(invoiceId)) {
    throw new ValidationError('Invalid invoice ID');
  }

  if (!status) {
    throw new ValidationError('Status is required');
  }

  try {
    const changes = await invoiceService.updateInvoiceStatus(invoiceId, status);
    
    res.json({ 
      success: true, 
      data: { changes },
      message: `Invoice status updated to ${status}`
    });
  } catch (error) {
    const errorMessage = (error as Error).message;
    if (errorMessage === 'Invoice not found') {
      throw new NotFoundError('Invoice');
    } else if (errorMessage === 'Invalid status') {
      throw new ValidationError('Invalid status');
    }
    throw new ValidationError(errorMessage);
  }
});

/**
 * Mark invoice as sent
 */
export const markInvoiceAsSent = asyncHandler(async (req: Request<{ id: string }, Record<string, unknown>, { email_sent_at?: string | number }>, res: Response): Promise<void> => {
  const { id } = req.params;
  const { email_sent_at } = req.body;
  const invoiceId = parseInt(id, 10);

  if (isNaN(invoiceId)) {
    throw new ValidationError('Invalid invoice ID');
  }

  try {
    const changes = await invoiceService.markInvoiceAsSent(invoiceId, email_sent_at);

    res.json({ 
      success: true, 
      data: { changes },
      message: 'Invoice marked as sent'
    });
  } catch (error) {
    const errorMessage = (error as Error).message;
    if (errorMessage === 'Valid invoice ID is required') {
      throw new ValidationError('Valid invoice ID is required');
    }
    throw new ValidationError(errorMessage);
  }
});

/**
 * Get overdue invoices
 */
export const getOverdueInvoices = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const overdueInvoices = await invoiceService.getOverdueInvoices();
  res.json({ success: true, data: overdueInvoices });
});

/**
 * Get invoices by client ID
 */
export const getInvoicesByClientId = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { client_id } = req.params;
  const { limit = '100', offset = '0' } = req.query;

  if (typeof client_id !== 'string') {
    throw new ValidationError('Invalid client ID');
  }

  const clientId = parseInt(client_id, 10);

  if (isNaN(clientId)) {
    throw new ValidationError('Invalid client ID');
  }

  const parsedLimit = parseInt(limit as string, 10);
  const parsedOffset = parseInt(offset as string, 10);

  if (isNaN(parsedLimit) || isNaN(parsedOffset)) {
    throw new ValidationError('Invalid limit or offset');
  }

  const invoices = await invoiceService.getInvoicesByClientId(clientId, { 
    limit: parsedLimit, 
    offset: parsedOffset 
  });
  
  res.json({ success: true, data: invoices });
});

/**
 * Get recent invoices
 */
export const getRecentInvoices = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { limit = '10' } = req.query;
  const parsedLimit = parseInt(limit as string, 10);

  if (isNaN(parsedLimit) || parsedLimit < 1) {
    throw new ValidationError('Invalid limit');
  }

  const invoices = await invoiceService.getRecentInvoices(parsedLimit);
  res.json({ success: true, data: invoices });
});

/**
 * Check if invoice number exists
 */
export const checkInvoiceNumberExists = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { invoice_number } = req.params;
  const { exclude_id } = req.query;

  if (!invoice_number) {
    throw new ValidationError('Invoice number parameter is required');
  }

  let excludeId: number | undefined;
  if (exclude_id) {
    excludeId = parseInt(exclude_id as string, 10);
    if (isNaN(excludeId)) {
      throw new ValidationError('Invalid exclude_id');
    }
  }

  const exists = await invoiceService.invoiceNumberExists(invoice_number, excludeId);
  res.json({ success: true, data: { exists } });
});

/**
 * Generate next invoice number
 */
export const generateInvoiceNumber = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  try {
    const invoiceNumber = await invoiceNumberService.generateInvoiceNumber();

    res.json({
      success: true,
      data: { invoice_number: invoiceNumber }
    });
  } catch (error) {
    console.error('Error generating invoice number:', error);
    throw new ValidationError('Failed to generate invoice number');
  }
});

/**
 * Preview next invoice number (without incrementing counter)
 */
export const previewNextInvoiceNumber = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  try {
    const invoiceNumber = await invoiceNumberService.getNextInvoiceNumber();

    res.json({
      success: true,
      data: { invoice_number: invoiceNumber }
    });
  } catch (error) {
    console.error('Error previewing invoice number:', error);

    // Fallback: generate a default invoice number if service fails
    try {
      const fallbackNumber = `INV-${Date.now()}`;
      console.log('Using fallback invoice number:', fallbackNumber);

      res.json({
        success: true,
        data: { invoice_number: fallbackNumber }
      });
    } catch (fallbackError) {
      console.error('Fallback invoice number generation failed:', fallbackError);
      throw new ValidationError('Failed to preview invoice number');
    }
  }
});