
import React, { useState, useEffect } from 'react';
import { Edit, Receipt, Eye, Trash2, Delete, Tag, Building } from 'lucide-react';
import { formatDateSync } from '@/components/ui/FormattedDate';
import { FormattedCurrency } from '@/components/ui/FormattedCurrency';
import { type ExpensesListProps } from '@/types/components/expense.types';

export const ExpensesList: React.FC<ExpensesListProps> = ({ 
  expenses, 
  onEditExpense, 
  onDeleteExpense, 
  onViewExpense,
  onBulkDelete,
  onBulkCategorize,
  onBulkChangeVendor,
  categories = []
}) => {
  const [selectedExpenses, setSelectedExpenses] = useState<number[]>([]);
  const [bulkCategory, setBulkCategory] = useState('');
  const [bulkVendor, setBulkVendor] = useState('');

  // Reset selection when expenses change
  useEffect(() => {
    setSelectedExpenses([]);
  }, [expenses]);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedExpenses(expenses.map(expense => expense.id));
    } else {
      setSelectedExpenses([]);
    }
  };

  const handleSelectExpense = (expenseId: number, checked: boolean) => {
    if (checked) {
      setSelectedExpenses(prev => [...prev, expenseId]);
    } else {
      setSelectedExpenses(prev => prev.filter(id => id !== expenseId));
    }
  };

  const handleDelete = (id: number, vendor?: string) => {
    if (window.confirm(`Are you sure you want to delete the expense from ${vendor || 'Unknown vendor'}?`)) {
      onDeleteExpense(id);
    }
  };

  const handleBulkDelete = () => {
    if (selectedExpenses.length === 0) return;
    
    if (window.confirm(`Are you sure you want to delete ${selectedExpenses.length} selected expense(s)?`)) {
      onBulkDelete?.(selectedExpenses);
      setSelectedExpenses([]);
      }
  };

  const handleBulkCategorize = () => {
    if (selectedExpenses.length === 0 || !bulkCategory) return;
    
    onBulkCategorize?.(selectedExpenses, bulkCategory);
    setSelectedExpenses([]);
    setBulkCategory('');
  };

  const handleBulkChangeVendor = () => {
    if (selectedExpenses.length === 0 || !bulkVendor) return;

    onBulkChangeVendor?.(selectedExpenses, bulkVendor);
    setSelectedExpenses([]);
    setBulkVendor('');
  };

  const isAllSelected = expenses.length > 0 && selectedExpenses.length === expenses.length;
  const isPartialSelected = selectedExpenses.length > 0 && selectedExpenses.length < expenses.length;

  return (
    <div className="bg-card rounded-lg shadow-sm border border-border overflow-hidden">
      {/* Bulk Actions Bar */}
      {selectedExpenses.length > 0 && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border-b border-border p-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
              {selectedExpenses.length} expense(s) selected
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
              
              {/* Bulk Categorize */}
              {onBulkCategorize && (
                <div className="flex items-center gap-2">
                  <select
                    value={bulkCategory}
                    onChange={(e) => setBulkCategory(e.target.value)}
                    className="text-sm border border-border rounded-md px-2 py-1.5 bg-background"
                  >
                    <option value="">Select category...</option>
                    {categories.map(category => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                  <button
                    onClick={handleBulkCategorize}
                    disabled={!bulkCategory}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Tag className="h-4 w-4" />
                    Categorize
                  </button>
                </div>
              )}
              
              {/* Bulk Change Vendor */}
              {onBulkChangeVendor && (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Enter vendor name..."
                    value={bulkVendor}
                    onChange={(e) => setBulkVendor(e.target.value)}
                    className="text-sm border border-border rounded-md px-2 py-1.5 bg-background w-48"
                  />
                  <button
                    onClick={handleBulkChangeVendor}
                    disabled={!bulkVendor.trim()}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Building className="h-4 w-4" />
                    Change Vendor
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
                Vendor
              </th>
              <th className="text-left py-3 px-6 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Category
              </th>
              <th className="text-left py-3 px-6 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Amount
              </th>
              <th className="text-left py-3 px-6 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Type
              </th>
              <th className="text-left py-3 px-6 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Receipt
              </th>
              <th className="text-left py-3 px-6 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {expenses.map((expense) => (
              <tr key={expense.id} className={`hover:bg-muted/50 ${selectedExpenses.includes(expense.id) ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}>
                <td className="py-4 px-6">
                  <input
                    type="checkbox"
                    checked={selectedExpenses.includes(expense.id)}
                    onChange={(e) => handleSelectExpense(expense.id, e.target.checked)}
                    className="rounded border-border"
                  />
                </td>
                <td className="py-4 px-6 text-sm text-foreground">
                  {formatDateSync(expense.date)}
                </td>
                <td className="py-4 px-6">
                  <div>
                    <div className="text-sm font-medium text-foreground">{expense.vendor || 'Unknown'}</div>
                    {expense.description && (
                      <div className="text-sm text-muted-foreground truncate max-w-xs">
                        {expense.description}
                      </div>
                    )}
                  </div>
                </td>
                <td className="py-4 px-6 text-sm text-foreground">
                  {expense.category}
                </td>
                <td className="py-4 px-6 text-sm font-medium text-foreground">
                  <FormattedCurrency amount={expense.amount} />
                </td>
                <td className="py-4 px-6">
                  <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                    {expense.is_billable ? 'Billable' : 'Non-billable'}
                  </span>
                </td>
                <td className="py-4 px-6">
                  {expense.receipt_url ? (
                    <button className="text-blue-600 hover:text-blue-800">
                      <Receipt className="h-4 w-4" />
                    </button>
                  ) : (
                    <span className="text-muted-foreground text-sm">None</span>
                  )}
                </td>
                <td className="py-4 px-6">
                  <div className="flex space-x-2">
                    <button
                      onClick={() => onEditExpense(expense)}
                      className="p-1 text-muted-foreground hover:text-blue-600"
                      title="Edit expense"
                    >
                      <Edit className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => onViewExpense(expense)}
                      className="p-1 text-muted-foreground hover:text-white"
                      title="View details"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(expense.id, expense.vendor)}
                      className="p-1 text-muted-foreground hover:text-red-600"
                      title="Delete expense"
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
