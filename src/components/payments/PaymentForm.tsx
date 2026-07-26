import React, { useState, useEffect } from 'react';
import { ArrowLeft, Search, X } from 'lucide-react';
import { useFormNavigation } from '@/hooks/useFormNavigation';
import { themeClasses, getButtonClasses } from '@/utils/themeUtils.util';
import { authenticatedFetch } from '@/utils/api';
import { type Payment, type PaymentFormProps } from '@/types';
import { type Invoice } from '@/types';

export const PaymentForm: React.FC<PaymentFormProps> = ({ 
  payment, 
  onSave, 
  onCancel, 
  preselectedInvoiceId,
  preselectedClientName,
  preselectedAmount
}) => {
  const [formData, setFormData] = useState({
    date: payment?.date || new Date().toISOString().split('T')[0],
    client_name: payment?.client_name || preselectedClientName || '',
    invoice_id: payment?.invoice_id?.toString() || preselectedInvoiceId?.toString() || '',
    amount: payment?.amount?.toString() || preselectedAmount?.toString() || '',
    method: payment?.method || 'bank_transfer' as const,
    reference: payment?.reference || '',
    description: payment?.description || '',
    status: payment?.status || 'received' as const
  });

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [showInvoiceSearch, setShowInvoiceSearch] = useState(false);
  const [invoiceSearchTerm, setInvoiceSearchTerm] = useState('');
  const [originalFormData, setOriginalFormData] = useState<typeof formData | null>(null);
  const [loadingInvoices, setLoadingInvoices] = useState(false);

  // Track if form has been modified
  const isDirty = originalFormData ? JSON.stringify(formData) !== JSON.stringify(originalFormData) : false;
  
  const { confirmNavigation, NavigationGuard } = useFormNavigation({
    isDirty,
    isEnabled: true,
    entityType: 'payment',
    onCancel
  });

  const handleCancel = () => {
    if (!isDirty) {
      onCancel();
      return;
    }

    // Show confirmation dialog if form is dirty
    confirmNavigation('cancel');
  };

  useEffect(() => {
    const initialData = {
      date: payment?.date || new Date().toISOString().split('T')[0],
      client_name: payment?.client_name || preselectedClientName || '',
      invoice_id: payment?.invoice_id?.toString() || preselectedInvoiceId?.toString() || '',
      amount: payment?.amount?.toString() || preselectedAmount?.toString() || '',
      method: payment?.method || 'bank_transfer' as const,
      reference: payment?.reference || '',
      description: payment?.description || '',
      status: payment?.status || 'received' as const
    };
    setOriginalFormData(initialData);
  }, [payment, preselectedInvoiceId, preselectedClientName, preselectedAmount]);

  const loadInvoices = async (searchTerm = '') => {
    try {
      setLoadingInvoices(true);
      const params = new URLSearchParams();
      if (searchTerm) {
        params.set('search', searchTerm);
      }
      params.set('limit', '50');

      const response = await authenticatedFetch(`/api/invoices?${params}`);
      const data = await response.json();
      
      if (data.success) {
        setInvoices(data.data.invoices || []);
      }
    } catch (error) {
      console.error('Error loading invoices:', error);
    } finally {
      setLoadingInvoices(false);
    }
  };

  useEffect(() => {
    if (showInvoiceSearch) {
      loadInvoices();
    }
  }, [showInvoiceSearch]);

  useEffect(() => {
    if (showInvoiceSearch && invoiceSearchTerm) {
      const timeoutId = setTimeout(() => {
        loadInvoices(invoiceSearchTerm);
      }, 300);
      return () => clearTimeout(timeoutId);
    }
  }, [invoiceSearchTerm, showInvoiceSearch]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const paymentData = {
      date: formData.date,
      client_name: formData.client_name,
      invoice_id: formData.invoice_id ? parseInt(formData.invoice_id) : undefined,
      amount: parseFloat(formData.amount),
      method: formData.method,
      reference: formData.reference || undefined,
      description: formData.description || undefined,
      status: formData.status
    };
    
    onSave(paymentData);
  };

  const selectInvoice = (invoice: Invoice) => {
    setFormData({
      ...formData,
      invoice_id: invoice.id.toString(),
      client_name: invoice.client_name || formData.client_name,
      amount: invoice.total_amount.toString(),
      description: `Payment for ${invoice.invoice_number}`
    });
    setShowInvoiceSearch(false);
    setInvoiceSearchTerm('');
  };

  const clearInvoice = () => {
    setFormData({
      ...formData,
      invoice_id: ''
    });
  };

  const getSelectedInvoice = () => {
    if (!formData.invoice_id) return null;
    return invoices.find(inv => inv.id.toString() === formData.invoice_id);
  };

  const filteredInvoices = invoices.filter(invoice =>
    invoice.invoice_number.toLowerCase().includes(invoiceSearchTerm.toLowerCase()) ||
    (invoice.client_name && invoice.client_name.toLowerCase().includes(invoiceSearchTerm.toLowerCase()))
  );

  return (
    <div className={themeClasses.page}>
      <div className={themeClasses.pageContainer}>
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <div className={themeClasses.sectionHeader}>
            <button
              onClick={handleCancel}
              className="flex items-center text-muted-foreground hover:text-foreground mr-4"
            >
              <ArrowLeft className="h-5 w-5 mr-1" />
              Back
            </button>
            <h1 className={themeClasses.sectionTitle}>
              {payment ? 'Edit Payment' : 'Add New Payment'}
            </h1>
          </div>

          {/* Form */}
          <div className={themeClasses.card}>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className={themeClasses.label}>
                    Date *
                  </label>
                  <input
                    type="date"
                    required
                    className={themeClasses.dateInput}
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  />
                </div>

                <div>
                  <label className={themeClasses.label}>
                    Amount *
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground">$</span>
                    <input
                      type="number"
                      step="0.01"
                      required
                      className={`${themeClasses.input} pl-8`}
                      value={formData.amount}
                      onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                      placeholder="0.00"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className={themeClasses.label}>
                  Client Name *
                </label>
                <input
                  type="text"
                  required
                  className={themeClasses.input}
                  value={formData.client_name}
                  onChange={(e) => setFormData({ ...formData, client_name: e.target.value })}
                  placeholder="e.g., John Smith, Acme Corp"
                />
              </div>

              <div>
                <label className={themeClasses.label}>
                  Payment Method *
                </label>
                <select
                  required
                  className={themeClasses.select}
                  value={formData.method}
                  onChange={(e) => setFormData({ ...formData, method: e.target.value as Payment['method'] })}
                >
                  <option value="cash">Cash</option>
                  <option value="check">Check</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="credit_card">Credit Card</option>
                  <option value="paypal">PayPal</option>
                  <option value="other">Other</option>
                </select>
              </div>

              {/* Invoice Selection */}
              <div>
                <label className={themeClasses.label}>
                  Invoice (Optional)
                </label>
                {!formData.invoice_id ? (
                  <button
                    type="button"
                    onClick={() => setShowInvoiceSearch(true)}
                    className={`${themeClasses.input} text-left text-muted-foreground hover:text-foreground`}
                  >
                    <Search className="inline h-4 w-4 mr-2" />
                    Link to an invoice (optional)
                  </button>
                ) : (
                  <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border border-border">
                    <div className="flex items-center">
                      <span className="text-sm text-foreground">
                        {getSelectedInvoice()?.invoice_number || `Invoice #${formData.invoice_id}`}
                        {getSelectedInvoice()?.client_name && (
                          <span className="text-muted-foreground ml-2">
                            - {getSelectedInvoice()?.client_name}
                          </span>
                        )}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={clearInvoice}
                      className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>

              {/* Invoice Search Modal */}
              {showInvoiceSearch && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                  <div className="bg-card rounded-lg shadow-lg max-w-2xl w-full max-h-[80vh] overflow-hidden">
                    <div className="flex items-center justify-between p-4 border-b border-border">
                      <h3 className="text-lg font-semibold text-foreground">Select Invoice</h3>
                      <button
                        onClick={() => setShowInvoiceSearch(false)}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </div>
                    
                    <div className="p-4 border-b border-border">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <input
                          type="text"
                          placeholder="Search invoices..."
                          className={`${themeClasses.input} pl-10`}
                          value={invoiceSearchTerm}
                          onChange={(e) => setInvoiceSearchTerm(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="max-h-96 overflow-y-auto">
                      {loadingInvoices ? (
                        <div className="p-8 text-center text-muted-foreground">Loading...</div>
                      ) : filteredInvoices.length === 0 ? (
                        <div className="p-8 text-center text-muted-foreground">
                          {invoiceSearchTerm ? 'No invoices match your search' : 'No invoices found'}
                        </div>
                      ) : (
                        filteredInvoices.map((invoice) => (
                          <button
                            key={invoice.id}
                            type="button"
                            onClick={() => selectInvoice(invoice)}
                            className="w-full p-4 text-left hover:bg-muted/50 border-b border-border last:border-b-0"
                          >
                            <div className="flex justify-between items-start">
                              <div>
                                <div className="font-medium text-foreground">
                                  {invoice.invoice_number}
                                </div>
                                {invoice.client_name && (
                                  <div className="text-sm text-muted-foreground">
                                    {invoice.client_name}
                                  </div>
                                )}
                              </div>
                              <div className="text-right">
                                <div className="font-medium text-foreground">
                                  ${invoice.total_amount.toFixed(2)}
                                </div>
                                <div className="text-sm text-muted-foreground capitalize">
                                  {invoice.status}
                                </div>
                              </div>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className={themeClasses.label}>
                  Reference Number
                </label>
                <input
                  type="text"
                  className={themeClasses.input}
                  value={formData.reference}
                  onChange={(e) => setFormData({ ...formData, reference: e.target.value })}
                  placeholder="e.g., Check #1234, Transaction ID"
                />
              </div>

              <div>
                <label className={themeClasses.label}>
                  Status
                </label>
                <select
                  className={themeClasses.select}
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as Payment['status'] })}
                >
                  <option value="received">Received</option>
                  <option value="pending">Pending</option>
                  <option value="failed">Failed</option>
                  <option value="refunded">Refunded</option>
                </select>
              </div>

              <div>
                <label className={themeClasses.label}>
                  Description
                </label>
                <textarea
                  rows={3}
                  className={themeClasses.textarea}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Brief description or notes about the payment"
                />
              </div>

              {/* Form Actions */}
              <div className="flex justify-end space-x-4 pt-4">
                <button
                  type="button"
                  onClick={handleCancel}
                  className={getButtonClasses('secondary')}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={getButtonClasses('primary')}
                >
                  {payment ? 'Update Payment' : 'Save Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      <NavigationGuard />
    </div>
  );
};