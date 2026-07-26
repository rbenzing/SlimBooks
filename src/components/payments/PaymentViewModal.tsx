import React from 'react';
import { X, Calendar, DollarSign, User, CreditCard, Hash, FileText, Clock, Receipt } from 'lucide-react';
import { getStatusColor, themeClasses } from '@/utils/themeUtils.util';
import { formatDateSync } from '@/components/ui/FormattedDate';
import { FormattedCurrency } from '@/components/ui/FormattedCurrency';
import { type PaymentViewModalProps } from '@/types';

export const PaymentViewModal: React.FC<PaymentViewModalProps> = ({ payment, isOpen, onClose }) => {
  if (!isOpen || !payment) return null;

  const getMethodIcon = (method: string) => {
    switch (method) {
      case 'cash':
        return <Receipt className="h-5 w-5 text-green-600 dark:text-green-400" />;
      case 'credit_card':
        return <CreditCard className="h-5 w-5 text-blue-600 dark:text-blue-400" />;
      case 'bank_transfer':
        return <DollarSign className="h-5 w-5 text-purple-600 dark:text-purple-400" />;
      case 'check':
        return <FileText className="h-5 w-5 text-orange-600 dark:text-orange-400" />;
      case 'paypal':
        return <CreditCard className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />;
      default:
        return <CreditCard className="h-5 w-5 text-gray-600 dark:text-gray-400" />;
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className={`${themeClasses.card} rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto`}>
        <div className={`flex justify-between items-center p-6 ${themeClasses.cardHeader}`}>
          <h2 className={`text-2xl font-bold ${themeClasses.cardTitle}`}>Payment Details</h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Basic Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="flex items-center space-x-3">
                <Calendar className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                <div>
                  <p className="text-sm text-muted-foreground">Date</p>
                  <p className="font-medium text-foreground">{formatDateSync(payment.date)}</p>
                </div>
              </div>

              <div className="flex items-center space-x-3">
                <User className="h-5 w-5 text-green-600 dark:text-green-400" />
                <div>
                  <p className="text-sm text-muted-foreground">Client</p>
                  <p className="font-medium text-foreground">{payment.client_name}</p>
                </div>
              </div>

              <div className="flex items-center space-x-3">
                {getMethodIcon(payment.method)}
                <div>
                  <p className="text-sm text-muted-foreground">Payment Method</p>
                  <p className="font-medium text-foreground">{getMethodLabel(payment.method)}</p>
                </div>
              </div>

              {payment.invoice_id && (
                <div className="flex items-center space-x-3">
                  <Receipt className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                  <div>
                    <p className="text-sm text-muted-foreground">Invoice</p>
                    <p className="font-medium text-foreground">Invoice #{payment.invoice_id}</p>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className="flex items-center space-x-3">
                <DollarSign className="h-5 w-5 text-green-600 dark:text-green-400" />
                <div>
                  <p className="text-sm text-muted-foreground">Amount</p>
                  <p className="font-medium text-foreground text-lg">
                    <FormattedCurrency amount={payment.amount} />
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-3">
                <div className="h-5 w-5 flex items-center justify-center">
                  <div className="h-3 w-3 rounded-full bg-blue-600 dark:bg-blue-400"></div>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(payment.status)}`}>
                    {payment.status.charAt(0).toUpperCase() + payment.status.slice(1)}
                  </span>
                </div>
              </div>

              {payment.reference && (
                <div className="flex items-center space-x-3">
                  <Hash className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                  <div>
                    <p className="text-sm text-muted-foreground">Reference</p>
                    <p className="font-medium text-foreground">{payment.reference}</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Description */}
          {payment.description && (
            <div className="border-t border-border pt-6">
              <h3 className="text-lg font-semibold text-foreground mb-3">Description</h3>
              <p className="text-foreground bg-muted/30 p-4 rounded-lg">{payment.description}</p>
            </div>
          )}

          {/* Timestamps */}
          <div className="border-t border-border pt-6">
            <h3 className="text-lg font-semibold text-foreground mb-3">Timeline</h3>
            <div className="space-y-2">
              <div className="flex items-center space-x-3">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <div>
                  <span className="text-sm text-muted-foreground">Created: </span>
                  <span className="text-sm text-foreground">{formatDateSync(payment.created_at)}</span>
                </div>
              </div>
              {payment.updated_at && payment.updated_at !== payment.created_at && (
                <div className="flex items-center space-x-3">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <span className="text-sm text-muted-foreground">Last updated: </span>
                    <span className="text-sm text-foreground">{formatDateSync(payment.updated_at)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className={`flex justify-end p-6 ${themeClasses.cardFooter}`}>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};