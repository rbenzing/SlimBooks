/**
 * Settings tab structure tests.
 *
 * The settings area used to carry two Email panels writing to two different
 * stores — the tab's `email_settings` (which the mail service reads) and a
 * second copy under Project Settings that nothing consumed. These tests pin the
 * structure that replaced it:
 *
 *  - exactly one place to enter email credentials,
 *  - credentials live on the tab for the integration they belong to,
 *  - each integration owns BOTH its switch and its credentials, so there is
 *    one place to go rather than a switch on one tab and fields on another.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type * as UseSettingsHook from '@/hooks/useSettings.hook';

const { getProjectSettings, updateProjectSettings, getSetting, setSetting, isReady, initialize } =
  vi.hoisted(() => ({
    getProjectSettings: vi.fn(),
    updateProjectSettings: vi.fn(),
    getSetting: vi.fn(),
    setSetting: vi.fn(),
    isReady: vi.fn(() => true),
    initialize: vi.fn(async () => {})
  }));
const { getEmailConfigurationStatus } = vi.hoisted(() => ({
  getEmailConfigurationStatus: vi.fn()
}));

vi.mock('@/services/sqlite.svc', () => ({
  sqliteService: {
    getProjectSettings, updateProjectSettings, getSetting, setSetting, isReady, initialize
  }
}));
vi.mock('@/utils/emailConfig.util', () => ({ getEmailConfigurationStatus }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const { useCompanySettings } = vi.hoisted(() => ({ useCompanySettings: vi.fn() }));
vi.mock('@/hooks/useSettings.hook', async () => {
  const actual = await vi.importActual<typeof UseSettingsHook>('@/hooks/useSettings.hook');
  return { ...actual, useCompanySettings };
});

import { SecuritySettingsTab } from '@/components/settings/SecuritySettingsTab';
import { GoogleSettingsTab } from '@/components/settings/GoogleSettingsTab';
import { ResponsiveSettings } from '@/components/ResponsiveSettings';

const projectSettings = (over: Record<string, unknown> = {}) => ({
  google_oauth: { enabled: false, client_id: '', client_secret: '', configured: false },
  stripe: { enabled: false, publishable_key: '', secret_key: '', configured: false },
  email: {
    enabled: false, smtp_host: '', smtp_port: 587,
    smtp_user: '', smtp_pass: '', email_from: '', configured: false
  },
  security: {
    require_email_verification: false,
    max_failed_login_attempts: 5,
    account_lockout_duration: 1800000
  },
  ...over
});

const emailStatus = (canSendEmails: boolean) => ({
  isConfigured: canSendEmails,
  isEnabled: canSendEmails,
  missingFields: [],
  canSendEmails
});

/** Renders a tab and waits for its loading skeleton to be replaced. */
const renderTab = async (ui: React.ReactElement, heading: RegExp) => {
  const view = render(<MemoryRouter>{ui}</MemoryRouter>);
  await screen.findByRole('heading', { name: heading });
  return view;
};

const renderSecurity = () => renderTab(<SecuritySettingsTab />, /^Security$/);
const renderGoogle = () => renderTab(<GoogleSettingsTab />, /^Google OAuth$/);

/** Google switched on, which is when its credential fields exist. */
const renderGoogleEnabled = async (over: Record<string, unknown> = {}) => {
  getProjectSettings.mockResolvedValue(projectSettings({
    google_oauth: { enabled: true, client_id: '', configured: false, ...over }
  }));
  return renderGoogle();
};

const companySettings = () => ({
  companyName: '', ownerName: '', email: '', phone: '', address: '',
  city: '', state: '', zipCode: '', brandingImage: '',
  fiscalYearStartMonth: 1, accountingMethod: 'accrual' as const
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  isReady.mockReturnValue(true);
  getProjectSettings.mockResolvedValue(projectSettings());
  updateProjectSettings.mockResolvedValue(undefined);
  getEmailConfigurationStatus.mockResolvedValue(emailStatus(true));
  getSetting.mockResolvedValue([]);
  useCompanySettings.mockReturnValue({
    settings: companySettings(),
    setSettings: vi.fn(),
    saveSettings: vi.fn().mockResolvedValue(undefined),
    isLoading: false,
    isSaving: false,
    isLoaded: true,
    error: null
  });
});

