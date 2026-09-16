// PDF routes for generating PDFs from invoices and reports
// Handles PDF generation endpoints

import { Router } from 'express';
import { param, body, query } from 'express-validator';
import {
  downloadInvoicePDF,
  downloadPublicInvoicePDF,
  generatePagePDF,
  getPDFServiceStatus,
  initializePDFService,
  updatePDFFormat,
  getPDFFormat
} from '../controllers/pdfController.js';
import { requireAuth, validateRequest } from '../middleware/index.js';
import type { Runtime } from '../runtime/types.js';

/**
 * Build the PDF router.
 *
 * Takes the runtime for one reason: `POST /page` drives a real headless browser
 * at a URL from the request body, and the only safe URL is this installation's
 * own. `runtime.urls.publicUrl` is where that comes from.
 */
export const createPdfRoutes = (runtime: Runtime): Router => {
  const router: Router = Router();

  // The single origin the renderer may be pointed at.
  //
  // Without this, `POST /page` was a server-side request forgery primitive that
  // any signed-in user could drive: hand it http://169.254.169.254/… and the
  // cloud instance's own metadata — IAM credentials included — came back
  // rendered as a PDF. The browser runs inside the network perimeter, so every
  // internal address the host can reach was reachable through it.
  //
  // The legitimate caller only ever sends `window.location.origin + /reports/…`
  // (see downloadReportPDF), so restricting it to this origin costs the feature
  // nothing.
  const allowedOrigin = new URL(runtime.urls.publicUrl).origin;

  const isOwnOrigin = (value: string): boolean => {
    try {
      return new URL(value).origin === allowedOrigin;
    } catch {
      return false;
    }
  };

  // Invoice PDF download routes
  router.get('/invoice/:id/download',
    requireAuth,
    [
      param('id').isInt({ min: 1 }).withMessage('Invoice ID must be a positive integer')
    ],
    validateRequest,
    downloadInvoicePDF
  );

  // Public invoice PDF access (with token)
  router.get('/invoice/:id',
    [
      param('id').isInt({ min: 1 }).withMessage('Invoice ID must be a positive integer'),
      query('token').notEmpty().withMessage('Access token is required')
    ],
    validateRequest,
    downloadPublicInvoicePDF
  );

  // Custom page/report PDF generation
  router.post('/page',
    requireAuth,
    [
      // require_protocol rejects the bare `169.254.169.254` that default isURL
      // accepts; the protocol list rejects file:// and everything else Chrome
      // would happily open.
      //
      // require_tld must be off: it defaults on, and `localhost` has no TLD, so
      // leaving it would reject every development install and any deployment
      // reached by hostname alone. It is not what makes this safe — the origin
      // comparison below is — and with it on, the feature was broken for
      // exactly the installs that use it most.
      body('url')
        .isURL({ require_protocol: true, require_tld: false, protocols: ['http', 'https'] })
        .withMessage('Valid URL is required')
        .bail()
        .custom(isOwnOrigin)
        .withMessage('URL must be a page on this installation'),
      body('filename').optional().isString().withMessage('Filename must be a string'),
      body('options').optional().isObject().withMessage('Options must be an object')
    ],
    validateRequest,
    generatePagePDF
  );

  // PDF service management routes
  router.get('/status',
    requireAuth,
    getPDFServiceStatus
  );

  router.post('/initialize',
    requireAuth,
    initializePDFService
  );

  // PDF format settings routes
  router.get('/format',
    requireAuth,
    getPDFFormat
  );

  router.put('/format',
    requireAuth,
    [
      body('format').isIn(['A4', 'Letter', 'Legal', 'A3', 'A5']).withMessage('Invalid PDF format')
    ],
    validateRequest,
    updatePDFFormat
  );

  return router;
};
