
import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { type ManagedUser, type UserFormData } from '@/types';

interface UserFormProps {
  user?: ManagedUser | null;
  /**
   * True only while editing the sole remaining administrator. Disables the
   * role field so the form does not offer a demotion the server will refuse
   * anyway — the courtesy lives here, the guard lives in the users service.
   */
  isLastAdmin: boolean;
  onSave: (userData: UserFormData) => void;
  onCancel: () => void;
}

const EMPTY_FORM: UserFormData = {
  name: '',
  email: '',
  username: '',
  role: 'user',
  password: ''
};

export const UserForm: React.FC<UserFormProps> = ({ user, isLastAdmin, onSave, onCancel }) => {
  const [formData, setFormData] = useState<UserFormData>(EMPTY_FORM);

  useEffect(() => {
    if (user) {
      setFormData({
        name: user.name,
        email: user.email,
        username: user.username,
        // `viewer` is a valid wire value but never a form choice; an
        // account that already carries it is treated as `user` here.
        role: user.role === 'admin' ? 'admin' : 'user',
        password: undefined
      });
    } else {
      setFormData(EMPTY_FORM);
    }
  }, [user]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const { name, email, username, role, password } = formData;

    // Editing a password happens through the reset dialog, never here — an
    // edit never sends one, whatever the field last held while creating.
    const submissionData: UserFormData = user
      ? { name, email, username, role }
      : { name, email, username, role, password };

    onSave(submissionData);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-card rounded-lg p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto border border-border">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-foreground">{user ? 'Edit User' : 'Add New User'}</h2>
          <button onClick={onCancel} className="text-muted-foreground hover:text-foreground">
            <X className="h-6 w-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Name *</label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Email *</label>
              <input
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Username *</label>
              <input
                type="text"
                required
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Role *</label>
            <select
              required
              disabled={isLastAdmin}
              title={isLastAdmin ? "This is the only administrator. Promote another account before changing this one's role." : undefined}
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value as UserFormData['role'] })}
              className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="admin">Administrator</option>
              <option value="user">User</option>
            </select>
          </div>

          {!user && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Password *</label>
              <input
                type="password"
                required
                minLength={8}
                maxLength={128}
                autoComplete="new-password"
                value={formData.password ?? ''}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
              />
            </div>
          )}

          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 border border-input rounded-lg text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
            >
              {user ? 'Update User' : 'Create User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