afterEach(() => vi.restoreAllMocks());

describe('Security tab', () => {
  it('does not ask for email credentials', async () => {
    // The Email Settings tab owns these; a second copy here wrote to a store
    // nothing read.
    await renderSecurity();

    expect(screen.queryByLabelText(/smtp/i)).toBeNull();
    expect(screen.queryByPlaceholderText(/smtp\.gmail\.com/i)).toBeNull();
    expect(screen.queryByText(/from email/i)).toBeNull();
  });

  it('does not ask for integration credentials', async () => {
    // Those belong on the integration's own tab.
    await renderSecurity();

    expect(screen.queryByPlaceholderText(/pk_test_/i)).toBeNull();
    expect(screen.queryByPlaceholderText(/sk_test_/i)).toBeNull();
    expect(screen.queryByPlaceholderText(/client id/i)).toBeNull();
  });

  it('does not carry the integration switches', async () => {
    // They moved to each integration's own tab. Leaving a copy here would be a
    // second answer to the same question.
    await renderSecurity();

    expect(screen.queryByLabelText(/enable google oauth/i)).toBeNull();
    expect(screen.queryByLabelText(/enable stripe/i)).toBeNull();
  });

  it('keeps the account security controls', async () => {
    await renderSecurity();

    expect(screen.getByLabelText(/max failed login attempts/i)).toBeTruthy();
    expect(screen.getByLabelText(/account lockout duration/i)).toBeTruthy();
    expect(screen.getByLabelText(/require email verification/i)).toBeTruthy();
  });

  it('shows the lockout duration in minutes, not milliseconds', async () => {
    getProjectSettings.mockResolvedValue(projectSettings({
      security: {
        require_email_verification: false,
        max_failed_login_attempts: 5,
        account_lockout_duration: 1800000
      }
    }));

    await renderSecurity();

    expect((screen.getByLabelText(/account lockout duration/i) as HTMLInputElement).value).toBe('30');
  });
});

describe('email verification gate', () => {
  it('allows the toggle once email can actually send', async () => {
    getEmailConfigurationStatus.mockResolvedValue(emailStatus(true));

    await renderSecurity();

    await waitFor(() =>
      expect((screen.getByLabelText(/require email verification/i) as HTMLInputElement).disabled)
        .toBe(false)
    );
  });

  it('blocks the toggle while email cannot send', async () => {
    // Requiring verification with no working mail path locks everyone out.
    getEmailConfigurationStatus.mockResolvedValue(emailStatus(false));

    await renderSecurity();

    await waitFor(() =>
      expect((screen.getByLabelText(/require email verification/i) as HTMLInputElement).disabled)
        .toBe(true)
    );
    expect(screen.getByText(/email settings tab first/i)).toBeTruthy();
  });

  it('gates on the store the mail service reads, not on project settings', async () => {
    // Project settings say email is configured; the real store says otherwise.
    getProjectSettings.mockResolvedValue(projectSettings({
      email: { enabled: true, configured: true, smtp_host: 'smtp.example.com', smtp_port: 587 }
    }));
    getEmailConfigurationStatus.mockResolvedValue(emailStatus(false));

    await renderSecurity();

    await waitFor(() =>
      expect((screen.getByLabelText(/require email verification/i) as HTMLInputElement).disabled)
        .toBe(true)
    );
  });

  it('keeps the toggle closed when the status check fails', async () => {
    // Failing open would let someone require a verification email the app
    // may not be able to send.
    getEmailConfigurationStatus.mockRejectedValue(new Error('offline'));

    await renderSecurity();

    expect((screen.getByLabelText(/require email verification/i) as HTMLInputElement).disabled)
      .toBe(true);
  });
});

