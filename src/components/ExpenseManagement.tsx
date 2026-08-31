
import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  Receipt, 
  DollarSign, 
  Calendar, 
  FileText, 
  Upload, 
  LayoutGrid, 
  Table, 
  Eye, 
  Edit, 
  Trash2 
} from 'lucide-react';
import { ExpenseForm } from './expenses/ExpenseForm';
import { ExpensesList } from './expenses/ExpensesList';
import { ExpenseImportExport } from './expenses/ExpenseImportExport';
import { ExpenseViewModal } from './expenses/ExpenseViewModal';
import { PaginationControls } from './ui/PaginationControls';
import { DateRangeFilter } from './ui/DateRangeFilter';
import { authenticatedFetch, apiPost, apiPut, apiDelete } from '@/utils/api';
import { usePagination } from '@/hooks/usePagination';
import { toast } from 'sonner';
import { 
  themeClasses, 
  getButtonClasses, 
  getStatusColor 
} from '@/utils/themeUtils.util';
import { StatCard, StatCardGrid } from '@/components/ui/StatCard';
import { filterByDateRange, getDateRangeForPeriod } from '@/utils/data';
import { formatDateSync } from '@/components/ui/FormattedDate';
import { FormattedCurrency } from '@/components/ui/FormattedCurrency';
import { useFiscalSettings } from '@/hooks/useFiscalSettings.hook';
import { useRememberedPeriod } from '@/hooks/useRememberedPeriod.hook';
import { type Expense } from '@/types';

