
import { toast } from 'sonner';
import React, { useState } from 'react';
import { Upload, Download, DollarSign } from 'lucide-react';
import Modal from '@/components/ui/modal.cpt';
import { getStatusColor } from '@/utils/themeUtils.util';
import { formatDateSync } from '@/components/ui/FormattedDate';
import { FormattedCurrency } from '@/components/ui/FormattedCurrency';
import { pdfService } from '@/services/pdf.svc';
import { useCompanySettings } from '@/hooks/useSettings.hook';
import { useRuntimeConfig } from '@/hooks/useRuntimeConfig.hook';
import type { Invoice, InvoiceViewLineItem } from '@/types';

interface InvoiceViewModalProps {
  invoice: Invoice | null;
  isOpen: boolean;
  onClose: () => void;
  onMarkAsPaid?: (invoice: Invoice) => void;
}

export const InvoiceViewModal: React.FC<InvoiceViewModalProps> = ({ invoice, isOpen, onClose, onMarkAsPaid }) => {
  const { settings: companySettings, isLoading: companySettingsLoading } = useCompanySettings();
  const { data: runtimeConfig } = useRuntimeConfig();
  const pdfEnabled = runtimeConfig?.features.pdf === true;
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

  // Helper function to clean up stored client address that may contain "null" values
  const cleanClientAddress = (address: string) => {
    if (!address) return '';

    // Remove "null" strings and clean up the address
    const cleanedAddress = address
      .split(',')
      .map(part => part.trim())
      .filter(part => part && part !== 'null' && part !== 'undefined')
      .join(', ');

    return cleanedAddress || '';
  };

  // Handle line items - create from description if none exist
  let lineItems: InvoiceViewLineItem[] = [];
  let taxAmount = 0;
  let shippingAmount = 0;
  let subtotal = 0;

  if (invoice) {
    if (invoice.line_items) {
      try {
        lineItems = JSON.parse(invoice.line_items);
      } catch {
        lineItems = [];
      }
    }

    // If no line items exist, create one from the description and amount
    if (lineItems.length === 0 && invoice.description) {
      lineItems = [{
        id: '1',
        description: invoice.description,
        quantity: 1,
        rate: invoice.amount,
        amount: invoice.amount
      }];
    }

    taxAmount = invoice.tax_amount || 0;
    shippingAmount = invoice.shipping_amount || 0;
    subtotal = invoice.amount - taxAmount - shippingAmount;
  }

  // Get template from localStorage or default to modern-blue
  const template = localStorage.getItem('invoiceTemplate') || 'modern-blue';

  const getTemplateStyles = () => {
    const baseStyles = {
      container: 'bg-card border',
      modalHeader: 'bg-card border-b border-border',
      invoiceHeader: '',
      companySection: '',
      title: 'text-foreground',
      accent: 'text-muted-foreground',
      tableHeader: 'bg-muted/30 border-border',
      totalSection: 'bg-card',
      contentText: 'text-foreground',
      clientSection: 'bg-muted/20 border border-border',
      clientText: 'text-foreground',
      tableText: 'text-foreground',
      tableBorder: 'border-border',
    };

    switch (template) {
      case 'classic-white':
        return {
          ...baseStyles,
          container: 'bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600',
          modalHeader: 'bg-gray-50 dark:bg-gray-700 border-b border-gray-300 dark:border-gray-600',
          invoiceHeader: 'bg-gray-100 dark:bg-gray-700 border-b-2 border-gray-400 dark:border-gray-500 rounded-t-lg',
          companySection: 'bg-white dark:bg-gray-800',
          title: 'text-gray-900 dark:text-gray-100',
          accent: 'text-gray-700 dark:text-gray-300',
          tableHeader: 'bg-gray-200 dark:bg-gray-700 border-gray-400 dark:border-gray-500',
          totalSection: 'bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-300 dark:border-gray-600',
          contentText: 'text-gray-900 dark:text-gray-100',
          clientSection: 'bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600',
          clientText: 'text-gray-900 dark:text-gray-100',
          tableText: 'text-gray-900 dark:text-gray-100',
          tableBorder: 'border-gray-300 dark:border-gray-600',
        };
      case 'professional-gray':
        return {
          ...baseStyles,
          container: 'bg-white dark:bg-gray-800 border border-slate-400 dark:border-slate-600',
          modalHeader: 'bg-slate-100 dark:bg-slate-700 border-b border-slate-400 dark:border-slate-600',
          invoiceHeader: 'bg-gradient-to-r from-slate-700 to-slate-800 dark:from-slate-600 dark:to-slate-700 text-white border-b-2 border-slate-600 dark:border-slate-500 rounded-t-lg',
          companySection: 'bg-white dark:bg-gray-800',
          title: 'text-white',
          accent: 'text-slate-200 dark:text-slate-300',
          tableHeader: 'bg-slate-200 dark:bg-slate-700 border-slate-400 dark:border-slate-500',
          totalSection: 'bg-slate-100 dark:bg-slate-700 rounded-lg border border-slate-400 dark:border-slate-600',
          contentText: 'text-slate-900 dark:text-slate-100',
          clientSection: 'bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600',
          clientText: 'text-slate-900 dark:text-slate-100',
          tableText: 'text-slate-900 dark:text-slate-100',
          tableBorder: 'border-slate-300 dark:border-slate-600',
        };
      default: // modern-blue
        return {
          ...baseStyles,
          container: 'bg-white dark:bg-gray-800 border border-blue-300 dark:border-blue-600',
          modalHeader: 'bg-blue-50 dark:bg-blue-900/20 border-b border-blue-300 dark:border-blue-600',
          invoiceHeader: 'bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-700 dark:to-blue-800 text-white border-b-2 border-blue-500 dark:border-blue-600 rounded-t-lg',
          companySection: 'bg-white dark:bg-gray-800',
          title: 'text-white',
          accent: 'text-blue-100 dark:text-blue-200',
          tableHeader: 'bg-blue-100 dark:bg-blue-900/30 border-blue-300 dark:border-blue-600',
          totalSection: 'bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-300 dark:border-blue-600',
          contentText: 'text-blue-900 dark:text-blue-100',
          clientSection: 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-600',
          clientText: 'text-blue-900 dark:text-blue-100',
          tableText: 'text-blue-900 dark:text-blue-100',
          tableBorder: 'border-blue-200 dark:border-blue-600',
        };
    }
  };

  const styles = getTemplateStyles();

  const handleDownloadPDF = async () => {
    if (!invoice) return;

    setIsGeneratingPDF(true);
    try {
      // For authenticated users, use the direct invoice PDF method
      await pdfService.downloadInvoicePDF(
        invoice.id,
        invoice.invoice_number
      );
    } catch (error) {
      console.error('Error downloading PDF:', error);

      // Interpolating a server-supplied message into innerHTML made this an
      // injection sink; the app already has a toast for exactly this.
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to generate PDF. Please try again.';
      toast.error(`PDF generation failed: ${errorMessage}`);
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  // Withheld while company settings are loading: the invoice body itself
  // hasn't rendered yet, so these actions would be reachable with nothing to act on.
  const showMarkAsPaid = Boolean(!companySettingsLoading && invoice && onMarkAsPaid && invoice.status !== 'paid');
  const showDownloadPdf = Boolean(!companySettingsLoading && invoice && pdfEnabled);

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title="Invoice Preview"
      size="5xl"
      footer={
        showMarkAsPaid || showDownloadPdf ? (
          <>
            {showMarkAsPaid && invoice && onMarkAsPaid && (
              <button
                onClick={() => onMarkAsPaid(invoice)}
                className="flex items-center justify-center px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
              >
                <DollarSign className="h-4 w-4 mr-2" />
                Mark as Paid
              </button>
            )}
            {showDownloadPdf && (
              <button
                onClick={handleDownloadPDF}
                disabled={isGeneratingPDF}
                className="flex items-center justify-center px-3 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                <Download className="h-4 w-4 mr-2" />
                {isGeneratingPDF ? 'Generating...' : 'Download PDF'}
              </button>
            )}
          </>
        ) : undefined
      }
    >
      {companySettingsLoading ? (
        <div className="text-foreground">Loading company settings...</div>
      ) : invoice ? (
        <div className={`p-8 ${styles.companySection}`}>
          {/* Company Header with Branding */}
          <div className={`p-6 mb-6 ${styles.invoiceHeader}`}>
            <div className="flex justify-between items-start">
              <div className="flex items-center space-x-4">
                <div className="w-16 h-16 bg-white/20 rounded-lg flex items-center justify-center border-2 border-white/30 overflow-hidden">
                  {companySettings.brandingImage ? (
                    <img src={companySettings.brandingImage} alt="Company Logo" className="w-full h-full object-cover" />
                  ) : (
                    <Upload className="h-6 w-6 text-white/70" />
                  )}
                </div>
                <div>
                  <h1 className={`text-2xl font-bold ${styles.title}`}>{companySettings.companyName}</h1>
                  <p className={`${styles.accent} text-sm`}>{companySettings.address}</p>
                  <p className={`${styles.accent} text-sm`}>
                    {companySettings.city}, {companySettings.state} {companySettings.zipCode}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <h3 className={`text-3xl font-bold mb-2 ${styles.title}`}>INVOICE</h3>
                <div className={`space-y-1 text-sm ${styles.accent}`}>
                  <p><strong>Invoice #:</strong> {invoice.invoice_number}</p>
                  <p><strong>Date:</strong> {formatDateSync(invoice.created_at)}</p>
                  <p><strong>Due Date:</strong> {invoice.due_date ? formatDateSync(invoice.due_date) : 'N/A'}</p>
                  <p><strong>Status:</strong>
                    <span className={`ml-2 px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(invoice.status || 'draft')}`}>
                      {invoice.status ? invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1) : 'Draft'}
                    </span>
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Client Information */}
          <div className="mb-8">
            <h4 className={`font-semibold mb-3 text-lg ${styles.contentText}`}>Bill To:</h4>
            <div className={`p-4 rounded-lg ${styles.clientSection}`}>
              <p className={`font-medium text-lg ${styles.clientText}`}>{invoice.client_name}</p>
              {invoice.client_email && <p className={styles.clientText}>{invoice.client_email}</p>}
              {invoice.client_phone && <p className={styles.clientText}>{invoice.client_phone}</p>}
              {invoice.client_address && cleanClientAddress(invoice.client_address) && (
                <div className="mt-2">
                  <p className={styles.clientText}>{cleanClientAddress(invoice.client_address)}</p>
                </div>
              )}
            </div>
          </div>

          {/* Line Items */}
          <div className="mb-8">
            <table className={`w-full rounded-lg overflow-hidden ${styles.tableBorder} border`}>
              <thead>
                <tr className={styles.tableHeader}>
                  <th className={`text-left py-4 px-4 font-semibold ${styles.tableText}`}>Description</th>
                  <th className={`text-center py-4 px-4 font-semibold w-20 ${styles.tableText}`}>Qty</th>
                  <th className={`text-right py-4 px-4 font-semibold w-24 ${styles.tableText}`}>Rate</th>
                  <th className={`text-right py-4 px-4 font-semibold w-24 ${styles.tableText}`}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {lineItems.length > 0 ? lineItems.map((item, index) => (
                  <tr key={index} className={`${styles.tableBorder} border-b last:border-b-0 hover:bg-muted/10`}>
                    <td className={`py-4 px-4 ${styles.tableText}`}>{item.description}</td>
                    <td className={`py-4 px-4 text-center ${styles.tableText}`}>{item.quantity}</td>
                    <td className={`py-4 px-4 text-right ${styles.tableText}`}>
                      <FormattedCurrency amount={item.rate || 0} />
                    </td>
                    <td className={`py-4 px-4 text-right font-medium ${styles.tableText}`}>
                      <FormattedCurrency amount={item.amount || 0} />
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={4} className={`py-8 text-center ${styles.tableText} opacity-60`}>No line items available</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="flex justify-end mb-8">
            <div className="w-64">
              <div className={`p-4 space-y-3 ${styles.totalSection}`}>
                <div className={`flex justify-between ${styles.contentText}`}>
                  <span>Subtotal:</span>
                  <span><FormattedCurrency amount={subtotal} /></span>
                </div>
                {taxAmount > 0 && (
                  <div className={`flex justify-between ${styles.contentText}`}>
                    <span>Tax:</span>
                    <span><FormattedCurrency amount={taxAmount} /></span>
                  </div>
                )}
                {shippingAmount > 0 && (
                  <div className={`flex justify-between ${styles.contentText}`}>
                    <span>Shipping:</span>
                    <span><FormattedCurrency amount={shippingAmount} /></span>
                  </div>
                )}
                <div className={`border-t ${styles.tableBorder} pt-3 flex justify-between font-bold text-lg ${styles.contentText}`}>
                  <span>Total:</span>
                  <span><FormattedCurrency amount={invoice.amount} /></span>
                </div>
              </div>
            </div>
          </div>

          {/* Thank You Message */}
          <div className={`border-t ${styles.tableBorder} pt-6`}>
            <h4 className={`font-semibold mb-2 ${styles.contentText}`}>Thank You Message:</h4>
            <p className={`text-sm ${styles.contentText} opacity-80`}>
              {invoice.notes || 'Thank you for your business!'}
            </p>
          </div>
        </div>
      ) : null}
    </Modal>
  );
};
