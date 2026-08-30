/**
 * Regression tests for symbols referenced but never imported/defined.
 *
 * The frontend was never type-checked (the root tsconfig had `"files": []`, so
 * `tsc --noEmit` compiled zero files), which let unresolved identifiers reach
 * runtime. Each one throws a ReferenceError the moment its code path executes.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import type * as UseSettingsHook from '@/hooks/useSettings.hook';

const { testConnection, getEmailSettings } = vi.hoisted(() => ({
  testConnection: vi.fn(),
  getEmailSettings: vi.fn()
}));

vi.mock('@/services/email.svc', () => ({
  emailService: { testConnection, sendTestEmail: vi.fn(), sendEmail: vi.fn() },
  EmailService: {
    getInstance: () => ({ testConnection, sendEmail: vi.fn() })
  }
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { email: 'admin@example.com', name: 'Admin' } })
}));

vi.mock('@/hooks/useSettings.hook', async () => {
  const actual = await vi.importActual<typeof UseSettingsHook>('@/hooks/useSettings.hook');
  return {
    ...actual,
    useEmailSettings: getEmailSettings,
    useCompanySettings: () => ({
      settings: { fiscalYearStartMonth: 1, accountingMethod: 'accrual' },
      isLoading: false
    })
  };
});

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() }
}));

import { EmailSettings } from '@/components/settings/EmailSettings';
import { DateRangeFilter } from '@/components/ui/DateRangeFilter';

describe('EmailSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getEmailSettings.mockReturnValue({
      settings: { isEnabled: true, smtp_host: '', smtp_user: '', from_email: '' },
      setSettings: vi.fn(),
      saveSettings: vi.fn().mockResolvedValue(undefined),
      isLoading: false,
      isSaving: false,
      isLoaded: true,
      error: null
    });
  });

  it('cannot attempt a connection before the required fields are filled in', async () => {
    // The guard used to be a click handler that toasted — and referenced a
    // `toast` it never imported, so it threw ReferenceError instead of showing
    // the message. It is now the button's own disabled state, which cannot
    // throw at all.
    render(<EmailSettings />);

    const button = screen.getByRole('button', { name: /test connection/i }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);

    fireEvent.click(button);

    await waitFor(() => expect(testConnection).not.toHaveBeenCalled());
  });

  it('allows a connection test once the required fields are present', async () => {
    getEmailSettings.mockReturnValue({
      settings: {
        provider: 'gmail', isEnabled: true, smtp_host: 'smtp.gmail.com', smtp_port: 587,
        smtp_security: 'tls', smtp_user: 'a@b.co', smtp_password: 'pw',
        from_email: 'a@b.co', from_name: 'Slimbooks'
      },
      setSettings: vi.fn(),
      saveSettings: vi.fn().mockResolvedValue(undefined),
      isLoading: false, isSaving: false, isLoaded: true, error: null
    });

    render(<EmailSettings />);

    expect((screen.getByRole('button', { name: /test connection/i }) as HTMLButtonElement).disabled)
      .toBe(false);
  });
});

describe('DateRangeFilter', () => {
  it('renders a custom range label without throwing a ReferenceError', () => {
    const customRange = {
      start: new Date(2026, 0, 1),
      end: new Date(2026, 0, 31)
    };

    expect(() =>
      render(
        <DateRangeFilter value="custom" customRange={customRange} onChange={vi.fn()} />
      )
    ).not.toThrow();
  });

  it('falls back to a selectable period when a custom range is cleared', () => {
    const onChange = vi.fn();
    const customRange = {
      start: new Date(2026, 0, 1),
      end: new Date(2026, 0, 31)
    };

    render(<DateRangeFilter value="custom" customRange={customRange} onChange={onChange} />);

    const clear = document.querySelector<HTMLButtonElement>('button[title="Clear custom range"]');
    expect(clear).not.toBeNull();
    fireEvent.click(clear!);

    // 'this-month' is not one of the values the period dropdown offers, so
    // clearing used to leave the filter on a period that matches nothing.
    const offered = Array.from(document.querySelectorAll('option')).map((o) => o.value);
    expect(onChange).toHaveBeenCalled();
    expect(offered).toContain(onChange.mock.calls[0][0]);
  });
});
