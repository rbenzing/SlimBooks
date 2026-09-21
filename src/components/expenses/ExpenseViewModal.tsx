import React from 'react';
import { Calendar, DollarSign, FileText, Tag, Receipt, Clock } from 'lucide-react';
import Modal from '@/components/ui/modal.cpt';
import { getStatusColor } from '@/utils/themeUtils.util';
import { formatDateSync } from '@/components/ui/FormattedDate';
import { FormattedCurrency } from '@/components/ui/FormattedCurrency';
import { type ExpenseViewModalProps } from '@/types/components/expense.types';

export const ExpenseViewModal: React.FC<ExpenseViewModalProps> = ({ expense, isOpen, onClose }) => {
  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title="Expense Details"
      size="2xl"
      footer={
        <button
          onClick={onClose}
          className="px-4 py-2 bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground rounded-lg transition-colors"
        >
          Close
        </button>
      }
    >
      {expense && (
        <div className="space-y-6">
          {/* Basic Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="flex items-center space-x-3">
                <Calendar className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                <div>
                  <p className="text-sm text-muted-foreground">Date</p>
                  <p className="font-medium text-foreground">{formatDateSync(expense.date)}</p>
                </div>
              </div>

              <div className="flex items-center space-x-3">
                <FileText className="h-5 w-5 text-green-600 dark:text-green-400" />
                <div>
                  <p className="text-sm text-muted-foreground">Vendor</p>
                  <p className="font-medium text-foreground">{expense.vendor || 'N/A'}</p>
                </div>
              </div>

              <div className="flex items-center space-x-3">
                <Tag className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                <div>
                  <p className="text-sm text-muted-foreground">Category</p>
                  <p className="font-medium text-foreground">{expense.category}</p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center space-x-3">
                <DollarSign className="h-5 w-5 text-green-600 dark:text-green-400" />
                <div>
                  <p className="text-sm text-muted-foreground">Amount</p>
                  <p className="font-medium text-foreground text-lg">
                    <FormattedCurrency amount={expense.amount} />
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-3">
                <div className="h-5 w-5 flex items-center justify-center">
                  <div className="h-3 w-3 rounded-full bg-blue-600 dark:bg-blue-400"></div>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <span className={getStatusColor(expense.status || 'pending')}>
                    {expense.status ? expense.status.charAt(0).toUpperCase() + expense.status.slice(1) : 'Pending'}
                  </span>
                </div>
              </div>

              <div className="flex items-center space-x-3">
                <Receipt className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                <div>
                  <p className="text-sm text-muted-foreground">Receipt</p>
                  {expense.receipt_url ? (
                    <a
                      href={expense.receipt_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-medium"
                    >
                      View Receipt
                    </a>
                  ) : (
                    <p className="text-muted-foreground">No receipt attached</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Description */}
          {expense.description && (
            <div className="border-t border-border pt-6">
              <h3 className="text-lg font-semibold text-foreground mb-3">Description</h3>
              <p className="text-foreground bg-muted/30 p-4 rounded-lg">{expense.description}</p>
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
                  <span className="text-sm text-foreground">{formatDateSync(expense.created_at)}</span>
                </div>
              </div>
              {expense.updated_at && expense.updated_at !== expense.created_at && (
                <div className="flex items-center space-x-3">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <span className="text-sm text-muted-foreground">Last updated: </span>
                    <span className="text-sm text-foreground">{formatDateSync(expense.updated_at)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
};
