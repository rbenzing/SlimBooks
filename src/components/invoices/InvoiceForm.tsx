
import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { authenticatedFetch } from '@/utils/api';
import { themeClasses } from '@/utils/themeUtils.util';
import { formatClientAddressSingleLine } from '@/utils/formatting';
import type { Invoice, InvoiceFormData, InvoiceStatus, InvoiceType, Client } from '@/types';

interface InvoiceFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (invoiceData: InvoiceFormData) => void;
  invoice?: Invoice | null;
}

export const InvoiceForm: React.FC<InvoiceFormProps> = ({ isOpen, onClose, onSave, invoice }) => {
  const [clients, setClients] = useState<Client[]>([]);
  const [formData, setFormData] = useState({
    client_id: '',
    amount: '',
    status: 'draft',
    due_date: '',
    issue_date: '',
    description: '',
    type: 'one-time'
  });

  useEffect(() => {
    const loadClients = async () => {
      if (isOpen) {
        try {
          // Load clients
          const response = await authenticatedFetch('/api/clients');
          const clientsData = await response.json();
          const allClients = clientsData.data;
          setClients(allClients);
        } catch (error) {
          console.error('Error loading clients:', error);
        }
      }
    };

    loadClients();
  }, [isOpen]);

  useEffect(() => {
    if (invoice) {
      setFormData({
        client_id: invoice.client_id?.toString() || '',
        amount: invoice.amount?.toString() || '',
        status: invoice.status || 'draft',
        due_date: invoice.due_date || '',
        issue_date: invoice.issue_date || '',
        description: invoice.description || '',
        type: invoice.type || 'one-time'
      });
    } else {
      setFormData({
        client_id: '',
        amount: '',
        status: 'draft',
        due_date: '',
        issue_date: '',
        description: '',
        type: 'one-time'
      });
    }
  }, [invoice]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const selectedClient = clients.find(c => c.id === parseInt(formData.client_id));
    
    // Ensure dates are in ISO format, default to current date if not provided
    const currentDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    const issueDate = formData.issue_date || currentDate;
    const dueDate = formData.due_date || currentDate;
    
    const amount = parseFloat(formData.amount) || 0;

    onSave({
      ...formData,
      status: formData.status as InvoiceStatus,
      type: formData.type as InvoiceType,
      client_id: parseInt(formData.client_id),
      amount,
      // This form has no tax or shipping fields, so the total is the amount.
      tax_amount: 0,
      shipping_amount: 0,
      total_amount: amount,
      issue_date: issueDate,
      due_date: dueDate,
      client_name: selectedClient?.name,
      client_email: selectedClient?.email,
      client_phone: selectedClient?.phone,
      client_address: selectedClient ? formatClientAddressSingleLine(selectedClient) : undefined,
      line_items: JSON.stringify([{
        id: '1',
        description: formData.description,
        quantity: 1,
        rate: parseFloat(formData.amount),
        amount: parseFloat(formData.amount)
      }])
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-card rounded-lg p-6 w-full max-w-2xl border border-border">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-card-foreground">{invoice ? 'Edit Invoice' : 'Create New Invoice'}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-6 w-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={themeClasses.label}>Client *</label>
              <select
                required
                value={formData.client_id}
                onChange={(e) => setFormData({ ...formData, client_id: e.target.value })}
                className={`w-full ${themeClasses.select}`}
              >
                <option value="">Select a client</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name} - {client.company}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={themeClasses.label}>Amount *</label>
              <input
                type="number"
                step="0.01"
                required
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                className={themeClasses.input}
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className={themeClasses.label}>Status</label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                className={`w-full ${themeClasses.select}`}
              >
                <option value="draft">Draft</option>
                <option value="sent">Sent</option>
                <option value="paid">Paid</option>
                <option value="overdue">Overdue</option>
              </select>
            </div>
            <div>
              <label className={themeClasses.label}>Issue Date *</label>
              <input
                type="date"
                required
                value={formData.issue_date}
                onChange={(e) => setFormData({ ...formData, issue_date: e.target.value })}
                className={themeClasses.dateInput}
              />
            </div>
            <div>
              <label className={themeClasses.label}>Due Date *</label>
              <input
                type="date"
                required
                value={formData.due_date}
                onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                className={themeClasses.dateInput}
              />
            </div>
          </div>

          <div>
            <label className={themeClasses.label}>Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className={themeClasses.textarea}
              rows={3}
              placeholder="Invoice description..."
            />
          </div>

          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className={themeClasses.buttonOutline}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={themeClasses.button}
            >
              {invoice ? 'Update Invoice' : 'Create Invoice'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
