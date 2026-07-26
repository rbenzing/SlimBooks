// Client routes for Slimbooks API
// Handles all client-related endpoints

import { Router, type Request, type Response } from 'express';
import { type BulkImportClientsRequest, type ClientRequest } from '../types/api.types.js';
import {
  getAllClients,
  getClientById,
  createClient,
  updateClient,
  deleteClient,
  getClientStats,
  searchClients
} from '../controllers/index.js';
import {
  requireAuth,
  validateRequest,
  validationSets
} from '../middleware/index.js';

const router: Router = Router();

// All client routes require authentication
router.use(requireAuth);

// Get all clients
router.get('/', getAllClients);

// Search clients
router.get('/search', searchClients);

// Get clients with invoice summary (disabled - function not implemented)
// router.get('/with-invoice-summary', getClientsWithInvoiceSummary);

// Get client statistics
router.get('/:id/stats', 
  validationSets.updateClient.slice(0, 1), // Just ID validation
  validateRequest,
  getClientStats
);

// Get client by ID
router.get('/:id', 
  validationSets.updateClient.slice(0, 1), // Just ID validation
  validateRequest,
  getClientById
);

// Create new client
router.post('/', 
  validationSets.createClient,
  validateRequest,
  createClient
);

// Update client
router.put('/:id', 
  validationSets.updateClient,
  validateRequest,
  updateClient
);

// Delete client
router.delete('/:id', 
  validationSets.updateClient.slice(0, 1), // Just ID validation
  validateRequest,
  deleteClient
);

// Bulk import clients
router.post('/bulk-import',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { clients } = req.body as BulkImportClientsRequest;

      if (!clients || !Array.isArray(clients)) {
        res.status(400).json({
          success: false,
          error: 'Clients array is required'
        });
        return;
      }

      let successCount = 0;
      let errorCount = 0;
      const errors: string[] = [];

      // Import the client service
      const { clientService } = await import('../services/ClientService.js');

      for (let i = 0; i < clients.length; i++) {
        const clientData = clients[i] as ClientRequest;
        try {
          // Use the client service directly instead of the controller
          await clientService.createClient(clientData);
          successCount++;
        } catch (error) {
          errorCount++;
          const errorMessage = (error as Error).message;
          errors.push(`Client ${i + 1}: ${errorMessage}`);
        }
      }

      res.json({
        success: true,
        data: {
          imported: successCount,
          failed: errorCount,
          errors
        },
        message: `Import completed: ${successCount} clients imported, ${errorCount} failed`
      });
    } catch (error) {
      console.error('Bulk import error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to import clients'
      });
    }
  }
);

export default router;