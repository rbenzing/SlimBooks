/**
 * AuthContext session-monitoring tests.
 *
 * The expiry-monitoring effect listed `currentWarningToast` in its dependency
 * array *and* called `setCurrentWarningToast` from inside its own warning
 * callback. Showing a session-expiry warning therefore re-ran the effect, whose
 * cleanup stopped monitoring and dismissed the toast it had just raised — the
 * warning killed itself and the monitor was torn down and restarted every time.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

type ExpiredHandler = () => void;
type WarningHandler = (minutesLeft: number) => void;

const {
  startMonitoring,
  stopMonitoring,
  verifyToken,
  getToken,
  isTokenExpired,
  toastWarning,
  toastDismiss
} = vi.hoisted(() => ({
  startMonitoring: vi.fn(),
  stopMonitoring: vi.fn(),
  verifyToken: vi.fn(),
  getToken: vi.fn(),
  isTokenExpired: vi.fn(),
  toastWarning: vi.fn(() => 'toast-1'),
  toastDismiss: vi.fn()
}));

vi.mock('@/services/tokenManager.svc', () => ({
  TokenManagerService: {
    getInstance: () => ({ startMonitoring, stopMonitoring, registerActivity: vi.fn() })
  }
}));

vi.mock('@/services/auth.svc', () => ({
  AuthService: {
    getInstance: () => ({
      verifyToken,
      setCurrentUser: vi.fn(),
      logout: vi.fn(),
      login: vi.fn(),
      register: vi.fn()
    })
  }
}));

vi.mock('@/utils/api/auth.util', () => ({
  getToken,
  isTokenExpired,
  clearAuthTokens: vi.fn(),
  setAuthTokens: vi.fn(),
  TokenPersistence: { Persistent: 'persistent', Session: 'session' }
}));

vi.mock('sonner', () => ({
  toast: {
    warning: toastWarning,
    dismiss: toastDismiss,
    success: vi.fn(),
    error: vi.fn()
  }
}));

import { AuthProvider, useAuth } from '@/contexts/AuthContext';

const Probe = () => {
  const { user, loading } = useAuth();
  if (loading) return <div>loading</div>;
  return <div data-testid="who">{user ? user.email : 'anonymous'}</div>;
};

const renderProvider = () =>
  render(
    <MemoryRouter>
      <AuthProvider>
        <Probe />
      </AuthProvider>
    </MemoryRouter>
  );

describe('AuthContext session monitoring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getToken.mockReturnValue('a.valid.token');
    isTokenExpired.mockReturnValue(false);
    verifyToken.mockResolvedValue({ id: 1, email: 'admin@slimbooks.app', role: 'admin' });
  });

  it('starts expiry monitoring once for an authenticated user', async () => {
    renderProvider();

    expect(await screen.findByTestId('who')).toHaveTextContent('admin@slimbooks.app');
    await waitFor(() => expect(startMonitoring).toHaveBeenCalledTimes(1));
  });

  it('does not restart monitoring when an expiry warning is raised', async () => {
    renderProvider();
    await waitFor(() => expect(startMonitoring).toHaveBeenCalledTimes(1));

    // stopMonitoring is legitimately called once on mount, while `user` is
    // still null and the effect has nothing to monitor.
    const teardownsBefore = stopMonitoring.mock.calls.length;

    const onWarning = startMonitoring.mock.calls[0][1] as WarningHandler;
    onWarning(5);

    // The warning must not cause the effect to tear down and re-arm the monitor.
    await waitFor(() => expect(toastWarning).toHaveBeenCalledTimes(1));
    expect(startMonitoring).toHaveBeenCalledTimes(1);
    expect(stopMonitoring).toHaveBeenCalledTimes(teardownsBefore);
  });

  it('does not dismiss the warning toast it just raised', async () => {
    renderProvider();
    await waitFor(() => expect(startMonitoring).toHaveBeenCalledTimes(1));

    const onWarning = startMonitoring.mock.calls[0][1] as WarningHandler;
    onWarning(5);

    await waitFor(() => expect(toastWarning).toHaveBeenCalledTimes(1));
    expect(toastDismiss).not.toHaveBeenCalled();
  });

  it('dismisses the outstanding warning once the user becomes active again', async () => {
    renderProvider();
    await waitFor(() => expect(startMonitoring).toHaveBeenCalledTimes(1));

    const onWarning = startMonitoring.mock.calls[0][1] as WarningHandler;
    const onWarningDismissed = startMonitoring.mock.calls[0][2] as () => void;

    onWarning(5);
    await waitFor(() => expect(toastWarning).toHaveBeenCalledTimes(1));

    onWarningDismissed();
    await waitFor(() => expect(toastDismiss).toHaveBeenCalledWith('toast-1'));
  });

  it('does not start monitoring when there is no authenticated user', async () => {
    getToken.mockReturnValue(null);

    renderProvider();

    expect(await screen.findByTestId('who')).toHaveTextContent('anonymous');
    expect(startMonitoring).not.toHaveBeenCalled();
  });

  it('logs the user out when the expiry handler fires', async () => {
    renderProvider();
    await waitFor(() => expect(startMonitoring).toHaveBeenCalledTimes(1));

    const onExpired = startMonitoring.mock.calls[0][0] as ExpiredHandler;
    onExpired();

    expect(await screen.findByTestId('who')).toHaveTextContent('anonymous');
  });
});
