import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type * as ReactRouterDom from 'react-router-dom';
import { SetupWizardPage } from './SetupWizardPage';

const { completeSetup, navigateMock } = vi.hoisted(() => ({
  completeSetup: vi.fn(),
  navigateMock: vi.fn()
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ completeSetup })
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactRouterDom>();
  return { ...actual, useNavigate: () => navigateMock };
});

afterEach(() => {
  vi.clearAllMocks();
});

const fillAdminForm = () => {
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Ada Admin' } });
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ada@example.com' } });
  fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'ada' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct horse battery staple' } });
  fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'correct horse battery staple' } });
};

describe('SetupWizardPage', () => {
  it('rejects a mismatched confirmation without calling completeSetup', async () => {
    render(<MemoryRouter><SetupWizardPage /></MemoryRouter>);

    fillAdminForm();
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'something else' } });
    fireEvent.click(screen.getByRole('button', { name: /create administrator account/i }));

    expect(await screen.findByText('Passwords do not match')).toBeInTheDocument();
    expect(completeSetup).not.toHaveBeenCalled();
  });

  it('shows the server error and does not advance when setup fails', async () => {
    completeSetup.mockResolvedValue({ success: false, message: 'Setup has already been completed.' });
    render(<MemoryRouter><SetupWizardPage /></MemoryRouter>);

    fillAdminForm();
    fireEvent.click(screen.getByRole('button', { name: /create administrator account/i }));

    expect(await screen.findByText('Setup has already been completed.')).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('navigates to the dashboard once the only step succeeds', async () => {
    completeSetup.mockResolvedValue({ success: true, user: { role: 'admin' }, session_token: 'tok' });
    render(<MemoryRouter><SetupWizardPage /></MemoryRouter>);

    fillAdminForm();
    fireEvent.click(screen.getByRole('button', { name: /create administrator account/i }));

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/dashboard', { replace: true }));
  });
});
