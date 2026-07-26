// Template controller for Slimbooks
// Handles all template-related business logic

import { type Request, type Response } from 'express';
import { templateService } from '../services/TemplateService.js';
import {
  NotFoundError,
  ValidationError,
  asyncHandler
} from '../middleware/index.js';

/**
 * Template data request interface
 */
interface TemplateRequest {
  name: string;
  content: string;
  is_default?: boolean;
  variables?: string;
}

/**
 * Get all templates
 */
export const getAllTemplates = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const templates = await templateService.getAllTemplates();
  res.json({ success: true, data: templates });
});

/**
 * Get template by ID
 */
export const getTemplateById = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  if (!id || isNaN(parseInt(id))) {
    throw new ValidationError('Invalid template ID');
  }

  const templateId = parseInt(id, 10);
  const template = await templateService.getTemplateById(templateId);

  if (!template) {
    throw new NotFoundError('Template not found');
  }

  res.json({ success: true, data: template });
});

/**
 * Create new template
 */
export const createTemplate = asyncHandler(async (req: Request<object, object, { templateData: TemplateRequest }>, res: Response): Promise<void> => {
  const { templateData } = req.body;

  if (!templateData) {
    throw new ValidationError('Template data is required');
  }

  try {
    const templateId = await templateService.createTemplate(templateData);
    
    res.status(201).json({ 
      success: true, 
      data: { id: templateId },
      message: 'Template created successfully'
    });
  } catch (error) {
    const errorMessage = (error as Error).message;
    if (errorMessage.includes('name is required')) {
      throw new ValidationError('Template name is required');
    } else if (errorMessage.includes('content is required')) {
      throw new ValidationError('Template content is required');
    }
    throw new ValidationError(errorMessage);
  }
});

/**
 * Update template
 */
export const updateTemplate = asyncHandler(async (req: Request<{ id: string }, object, { templateData: Partial<TemplateRequest> }>, res: Response): Promise<void> => {
  const { id } = req.params;
  const { templateData } = req.body;

  if (!id || isNaN(parseInt(id))) {
    throw new ValidationError('Invalid template ID');
  }

  if (!templateData) {
    throw new ValidationError('Template data is required');
  }

  const templateId = parseInt(id, 10);

  try {
    const updated = await templateService.updateTemplate(templateId, templateData);

    if (!updated) {
      throw new NotFoundError('Template not found');
    }

    res.json({ 
      success: true, 
      message: 'Template updated successfully' 
    });
  } catch (error) {
    const errorMessage = (error as Error).message;
    if (errorMessage.includes('not found')) {
      throw new NotFoundError('Template not found');
    }
    throw new ValidationError(errorMessage);
  }
});

/**
 * Delete template
 */
export const deleteTemplate = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  if (!id || isNaN(parseInt(id))) {
    throw new ValidationError('Invalid template ID');
  }

  const templateId = parseInt(id, 10);

  try {
    const deleted = await templateService.deleteTemplate(templateId);

    if (!deleted) {
      throw new NotFoundError('Template not found');
    }

    res.json({ 
      success: true, 
      message: 'Template deleted successfully' 
    });
  } catch (error) {
    const errorMessage = (error as Error).message;
    if (errorMessage.includes('not found')) {
      throw new NotFoundError('Template not found');
    } else if (errorMessage.includes('in use')) {
      throw new ValidationError('Template is currently in use and cannot be deleted');
    }
    throw new ValidationError(errorMessage);
  }
});