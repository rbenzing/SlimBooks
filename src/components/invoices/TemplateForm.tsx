
import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { authenticatedFetch } from '@/utils/api';
import { themeClasses, getButtonClasses } from '@/utils/themeUtils.util';
import type { InvoiceTemplate, InvoiceTemplateFormData, Client } from '@/types';

interface TemplateFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (templateData: InvoiceTemplateFormData) => void;
  template?: InvoiceTemplate | null;
}

export const TemplateForm: React.FC<TemplateFormProps> = ({ isOpen, onClose, onSave, template }) => {
  const [clients, setClients] = useState<Client[]>([]);
  const [formData, setFormData] = useState({
    name: '',
    client_id: '',
    frequency: 'monthly',
    amount: '',
    description: '',
    payment_terms: 'net_30',
    next_invoice_date: ''
  });

  useEffect(() => {
    const loadClients = async () => {
      if (isOpen) {
        try {
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
    if (template) {
      setFormData({
        name: template.name || '',
        client_id: template.client_id?.toString() || '',
        frequency: template.frequency || 'monthly',
        amount: template.amount?.toString() || '',
        description: template.description || '',
        payment_terms: template.payment_terms || 'net_30',
        next_invoice_date: template.next_invoice_date || ''
      });
    } else {
      setFormData({
        name: '',
        client_id: '',
        frequency: 'monthly',
        amount: '',
        description: '',
        payment_terms: 'net_30',
        next_invoice_date: ''
      });
    }
  }, [template]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      ...formData,
      frequency: formData.frequency as InvoiceTemplateFormData['frequency'],
      client_id: parseInt(formData.client_id),
      amount: parseFloat(formData.amount) || 0,
      // This form captures the recurrence only; line items, tax and shipping
      // are set when each invoice is generated from the template.
      is_active: true,
      items: [],
      tax_amount: 0,
      shipping_amount: 0
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className={`${themeClasses.card} w-full max-w-2xl`}>
        <div className="flex justify-between items-center mb-6">
          <h2 className={themeClasses.cardTitle}>{template ? 'Edit Template' : 'Create Recurring Template'}</h2>
          <button onClick={onClose} className={`${themeClasses.mutedText} hover:text-foreground`}>
            <X className="h-6 w-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={`block text-sm font-medium ${themeClasses.bodyText} mb-1`}>Template Name *</label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className={themeClasses.input}
                placeholder="Monthly Retainer"
              />
            </div>
            <div>
              <label className={`block text-sm font-medium ${themeClasses.bodyText} mb-1`}>Client *</label>
              <select
                required
                value={formData.client_id}
                onChange={(e) => setFormData({ ...formData, client_id: e.target.value })}
                className={themeClasses.select}
              >
                <option value="">Select a client</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name} - {client.company}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={`block text-sm font-medium ${themeClasses.bodyText} mb-1`}>Frequency *</label>
              <select
                value={formData.frequency}
                onChange={(e) => setFormData({ ...formData, frequency: e.target.value })}
                className={themeClasses.select}
              >
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>
            <div>
              <label className={`block text-sm font-medium ${themeClasses.bodyText} mb-1`}>Payment Terms *</label>
              <select
                value={formData.payment_terms}
                onChange={(e) => setFormData({ ...formData, payment_terms: e.target.value })}
                className={themeClasses.select}
              >
                <option value="due_on_receipt">Due on Receipt</option>
                <option value="net_15">Net 15</option>
                <option value="net_30">Net 30</option>
                <option value="net_60">Net 60</option>
                <option value="net_90">Net 90</option>
              </select>
            </div>
            <div>
              <label className={`block text-sm font-medium ${themeClasses.bodyText} mb-1`}>Amount *</label>
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

          <div>
            <label className={`block text-sm font-medium ${themeClasses.bodyText} mb-1`}>Next Invoice Date *</label>
            <input
              type="date"
              required
              value={formData.next_invoice_date}
              onChange={(e) => setFormData({ ...formData, next_invoice_date: e.target.value })}
              className={themeClasses.dateInput}
            />
          </div>

          <div>
            <label className={`block text-sm font-medium ${themeClasses.bodyText} mb-1`}>Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className={themeClasses.textarea}
              rows={3}
              placeholder="Template description..."
            />
          </div>

          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className={getButtonClasses('outline')}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={getButtonClasses('primary')}
            >
              {template ? 'Update Template' : 'Create Template'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
