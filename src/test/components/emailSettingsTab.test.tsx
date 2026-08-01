/**
 * Email Settings tab tests.
 *
 * The tab is laid out in the order the information is known: sender, then
 * provider, then credentials. These tests pin the parts that were reported
 * broken or that are easy to break again:
 *
 *  - Test Connection is reachable when the fields are filled in. It used to be
 *    gated on an "enabled" flag that was permanently false, because the hook
 *    read every setting in the database instead of the one row it owns.
 *  - Choosing a provider sets host, port and encryption together.
 *  - The server fields appear only for a custom provider.
 *  - The sender is prefilled from the signed-in user, and only when empty.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { useEmailSettings } = vi.hoisted(() => ({ useEmailSettings: vi.fn() }));
vi.mock('@/hooks/useSettings.hook', () => ({ useEmailSettings }));

const { testConnection, sendTestEmail } = vi.hoisted(() => ({
  testConnection: vi.fn(),
  sendTestEmail: vi.fn()
}));
vi.mock('@/services/email.svc', () => ({
  emailService: { testConnection, sendTestEmail }
}));

const { useAuth } = vi.hoisted(() => ({ useAuth: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth }));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { EmailSettings } from '@/components/settings/EmailSettings';

/** The current form state, and a spy for every change the tab makes. */
let current: Record<string, unknown>;
const setSettings = vi.fn((updater: unknown) => {
  current = typeof updater === 'function'
    ? (updater as (prev: unknown) => Record<string, unknown>)(current)
    : updater as Record<string, unknown>;
});
const saveSettings = vi.fn().mockResolvedValue(undefined);

const formState = (over: Record<string, unknown> = {}) => ({
  provider: '',
  smtp_host: '',
  smtp_port: 587,
  smtp_user: '',
  smtp_password: '',
  smtp_security: 'tls',
  from_email: '',
  from_name: '',
  isEnabled: false,
  ...over
});

/** A complete configuration, as a working install would have. */
const configured = (over: Record<string, unknown> = {}) => formState({
  provider: 'gmail',
  smtp_host: 'smtp.gmail.com',
  smtp_user: 'billing@example.com',
  smtp_password: 'app-password',
  from_email: 'billing@example.com',
  from_name: 'Slimbooks',
  isEnabled: true,
  ...over
});

const renderTab = (settings: Record<string, unknown>, isLoaded = true) => {
  current = settings;
  useEmailSettings.mockReturnValue({
    settings, setSettings, saveSettings,
    isLoading: false, isSaving: false, isLoaded, error: null
  });
  return render(<EmailSettings />);
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  useAuth.mockReturnValue({ user: { email: 'admin@example.com', name: 'Ada Lovelace' } });
  testConnection.mockResolvedValue({ success: true, message: 'SMTP connection successful' });
  sendTestEmail.mockResolvedValue({ success: true, message: 'sent' });
});

afterEach(() => vi.restoreAllMocks());

describe('layout', () => {
  it('puts the sender fields on the tab, separate from the server details', () => {
    renderTab(configured());

    expect(screen.getByLabelText(/from email/i)).toBeTruthy();
    expect(screen.getByLabelText(/from name/i)).toBeTruthy();
  });

  it('offers a provider dropdown rather than asking for a hostname first', () => {
    renderTab(formState());

    expect(screen.getByLabelText(/^provider$/i)).toBeTruthy();
  });

  it('keeps the credentials fields available', () => {
    renderTab(configured());

    expect(screen.getByLabelText(/username/i)).toBeTruthy();
    expect(screen.getByLabelText(/^password/i)).toBeTruthy();
  });
});

describe('the provider dropdown', () => {
  it('sets host, port and encryption together', async () => {
    // These three have to agree; choosing them separately is how people end up
    // with 465 and STARTTLS and an error that reads like a bad password.
    const user = userEvent.setup();
    renderTab(formState());

    await user.selectOptions(screen.getByLabelText(/^provider$/i), 'yahoo');

    expect(current).toMatchObject({
      provider: 'yahoo',
      smtp_host: 'smtp.mail.yahoo.com',
      smtp_port: 465,
      smtp_security: 'ssl'
    });
  });

  it('shows what the chosen provider resolved to', () => {
    renderTab(configured());

    expect(screen.getByText(/smtp\.gmail\.com/)).toBeTruthy();
  });

  it('warns about the providers that reject an account password', () => {
    renderTab(configured());

    expect(screen.getByText(/app password/i)).toBeTruthy();
  });

  it('hides the server fields while a known provider supplies them', () => {
    renderTab(configured());

    expect(screen.queryByLabelText(/smtp host/i)).toBeNull();
    expect(screen.queryByLabelText(/smtp port/i)).toBeNull();
  });

  it('reveals the server fields for a custom provider', async () => {
    const user = userEvent.setup();
    renderTab(formState());

    await user.selectOptions(screen.getByLabelText(/^provider$/i), 'custom');
    renderTab({ ...formState(), provider: 'custom' });

    expect(screen.getByLabelText(/smtp host/i)).toBeTruthy();
    expect(screen.getByLabelText(/smtp port/i)).toBeTruthy();
    expect(screen.getByLabelText(/encryption/i)).toBeTruthy();
  });

  it('leaves a custom configuration alone rather than overwriting it', async () => {
    const user = userEvent.setup();
    renderTab(formState({
      provider: 'gmail', smtp_host: 'smtp.gmail.com', smtp_port: 587
    }));

    await user.selectOptions(screen.getByLabelText(/^provider$/i), 'custom');

    expect(current).toMatchObject({ provider: 'custom', smtp_host: 'smtp.gmail.com' });
  });

  it('recognises a stored configuration as the provider it came from', () => {
    // The dropdown reflects what is stored even when the provider id was never
    // saved, so an existing install does not show "select a provider".
    renderTab(configured({ provider: '' }));

    expect((screen.getByLabelText(/^provider$/i) as HTMLSelectElement).value).toBe('gmail');
  });

  it('calls a hand-edited host custom rather than claiming a provider', () => {
    renderTab(configured({ provider: '', smtp_host: 'mail.mycompany.com' }));

    expect((screen.getByLabelText(/^provider$/i) as HTMLSelectElement).value).toBe('custom');
  });
});

