/**
 * App-level setup gating: the wizard renders instead of the normal app while
 * GET /api/setup/status reports needsSetup: true, and the normal app renders
 * once it reports false. SetupWizardPage's own steps are covered in
 * SetupWizardPage.test.tsx; LoginPage's own behaviour in its own test — both
 * are stubbed here to isolate the gating decision itself.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';

const { useAuthMock, useSetupStatusMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  useSetupStatusMock: vi.fn()
}));

vi.mock('./contexts/AuthContext', () => ({
  useAuth: useAuthMock,
  ProtectedRoute: ({ children }: { children: React.ReactNode }) => <>{children}</>
}));

vi.mock('./hooks/useSetupStatus.hook', () => ({
  useSetupStatus: useSetupStatusMock
}));

vi.mock('./pages/SetupWizardPage', () => ({
  SetupWizardPage: () => <div>SETUP_WIZARD_MARKER</div>
}));

vi.mock('./pages/LoginPage', () => ({
  LoginPage: () => <div>LOGIN_MARKER</div>
}));

describe('App setup gating', () => {
  it('renders the setup wizard when needsSetup is true', async () => {
    useAuthMock.mockReturnValue({ isAuthenticated: false, loading: false });
    useSetupStatusMock.mockReturnValue({ data: { needsSetup: true }, isLoading: false });

    render(<App />);

    expect(await screen.findByText('SETUP_WIZARD_MARKER')).toBeInTheDocument();
    expect(screen.queryByText('LOGIN_MARKER')).not.toBeInTheDocument();
  });

  it('renders the normal app once needsSetup is false', async () => {
    useAuthMock.mockReturnValue({ isAuthenticated: false, loading: false });
    useSetupStatusMock.mockReturnValue({ data: { needsSetup: false }, isLoading: false });

    render(<App />);

    expect(await screen.findByText('LOGIN_MARKER')).toBeInTheDocument();
    expect(screen.queryByText('SETUP_WIZARD_MARKER')).not.toBeInTheDocument();
  });

  it('shows the loading screen while setup status is still resolving', () => {
    useAuthMock.mockReturnValue({ isAuthenticated: false, loading: false });
    useSetupStatusMock.mockReturnValue({ data: undefined, isLoading: true });

    render(<App />);

    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(screen.queryByText('SETUP_WIZARD_MARKER')).not.toBeInTheDocument();
    expect(screen.queryByText('LOGIN_MARKER')).not.toBeInTheDocument();
  });
});
