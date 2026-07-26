// Utility functions for payment-related operations
import { toast } from 'sonner';
import { authenticatedFetch } from './api';
import { type Invoice } from '@/types';
import { type PaymentFormData } from '@/types';

/**
 * Create a payment record for an invoice and mark the invoice as paid
 */
export const createPaymentForInvoice = async (
  invoice: Invoice,
  paymentMethod: PaymentFormData['method'] = 'bank_transfer',
  paymentDate: string = new Date().toISOString().split('T')[0]
): Promise<boolean> => {
  try {
    // Create payment record
    const paymentData: PaymentFormData = {
      date: paymentDate,
      client_name: invoice.client_name || 'Unknown Client',
      invoice_id: invoice.id,
      amount: invoice.total_amount,
      method: paymentMethod,
      reference: `AUTO-${invoice.invoice_number}`,
      description: `Payment for ${invoice.invoice_number}`,
      status: 'received'
    };

    // Create payment via API
    const paymentResponse = await authenticatedFetch('/api/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ paymentData })
    });

    const paymentResult = await paymentResponse.json();
    
    if (!paymentResult.success) {
      throw new Error(paymentResult.message || 'Failed to create payment');
    }

    // Update invoice status to paid
    const invoiceResponse = await authenticatedFetch(`/api/invoices/${invoice.id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ status: 'paid' })
    });

    const invoiceResult = await invoiceResponse.json();
    
    if (!invoiceResult.success) {
      // If invoice update fails, we should ideally rollback the payment
      // For now, just log the error and show a warning
      console.warn('Payment created but failed to update invoice status:', invoiceResult.message);
      toast.warning('Payment created but invoice status update failed');
      return false;
    }

    toast.success(`Payment recorded for ${invoice.invoice_number}`);
    return true;
  } catch (error) {
    console.error('Error creating payment for invoice:', error);
    toast.error('Failed to record payment');
    return false;
  }
};