describe('the sender prefill', () => {
  it('suggests the signed-in user on a blank configuration', async () => {
    renderTab(formState());

    await waitFor(() => expect(current).toMatchObject({
      from_email: 'admin@example.com',
      from_name: 'Ada Lovelace'
    }));
  });

  it('does not overwrite a stored sender', async () => {
    // Replacing the company's billing address with whoever happens to be
    // signed in would be worse than not prefilling at all.
    renderTab(configured({ from_email: 'billing@company.com', from_name: 'Company' }));

    await waitFor(() => expect(setSettings).toHaveBeenCalled());
    expect(current).toMatchObject({ from_email: 'billing@company.com' });
  });

  it('waits until the stored settings have loaded', () => {
    renderTab(formState(), false);

    expect(setSettings).not.toHaveBeenCalled();
  });

  it('does nothing when nobody is signed in', () => {
    useAuth.mockReturnValue({ user: null });

    renderTab(formState());

    expect(setSettings).not.toHaveBeenCalled();
  });
});

describe('testing the connection', () => {
  it('is available once the required fields are filled in', () => {
    renderTab(configured());

    expect((screen.getByRole('button', { name: /test connection/i }) as HTMLButtonElement).disabled)
      .toBe(false);
  });

  it('does not require the enable switch first', () => {
    // Refusing to test until sending is switched on forces you to switch on a
    // configuration you have not been allowed to check.
    renderTab(configured({ isEnabled: false }));

    expect((screen.getByRole('button', { name: /test connection/i }) as HTMLButtonElement).disabled)
      .toBe(false);
  });

  it('stays unavailable while a required field is blank', () => {
    renderTab(configured({ smtp_password: '' }));

    expect((screen.getByRole('button', { name: /test connection/i }) as HTMLButtonElement).disabled)
      .toBe(true);
  });

  it('saves before testing, so the result describes what is on screen', async () => {
    const user = userEvent.setup();
    renderTab(configured());

    await user.click(screen.getByRole('button', { name: /test connection/i }));

    await waitFor(() => expect(saveSettings).toHaveBeenCalled());
    expect(testConnection).toHaveBeenCalled();
  });

  it('reports a refused connection with the reason', async () => {
    const user = userEvent.setup();
    testConnection.mockResolvedValue({ success: false, message: '535 authentication failed' });
    renderTab(configured());

    await user.click(screen.getByRole('button', { name: /test connection/i }));

    expect(await screen.findByText(/535 authentication failed/)).toBeTruthy();
  });

  it('reports a successful connection', async () => {
    const user = userEvent.setup();
    renderTab(configured());

    await user.click(screen.getByRole('button', { name: /test connection/i }));

    expect(await screen.findByText(/connection successful/i)).toBeTruthy();
  });
});

describe('sending a test email', () => {
  it('waits for a successful connection first', () => {
    renderTab(configured());

    expect((screen.getByRole('button', { name: /send test email/i }) as HTMLButtonElement).disabled)
      .toBe(true);
  });

  it('sends once the connection has been proved and sending is on', async () => {
    const user = userEvent.setup();
    renderTab(configured());

    await user.click(screen.getByRole('button', { name: /test connection/i }));
    await screen.findByText(/connection successful/i);
    await user.click(screen.getByRole('button', { name: /send test email/i }));

    expect(sendTestEmail).toHaveBeenCalled();
  });

  it('stays unavailable while sending is switched off', async () => {
    const user = userEvent.setup();
    renderTab(configured({ isEnabled: false }));

    await user.click(screen.getByRole('button', { name: /test connection/i }));
    await screen.findByText(/connection successful/i);

    expect((screen.getByRole('button', { name: /send test email/i }) as HTMLButtonElement).disabled)
      .toBe(true);
  });
});

describe('the password field', () => {
  it('is masked by default', () => {
    renderTab(configured());

    expect((screen.getByLabelText(/^password/i) as HTMLInputElement).type).toBe('password');
  });

  it('can be revealed', async () => {
    const user = userEvent.setup();
    renderTab(configured());

    await user.click(screen.getByLabelText(/show password/i));

    expect((screen.getByLabelText(/^password/i) as HTMLInputElement).type).toBe('text');
  });
});
