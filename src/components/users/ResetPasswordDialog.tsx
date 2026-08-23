
import React, { useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset Password</DialogTitle>
          <DialogDescription>Set a new password for {user.name}.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="reset-password-new">New Password</Label>
            <Input
              id="reset-password-new"
              type="password"
              required
              minLength={PASSWORD_BOUNDS.minLength}
              maxLength={PASSWORD_BOUNDS.maxLength}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="reset-password-confirm">Confirm Password</Label>
            <Input
              id="reset-password-confirm"
              type="password"
              required
              minLength={PASSWORD_BOUNDS.minLength}
              maxLength={PASSWORD_BOUNDS.maxLength}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Resetting...' : 'Reset Password'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
