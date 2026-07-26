
import { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Calendar, DollarSign, Search, LayoutGrid, Table, FileText, TrendingUp, Repeat } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { authenticatedFetch } from '@/utils/api';
import { TemplateForm } from './TemplateForm';
import { formatDateSync } from '@/components/ui/FormattedDate';
import { themeClasses, getButtonClasses, getIconColorClasses } from '@/utils/themeUtils.util';
import { FormattedCurrency } from '@/components/ui/FormattedCurrency';
import type { InvoiceTemplateFormData, RecurringTemplateWithClient } from '@/types';

export const TemplatesTab = () => {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<RecurringTemplateWithClient[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<RecurringTemplateWithClient | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [frequencyFilter, setFrequencyFilter] = useState('all');
  const [clientFilter, setClientFilter] = useState('all');
  const [viewMode, setViewMode] = useState<'panel' | 'table'>('panel');

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      const response = await authenticatedFetch('/api/recurring-templates/active');
      if (response.ok) {
        const data = await response.json();
        setTemplates(data.data || []);
      } else {
        console.error('Failed to load templates');
        setTemplates([]);
      }
    } catch (error) {
      console.error('Error loading templates:', error);
      setTemplates([]);
    }
  };

  const filteredTemplates = templates.filter(template => {
    const matchesSearch = template.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         template.client_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (template.description || '').toLowerCase().includes(searchTerm.toLowerCase());
    // Since API returns only active templates, all templates match status filter
    const matchesStatus = statusFilter === 'all' || statusFilter === 'active';
    const matchesFrequency = frequencyFilter === 'all' || template.frequency === frequencyFilter;
    const matchesClient = clientFilter === 'all' || template.client_name === clientFilter;

    return matchesSearch && matchesStatus && matchesFrequency && matchesClient;
  });

  // Get unique values for filters
  const uniqueClients = [...new Set(templates.map(template => template.client_name))];
  const uniqueFrequencies = [...new Set(templates.map(template => template.frequency))];

  // Calculate statistics
  // Note: API call to /active endpoint already filters to only active templates (is_active: true)
  const activeTemplates = templates.length; // All returned templates are active

  // Calculate Total MRR (Monthly Recurring Revenue)
  const totalMRR = templates.reduce((sum, template) => {
    const amount = template.amount || 0;
    switch (template.frequency) {
      case 'weekly':
        return sum + (amount * 4.33); // ~4.33 weeks per month
      case 'monthly':
        return sum + amount;
      case 'quarterly':
        return sum + (amount / 3);
      case 'yearly':
        return sum + (amount / 12);
      default:
        return sum + amount; // Default to monthly
    }
  }, 0);

  // Calculate Net MRR (assuming all active templates contribute positively)
  const netMRR = totalMRR; // In a real app, this might subtract churned MRR

  // Calculate Average Template Value (actual template amounts, not monthly normalized)
  const avgTemplateValue = activeTemplates > 0 ? templates.reduce((sum, template) => sum + (template.amount || 0), 0) / activeTemplates : 0;

  const handleSave = async (templateData: InvoiceTemplateFormData) => {
    try {
      // Recurring templates live in `recurring_invoice_templates`; /api/templates
      // is backed by `invoice_design_templates` and would hit an unrelated row.
      // The API expects the payload wrapped as { templateData }.
      if (editingTemplate) {
        const response = await authenticatedFetch(`/api/recurring-templates/${editingTemplate.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ templateData })
        });
        if (!response.ok) throw new Error('Failed to update template');
      } else {
        const response = await authenticatedFetch('/api/recurring-templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ templateData })
        });
        if (!response.ok) throw new Error('Failed to create template');
      }
      await loadTemplates();
      setIsFormOpen(false);
      setEditingTemplate(null);
    } catch (error) {
      console.error('Error saving template:', error);
    }
  };

  const handleDelete = async (id: number) => {
    if (confirm('Are you sure you want to delete this template?')) {
      try {
        const response = await authenticatedFetch(`/api/recurring-templates/${id}`, {
          method: 'DELETE'
        });
        if (!response.ok) throw new Error('Failed to delete template');
        await loadTemplates();
      } catch (error) {
        console.error('Error deleting template:', error);
      }
    }
  };

  const handleEdit = (template: RecurringTemplateWithClient) => {
    navigate(`/recurring-invoices/edit/${template.id}`);
  };

  const handleCreateNew = () => {
    navigate('/recurring-invoices/create');
  };

  const renderPanelView = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {filteredTemplates.map((template) => (
        <div key={template.id} className={themeClasses.cardHover}>
          <div className="flex justify-between items-start mb-4">
            <div>
              <h3 className={themeClasses.cardTitle}>{template.name}</h3>
              <p className={themeClasses.mutedText}>{template.client_name}</p>
            </div>
            <div className="flex space-x-2">
              <button
                onClick={() => handleEdit(template)}
                className="p-1 text-muted-foreground hover:text-blue-600"
                title="Edit Template"
                aria-label="Edit Template"
              >
                <Edit className="h-4 w-4" />
              </button>
              <button
                onClick={() => handleDelete(template.id)}
                className="p-1 text-muted-foreground hover:text-red-600"
                title="Delete Template"
                aria-label="Delete Template"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="space-y-3">
            <div className={`flex items-center text-sm ${themeClasses.mutedText}`}>
              <DollarSign className={`${themeClasses.iconSmall} mr-2 ${getIconColorClasses('green')}`} />
              <span><FormattedCurrency amount={template.amount} /></span>
            </div>

            <div className={`flex items-center text-sm ${themeClasses.mutedText}`}>
              <Calendar className={`${themeClasses.iconSmall} mr-2 ${getIconColorClasses('blue')}`} />
              <span className="capitalize">{template.frequency}</span>
            </div>

            <div className={`text-sm ${themeClasses.mutedText}`}>
              Next: {formatDateSync(template.next_invoice_date)}
            </div>

            {template.description && (
              <p className={`text-sm ${themeClasses.mutedText} truncate`}>{template.description}</p>
            )}
          </div>

          <div className="mt-4 pt-4 border-t border-border">
            <div className="flex justify-between items-center">
              <span className={`text-xs ${themeClasses.mutedText}`}>
                Created {formatDateSync(template.created_at)}
              </span>
              <span className={themeClasses.badgeSuccess}>
                Active
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  const renderTableView = () => (
    <div className="bg-card rounded-lg shadow-sm border border-border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left py-3 px-6 text-xs font-medium text-muted-foreground uppercase">Template Name</th>
              <th className="text-left py-3 px-6 text-xs font-medium text-muted-foreground uppercase">Client</th>
              <th className="text-left py-3 px-6 text-xs font-medium text-muted-foreground uppercase">Amount</th>
              <th className="text-left py-3 px-6 text-xs font-medium text-muted-foreground uppercase">Frequency</th>
              <th className="text-left py-3 px-6 text-xs font-medium text-muted-foreground uppercase">Next Invoice</th>
              <th className="text-left py-3 px-6 text-xs font-medium text-muted-foreground uppercase">Status</th>
              <th className="text-left py-3 px-6 text-xs font-medium text-muted-foreground uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filteredTemplates.map((template) => (
              <tr key={template.id} className="hover:bg-muted/50">
                <td className="py-4 px-6 text-sm font-medium text-card-foreground">
                  <div>
                    <div className="font-medium">{template.name}</div>
                    {template.description && (
                      <div className="text-xs text-muted-foreground truncate max-w-xs">
                        {template.description}
                      </div>
                    )}
                  </div>
                </td>
                <td className="py-4 px-6 text-sm text-card-foreground">{template.client_name}</td>
                <td className="py-4 px-6 text-sm font-medium text-card-foreground">
                  <FormattedCurrency amount={template.amount} />
                </td>
                <td className="py-4 px-6 text-sm text-card-foreground">
                  <span className="capitalize">{template.frequency}</span>
                </td>
                <td className="py-4 px-6 text-sm text-card-foreground">
                  {formatDateSync(template.next_invoice_date)}
                </td>
                <td className="py-4 px-6 text-sm">
                  <span className={themeClasses.badgeSuccess}>
                    Active
                  </span>
                </td>
                <td className="py-4 px-6 text-sm">
                  <div className="flex space-x-2">
                    <button
                      onClick={() => handleEdit(template)}
                      className="p-1 text-muted-foreground hover:text-blue-600"
                      title="Edit Template"
                    >
                      <Edit className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(template.id)}
                      className="p-1 text-muted-foreground hover:text-red-600"
                      title="Delete Template"
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

  return (
    <div>
      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
        <div className="bg-card p-6 rounded-lg shadow-sm border border-border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Total MRR</p>
              <p className="text-2xl font-bold text-green-600">
                <FormattedCurrency amount={totalMRR} />
              </p>
            </div>
            <DollarSign className="h-8 w-8 text-green-600" />
          </div>
        </div>
        <div className="bg-card p-6 rounded-lg shadow-sm border border-border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Active Templates</p>
              <p className="text-2xl font-bold text-blue-600">{activeTemplates}</p>
            </div>
            <FileText className="h-8 w-8 text-blue-600" />
          </div>
        </div>
        <div className="bg-card p-6 rounded-lg shadow-sm border border-border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Net MRR</p>
              <p className="text-2xl font-bold text-purple-600">
                <FormattedCurrency amount={netMRR} />
              </p>
            </div>
            <TrendingUp className="h-8 w-8 text-purple-600" />
          </div>
        </div>
        <div className="bg-card p-6 rounded-lg shadow-sm border border-border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Avg Template Value</p>
              <p className="text-2xl font-bold text-orange-600">
                <FormattedCurrency amount={avgTemplateValue} />
              </p>
            </div>
            <Repeat className="h-8 w-8 text-orange-600" />
          </div>
        </div>
      </div>

      {/* Search, Filters and View Toggle */}
      <div className={`${themeClasses.searchContainer} mb-6`}>
        <div className="flex items-center space-x-4">
          {/* Left column - Search and Filters (80%) */}
          <div className="flex-1 flex space-x-4">
            <div className="flex-1 relative max-w-md">
              <Search className={themeClasses.searchIcon} />
              <input
                type="text"
                placeholder="Search templates..."
                className={themeClasses.searchInput}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <select
              className={themeClasses.select}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
            </select>
            <select
              className={themeClasses.select}
              value={frequencyFilter}
              onChange={(e) => setFrequencyFilter(e.target.value)}
            >
              <option value="all">All Frequencies</option>
              {uniqueFrequencies.map(frequency => (
                <option key={frequency} value={frequency}>
                  {frequency.charAt(0).toUpperCase() + frequency.slice(1)}
                </option>
              ))}
            </select>
            <select
              className={themeClasses.select}
              value={clientFilter}
              onChange={(e) => setClientFilter(e.target.value)}
            >
              <option value="all">All Clients</option>
              {uniqueClients.map(client => (
                <option key={client} value={client}>{client}</option>
              ))}
            </select>
          </div>

          {/* Right column - View Toggle (20%) */}
          <div className="flex space-x-2">
            <button
              onClick={() => setViewMode('panel')}
              className={`p-2 rounded-lg border ${
                viewMode === 'panel'
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background text-muted-foreground border-input hover:bg-accent hover:text-accent-foreground'
              }`}
              title="Panel View"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`p-2 rounded-lg border ${
                viewMode === 'table'
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background text-muted-foreground border-input hover:bg-accent hover:text-accent-foreground'
              }`}
              title="Table View"
            >
              <Table className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Templates Display */}
      {viewMode === 'panel' ? renderPanelView() : renderTableView()}

      {filteredTemplates.length === 0 && (
        <div className="text-center py-12">
          <Calendar className={`h-12 w-12 ${themeClasses.mutedText} mx-auto mb-4`} />
          <h3 className={`text-lg font-medium ${themeClasses.bodyText} mb-2`}>
            {templates.length === 0 ? 'No templates yet' : 'No templates found'}
          </h3>
          <p className={`${themeClasses.mutedText} mb-4`}>
            {templates.length === 0
              ? 'Create your first recurring invoice template'
              : 'Try adjusting your search or filters'
            }
          </p>
          {templates.length === 0 && (
            <button
              onClick={handleCreateNew}
              className={getButtonClasses('primary')}
            >
              <Plus className={themeClasses.iconButton} />
              Create Template
            </button>
          )}
        </div>
      )}

      <TemplateForm
        isOpen={isFormOpen}
        onClose={() => {
          setIsFormOpen(false);
          setEditingTemplate(null);
        }}
        onSave={handleSave}
        template={editingTemplate}
      />
    </div>
  );
};
