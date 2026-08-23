
import React, { useState, useEffect } from 'react';
import { Plus, Search, Users, ShieldCheck, Lock, MailWarning } from 'lucide-react';
import { UserForm } from './users/UserForm';
import { UserTable } from './users/UserTable';
import { ResetPasswordDialog } from './users/ResetPasswordDialog';
import { PaginationControls } from './ui/PaginationControls';
import { usePagination } from '@/hooks/usePagination';
import { toast } from 'sonner';
import { themeClasses, getButtonClasses } from '@/utils/themeUtils.util';
import { StatCard, StatCardGrid } from '@/components/ui/StatCard';
import { useAuth } from '@/contexts/AuthContext';
import { usersService } from '@/services/users.svc';
import { type ManagedUser, type UserFormData } from '@/types';

export const UserManagement: React.FC = () => {
  const { user: currentUser, logout } = useAuth();

  const [uiState, setUiState] = useState({
    showForm: false
  });

  const [filters, setFilters] = useState({
    searchTerm: ''
  });

  const [activeItem, setActiveItem] = useState<{
    editing: ManagedUser | null;
  }>({
    editing: null
  });

  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [resetTarget, setResetTarget] = useState<ManagedUser | null>(null);

  const updateUiState = (updates: Partial<typeof uiState>) =>
    setUiState(prev => ({ ...prev, ...updates }));

  const updateFilters = (updates: Partial<typeof filters>) =>
    setFilters(prev => ({ ...prev, ...updates }));

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const data = await usersService.list();
      setUsers(data);
    } catch (error) {
      // A non-admin who reaches this screen directly gets a 403 here — the
      // sidebar hides the entry, but this is the actual access control.
      toast.error(error instanceof Error ? error.message : 'Failed to load users');
    }
  };

  const filteredUsers = users.filter(user =>
    user.name.toLowerCase().includes(filters.searchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(filters.searchTerm.toLowerCase()) ||
    user.username.toLowerCase().includes(filters.searchTerm.toLowerCase())
  );

  const pagination = usePagination({
    data: filteredUsers,
    searchTerm: filters.searchTerm,
    filters: {}
  });

  // The count that matters for the last-administrator courtesy is the whole
  // install, not just the current search/page — computed from `users`, not
  // `filteredUsers` or `pagination.paginatedData`.
  const liveAdminCount = users.filter(user => user.role === 'admin').length;

  const handleCreateUser = () => {
    setActiveItem({ editing: null });
    updateUiState({ showForm: true });
  };

  const handleEditUser = (user: ManagedUser) => {
    setActiveItem({ editing: user });
    updateUiState({ showForm: true });
  };

  const handleCloseForm = () => {
    updateUiState({ showForm: false });
    setActiveItem({ editing: null });
  };

  const handleSaveUser = async (formData: UserFormData) => {
    const editing = activeItem.editing;
    const isSelf = editing?.id === currentUser?.id;
    const isSelfDemotion = isSelf && editing?.role === 'admin' && formData.role !== 'admin';

    if (isSelfDemotion) {
      const confirmed = window.confirm(
        'You are about to remove your own administrator access. You will be signed out and another administrator will have to restore it.'
      );
      if (!confirmed) return;
    }

    try {
      if (editing) {
        await usersService.update(editing.id, formData);
        toast.success('User updated successfully');
      } else {
        await usersService.create(formData);
        toast.success('User created successfully');
      }

      handleCloseForm();

      if (isSelfDemotion) {
        logout();
        return;
      }

      await loadUsers();
    } catch (error) {
      // Surface the server's own message — a 409 here is the last-administrator
      // guard explaining itself, not a generic failure.
      toast.error(error instanceof Error ? error.message : 'Failed to save user');
    }
  };

  const handleDeleteUser = async (user: ManagedUser) => {
    const isSelf = user.id === currentUser?.id;
    const message = isSelf
      ? 'You are about to remove your own administrator access. You will be signed out and another administrator will have to restore it.'
      : `Delete ${user.name}? This cannot be undone.`;

    if (!window.confirm(message)) return;

    try {
      await usersService.remove(user.id);
      toast.success('User deleted successfully');

      if (isSelf) {
        logout();
        return;
      }

      await loadUsers();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete user');
    }
  };

  const handleUnlockUser = async (user: ManagedUser) => {
    try {
      await usersService.unlock(user.id);
      toast.success('Account unlocked');
      await loadUsers();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to unlock account');
    }
  };

  const lockedCount = users.filter(
    user => user.account_locked_until !== null && user.account_locked_until > Date.now()
  ).length;

  // Truthiness only: the wire value is 0/1, not a real boolean.
  const unverifiedCount = users.filter(user => !user.email_verified).length;

  if (uiState.showForm) {
    return (
      <UserForm
        user={activeItem.editing}
        isLastAdmin={
          activeItem.editing !== null &&
          activeItem.editing.role === 'admin' &&
          liveAdminCount <= 1
        }
        onSave={handleSaveUser}
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
            <h1 className={themeClasses.sectionTitle}>Users</h1>
            <p className={themeClasses.sectionSubtitle}>Manage user accounts and access</p>
          </div>
          <button
            onClick={handleCreateUser}
            className={getButtonClasses('primary')}
          >
            <Plus className={themeClasses.iconButton} />
            Add User
          </button>
        </div>

        {/* Statistics Cards */}
        <StatCardGrid className={themeClasses.statsGrid}>
          <StatCard label="Total Users" value={users.length} icon={Users} iconColor="blue" />
          <StatCard
            label="Administrators"
            value={liveAdminCount}
            icon={ShieldCheck}
            iconColor="green"
            valueColor="green"
            size="medium"
          />
          <StatCard
            label="Locked"
            value={lockedCount}
            icon={Lock}
            iconColor="red"
            valueColor="red"
            size="medium"
          />
          <StatCard
            label="Unverified"
            value={unverifiedCount}
            icon={MailWarning}
            iconColor="orange"
            valueColor="orange"
            size="medium"
          />
        </StatCardGrid>

        {/* Search */}
        <div className={themeClasses.searchContainer}>
          <div className="relative max-w-md flex-1">
            <Search className={themeClasses.searchIcon} />
            <input
              type="text"
              placeholder="Search users..."
              className={themeClasses.searchInput}
              value={filters.searchTerm}
              onChange={(e) => updateFilters({ searchTerm: e.target.value })}
            />
          </div>
        </div>

        {/* Users Table */}
        <UserTable
          users={pagination.paginatedData}
          liveAdminCount={liveAdminCount}
          currentUserId={currentUser?.id ?? null}
          onEdit={handleEditUser}
          onDelete={handleDeleteUser}
          onResetPassword={setResetTarget}
          onUnlock={handleUnlockUser}
        />

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
          itemType="users"
        />

        {/* Empty State */}
        {filteredUsers.length === 0 && (
          <div className="bg-card rounded-lg shadow-sm border border-border p-12">
            <div className="text-center">
              <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">
                {filters.searchTerm ? 'No users found' : 'No users yet'}
              </h3>
              <p className="text-muted-foreground mb-4">
                {filters.searchTerm
                  ? 'Try adjusting your search terms'
                  : 'Add your first user to get started'
                }
              </p>
              {!filters.searchTerm && (
                <button
                  onClick={handleCreateUser}
                  className="inline-flex items-center px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add User
                </button>
              )}
            </div>
          </div>
        )}

        {/* Reset Password Dialog */}
        {resetTarget && (
          <ResetPasswordDialog
            user={resetTarget}
            onClose={() => setResetTarget(null)}
          />
        )}
      </div>
    </div>
  );
};
