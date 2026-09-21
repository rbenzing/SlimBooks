
import React, { useState } from 'react';
import { toast } from 'sonner';
import Modal from '@/components/ui/modal.cpt';
import { usersService } from '@/services/users.svc';
import { type ManagedUser } from '@/types';

// Mirrors server/config/index.ts validationConfig.password. The server is the
// real gate — this only saves a round trip for an answer it already knows.
const PASSWORD_BOUNDS = { minLength: 8, maxLength: 128 };

interface ResetPasswordDialogProps {
  user: ManagedUser;
  onClose: () => void;
}

export const ResetPasswordDialog: React.FC<ResetPasswordDialogProps> = ({ user, onClose }) => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < PASSWORD_BOUNDS.minLength || password.length > PASSWORD_BOUNDS.maxLength) {
      setError(`Password must be between ${PASSWORD_BOUNDS.minLength} and ${PASSWORD_BOUNDS.maxLength} characters`);
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setSubmitting(true);

    try {
      await usersService.resetPassword(user.id, password);
      toast.success(`Password reset for ${user.name}`);
      onClose();
    } catch (err) {
      // The server's own message: e.g. a 409 here is the last-administrator
      // guard explaining itself, not a generic failure, so it is shown as-is.
      setError(err instanceof Error ? err.message : 'Failed to reset password');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Reset Password"
      description={`Set a new password for ${user.name}.`}
      size="lg"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="reset-password-form"
            disabled={submitting}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
          >
            {submitting ? 'Resetting...' : 'Reset Password'}
          </button>
        </>
      }
    >
      <form id="reset-password-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="reset-password-new" className="text-sm font-medium text-foreground">
            New Password
          </label>
          <input
            id="reset-password-new"
            type="password"
            required
            minLength={PASSWORD_BOUNDS.minLength}
            maxLength={PASSWORD_BOUNDS.maxLength}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="reset-password-confirm" className="text-sm font-medium text-foreground">
            Confirm Password
          </label>
          <input
            id="reset-password-confirm"
            type="password"
            required
            minLength={PASSWORD_BOUNDS.minLength}
            maxLength={PASSWORD_BOUNDS.maxLength}
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
      </form>
    </Modal>
  );
};
