// PDF controller for Slimbooks
// Handles PDF generation requests
import { type Request, type Response } from 'express';
import { pdfService } from '../services/PdfService.js';
import { invoiceService } from '../services/InvoiceService.js';
import {
  AppError,
  NotFoundError,
  ValidationError,
  asyncHandler
} from '../middleware/index.js';

/**
 * Generate and download invoice PDF for authenticated users
 */
export const downloadInvoicePDF = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const idParam = req.params.id;
  if (!idParam) {
    throw new ValidationError('Invoice ID is required');
  }

  const invoiceId = parseInt(idParam, 10);
  if (isNaN(invoiceId)) {
    throw new ValidationError('Invalid invoice ID');
  }

  // Validate invoice exists
  const invoice = await pdfService.getInvoiceForPDF(invoiceId);
  if (!invoice) {
    throw new NotFoundError('Invoice not found');
  }

  try {
    // Generate a proper JWT token for public access
    const tokenData = await invoiceService.generatePublicInvoiceToken(invoiceId);

    // Generate PDF
    const pdfBuffer = await pdfService.generateInvoicePDF(invoiceId, tokenData.token);

    // Set appropriate headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Invoice-${invoice.invoice_number || invoiceId}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length.toString());
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    // Send PDF buffer
    res.end(pdfBuffer);

    // Optional: Log PDF generation activity
    await pdfService.logPDFActivity(invoiceId, 'download', {
      user_agent: req.get('User-Agent'),
      ip: req.ip,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error(`Error generating PDF for invoice ${invoiceId}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new AppError(`Failed to generate PDF: ${errorMessage}`, 500);
  }
});

/**
 * Generate and download invoice PDF for public access with token
 */
export const downloadPublicInvoicePDF = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const idParam = req.params.id;
  if (!idParam) {
    throw new ValidationError('Invoice ID is required');
  }

  const invoiceId = parseInt(idParam, 10);
  const token = req.query.token as string;

  if (isNaN(invoiceId)) {
    throw new ValidationError('Invalid invoice ID');
  }

  if (!token) {
    throw new ValidationError('Access token is required');
  }

  // Validate invoice exists
  const invoice = await pdfService.getInvoiceForPDF(invoiceId);
  if (!invoice) {
    throw new NotFoundError('Invoice not found');
  }

  try {
    // Generate PDF
    const pdfBuffer = await pdfService.generateInvoicePDF(invoiceId, token);

    // Set appropriate headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Invoice-${invoice.invoice_number || invoiceId}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length.toString());
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    // Send PDF buffer
    res.end(pdfBuffer);

    // Optional: Log PDF generation activity
    await pdfService.logPDFActivity(invoiceId, 'public_download', {
      token_used: true,
      user_agent: req.get('User-Agent'),
      ip: req.ip,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error(`Error generating public PDF for invoice ${invoiceId}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new AppError(`Failed to generate PDF: ${errorMessage}`, 500);
  }
});

/**
 * Generate PDF for custom page/report
 */
export const generatePagePDF = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { url, filename, options } = req.body;

  if (!url) {
    throw new ValidationError('URL is required');
  }

  try {
    const pdfBuffer = await pdfService.generatePagePDF(url, options);

    // Set appropriate headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename || 'report.pdf'}"`);
    res.setHeader('Content-Length', pdfBuffer.length.toString());
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    // Send PDF buffer
    res.end(pdfBuffer);

  } catch (error) {
    console.error(`Error generating PDF for URL ${url}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new AppError(`Failed to generate PDF: ${errorMessage}`, 500);
  }
});

/**
 * Get PDF service status
 */
export const getPDFServiceStatus = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  try {
    const status = pdfService.getStatus();

    res.json({
      success: true,
      data: {
        status: status.initialized && status.browserConnected ? 'healthy' : 'unhealthy',
        initialized: status.initialized,
        browserConnected: status.browserConnected,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Error getting PDF service status:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new AppError(`Failed to get PDF service status: ${errorMessage}`, 500);
  }
});

/**
 * Initialize PDF service (if not already initialized)
 */
export const initializePDFService = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  try {
    await pdfService.initialize();

    res.json({
      success: true,
      message: 'PDF service initialized successfully',
      data: pdfService.getStatus()
    });

  } catch (error) {
    console.error('Error initializing PDF service:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new AppError(`Failed to initialize PDF service: ${errorMessage}`, 500);
  }
});

/**
 * Update PDF format settings
 */
export const updatePDFFormat = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { format } = req.body;

  if (!format) {
    throw new ValidationError('PDF format is required');
  }

  try {
    await pdfService.updatePDFFormat(format);

    res.json({
      success: true,
      message: 'PDF format updated successfully',
      data: { format }
    });

  } catch (error) {
    console.error('Error updating PDF format:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new AppError(`Failed to update PDF format: ${errorMessage}`, 500);
  }
});

/**
 * Get current PDF format setting
 */
export const getPDFFormat = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  try {
    const format = await pdfService.getPDFFormat();

    res.json({
      success: true,
      data: { format }
    });

  } catch (error) {
    console.error('Error getting PDF format:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new AppError(`Failed to get PDF format: ${errorMessage}`, 500);
  }
});