// PDF Service for client-side PDF operations
// Handles PDF generation requests to the server

import { type PDFGenerationOptions } from '@/types';
import { getToken, API_BASE } from '@/utils/api';

// PDFGenerationOptions moved to @/types/common.types.ts

class PDFService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = `${API_BASE}/pdf`;
  }

  /**
   * Generate PDF for an invoice using auto-generated token
   */
  async generateInvoicePDF(invoiceId: number, _options?: PDFGenerationOptions): Promise<Blob> {
    try {
      const token = getToken();
      const response = await fetch(`${this.baseUrl}/invoice/${invoiceId}/download`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          // Remove Content-Type for PDF download requests
        },
      });

      if (!response.ok) {
        let errorMessage = 'Failed to generate PDF';
        try {
          const errorData = await response.json();
          errorMessage = errorData.message || errorData.error || errorMessage;
        } catch {
          // If response is not JSON, use status text
          errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }

      // Verify the response is actually a PDF
      const contentType = response.headers.get('content-type');
      if (contentType && !contentType.includes('application/pdf')) {
        throw new Error('Server did not return a PDF file');
      }

      const blob = await response.blob();

      // Verify blob size
      if (blob.size === 0) {
        throw new Error('Received empty PDF file');
      }

      return blob;
    } catch (error) {
      console.error('Error generating invoice PDF:', error);
      throw error;
    }
  }

  /**
   * Generate PDF for an invoice with provided token (for public access)
   */
  async generatePublicInvoicePDF(invoiceId: number, token: string, _options?: PDFGenerationOptions): Promise<Blob> {
    try {
      const response = await fetch(`${this.baseUrl}/invoice/${invoiceId}?token=${token}`, {
        method: 'GET',
      });

      if (!response.ok) {
        let errorMessage = 'Failed to generate PDF';
        try {
          const errorData = await response.json();
          errorMessage = errorData.message || errorData.error || errorMessage;
        } catch {
          // If response is not JSON, use status text
          errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }

      // Verify the response is actually a PDF
      const contentType = response.headers.get('content-type');
      if (contentType && !contentType.includes('application/pdf')) {
        throw new Error('Server did not return a PDF file');
      }

      const blob = await response.blob();

      // Verify blob size
      if (blob.size === 0) {
        throw new Error('Received empty PDF file');
      }

      return blob;
    } catch (error) {
      console.error('Error generating public invoice PDF:', error);
      throw error;
    }
  }

  /**
   * Generate PDF for a custom page/report
   */
  async generatePagePDF(url: string, filename?: string, options?: PDFGenerationOptions): Promise<Blob> {
    try {
      const token = getToken();
      const response = await fetch(`${this.baseUrl}/page`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url,
          filename,
          options
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to generate PDF' }));
        throw new Error(errorData.message || 'Failed to generate PDF');
      }

      return await response.blob();
    } catch (error) {
      console.error('Error generating page PDF:', error);
      throw error;
    }
  }

  /**
   * Download PDF blob as file
   */
  downloadPDF(blob: Blob, filename: string): void {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }

  /**
   * Generate and download invoice PDF
   */
  async downloadInvoicePDF(invoiceId: number, invoiceNumber?: string): Promise<void> {
    try {
      const blob = await this.generateInvoicePDF(invoiceId);
      const filename = `Invoice-${invoiceNumber || invoiceId}.pdf`;
      this.downloadPDF(blob, filename);
    } catch (error) {
      console.error('Error downloading invoice PDF:', error);
      throw error;
    }
  }

  /**
   * Generate and download public invoice PDF
   * If no token provided, generates a new secure token
   */
  async downloadPublicInvoicePDF(invoiceId: number, token?: string, invoiceNumber?: string): Promise<void> {
    try {
      let publicToken = token;

      // If no token provided, generate a new secure token
      if (!publicToken) {
        publicToken = await this.generatePublicInvoiceToken(invoiceId);
      }

      const blob = await this.generatePublicInvoicePDF(invoiceId, publicToken);
      const filename = `Invoice-${invoiceNumber || invoiceId}.pdf`;
      this.downloadPDF(blob, filename);
    } catch (error) {
      console.error('Error downloading public invoice PDF:', error);
      throw error;
    }
  }

  /**
   * Generate and download report PDF
   */
  async downloadReportPDF(reportUrl: string, reportName: string): Promise<void> {
    try {
      const blob = await this.generatePagePDF(reportUrl, `${reportName}.pdf`);
      this.downloadPDF(blob, `${reportName}.pdf`);
    } catch (error) {
      console.error('Error downloading report PDF:', error);
      throw error;
    }
  }

  /**
   * Get PDF service status
   */
  async getServiceStatus(): Promise<{ status: string; message?: string }> {
    try {
      const token = getToken();
      const response = await fetch(`${this.baseUrl}/status`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to get PDF service status');
      }

      return await response.json();
    } catch (error) {
      console.error('Error getting PDF service status:', error);
      throw error;
    }
  }

  /**
   * Generate secure public token for invoice
   */
  async generatePublicInvoiceToken(invoiceId: number): Promise<string> {
    try {
      const token = getToken();
      const response = await fetch(`${this.baseUrl.replace('/pdf', '')}/invoices/${invoiceId}/public-token`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to generate public token');
      }

      const result = await response.json();
      return result.data.token;
    } catch (error) {
      console.error('Error generating public token:', error);
      throw error;
    }
  }
}

// Create singleton instance
export const pdfService = new PDFService();
export default pdfService;
