// Client controller for Slimbooks
// Handles all client-related business logic

import { type Request, type Response } from 'express';
import { clientService } from '../services/ClientService.js';
import {
  NotFoundError,
  ValidationError,
  asyncHandler
} from '../middleware/index.js';

/**
 * Client data request interface
 */
interface ClientRequest {
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
  company?: string;
  tax_id?: string;
  notes?: string;
  is_active?: boolean;
}

/**
 * Get all clients
 */
export const getAllClients = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const clients = await clientService.getAllClients();
  res.json({ success: true, data: clients });
});

/**
 * Get client by ID
 */
export const getClientById = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  if (typeof id !== 'string') {
    throw new ValidationError('Invalid client ID');
  }

  const clientId = parseInt(id, 10);

  if (isNaN(clientId)) {
    throw new ValidationError('Invalid client ID');
  }
  
  const client = await clientService.getClientById(clientId);

  if (!client) {
    throw new NotFoundError('Client');
  }

  res.json({ success: true, data: client });
});

/**
 * Create new client
 */
export const createClient = asyncHandler(async (req: Request<object, object, { clientData: ClientRequest }>, res: Response): Promise<void> => {
  const { clientData } = req.body;

  if (!clientData) {
    throw new ValidationError('Client data is required');
  }

  try {
    const clientId = await clientService.createClient(clientData);
    
    res.status(201).json({ 
      success: true, 
      data: { id: clientId },
      message: 'Client created successfully'
    });
  } catch (error) {
    const errorMessage = (error as Error).message;
    if (errorMessage.includes('already exists')) {
      throw new ValidationError('Client with this email already exists');
    } else if (errorMessage.includes('required')) {
      throw new ValidationError('Invalid client data - name is required');
    } else if (errorMessage.includes('email format')) {
      throw new ValidationError('Invalid email format');
    }
    throw new ValidationError(errorMessage);
  }
});

/**
 * Update client
 */
export const updateClient = asyncHandler(async (req: Request<{ id: string }, object, { clientData: Partial<ClientRequest> }>, res: Response): Promise<void> => {
  const { id } = req.params;
  const { clientData } = req.body;
  const clientId = parseInt(id, 10);

  if (isNaN(clientId)) {
    throw new ValidationError('Invalid client ID');
  }

  if (!clientData) {
    throw new ValidationError('Client data is required');
  }

  try {
    const changes = await clientService.updateClient(clientId, clientData);
    
    res.json({ 
      success: true, 
      data: { changes },
      message: 'Client updated successfully'
    });
  } catch (error) {
    const errorMessage = (error as Error).message;
    if (errorMessage === 'Client not found') {
      throw new NotFoundError('Client');
    } else if (errorMessage.includes('already exists') || errorMessage.includes('already in use')) {
      throw new ValidationError('Email is already in use by another client');
    } else if (errorMessage.includes('email format')) {
      throw new ValidationError('Invalid email format');
    } else if (errorMessage === 'No valid fields to update') {
      throw new ValidationError('No valid fields to update');
    }
    throw new ValidationError(errorMessage);
  }
});

/**
 * Delete client
 */
export const deleteClient = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  if (typeof id !== 'string') {
    throw new ValidationError('Invalid client ID');
  }

  const clientId = parseInt(id, 10);

  if (isNaN(clientId)) {
    throw new ValidationError('Invalid client ID');
  }
  
  try {
    const changes = await clientService.deleteClient(clientId);
    
    res.json({ 
      success: true, 
      data: { changes },
      message: 'Client deleted successfully'
    });
  } catch (error) {
    const errorMessage = (error as Error).message;
    if (errorMessage === 'Client not found') {
      throw new NotFoundError('Client');
    } else if (errorMessage.includes('existing invoices')) {
      throw new ValidationError('Cannot delete client with existing invoices. Archive the client instead.');
    }
    throw new ValidationError(errorMessage);
  }
});

/**
 * Get client statistics
 */
export const getClientStats = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const stats = await clientService.getClientStats();
  res.json({ success: true, data: stats });
});

/**
 * Search clients
 */