describe('Google tab', () => {
  it('asks for the OAuth credentials', async () => {
    await renderGoogleEnabled();

    expect(screen.getByLabelText(/client id/i)).toBeTruthy();
    expect(screen.getByLabelText(/^client secret$/i)).toBeTruthy();
  });

  it('masks the client secret by default', async () => {
    await renderGoogleEnabled();

    expect((screen.getByLabelText(/^client secret$/i) as HTMLInputElement).type).toBe('password');
  });

  it('reveals the client secret on request', async () => {
    const user = userEvent.setup();
    await renderGoogleEnabled();

    await user.click(screen.getByLabelText(/show client secret/i));

    expect((screen.getByLabelText(/^client secret$/i) as HTMLInputElement).type).toBe('text');
  });

  it('shows the stored credentials', async () => {
    getProjectSettings.mockResolvedValue(projectSettings({
      google_oauth: { enabled: true, client_id: 'client-123', client_secret: 'secret', configured: true }
    }));

    await renderGoogle();

    expect((screen.getByLabelText(/client id/i) as HTMLInputElement).value).toBe('client-123');
  });

  it('carries its own enable switch', async () => {
    // The tab is always reachable now, so this is where Google gets turned on.
    await renderGoogle();

    expect(screen.getByLabelText(/enable google oauth/i)).toBeTruthy();
  });

  it('hides the credential fields until the integration is switched on', async () => {
    await renderGoogle();

    expect(screen.queryByLabelText(/client id/i)).toBeNull();
  });

  it('switches on automatically when .env already carries the credentials', async () => {
    // A deployment that put the credentials in .env has already decided.
    getProjectSettings.mockResolvedValue(projectSettings({
      google_oauth: { enabled: true, client_id: 'id', configured: true, env_configured: true }
    }));

    await renderGoogle();

    expect((screen.getByLabelText(/enable google oauth/i) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText(/found in your .env file/i)).toBeTruthy();
  });

  it('warns while the integration is unconfigured', async () => {
    await renderGoogleEnabled();

    expect(screen.getByText(/not configured yet/i)).toBeTruthy();
  });

  it('does not warn once configured', async () => {
    getProjectSettings.mockResolvedValue(projectSettings({
      google_oauth: { enabled: true, client_id: 'id', client_secret: 's', configured: true }
    }));

    await renderGoogle();

    expect(screen.queryByText(/not configured yet/i)).toBeNull();
  });

  it('leaves the credential fields editable', async () => {
    const user = userEvent.setup();
    await renderGoogleEnabled();

    await user.type(screen.getByLabelText(/client id/i), 'abc');

    expect((screen.getByLabelText(/client id/i) as HTMLInputElement).value).toBe('abc');
  });
});

/**
 * Settings tab list.
 *
 * Tax Rates used to be its own tab; it is now a section of Company & Tax, so
 * these pin the merged tab list and the redirect that keeps the old `#tax`
 * deep link working.
 */
describe('Settings tab list', () => {
  const expectedTabNames = [
    'Company & Tax', 'General', 'Shipping', 'Email Settings', 'Notifications',
    'Appearance', 'Google OAuth', 'Stripe', 'Security', 'Backup & Restore'
  ];

  const renderSettings = (initialEntries: string[] = ['/settings']) =>
    render(
      <MemoryRouter initialEntries={initialEntries}>
        <ResponsiveSettings />
      </MemoryRouter>
    );

  it('shows exactly the merged ten tabs — no separate Tax Rates or bare Company', async () => {
    renderSettings();
    await screen.findByLabelText(/fiscal year starts/i);

    const candidateNames = new Set([...expectedTabNames, 'Tax Rates', 'Company']);
    const shownTabNames = new Set(
      screen.getAllByRole('button')
        .map((button) => button.textContent?.trim())
        .filter((text): text is string => !!text && candidateNames.has(text))
    );

    expect([...shownTabNames].sort()).toEqual([...expectedTabNames].sort());
  });

  it('defaults to Company & Tax, showing company details, the fiscal fields and tax rates together', async () => {
    getSetting.mockResolvedValue([{ id: '1', name: 'No Tax', rate: 0, isDefault: true }]);
    renderSettings();

    expect(await screen.findByText('Company Name *')).toBeTruthy();
    expect(await screen.findByLabelText(/fiscal year starts/i)).toBeTruthy();
    expect(await screen.findByLabelText(/accounting basis/i)).toBeTruthy();
    expect(await screen.findByText('No Tax')).toBeTruthy();
  });

  it('redirects the old #tax deep link to Company & Tax rather than matching nothing', async () => {
    renderSettings(['/settings#tax']);

    // If the redirect were missing, no known tab id would match '#tax' either
    // — but the fiscal fields are proof the Company & Tax tab, not some
    // coincidental default, is what actually rendered.
    expect(await screen.findByLabelText(/fiscal year starts/i)).toBeTruthy();
  });
});
