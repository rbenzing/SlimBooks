
import React from 'react';
import { Edit, KeyRound, Unlock, Trash2 } from 'lucide-react';
import { formatDateSync } from '@/components/ui/FormattedDate';
import { themeClasses } from '@/utils/themeUtils.util';
import { type ManagedUser } from '@/types';

interface UserTableProps {
  users: ManagedUser[];
  /**
   * Count of administrators across the whole install, not just the rows on
   * this page — computing it from a paginated slice would let the "last
   * admin" courtesy below miscount whenever another admin sits on a
   * different page.
   */
  liveAdminCount: number;
  currentUserId: number | null;
  onEdit: (user: ManagedUser) => void;
  onDelete: (user: ManagedUser) => void;
  onResetPassword: (user: ManagedUser) => void;
  onUnlock: (user: ManagedUser) => void;
}

/**
 * Locked beats unverified beats active — an operator looking at this column
 * wants the reason the account cannot be used, not a list of its properties.
 */
const statusOf = (user: ManagedUser): { label: string; tone: 'locked' | 'pending' | 'active' } => {
  const lockedUntil = user.account_locked_until;

  if (lockedUntil !== null && lockedUntil > Date.now()) {
    return { label: 'Locked', tone: 'locked' };
  }

  if (!user.email_verified) {
    return { label: 'Unverified', tone: 'pending' };
  }

  return { label: 'Active', tone: 'active' };
};

const badgeClassFor = (tone: 'locked' | 'pending' | 'active'): string => {
  switch (tone) {
    case 'locked':
      return themeClasses.badgeError;
    case 'pending':
      return themeClasses.badgeWarning;
    default:
      return themeClasses.badgeSuccess;
  }
};

const roleLabel = (role: ManagedUser['role']): string => {
  switch (role) {
    case 'admin':
      return 'Administrator';
    case 'viewer':
      return 'Viewer';
    default:
      return 'User';
  }
};

export const UserTable: React.FC<UserTableProps> = ({
  users,
  liveAdminCount,
  currentUserId,
  onEdit,
  onDelete,
  onResetPassword,
  onUnlock
}) => {
  return (
    <div className="bg-card rounded-lg shadow-sm border border-border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-muted/50 border-b border-border">
            <tr>
              <th className="text-left py-3 px-6 text-xs font-medium text-muted-foreground uppercase tracking-wider">Name</th>
              <th className="text-left py-3 px-6 text-xs font-medium text-muted-foreground uppercase tracking-wider">Email</th>
              <th className="text-left py-3 px-6 text-xs font-medium text-muted-foreground uppercase tracking-wider">Role</th>
              <th className="text-left py-3 px-6 text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
              <th className="text-left py-3 px-6 text-xs font-medium text-muted-foreground uppercase tracking-wider">Last Login</th>
              <th className="text-left py-3 px-6 text-xs font-medium text-muted-foreground uppercase tracking-wider">Created</th>
              <th className="text-left py-3 px-6 text-xs font-medium text-muted-foreground uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {users.map((user) => {
              const status = statusOf(user);
              const isSelf = user.id === currentUserId;

              // This only hides the button so an operator is not surprised by a
              // refusal that has already been decided. It is a courtesy, not the
              // guard: the users service enforces the last-administrator rule at
              // the database level, so a stale or paginated list here can never
              // be the thing standing between the install and losing its only
              // administrator.
              const isLastAdmin = user.role === 'admin' && liveAdminCount <= 1;

              return (
                <tr key={user.id} className="hover:bg-muted/50">
                  <td className="py-4 px-6 text-sm font-medium text-card-foreground">
                    {user.name}
                    {isSelf && <span className="ml-2 text-xs text-muted-foreground">(you)</span>}
                  </td>
                  <td className="py-4 px-6 text-sm text-card-foreground">{user.email}</td>
                  <td className="py-4 px-6 text-sm text-card-foreground">{roleLabel(user.role)}</td>
                  <td className="py-4 px-6 text-sm">
                    <span
                      className={badgeClassFor(status.tone)}
                      title={status.tone === 'locked' ? `Locked until ${formatDateSync(user.account_locked_until)}` : undefined}
                    >
                      {status.label}
                    </span>
                  </td>
                  <td className="py-4 px-6 text-sm text-muted-foreground">
                    {user.last_login ? formatDateSync(user.last_login) : 'Never'}
                  </td>
                  <td className="py-4 px-6 text-sm text-card-foreground">
                    {formatDateSync(user.created_at)}
                  </td>
                  <td className="py-4 px-6 text-sm">
                    <div className="flex space-x-2">
                      <button
                        onClick={() => onEdit(user)}
                        className="p-1 text-muted-foreground hover:text-blue-600"
                        title="Edit User"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => onResetPassword(user)}
                        className="p-1 text-muted-foreground hover:text-blue-600"
                        title="Reset Password"
                      >
                        <KeyRound className="h-4 w-4" />
                      </button>
                      {status.tone === 'locked' && (
                        <button
                          onClick={() => onUnlock(user)}
                          className="p-1 text-muted-foreground hover:text-green-600"
                          title="Unlock Account"
                        >
                          <Unlock className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        onClick={() => onDelete(user)}
                        disabled={isLastAdmin}
                        className="p-1 text-muted-foreground hover:text-red-600 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-muted-foreground"
                        title={isLastAdmin ? 'This is the only administrator. Promote another account first.' : 'Delete User'}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
