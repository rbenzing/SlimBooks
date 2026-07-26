// Recurring Invoice Template controller for Slimbooks
// Handles all recurring invoice template-related business logic

import { type Request, type Response } from 'express';
import { recurringInvoiceTemplateService } from '../services/RecurringInvoiceTemplateService.js';
import { recurringInvoiceProcessorService } from '../services/RecurringInvoiceProcessorService.js';
import {
  NotFoundError,
  ValidationError,
  asyncHandler
} from '../middleware/index.js';

/**
 * Recurring Invoice Template data request interface
 */
interface RecurringInvoiceTemplateRequest {
  name: string;
  client_id: number;
  amount: number;
  description?: string;
  frequency: 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'custom';
  payment_terms: string;
  next_invoice_date: string;
  is_active?: boolean;
  line_items?: string;
  tax_amount?: number;
  tax_rate_id?: string;
  shipping_amount?: number;
  shipping_rate_id?: string;
  notes?: string;
}

/**
 * Get all recurring invoice templates
 */
export const getAllRecurringTemplates = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const templates = await recurringInvoiceTemplateService.getAllRecurringTemplates();
  res.json({ success: true, data: templates });
});

/**
 * Get active recurring invoice templates
 */
export const getActiveRecurringTemplates = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const templates = await recurringInvoiceTemplateService.getActiveRecurringTemplates();
  res.json({ success: true, data: templates });
});

/**
 * Get templates due for processing
 */
export const getTemplatesDueForProcessing = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const templates = await recurringInvoiceTemplateService.getTemplatesDueForProcessing();
  res.json({ success: true, data: templates });
});

/**
 * Get recurring invoice template by ID
 */
export const getRecurringTemplateById = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  if (!id || isNaN(parseInt(id))) {
    throw new ValidationError('Invalid recurring template ID');
  }

  const templateId = parseInt(id, 10);
  const template = await recurringInvoiceTemplateService.getRecurringTemplateById(templateId);

  if (!template) {
    throw new NotFoundError('Recurring template not found');
  }

  res.json({ success: true, data: template });
});

/**
 * Get recurring templates by client ID
 */
export const getRecurringTemplatesByClientId = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { clientId } = req.params;

  if (!clientId || isNaN(parseInt(clientId))) {
    throw new ValidationError('Invalid client ID');
  }

  const clientIdNum = parseInt(clientId, 10);
  const templates = await recurringInvoiceTemplateService.getRecurringTemplatesByClientId(clientIdNum);

  res.json({ success: true, data: templates });
});

/**
 * Create new recurring invoice template
 */
export const createRecurringTemplate = asyncHandler(async (req: Request<object, object, { templateData: RecurringInvoiceTemplateRequest }>, res: Response): Promise<void> => {
  const { templateData } = req.body;

  if (!templateData) {
    throw new ValidationError('Template data is required');
  }

  // Validate required fields
  if (!templateData.name || typeof templateData.name !== 'string') {
    throw new ValidationError('Template name is required');
  }

  if (!templateData.client_id || typeof templateData.client_id !== 'number') {
    throw new ValidationError('Client ID is required');
  }

  if (!templateData.amount || typeof templateData.amount !== 'number' || templateData.amount <= 0) {
    throw new ValidationError('Valid amount is required');
  }

  if (!templateData.frequency || !['weekly', 'monthly', 'quarterly', 'yearly', 'custom'].includes(templateData.frequency)) {
    throw new ValidationError('Valid frequency is required (weekly, monthly, quarterly, yearly, custom)');
  }

  if (!templateData.payment_terms || typeof templateData.payment_terms !== 'string') {
    throw new ValidationError('Payment terms are required');
  }

  if (!templateData.next_invoice_date || typeof templateData.next_invoice_date !== 'string') {
    throw new ValidationError('Next invoice date is required');
  }

  try {
    const templateId = await recurringInvoiceTemplateService.createRecurringTemplate(templateData);
    
    res.status(201).json({ 
      success: true, 
      data: { id: templateId },
      message: 'Recurring invoice template created successfully'
    });
  } catch (error) {
    const errorMessage = (error as Error).message;
    if (errorMessage.includes('Client not found')) {
      throw new NotFoundError('Client not found');
    }
    throw new ValidationError(errorMessage);
  }
});

/**
 * Update recurring invoice template
 */