export const ExpenseManagement: React.FC = () => {
  const [uiState, setUiState] = useState({
    showCreateForm: false,
    showImportExport: false,
    isViewModalOpen: false,
    viewMode: 'table' as 'panel' | 'table'
  });

  const { fiscalYearStartMonth } = useFiscalSettings();
  const [dateFilter, customDateRange, setDateFilter] = useRememberedPeriod('expenses');

  const [filters, setFilters] = useState({
    searchTerm: '',
    categoryFilter: 'all',
    statusFilter: 'all'
  });

  const [activeItem, setActiveItem] = useState<{
    editing: Expense | null;
    viewing: Expense | null;
  }>({
    editing: null,
    viewing: null
  });

  const [expenses, setExpenses] = useState<Expense[]>([]);

  const updateUiState = (updates: Partial<typeof uiState>) =>
    setUiState(prev => ({ ...prev, ...updates }));

  const updateFilters = (updates: Partial<typeof filters>) =>
    setFilters(prev => ({ ...prev, ...updates }));

  useEffect(() => {
    loadExpenses();
  }, []);

  const loadExpenses = async () => {
    try {
      const response = await authenticatedFetch('/api/expenses');
      if (response.ok) {
        const data = await response.json();
        const allExpenses = data.data?.data || [];

        // Ensure all expenses have required fields (basic validation)
        const validExpenses = allExpenses.filter((expense: Expense) =>
          expense &&
          expense.id &&
          typeof expense.amount === 'number'
        );

        setExpenses(validExpenses);
      } else {
        throw new Error('Failed to load expenses');
      }
    } catch (error) {
      console.error('Error loading expenses:', error);
      toast.error('Failed to load expenses');
      setExpenses([]); // Set empty array as fallback
    }
  };

  const filteredExpenses = expenses.filter(expense => {
    if (!expense) return false;

    const vendor = expense.vendor || '';
    const description = expense.description || '';
    const category = expense.category || '';
    const status = expense.status || '';

    const matchesSearch = vendor.toLowerCase().includes(filters.searchTerm.toLowerCase()) ||
                         description.toLowerCase().includes(filters.searchTerm.toLowerCase());
    const matchesCategory = filters.categoryFilter === 'all' || category === filters.categoryFilter;
    const matchesStatus = filters.statusFilter === 'all' || status === filters.statusFilter;

    return matchesSearch && matchesCategory && matchesStatus;
  });

  // Apply date filtering
  const dateFilteredExpenses = (() => {
    if (dateFilter === 'custom' && customDateRange) {
      return filterByDateRange(filteredExpenses, customDateRange, 'date');
    } else {
      const dateRange = getDateRangeForPeriod(dateFilter, fiscalYearStartMonth, new Date());
      return filterByDateRange(filteredExpenses, dateRange, 'date');
    }
  })();

  // Use pagination hook
  const pagination = usePagination({
    data: dateFilteredExpenses,
    searchTerm: filters.searchTerm,
    filters: { categoryFilter: filters.categoryFilter, statusFilter: filters.statusFilter, dateFilter }
  });

  const totalExpenses = dateFilteredExpenses.reduce((sum, exp) => sum + exp.amount, 0);
  const pendingCount = dateFilteredExpenses.filter(exp => exp.status === 'pending').length;
  const approvedCount = dateFilteredExpenses.filter(exp => exp.status === 'approved').length;
  const reimbursedCount = dateFilteredExpenses.filter(exp => exp.status === 'reimbursed').length;

  const handleCreateExpense = () => {
    setActiveItem({ editing: null, viewing: null });
    updateUiState({ showCreateForm: true });
  };

  const handleEditExpense = (expense: Expense) => {
    setActiveItem({ editing: expense, viewing: null });
    updateUiState({ showCreateForm: true });
  };

  const handleViewExpense = (expense: Expense) => {
    setActiveItem(prev => ({ ...prev, viewing: expense }));
    updateUiState({ isViewModalOpen: true });
  };

  const handleSaveExpense = async (expenseData: Omit<Expense, 'id' | 'created_at' | 'updated_at'>) => {
    try {
      if (activeItem.editing) {
        const response = await apiPut(`/api/expenses/${activeItem.editing.id}`, { expenseData });
        if (response.success) {
          toast.success('Expense updated successfully');
        } else {
          throw new Error(response.error || 'Failed to update expense');
        }
      } else {
        const response = await apiPost('/api/expenses', { expenseData });
        if (response.success) {
          toast.success('Expense created successfully');
        } else {
          throw new Error(response.error || 'Failed to create expense');
        }
      }
      await loadExpenses();
      updateUiState({ showCreateForm: false });
      setActiveItem({ editing: null, viewing: null });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save expense');
    }
  };

  const handleDeleteExpense = async (id: number) => {
    try {
      const response = await apiDelete(`/api/expenses/${id}`);
      if (response.success) {
        toast.success('Expense deleted successfully');
        await loadExpenses();
      } else {
        throw new Error(response.error || 'Failed to delete expense');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete expense');
    }
  };

  const handleBulkDelete = async (expenseIds: number[]) => {
    try {
      const response = await apiPost('/api/expenses/bulk-delete', { expenseIds });
      if (response.success) {
        toast.success(`${expenseIds.length} expenses deleted successfully`);
        await loadExpenses();
      } else {
        throw new Error(response.error || 'Failed to delete expenses');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete expenses');
    }
  };

  const handleBulkCategorize = async (expenseIds: number[], category: string) => {
    try {
      const response = await apiPost('/api/expenses/bulk-update', { expenseIds, updates: { category } });
      if (response.success) {
        toast.success(`${expenseIds.length} expenses categorized as "${category}"`);
        await loadExpenses();
      } else {
        throw new Error(response.error || 'Failed to categorize expenses');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update expense categories');
    }
  };

  const handleBulkChangeVendor = async (expenseIds: number[], vendor: string) => {
    try {
      const response = await apiPost('/api/expenses/bulk-update', { expenseIds, updates: { vendor } });
      if (response.success) {
        toast.success(`${expenseIds.length} expenses updated to vendor "${vendor}"`);
        await loadExpenses();
      } else {
        throw new Error(response.error || 'Failed to update vendor');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update expense vendors');
    }
  };

  const handleCloseForm = () => {
    updateUiState({ showCreateForm: false });
    setActiveItem(prev => ({ ...prev, editing: null }));
  };

  const renderPanelView = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {pagination.paginatedData.map((expense) => (
        <div key={expense.id} className="bg-card rounded-lg shadow-sm border border-border p-6">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h3 className="font-semibold text-foreground">{expense.vendor}</h3>
              <p className="text-sm text-muted-foreground">{expense.category}</p>
            </div>
            <div className="flex space-x-2">
              <button
                onClick={() => handleViewExpense(expense)}
                className="p-1 text-muted-foreground hover:text-white"
                title="View Expense"
              >
                <Eye className="h-4 w-4" />
              </button>
              <button
                onClick={() => handleEditExpense(expense)}
                className="p-1 text-muted-foreground hover:text-blue-600"
                title="Edit Expense"
              >
                <Edit className="h-4 w-4" />
              </button>
              <button
                onClick={() => handleDeleteExpense(expense.id)}
                className="p-1 text-muted-foreground hover:text-red-600"
                title="Delete Expense"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Amount</span>
              <span className="font-medium text-foreground">
                <FormattedCurrency amount={expense.amount} />
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Date</span>
              <span className="text-sm text-foreground">{formatDateSync(expense.date)}</span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Status</span>
              <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(expense.status)}`}>
                {expense.status.charAt(0).toUpperCase() + expense.status.slice(1)}
              </span>
            </div>

            {expense.description && (
              <div className="pt-2 border-t border-border">
                <p className="text-sm text-muted-foreground">{expense.description}</p>
              </div>
            )}

            {expense.receipt_url && (
              <div className="flex items-center text-sm text-blue-600">
                <Receipt className="h-4 w-4 mr-1" />
                <span>Receipt attached</span>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );

  if (uiState.showCreateForm) {
    return (
      <ExpenseForm 
        expense={activeItem.editing}
        onSave={handleSaveExpense}
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
            <h1 className={themeClasses.sectionTitle}>Expenses</h1>
            <p className={themeClasses.sectionSubtitle}>Track and manage company expenses</p>
          </div>
          <div className="flex space-x-3">
            <button
              onClick={() => updateUiState({ showImportExport: true })}
              className={getButtonClasses('secondary')}
            >
              <Upload className={themeClasses.iconButton} />
              Import/Export
            </button>
            <button
              onClick={handleCreateExpense}
              className={getButtonClasses('primary')}
            >
              <Plus className={themeClasses.iconButton} />
              Add Expense
            </button>
          </div>
        </div>

        {/* Statistics Cards */}
        <StatCardGrid className={themeClasses.statsGrid}>
          <StatCard
            label="Total Expenses"
            value={<FormattedCurrency amount={totalExpenses} />}
            icon={DollarSign}
            iconColor="blue"
          />
          <div className={themeClasses.statCard}>
            <div className={themeClasses.statCardContent}>
              <div>
                <p className={themeClasses.statLabel}>Pending</p>
                <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">{pendingCount}</p>
              </div>
              <Calendar className="h-8 w-8 text-orange-600 dark:text-orange-400" />
            </div>
          </div>
          <div className="bg-card p-6 rounded-lg shadow-sm border border-border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Approved</p>
                <p className="text-2xl font-bold text-green-600 dark:text-green-400">{approvedCount}</p>
              </div>
              <Receipt className="h-8 w-8 text-green-600 dark:text-green-400" />
            </div>
          </div>
          <div className="bg-card p-6 rounded-lg shadow-sm border border-border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Reimbursed</p>
                <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{reimbursedCount}</p>
              </div>
              <FileText className="h-8 w-8 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
        </StatCardGrid>

        {/* Search and Filter Controls */}
        <div className="bg-card p-6 rounded-lg shadow-sm border border-border">
          <div className="flex justify-between items-center">
            {/* Left section - Search and Filters (80%) */}
            <div className="flex space-x-4 flex-1 mr-6">
              <div className="flex-1 relative max-w-md">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search expenses..."
                  className="w-full pl-10 pr-4 py-2 bg-background border border-input rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                  value={filters.searchTerm}
                  onChange={(e) => updateFilters({ searchTerm: e.target.value })}
                />
              </div>
              <select
                className="px-4 py-2 bg-background border border-input rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                value={filters.categoryFilter}
                onChange={(e) => updateFilters({ categoryFilter: e.target.value })}
              >
                <option value="all">All Categories</option>
                <option value="Office Supplies">Office Supplies</option>
                <option value="Meals & Entertainment">Meals & Entertainment</option>
                <option value="Travel">Travel</option>
                <option value="Software">Software</option>
                <option value="Marketing">Marketing</option>
                <option value="Other">Other</option>
              </select>
              <select
                className="px-4 py-2 bg-background border border-input rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                value={filters.statusFilter}
                onChange={(e) => updateFilters({ statusFilter: e.target.value })}
              >
                <option value="all">All Status</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="reimbursed">Reimbursed</option>
              </select>
              <DateRangeFilter
                value={dateFilter}
                customRange={customDateRange}
                onChange={setDateFilter}
                className="max-w-xs"
              />
            </div>

            {/* Right section - View Toggle (20%) */}
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

        {/* Expenses Display */}
        <div>
          {uiState.viewMode === 'panel' ? renderPanelView() : (
            <ExpensesList
              expenses={pagination.paginatedData}
              onEditExpense={handleEditExpense}
              onDeleteExpense={handleDeleteExpense}
              onViewExpense={handleViewExpense}
              onBulkDelete={handleBulkDelete}
              onBulkCategorize={handleBulkCategorize}
              onBulkChangeVendor={handleBulkChangeVendor}
              categories={Array.from(new Set(expenses.map(e => e.category).filter(Boolean)))}
            />
          )}
        </div>

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
          itemType="expenses"
        />

        {/* Empty State */}
        {dateFilteredExpenses.length === 0 && (
          <div className="bg-card rounded-lg shadow-sm border border-border p-12">
            <div className="text-center">
              <Receipt className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">No expenses found</h3>
              <p className="text-muted-foreground mb-4">
                {filters.searchTerm || filters.categoryFilter !== 'all' || filters.statusFilter !== 'all' || dateFilter !== 'this_year'
                  ? 'Try adjusting your search or filters'
                  : 'Add your first expense to get started'
                }
              </p>
            </div>
          </div>
        )}

        {/* Import/Export Modal */}
        {uiState.showImportExport && (
          <ExpenseImportExport
            onClose={() => updateUiState({ showImportExport: false })}
            onImportComplete={loadExpenses}
            currentPeriod={dateFilter}
            currentCustomRange={customDateRange}
            onPeriodChange={setDateFilter}
          />
        )}

        {/* Expense View Modal */}
        <ExpenseViewModal
          expense={activeItem.viewing}
          isOpen={uiState.isViewModalOpen}
          onClose={() => {
            updateUiState({ isViewModalOpen: false });
            setActiveItem(prev => ({ ...prev, viewing: null }));
          }}
        />
      </div>
    </div>
  );
};