export const searchClients = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { q, limit = '10', offset = '0' } = req.query;
  
  if (!q || typeof q !== 'string') {
    throw new ValidationError('Search query is required');
  }

  const parsedLimit = parseInt(limit as string, 10);
  const parsedOffset = parseInt(offset as string, 10);

  if (isNaN(parsedLimit) || isNaN(parsedOffset)) {
    throw new ValidationError('Invalid limit or offset');
  }
  
  try {
    const results = await clientService.searchClients(q, { limit: parsedLimit, offset: parsedOffset });
    res.json({ success: true, data: results });
  } catch (error) {
    throw new ValidationError((error as Error).message);
  }
});

/**
 * Get active clients
 */
export const getActiveClients = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { limit = '100', offset = '0' } = req.query;
  
  const parsedLimit = parseInt(limit as string, 10);
  const parsedOffset = parseInt(offset as string, 10);

  if (isNaN(parsedLimit) || isNaN(parsedOffset)) {
    throw new ValidationError('Invalid limit or offset');
  }

  const clients = await clientService.getActiveClients({ limit: parsedLimit, offset: parsedOffset });
  res.json({ success: true, data: clients });
});

/**
 * Toggle client status (archive/unarchive)
 */
export const toggleClientStatus = asyncHandler(async (req: Request<{ id: string }, object, { isActive: boolean }>, res: Response): Promise<void> => {
  const { id } = req.params;
  const { isActive } = req.body;
  const clientId = parseInt(id, 10);

  if (isNaN(clientId)) {
    throw new ValidationError('Invalid client ID');
  }

  if (typeof isActive !== 'boolean') {
    throw new ValidationError('isActive must be a boolean value');
  }

  try {
    const changes = await clientService.toggleClientStatus(clientId, isActive);
    res.json({ 
      success: true, 
      data: { changes },
      message: `Client ${isActive ? 'activated' : 'archived'} successfully`
    });
  } catch (error) {
    const errorMessage = (error as Error).message;
    if (errorMessage === 'Client not found') {
      throw new NotFoundError('Client');
    }
    throw new ValidationError(errorMessage);
  }
});

/**
 * Get clients with recent activity
 */
export const getClientsWithRecentActivity = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { days = '30', limit = '50', offset = '0' } = req.query;
  
  const parsedDays = parseInt(days as string, 10);
  const parsedLimit = parseInt(limit as string, 10);
  const parsedOffset = parseInt(offset as string, 10);

  if (isNaN(parsedDays) || isNaN(parsedLimit) || isNaN(parsedOffset)) {
    throw new ValidationError('Invalid days, limit, or offset');
  }

  const clients = await clientService.getClientsWithRecentActivity(parsedDays, { 
    limit: parsedLimit, 
    offset: parsedOffset 
  });
  
  res.json({ success: true, data: clients });
});

/**
 * Get clients by country
 */
export const getClientsByCountry = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { country } = req.params;
  const { limit = '100', offset = '0' } = req.query;

  if (!country) {
    throw new ValidationError('Country parameter is required');
  }
  
  const parsedLimit = parseInt(limit as string, 10);
  const parsedOffset = parseInt(offset as string, 10);

  if (isNaN(parsedLimit) || isNaN(parsedOffset)) {
    throw new ValidationError('Invalid limit or offset');
  }

  const clients = await clientService.getClientsByCountry(country, { 
    limit: parsedLimit, 
    offset: parsedOffset 
  });
  
  res.json({ success: true, data: clients });
});

/**
 * Check if email exists
 */
export const checkEmailExists = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { email } = req.params;
  const { excludeId } = req.query;

  if (!email) {
    throw new ValidationError('Email parameter is required');
  }

  let excludeIdNum: number | undefined;
  if (excludeId) {
    excludeIdNum = parseInt(excludeId as string, 10);
    if (isNaN(excludeIdNum)) {
      throw new ValidationError('Invalid excludeId');
    }
  }

  const exists = await clientService.emailExists(email, excludeIdNum);
  res.json({ success: true, data: { exists } });
});