export const updateRecurringTemplate = asyncHandler(async (req: Request<{ id: string }, object, { templateData: Partial<RecurringInvoiceTemplateRequest> }>, res: Response): Promise<void> => {
  const { id } = req.params;
  const { templateData } = req.body;

  if (!id || isNaN(parseInt(id))) {
    throw new ValidationError('Invalid recurring template ID');
  }

  if (!templateData) {
    throw new ValidationError('Template data is required');
  }

  const templateId = parseInt(id, 10);

  try {
    const updated = await recurringInvoiceTemplateService.updateRecurringTemplate(templateId, templateData);

    if (!updated) {
      throw new NotFoundError('Recurring template not found');
    }

    res.json({ 
      success: true, 
      message: 'Recurring invoice template updated successfully' 
    });
  } catch (error) {
    const errorMessage = (error as Error).message;
    if (errorMessage.includes('not found')) {
      throw new NotFoundError('Recurring template not found');
    }
    if (errorMessage.includes('Client not found')) {
      throw new NotFoundError('Client not found');
    }
    throw new ValidationError(errorMessage);
  }
});

/**
 * Delete recurring invoice template
 */
export const deleteRecurringTemplate = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  if (!id || isNaN(parseInt(id))) {
    throw new ValidationError('Invalid recurring template ID');
  }

  const templateId = parseInt(id, 10);

  try {
    const deleted = await recurringInvoiceTemplateService.deleteRecurringTemplate(templateId);

    if (!deleted) {
      throw new NotFoundError('Recurring template not found');
    }

    res.json({ 
      success: true, 
      message: 'Recurring invoice template deleted successfully' 
    });
  } catch (error) {
    const errorMessage = (error as Error).message;
    if (errorMessage.includes('not found')) {
      throw new NotFoundError('Recurring template not found');
    } else if (errorMessage.includes('in use')) {
      throw new ValidationError('Recurring template is currently in use and cannot be deleted');
    }
    throw new ValidationError(errorMessage);
  }
});

/**
 * Toggle recurring template active/inactive
 */
export const toggleRecurringTemplate = asyncHandler(async (req: Request<{ id: string }, object, { isActive: boolean }>, res: Response): Promise<void> => {
  const { id } = req.params;
  const { isActive } = req.body;

  if (!id || isNaN(parseInt(id))) {
    throw new ValidationError('Invalid recurring template ID');
  }

  if (typeof isActive !== 'boolean') {
    throw new ValidationError('isActive must be a boolean value');
  }

  const templateId = parseInt(id, 10);

  try {
    const updated = await recurringInvoiceTemplateService.toggleRecurringTemplate(templateId, isActive);

    if (!updated) {
      throw new NotFoundError('Recurring template not found');
    }

    res.json({ 
      success: true, 
      message: `Recurring invoice template ${isActive ? 'activated' : 'deactivated'} successfully` 
    });
  } catch (error) {
    const errorMessage = (error as Error).message;
    if (errorMessage.includes('not found')) {
      throw new NotFoundError('Recurring template not found');
    }
    throw new ValidationError(errorMessage);
  }
});

/**
 * Process recurring templates (manually trigger)
 */
export const processRecurringTemplates = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  try {
    const results = await recurringInvoiceProcessorService.processAllDueTemplates();
    
    res.json({ 
      success: true, 
      data: {
        invoicesCreated: results.created,
        errors: results.errors,
        hasErrors: results.errors.length > 0
      },
      message: `Processed recurring templates: ${results.created} invoices created${results.errors.length > 0 ? `, ${results.errors.length} errors` : ''}` 
    });
  } catch (error) {
    const errorMessage = (error as Error).message;
    throw new ValidationError(errorMessage);
  }
});

/**
 * Process a single recurring template
 */
export const processSingleTemplate = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  if (!id || isNaN(parseInt(id))) {
    throw new ValidationError('Invalid recurring template ID');
  }

  const templateId = parseInt(id, 10);

  try {
    const result = await recurringInvoiceProcessorService.processSingleTemplate(templateId);
    
    if (result.success) {
      res.json({ 
        success: true, 
        data: { invoiceId: result.invoiceId },
        message: 'Invoice created successfully from recurring template' 
      });
    } else {
      throw new ValidationError(result.error || 'Failed to process template');
    }
  } catch (error) {
    const errorMessage = (error as Error).message;
    throw new ValidationError(errorMessage);
  }
});

/**
 * Get processing statistics
 */
export const getProcessingStats = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  try {
    const stats = await recurringInvoiceProcessorService.getProcessingStats();
    
    res.json({ 
      success: true, 
      data: stats 
    });
  } catch (error) {
    const errorMessage = (error as Error).message;
    throw new ValidationError(errorMessage);
  }
});