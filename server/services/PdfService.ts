// PDF Service - Domain-specific service for PDF generation operations
// Handles PDF-related database operations, settings retrieval, and PDF generation

// puppeteer is an optional dependency, so it must not be imported at module
// scope: a static import makes this whole module fail to load on a host that
// has no Chromium, which takes the rest of the API down with it. These are
// type-only imports (erased at compile time); the module itself is loaded
// lazily in initialize(), and runtime.features.pdf decides whether that ever
// happens.
import type { Browser, Page, PDFOptions, PaperFormat } from 'puppeteer';
import { databaseService } from '../core/DatabaseService.js';
import { settingsService } from './SettingsService.js';
import { type InvoiceWithClient } from '../types/index.js';
import { utcNow } from '../utils/utcTime.util.js';

/**
 * `settingsService.getSettingByKey()` already JSON-parses the stored value, so
 * these helpers receive the payload itself — not a `{ value: string }` row.
 * Treating it as a row (and parsing a second time) made every lookup here fall
 * through to its default and silently ignore the user's saved settings.
 */
type StoredSetting = unknown;

/** Reads the page format from a `pdf_format` setting stored as an object or a bare string. */
const readPdfFormat = (setting: StoredSetting): string | null => {
  if (typeof setting === 'string') {
    return setting.trim() || null;
  }

  if (setting && typeof setting === 'object' && 'format' in setting) {
    const format = (setting as { format?: unknown }).format;
    return typeof format === 'string' && format.trim() ? format : null;
  }

  return null;
};

/**
 * PDF Service
 * Handles invoice retrieval for PDF generation, settings, and actual PDF generation using Puppeteer
 */
export class PdfService {
  private browser: Browser | null = null;
  private isInitialized: boolean = false;

  /**
   * Initialize the PDF service with a browser instance
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Loaded here rather than at module scope. On a host without Chromium
      // this throws, and the caller reports PDF as unavailable — the rest of
      // the application is unaffected.
      const puppeteerModule = await import('puppeteer');
      const puppeteer = puppeteerModule.default ?? puppeteerModule;

      this.browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu'
        ]
      });
      this.isInitialized = true;
      console.log('PDF Generator Service initialized successfully');
    } catch (error) {
      console.error('Failed to initialize PDF Generator Service:', error);
      throw error;
    }
  }

  /**
   * Generate PDF from invoice URL with settings-aware styling
   */
  async generateInvoicePDF(invoiceId: number, token: string, options: PDFOptions = {}): Promise<Buffer> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (!this.browser) {
      throw new Error('Browser not initialized');
    }

    const page: Page = await this.browser.newPage();

