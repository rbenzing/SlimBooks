
import React, { useState, useEffect } from 'react';
import { Plus, Search, Users, Building, Mail, Phone, LayoutGrid, Table, Edit, Trash2 } from 'lucide-react';
import { ClientForm } from './ClientForm';
import { ClientImportExport } from './clients/ClientImportExport';
import { PaginationControls } from './ui/PaginationControls';
import { authenticatedFetch } from '@/utils/api';
import { usePagination } from '@/hooks/usePagination';
import { toast } from 'sonner';
import { formatDateSync } from '@/components/ui/FormattedDate';
import { themeClasses, getButtonClasses, getIconColorClasses } from '@/utils/themeUtils.util';
import { type Client, type ClientFormData } from '@/types';

export const ClientManagement: React.FC = () => {
  const [uiState, setUiState] = useState({
    showCreateForm: false,
    showImportExport: false,
    viewMode: 'panel' as 'panel' | 'table'
  });

  const [filters, setFilters] = useState({
    searchTerm: ''
  });

  const [activeItem, setActiveItem] = useState<{
    editing: Client | null;
  }>({
    editing: null
  });

  const [clients, setClients] = useState<Client[]>([]);

  const updateUiState = (updates: Partial<typeof uiState>) =>
    setUiState(prev => ({ ...prev, ...updates }));

  const updateFilters = (updates: Partial<typeof filters>) =>
    setFilters(prev => ({ ...prev, ...updates }));

  useEffect(() => {
    loadClients();
  }, []);

  const loadClients = async () => {
    try {
      const response = await authenticatedFetch('/api/clients');
      if (response.ok) {
        const data = await response.json();
        setClients(data.data || []);
      } else {
        throw new Error('Failed to load clients');
      }
    } catch {
      toast.error('Failed to load clients');
    }
  };

  const filteredClients = clients.filter(client =>
    client.name.toLowerCase().includes(filters.searchTerm.toLowerCase()) ||
    client.email.toLowerCase().includes(filters.searchTerm.toLowerCase()) ||
    client.company.toLowerCase().includes(filters.searchTerm.toLowerCase())
  );

  // Use pagination hook
  const pagination = usePagination({
    data: filteredClients,
    searchTerm: filters.searchTerm,
    filters: {}
  });

  const handleCreateClient = () => {
    setActiveItem({ editing: null });
    updateUiState({ showCreateForm: true });
  };

  const handleEditClient = (client: Client) => {
    setActiveItem({ editing: client });
    updateUiState({ showCreateForm: true });
  };

  const handleSaveClient = async (clientData: ClientFormData) => {
    try {
      let response: Response;
      if (activeItem.editing) {
        response = await authenticatedFetch(`/api/clients/${activeItem.editing.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientData })
        });
        if (response.ok) {
          toast.success('Client updated successfully');
        } else {
          throw new Error('Failed to update client');
        }
      } else {
        response = await authenticatedFetch('/api/clients', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientData })
        });
        if (response.ok) {
          toast.success('Client created successfully');
        } else {
          throw new Error('Failed to create client');
        }
      }
      await loadClients();
      updateUiState({ showCreateForm: false });
      setActiveItem({ editing: null });
    } catch {
      toast.error('Failed to save client');
    }
  };

  const handleDeleteClient = async (id: number) => {
    try {
      const response = await authenticatedFetch(`/api/clients/${id}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        toast.success('Client deleted successfully');
        await loadClients();
      } else {
        throw new Error('Failed to delete client');
      }
    } catch {
      toast.error('Failed to delete client');
    }
  };

  const handleDeleteClientWithConfirm = (id: number, name: string) => {
    if (window.confirm(`Are you sure you want to delete ${name}?`)) {
      handleDeleteClient(id);
    }
  };

  const renderTableView = () => (
    <div className="bg-card rounded-lg shadow-sm border border-border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-muted/50 border-b border-border">
            <tr>
              <th className="text-left py-3 px-6 text-xs font-medium text-muted-foreground uppercase tracking-wider">Name</th>
              <th className="text-left py-3 px-6 text-xs font-medium text-muted-foreground uppercase tracking-wider">Company</th>
              <th className="text-left py-3 px-6 text-xs font-medium text-muted-foreground uppercase tracking-wider">Email</th>
              <th className="text-left py-3 px-6 text-xs font-medium text-muted-foreground uppercase tracking-wider">Phone</th>
              <th className="text-left py-3 px-6 text-xs font-medium text-muted-foreground uppercase tracking-wider">Created</th>
              <th className="text-left py-3 px-6 text-xs font-medium text-muted-foreground uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {pagination.paginatedData.map((client) => (
              <tr key={client.id} className="hover:bg-muted/50">
                <td className="py-4 px-6 text-sm font-medium text-card-foreground">
                  {client.name}
                </td>
                <td className="py-4 px-6 text-sm text-card-foreground">
                  {client.company}
                </td>
                <td className="py-4 px-6 text-sm text-card-foreground">
                  {client.email}
                </td>
                <td className="py-4 px-6 text-sm text-muted-foreground">
                  {client.phone || 'N/A'}
                </td>
                <td className="py-4 px-6 text-sm text-card-foreground">
                  {formatDateSync(client.created_at)}
                </td>
                <td className="py-4 px-6 text-sm">
                  <div className="flex space-x-2">
                    <button
                      onClick={() => handleEditClient(client)}
                      className="p-1 text-muted-foreground hover:text-blue-600"
                      title="Edit Client"
                    >
                      <Edit className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteClientWithConfirm(client.id, client.name)}
                      className="p-1 text-muted-foreground hover:text-red-600"
                      title="Delete Client"
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

  const handleCloseForm = () => {
    updateUiState({ showCreateForm: false });
    setActiveItem({ editing: null });
  };

  const renderPanelView = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {pagination.paginatedData.map((client) => (
        <div
          key={client.id}
          className={themeClasses.cardHover}
        >
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <h3 className={themeClasses.cardTitle}>{client.name}</h3>
              <p className={themeClasses.mutedText}>{client.company}</p>
            </div>
            <div className="flex space-x-2">
              <button
                onClick={() => handleEditClient(client)}
                className="p-1 text-muted-foreground hover:text-white"
                title="Edit Client"
              >
                <Edit className="h-4 w-4" />
              </button>
              <button
                onClick={() => handleDeleteClientWithConfirm(client.id, client.name)}
                className="p-1 text-muted-foreground hover:text-white"
                title="Delete Client"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <div className={`flex items-center text-sm ${themeClasses.mutedText}`}>
              <Mail className={`${themeClasses.iconSmall} mr-2`} />
              <span className="truncate">{client.email}</span>
            </div>

            {client.phone && (
              <div className={`flex items-center text-sm ${themeClasses.mutedText}`}>
                <Phone className={`${themeClasses.iconSmall} mr-2`} />
                <span>{client.phone}</span>
              </div>
            )}
          </div>

          <div className="mt-4 pt-4 border-t border-border">
            <p className={`text-xs ${themeClasses.mutedText}`}>
              Added {formatDateSync(client.created_at)}
            </p>
          </div>
        </div>
      ))}
    </div>
  );

  if (uiState.showCreateForm) {
    return (
      <ClientForm
        client={activeItem.editing}
        onSave={handleSaveClient}
        onCancel={handleCloseForm}
      />
    );
  }

  return (
    <div className={themeClasses.page}>
      <div className={themeClasses.pageContainer}>
        {/* Header */}
        <div className={themeClasses.sectionHeader}>
          <div>
            <h1 className={themeClasses.sectionTitle}>Clients</h1>
            <p className={themeClasses.sectionSubtitle}>Manage your client relationships</p>
          </div>
          <div className="flex space-x-3">
            <button
              onClick={() => updateUiState({ showImportExport: true })}
              className={getButtonClasses('secondary')}
            >
              <Building className={themeClasses.iconButton} />
              Import/Export
            </button>
            <button
              onClick={handleCreateClient}
              className={getButtonClasses('primary')}
            >
              <Plus className={themeClasses.iconButton} />
              Add Client
            </button>
          </div>
        </div>

        {/* Statistics Cards */}
        <div className={themeClasses.statsGrid}>
          <div className={themeClasses.statCard}>
            <div className={themeClasses.statCardContent}>
              <div>
                <p className={themeClasses.statLabel}>Total Clients</p>
                <p className={themeClasses.statValue}>{clients.length}</p>
              </div>
              <Users className={`${themeClasses.iconLarge} ${getIconColorClasses('blue')}`} />
            </div>
          </div>
          <div className={themeClasses.statCard}>
            <div className={themeClasses.statCardContent}>
              <div>
                <p className={themeClasses.statLabel}>Active This Month</p>
                <p className={`${themeClasses.statValueMedium} ${getIconColorClasses('green')}`}>{Math.floor(clients.length * 0.7)}</p>
              </div>
              <Building className={`${themeClasses.iconLarge} ${getIconColorClasses('green')}`} />
            </div>
          </div>
          <div className={themeClasses.statCard}>
            <div className={themeClasses.statCardContent}>
              <div>
                <p className={themeClasses.statLabel}>New This Month</p>
                <p className={`${themeClasses.statValueMedium} ${getIconColorClasses('purple')}`}>{Math.floor(clients.length * 0.2)}</p>
              </div>
              <Mail className={`${themeClasses.iconLarge} ${getIconColorClasses('purple')}`} />
            </div>
          </div>
          <div className={themeClasses.statCard}>
            <div className={themeClasses.statCardContent}>
              <div>
                <p className={themeClasses.statLabel}>Response Rate</p>
                <p className={`${themeClasses.statValueMedium} ${getIconColorClasses('orange')}`}>94%</p>
              </div>
              <Phone className={`${themeClasses.iconLarge} ${getIconColorClasses('orange')}`} />
            </div>
          </div>
        </div>

        {/* Search and View Toggle */}
        <div className={themeClasses.searchContainer}>
          <div className="flex justify-between items-center">
            {/* Left section - Search */}
            <div className="relative max-w-md flex-1 mr-6">
              <Search className={themeClasses.searchIcon} />
              <input
                type="text"
                placeholder="Search clients..."
                className={themeClasses.searchInput}
                value={filters.searchTerm}
                onChange={(e) => updateFilters({ searchTerm: e.target.value })}
              />
            </div>

            {/* Right section - View Toggle */}
            <div className="flex space-x-2">
              <button
                onClick={() => updateUiState({ viewMode: 'panel' })}
                className={`p-2 rounded-lg border ${
                  uiState.viewMode === 'panel'
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background text-muted-foreground border-input hover:bg-accent hover:text-accent-foreground'
                }`}
                title="Panel View"
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                onClick={() => updateUiState({ viewMode: 'table' })}
                className={`p-2 rounded-lg border ${
                  uiState.viewMode === 'table'
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

        {/* Clients Display */}
        {uiState.viewMode === 'panel' ? renderPanelView() : renderTableView()}

        {/* Pagination Controls */}
        <PaginationControls
          currentPage={pagination.currentPage}
          totalPages={pagination.totalPages}
          itemsPerPage={pagination.itemsPerPage}
          totalItems={pagination.totalItems}
          displayStart={pagination.displayStart}
          displayEnd={pagination.displayEnd}
          pageNumbers={pagination.pageNumbers}
          paginationSettings={pagination.paginationSettings}
          onPageChange={pagination.setCurrentPage}
          onItemsPerPageChange={pagination.setItemsPerPage}
          onNextPage={pagination.goToNextPage}
          onPrevPage={pagination.goToPrevPage}
          canGoNext={pagination.canGoNext}
          canGoPrev={pagination.canGoPrev}
          className="mt-6"
          itemType="clients"
        />

        {/* Empty State */}
        {filteredClients.length === 0 && (
          <div className="bg-card rounded-lg shadow-sm border border-border p-12">
            <div className="text-center">
              <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">
                {filters.searchTerm ? 'No clients found' : 'No clients yet'}
              </h3>
              <p className="text-muted-foreground mb-4">
                {filters.searchTerm
                  ? 'Try adjusting your search terms'
                  : 'Add your first client to get started'
                }
              </p>
              {!filters.searchTerm && (
                <button
                  onClick={handleCreateClient}
                  className="inline-flex items-center px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Client
                </button>
              )}
            </div>
          </div>
        )}

        {/* Import/Export Modal */}
        {uiState.showImportExport && (
          <ClientImportExport
            onClose={() => updateUiState({ showImportExport: false })}
            onImportComplete={loadClients}
          />
        )}
      </div>
    </div>
  );
};
