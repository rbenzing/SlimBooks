
import React, { useState, useEffect } from 'react';
import { ArrowLeft, Upload, X, Receipt } from 'lucide-react';
import { useFormNavigation } from '@/hooks/useFormNavigation';
import { themeClasses, getButtonClasses } from '@/utils/themeUtils.util';
import { EXPENSE_CATEGORIES, EXPENSE_STATUSES, type ExpenseStatus, type ExpenseFormProps } from '@/types';

export const ExpenseForm: React.FC<ExpenseFormProps> = ({ expense, onSave, onCancel }) => {
  const [formData, setFormData] = useState({
    date: expense?.date || new Date().toISOString().split('T')[0],
    vendor: expense?.vendor || '',
    category: expense?.category || 'Office Supplies',
    amount: expense?.amount?.toString() || '',
    description: expense?.description || '',
    receipt_url: expense?.receipt_url || '',
    status: expense?.status || 'pending' as const
  });

  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [originalFormData, setOriginalFormData] = useState<typeof formData | null>(null);

  // Track if form has been modified
  const isDirty = originalFormData ? JSON.stringify(formData) !== JSON.stringify(originalFormData) : false;
  
  const { confirmNavigation, NavigationGuard } = useFormNavigation({
    isDirty,
    isEnabled: true,
    entityType: 'expense',
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
      date: expense?.date || new Date().toISOString().split('T')[0],
      vendor: expense?.vendor || '',
      category: expense?.category || 'Office Supplies',
      amount: expense?.amount?.toString() || '',
      description: expense?.description || '',
      receipt_url: expense?.receipt_url || '',
      status: expense?.status || 'pending' as const
    };
    setOriginalFormData(initialData);
  }, [expense]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const expenseData = {
      date: formData.date,
      vendor: formData.vendor,
      category: formData.category,
      amount: parseFloat(formData.amount),
      description: formData.description,
      receipt_url: formData.receipt_url,
      status: formData.status
    };
    
    onSave(expenseData);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setReceiptFile(file);
      // In a real app, you'd upload this file and get a URL
      setFormData({ ...formData, receipt_url: `receipt_${Date.now()}.${file.name.split('.').pop()}` });
    }
  };

  const removeReceipt = () => {
    setReceiptFile(null);
    setFormData({ ...formData, receipt_url: '' });
  };

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
              {expense ? 'Edit Expense' : 'Add New Expense'}
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
                Merchant/Vendor *
              </label>
              <input
                type="text"
                required
                className={themeClasses.input}
                value={formData.vendor}
                onChange={(e) => setFormData({ ...formData, vendor: e.target.value })}
                placeholder="e.g., Office Depot, Starbucks"
              />
            </div>

            <div>
              <label className={themeClasses.label}>
                Category *
              </label>
              <select
                required
                className={themeClasses.select}
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              >
                {EXPENSE_CATEGORIES.map(category => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </div>

            <div>
              <label className={themeClasses.label}>
                Status
              </label>
              <select
                className={themeClasses.select}
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as ExpenseStatus })}
              >
                {EXPENSE_STATUSES.map(status => (
                  <option key={status} value={status}>
                    {status.charAt(0).toUpperCase() + status.slice(1)}
                  </option>
                ))}
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
                placeholder="Brief description of the expense"
              />
            </div>

            {/* Receipt Upload */}
            <div>
              <label className={themeClasses.label}>
                Receipt
              </label>
              {!receiptFile && !formData.receipt_url ? (
                <div className="border-2 border-dashed border-border rounded-lg p-6 text-center bg-muted/30">
                  <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground mb-2">Upload receipt image</p>
                  <label className={`cursor-pointer ${getButtonClasses('primary')}`}>
                    Choose File
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>
                </div>
              ) : (
                <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border border-border">
                  <div className="flex items-center">
                    <Receipt className="h-5 w-5 text-muted-foreground mr-2" />
                    <span className="text-sm text-foreground">
                      {receiptFile?.name || 'Receipt uploaded'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={removeReceipt}
                    className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}
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
                {expense ? 'Update Expense' : 'Save Expense'}
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
