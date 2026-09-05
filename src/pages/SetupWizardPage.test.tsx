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

vi.mock('@/components/settings/CompanySettings', async () => {
  const React = await import('react');
  return {
    CompanySettings: React.forwardRef(() => <div>Company settings form</div>)
  };
});

vi.mock('@/components/settings/EmailSettings', async () => {
  const React = await import('react');
  return {
    EmailSettings: React.forwardRef(() => <div>Email settings form</div>)
  };
});
vi.mock('@/components/settings/StripeSettingsTab', async () => {
  const React = await import('react');
  return {
    StripeSettingsTab: React.forwardRef(() => <div>Stripe settings form</div>)
  };
});
vi.mock('@/components/settings/GoogleSettingsTab', async () => {
  const React = await import('react');
  return {
    GoogleSettingsTab: React.forwardRef(() => <div>Google settings form</div>)
  };
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

  it('advances to the company step after the admin account is created', async () => {
    completeSetup.mockResolvedValue({ success: true, user: { role: 'admin' }, session_token: 'tok' });
    render(<MemoryRouter><SetupWizardPage /></MemoryRouter>);

    fillAdminForm();
    fireEvent.click(screen.getByRole('button', { name: /create administrator account/i }));

    expect(await screen.findByText('Company information')).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  const advancePastCompanyStep = async () => {
    fireEvent.click(screen.getByRole('button', { name: /^next$/i }));
    await screen.findByText('Email');
  };

  it('reaches the dashboard by skipping every optional step', async () => {
    completeSetup.mockResolvedValue({ success: true, user: { role: 'admin' }, session_token: 'tok' });
    render(<MemoryRouter><SetupWizardPage /></MemoryRouter>);

    fillAdminForm();
    fireEvent.click(screen.getByRole('button', { name: /create administrator account/i }));
    await screen.findByText('Company information');

    await advancePastCompanyStep();
    fireEvent.click(screen.getByRole('button', { name: /skip for now/i }));
    await screen.findByText('Stripe');

    fireEvent.click(screen.getByRole('button', { name: /skip for now/i }));
    await screen.findByText('Google Sign-In');

    fireEvent.click(screen.getByRole('button', { name: /skip for now/i }));
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/dashboard', { replace: true }));
  });

  it('mounts a Toaster so the integration steps can surface save feedback', () => {
    render(<MemoryRouter><SetupWizardPage /></MemoryRouter>);

    expect(screen.getByRole('region', { name: /notifications/i })).toBeInTheDocument();
  });
});