    try {
      // Set viewport for consistent rendering
      await page.setViewport({
        width: 1200,
        height: 1600,
        deviceScaleFactor: 2
      });

      // Construct the public invoice URL
      const baseUrl = process.env.CLIENT_URL || 'http://localhost:8080';
      const invoiceUrl = `${baseUrl}/invoice/${invoiceId}?token=${token}`;

      console.log(`Generating PDF for invoice URL: ${invoiceUrl}`);

      // Navigate to the invoice page
      console.log(`🌐 Navigating to: ${invoiceUrl}`);
      const response = await page.goto(invoiceUrl, {
        waitUntil: 'networkidle0',
        timeout: 30000
      });

      console.log(`📄 Page response status: ${response?.status()}`);

      // Check if page loaded successfully
      if (!response?.ok()) {
        const pageContent = await page.content();
        console.log(`❌ Page failed to load. Content preview:`, pageContent.substring(0, 500));
        throw new Error(`Failed to load invoice page: HTTP ${response?.status()}`);
      }

      // Wait for the invoice content to load
      console.log(`⏳ Waiting for invoice content to load...`);
      try {
        await page.waitForSelector('.bg-card', { timeout: 15000 });
        console.log(`✅ Invoice content loaded successfully`);
      } catch (selectorError) {
        const pageContent = await page.content();
        console.log(`❌ Invoice content failed to load. Page content:`, pageContent.substring(0, 1000));
        throw new Error(`Invoice content not found on page: ${selectorError}`);
      }

      // Apply PDF-specific styling that respects user settings
      await page.addStyleTag({
        content: `
          /* Hide download button header for PDF */
          .bg-card.border-b { display: none !important; }

          /* PDF-optimized layout */
          body {
            margin: 0;
            padding: 20px;
            background: white !important;
            -webkit-print-color-adjust: exact;
            color-adjust: exact;
          }

          /* Ensure full width for PDF */
          .max-w-4xl {
            max-width: none !important;
            margin: 0 !important;
            width: 100% !important;
          }

          /* Ensure proper background colors for PDF */
          .bg-card, .bg-background {
            background: white !important;
          }

          /* Ensure text is visible in PDF */
          .text-foreground, .text-card-foreground {
            color: #000 !important;
          }

          .text-muted-foreground {
            color: #666 !important;
          }

          /* Ensure borders are visible */
          .border, .border-border {
            border-color: #e5e7eb !important;
          }

          /* Ensure table styling is preserved */
          table {
            border-collapse: collapse !important;
          }

          /* Print-friendly colors for different themes */
          .bg-muted {
            background-color: #f9fafb !important;
          }

          /* Ensure company logo is properly sized */
          img {
            max-height: 80px !important;
            width: auto !important;
          }
        `
      });

      // Get PDF format from options or settings
      const pdfOptions = await this.getPDFOptionsFromSettings();
      const mergedOptions: PDFOptions = {
        ...pdfOptions,
        ...options
      };

      console.log(`📄 Generating PDF with options:`, mergedOptions);
      const pdfBuffer = Buffer.from(await page.pdf(mergedOptions));

      // Validate PDF buffer
      if (!pdfBuffer || pdfBuffer.length === 0) {
        throw new Error('Generated PDF buffer is empty');
      }

      // Check if buffer starts with PDF signature
      const bufferStart = pdfBuffer.slice(0, 20);
      const pdfSignature = bufferStart.slice(0, 4).toString();

      if (pdfSignature !== '%PDF') {
        console.log(`❌ Invalid PDF signature. Expected '%PDF', got '${pdfSignature}'`);
        throw new Error(`Generated buffer is not a valid PDF file. Got signature: '${pdfSignature}'`);
      }

      console.log(`✅ PDF generated successfully for invoice ${invoiceId}, size: ${pdfBuffer.length} bytes`);
      return pdfBuffer;

    } catch (error) {
      console.error(`Error generating PDF for invoice ${invoiceId}:`, error);
      throw error;
    } finally {
      await page.close();
    }
  }

  /**
   * Generate PDF for reports or other pages
   */
  async generatePagePDF(url: string, options: PDFOptions = {}): Promise<Buffer> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (!this.browser) {
      throw new Error('Browser not initialized');
    }

    const page: Page = await this.browser.newPage();
    
    try {
      await page.setViewport({
        width: 1200,
        height: 1600,
        deviceScaleFactor: 2
      });

      await page.goto(url, {
        waitUntil: 'networkidle0',
        timeout: 30000
      });

      const pdfOptions: PDFOptions = {
        format: 'A4',
        printBackground: true,
        margin: {
          top: '20px',
          right: '20px',
          bottom: '20px',
          left: '20px'
        },
        ...options
      };

      const pdfBuffer = Buffer.from(await page.pdf(pdfOptions));
      return pdfBuffer;

    } catch (error) {
      console.error(`Error generating PDF for URL ${url}:`, error);
      throw error;
    } finally {
      await page.close();
    }
  }

  /**
   * Close the browser instance
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.isInitialized = false;
      console.log('PDF Generator Service closed');
    }
  }

  /**
   * Get browser status
   */
  getStatus(): { initialized: boolean; browserConnected: boolean } {
    return {
      initialized: this.isInitialized,
      browserConnected: !!(this.browser && this.browser.isConnected())
    };
  }

  /**
   * Get invoice with client information for PDF generation
   */
  async getInvoiceForPDF(invoiceId: number): Promise<InvoiceWithClient | null> {
    if (!invoiceId || typeof invoiceId !== 'number') {
      throw new Error('Valid invoice ID is required');
    }

    return databaseService.getOne<InvoiceWithClient>(`
      SELECT i.*, c.name as client_name 
      FROM invoices i 
      LEFT JOIN clients c ON i.client_id = c.id
      WHERE i.id = ?
    `, [invoiceId]);
  }

  /**
   * Get PDF generation options based on user settings
   */
  async getPDFOptionsFromSettings(): Promise<{
    format: PaperFormat;
    printBackground: boolean;
    margin: {
      top: string;
      right: string;
      bottom: string;
      left: string;
    };
  }> {
    try {
      // Get appearance settings for PDF format preference
      const pdfFormatSettings = await settingsService.getSettingByKey('pdf_format');

      // Default PDF options
      const options: {
        format: PaperFormat;
        printBackground: boolean;
        margin: { top: string; right: string; bottom: string; left: string };
      } = {
        format: 'A4',
        printBackground: true,
        margin: {
          top: '0.5in',
          right: '0.5in',
          bottom: '0.5in',
          left: '0.5in'
        }
      };

      // Apply format preference if set
      const storedFormat = readPdfFormat(pdfFormatSettings);
      if (storedFormat) {
        options.format = storedFormat as PaperFormat;
      }

      // Company-specific PDF overrides (letterhead margins, custom page size, ...)
      const companySettings = await settingsService.getSettingByKey('company_settings');
      if (companySettings && typeof companySettings === 'object' && 'pdfOptions' in companySettings) {
        const pdfOverrides = (companySettings as { pdfOptions?: Record<string, unknown> }).pdfOptions;
        if (pdfOverrides && typeof pdfOverrides === 'object') {
          Object.assign(options, pdfOverrides);
        }
      }

      return options;
    } catch (error) {
      console.error('Error getting PDF settings:', error);
      // Return defaults if settings can't be loaded
      return {
        format: 'A4',
        printBackground: true,
        margin: {
          top: '0.5in',
          right: '0.5in',
          bottom: '0.5in',
          left: '0.5in'
        }
      };
    }
  }

  /**
   * Get PDF format setting
   */
  async getPDFFormat(): Promise<string> {
    try {
      // Get appearance settings for PDF format preference
      const formatSetting = await settingsService.getSettingByKey('pdf_format');

      return readPdfFormat(formatSetting) ?? 'A4';
    } catch (error) {
      console.error('Error getting PDF format setting:', error);
      return 'A4';
    }
  }

  /**
   * Update PDF format setting
   */
  async updatePDFFormat(format: string): Promise<void> {
    const validFormats = ['A4', 'Letter', 'Legal', 'A3', 'A5'];
    if (!validFormats.includes(format)) {
      throw new Error('Invalid PDF format');
    }

    const formatData = { format };
    await settingsService.updateFormatSettings({ pdf_format: formatData });
  }

  /**
   * Get company settings for PDF branding
   */
  async getCompanySettingsForPDF(): Promise<Record<string, unknown> | null> {
    try {
      const companySettings = await settingsService.getSettingByKey('company_settings');

      if (companySettings && typeof companySettings === 'object') {
        return companySettings as Record<string, unknown>;
      }

      return null;
    } catch (error) {
      console.error('Error getting company settings for PDF:', error);
      return null;
    }
  }

  /**
   * Validate invoice exists and user has access
   */
  async validateInvoiceAccess(invoiceId: number, _userId?: number): Promise<InvoiceWithClient> {
    if (!invoiceId || typeof invoiceId !== 'number') {
      throw new Error('Valid invoice ID is required');
    }

    const invoice = await this.getInvoiceForPDF(invoiceId);
    
    if (!invoice) {
      throw new Error('Invoice not found');
    }

    // Add additional access validation logic here if needed
    // For now, we assume if the invoice exists, it's accessible

    return invoice;
  }

  /**
   * Check if invoice exists
   */
  async invoiceExists(invoiceId: number): Promise<boolean> {
    if (!invoiceId || typeof invoiceId !== 'number') {
      return false;
    }

    return databaseService.exists('invoices', 'id', invoiceId);
  }

  /**
   * Get invoice basic info (without client join)
   */
  async getInvoiceBasicInfo(invoiceId: number): Promise<{
    id: number;
    invoice_number: string;
    client_id: number;
    status: string;
    amount: number;
    created_at: number;
  } | null> {
    if (!invoiceId || typeof invoiceId !== 'number') {
      throw new Error('Valid invoice ID is required');
    }

    return databaseService.getOne<{
      id: number;
      invoice_number: string;
      client_id: number;
      status: string;
      amount: number;
      created_at: number;
    }>(`
      SELECT id, invoice_number, client_id, status, amount, created_at
      FROM invoices
      WHERE id = ?
    `, [invoiceId]);
  }

  /**
   * Log PDF generation activity (optional)
   */
  async logPDFActivity(
    invoiceId: number, 
    action: string, 
    metadata: Record<string, unknown> = {}
  ): Promise<boolean> {
    try {
      const logData = {
        invoice_id: invoiceId,
        action,
        metadata: JSON.stringify(metadata),
        created_at: utcNow()
      };

      // Only log if there's an activity log table
      // This is optional functionality
      if (await databaseService.tableExists('pdf_activity_log')) {
        await databaseService.executeQuery(`
          INSERT INTO pdf_activity_log (invoice_id, action, metadata, created_at)
          VALUES (?, ?, ?, ?)
        `, [logData.invoice_id, logData.action, logData.metadata, logData.created_at]);
      }

      return true;
    } catch (error) {
      console.error('Error logging PDF activity:', error);
      // Don't throw error for logging failures
      return false;
    }
  }
}

// Export singleton instance
export const pdfService = new PdfService();

// Graceful shutdown handling
process.on('SIGINT', async () => {
  console.log('Shutting down PDF Generator Service...');
  await pdfService.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Shutting down PDF Generator Service...');
  await pdfService.close();
  process.exit(0);
});