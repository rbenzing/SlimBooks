/**
 * What an edit actually puts on the wire.
 *
 * The form offers `admin` and `user` only, so a `viewer` account is displayed
 * as `user`. Sending `role` on every save therefore rewrote those accounts on
 * an edit that never touched the role — a name change silently changed their
 * access level. Silent data mutation is a recurring scar here, so the payload
 * is pinned rather than left to inspection.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { UserForm } from '@/components/users/UserForm';
import { type ManagedUser } from '@/types';

const viewer: ManagedUser = {
  id: 3,
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  username: 'ada',
  role: 'viewer',
  email_verified: 1,
  last_login: null,
  failed_login_attempts: 0,
  account_locked_until: null,
  created_at: 1_700_000_000_000
};

const onSave = vi.fn();
const onCancel = vi.fn();

const renderForm = (user: ManagedUser | null) =>
  render(<UserForm user={user} isLastAdmin={false} onSave={onSave} onCancel={onCancel} />);

const submit = () => fireEvent.submit(screen.getByRole('button', { name: /update user|create user/i }).closest('form') as HTMLFormElement);

beforeEach(() => vi.clearAllMocks());

describe('editing', () => {
  it('omits role from an edit that did not change it', () => {
    renderForm(viewer);

    fireEvent.change(screen.getByDisplayValue('Ada Lovelace'), { target: { value: 'Ada L.' } });
    submit();

    const [payload] = onSave.mock.calls[0] as [Record<string, unknown>];
    expect(payload).toEqual({ name: 'Ada L.', email: 'ada@example.com', username: 'ada' });
    expect('role' in payload).toBe(false);
  });

  it('shows a viewer as a user without that being a change', () => {
    renderForm(viewer);

    expect(screen.getByRole('combobox')).toHaveValue('user');

    submit();

    expect((onSave.mock.calls[0][0] as Record<string, unknown>).role).toBeUndefined();
  });

  it('sends role once the operator actually moves it', () => {
    renderForm(viewer);

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'admin' } });
    submit();

    expect(onSave.mock.calls[0][0]).toMatchObject({ role: 'admin' });
  });

  it('never sends a password from an edit', () => {
    renderForm({ ...viewer, role: 'user' });

    submit();

    expect('password' in (onSave.mock.calls[0][0] as object)).toBe(false);
  });
});

describe('creating', () => {
  it('sends everything the form collects, role and password included', () => {
    // The form's labels are not associated with their inputs, so these select
    // by type and order rather than by label text.
    const { container } = renderForm(null);
    const [name, email, username] = Array.from(container.querySelectorAll('input[type="text"], input[type="email"]'));

    fireEvent.change(name, { target: { value: 'Grace' } });
    fireEvent.change(email, { target: { value: 'grace@example.com' } });
    fireEvent.change(username, { target: { value: 'grace' } });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'admin' } });
    fireEvent.change(container.querySelector('input[type="password"]') as HTMLInputElement, {
      target: { value: 'Str0ng!Passphrase' }
    });
    submit();

    expect(onSave.mock.calls[0][0]).toEqual({
      name: 'Grace',
      email: 'grace@example.com',
      username: 'grace',
      role: 'admin',
      password: 'Str0ng!Passphrase'
    });
  });
});
