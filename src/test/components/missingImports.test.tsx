/**
 * Regression tests for symbols referenced but never imported/defined.
 *
 * The frontend was never type-checked (the root tsconfig had `"files": []`, so
 * `tsc --noEmit` compiled zero files), which let unresolved identifiers reach
 * runtime. Each one throws a ReferenceError the moment its code path executes.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const { testConnection, getEmailSettings } = vi.hoisted(() => ({
  testConnection: vi.fn(),
  getEmailSettings: vi.fn()
}));

vi.mock('@/services/email.svc', () => ({
  EmailService: {
    getInstance: () => ({ testConnection, sendEmail: vi.fn() })
  }
}));

vi.mock('@/hooks/useSettings.hook', () => ({
  useEmailSettings: getEmailSettings
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() }
}));

import { toast } from 'sonner';
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

  it('reports missing required fields through the toast module', async () => {
    // `toast` was referenced but never imported, so this handler threw
    // ReferenceError instead of surfacing the validation message.
    render(<EmailSettings />);

    fireEvent.click(screen.getByRole('button', { name: /test connection/i }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'Please fill in required fields before testing'
      )
    );
    // The guard short-circuits before any connection attempt is made.
    expect(testConnection).not.toHaveBeenCalled();
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
