import React, { useState, useEffect } from 'react';
import { Edit, CreditCard, Eye, Trash2, Delete, Receipt, Building } from 'lucide-react';
import { getStatusColor } from '@/utils/themeUtils.util';
import { formatDateSync } from '@/components/ui/FormattedDate';
import { FormattedCurrency } from '@/components/ui/FormattedCurrency';
import { type PaymentsListProps } from '@/types';

export const PaymentsList: React.FC<PaymentsListProps> = ({ 
  payments, 
  onEditPayment, 
  onDeletePayment, 
  onViewPayment,
  onBulkDelete,
  onBulkChangeStatus,
  onBulkChangeMethod
}) => {
  const [selectedPayments, setSelectedPayments] = useState<number[]>([]);
  const [bulkStatus, setBulkStatus] = useState('');
  const [bulkMethod, setBulkMethod] = useState('');

  // Reset selection when payments change
  useEffect(() => {
    setSelectedPayments([]);
  }, [payments]);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedPayments(payments.map(payment => payment.id));
    } else {
      setSelectedPayments([]);
    }
  };

  const handleSelectPayment = (paymentId: number, checked: boolean) => {
    if (checked) {
      setSelectedPayments(prev => [...prev, paymentId]);
    } else {
      setSelectedPayments(prev => prev.filter(id => id !== paymentId));
    }
  };

  const handleDelete = (id: number, clientName: string) => {
    if (window.confirm(`Are you sure you want to delete the payment from ${clientName}?`)) {
      onDeletePayment(id);
    }
  };

  const handleBulkDelete = () => {
    if (selectedPayments.length === 0) return;
    
    if (window.confirm(`Are you sure you want to delete ${selectedPayments.length} selected payment(s)?`)) {
      onBulkDelete?.(selectedPayments);
      setSelectedPayments([]);
    }
  };

  const handleBulkChangeStatus = () => {
    if (selectedPayments.length === 0 || !bulkStatus) return;
    
    onBulkChangeStatus?.(selectedPayments, bulkStatus);
    setSelectedPayments([]);
    setBulkStatus('');
  };

  const handleBulkChangeMethod = () => {
    if (selectedPayments.length === 0 || !bulkMethod) return;
    
    onBulkChangeMethod?.(selectedPayments, bulkMethod);
    setSelectedPayments([]);
    setBulkMethod('');
  };

  const getMethodIcon = (method: string) => {
    switch (method) {
      case 'cash':
        return <Receipt className="h-4 w-4" />;
      case 'credit_card':
        return <CreditCard className="h-4 w-4" />;
      case 'bank_transfer':
        return <Building className="h-4 w-4" />;
      default:
        return <CreditCard className="h-4 w-4" />;
    }
  };

  const getMethodLabel = (method: string) => {
    switch (method) {
      case 'cash':
        return 'Cash';
      case 'check':
        return 'Check';
      case 'bank_transfer':
        return 'Bank Transfer';
      case 'credit_card':
        return 'Credit Card';
      case 'paypal':
        return 'PayPal';
      default:
        return 'Other';
    }
  };

  const isAllSelected = payments.length > 0 && selectedPayments.length === payments.length;
  const isPartialSelected = selectedPayments.length > 0 && selectedPayments.length < payments.length;

  return (
    <div className="bg-card rounded-lg shadow-sm border border-border overflow-hidden">
      {/* Bulk Actions Bar */}
      {selectedPayments.length > 0 && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border-b border-border p-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
              {selectedPayments.length} payment(s) selected
            </span>
            <div className="flex items-center gap-2 flex-wrap">
              {/* Bulk Delete */}
              {onBulkDelete && (
                <button
                  onClick={handleBulkDelete}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
                >
                  <Delete className="h-4 w-4" />
                  Delete
                </button>
              )}
              
              {/* Bulk Change Status */}
              {onBulkChangeStatus && (
                <div className="flex items-center gap-2">
                  <select
                    value={bulkStatus}
                    onChange={(e) => setBulkStatus(e.target.value)}
                    className="text-sm border border-border rounded-md px-2 py-1.5 bg-background"
                  >
                    <option value="">Select status...</option>
                    <option value="received">Received</option>
                    <option value="pending">Pending</option>
                    <option value="failed">Failed</option>
                    <option value="refunded">Refunded</option>
                  </select>
                  <button
                    onClick={handleBulkChangeStatus}
                    disabled={!bulkStatus}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Receipt className="h-4 w-4" />
                    Update Status
                  </button>
                </div>
              )}
              
              {/* Bulk Change Method */}
              {onBulkChangeMethod && (
                <div className="flex items-center gap-2">
                  <select
                    value={bulkMethod}
                    onChange={(e) => setBulkMethod(e.target.value)}
                    className="text-sm border border-border rounded-md px-2 py-1.5 bg-background"
                  >
                    <option value="">Select method...</option>
                    <option value="cash">Cash</option>
                    <option value="check">Check</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="credit_card">Credit Card</option>
                    <option value="paypal">PayPal</option>
                    <option value="other">Other</option>
                  </select>
                  <button
                    onClick={handleBulkChangeMethod}
                    disabled={!bulkMethod}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <CreditCard className="h-4 w-4" />
                    Update Method
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-muted/50 border-b border-border">
            <tr>
              <th className="text-left py-3 px-6 w-8">
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  ref={input => {
                    if (input) input.indeterminate = isPartialSelected;
                  }}
                  onChange={(e) => handleSelectAll(e.target.checked)}
                  className="rounded border-border"
                />
              </th>
              <th className="text-left py-3 px-6 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Date
              </th>
              <th className="text-left py-3 px-6 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Client
              </th>
              <th className="text-left py-3 px-6 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Amount
              </th>
              <th className="text-left py-3 px-6 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Method
              </th>
              <th className="text-left py-3 px-6 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Reference
              </th>
              <th className="text-left py-3 px-6 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Status
              </th>
              <th className="text-left py-3 px-6 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {payments.map((payment) => (
              <tr key={payment.id} className={`hover:bg-muted/50 ${selectedPayments.includes(payment.id) ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}>
                <td className="py-4 px-6">
                  <input
                    type="checkbox"
                    checked={selectedPayments.includes(payment.id)}
                    onChange={(e) => handleSelectPayment(payment.id, e.target.checked)}
                    className="rounded border-border"
                  />
                </td>
                <td className="py-4 px-6 text-sm text-foreground">
                  {formatDateSync(payment.date)}
                </td>
                <td className="py-4 px-6">
                  <div>
                    <div className="text-sm font-medium text-foreground">{payment.client_name}</div>
                    {payment.description && (
                      <div className="text-sm text-muted-foreground truncate max-w-xs">
                        {payment.description}
                      </div>
                    )}
                    {payment.invoice_id && (
                      <div className="text-xs text-muted-foreground">
                        Invoice #{payment.invoice_id}
                      </div>
                    )}
                  </div>
                </td>
                <td className="py-4 px-6 text-sm font-medium text-foreground">
                  <FormattedCurrency amount={payment.amount} />
                </td>
                <td className="py-4 px-6">
                  <div className="flex items-center gap-2 text-sm text-foreground">
                    {getMethodIcon(payment.method)}
                    {getMethodLabel(payment.method)}
                  </div>
                </td>
                <td className="py-4 px-6 text-sm text-foreground">
                  {payment.reference || (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="py-4 px-6">
                  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(payment.status)}`}>
                    {payment.status ? payment.status.charAt(0).toUpperCase() + payment.status.slice(1) : 'Draft'}
                  </span>
                </td>
                <td className="py-4 px-6">
                  <div className="flex space-x-2">
                    <button
                      onClick={() => onEditPayment(payment)}
                      className="p-1 text-muted-foreground hover:text-blue-600"
                      title="Edit payment"
                    >
                      <Edit className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => onViewPayment(payment)}
                      className="p-1 text-muted-foreground hover:text-white"
                      title="View details"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(payment.id, payment.client_name)}
                      className="p-1 text-muted-foreground hover:text-red-600"
                      title="Delete payment"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};