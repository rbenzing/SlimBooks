import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import type * as UseSettingsHook from '@/hooks/useSettings.hook';

const { useCompanySettings } = vi.hoisted(() => ({ useCompanySettings: vi.fn() }));
vi.mock('@/hooks/useSettings.hook', async () => {
  const actual = await vi.importActual<typeof UseSettingsHook>('@/hooks/useSettings.hook');
  return { ...actual, useCompanySettings };
});

// Imported after the mock so useFiscalSettings picks up the mocked
// useCompanySettings while keeping the real toFiscalMonth/toAccountingMethod.
import { useFiscalSettings } from '@/hooks/useFiscalSettings.hook';

const companySettings = (overrides: Record<string, unknown> = {}, isLoading = false) => ({
  settings: {
    companyName: '', ownerName: '', email: '', phone: '', address: '',
    city: '', state: '', zipCode: '', brandingImage: '',
    fiscalYearStartMonth: 1, accountingMethod: 'accrual',
    ...overrides
  },
  isLoading
});

describe('useFiscalSettings', () => {
  beforeEach(() => useCompanySettings.mockReset());

  it('reads fiscal fields off the same company-settings blob useCompanySettings returns', () => {
    useCompanySettings.mockReturnValue(companySettings());
    const { result } = renderHook(() => useFiscalSettings());
    expect(useCompanySettings).toHaveBeenCalled();
    expect(result.current.fiscalYearStartMonth).toBe(1);
    expect(result.current.accountingMethod).toBe('accrual');
    expect(result.current.isLoading).toBe(false);
  });

  it('reads a stored July fiscal year on a cash basis', () => {
    useCompanySettings.mockReturnValue(
      companySettings({ fiscalYearStartMonth: 7, accountingMethod: 'cash' })
    );
    const { result } = renderHook(() => useFiscalSettings());
    expect(result.current.fiscalYearStartMonth).toBe(7);
    expect(result.current.accountingMethod).toBe('cash');
  });

  it('coerces a numeric string, because the blob round-trips through JSON', () => {
    useCompanySettings.mockReturnValue(
      companySettings({ fiscalYearStartMonth: '10' })
    );
    const { result } = renderHook(() => useFiscalSettings());
    expect(result.current.fiscalYearStartMonth).toBe(10);
  });

  it('falls back to January for an out-of-range month rather than producing a broken year', () => {
    useCompanySettings.mockReturnValue(
      companySettings({ fiscalYearStartMonth: 13 })
    );
    const { result } = renderHook(() => useFiscalSettings());
    expect(result.current.fiscalYearStartMonth).toBe(1);
  });

  it('falls back to accrual for an unrecognised accounting method', () => {
    useCompanySettings.mockReturnValue(
      companySettings({ accountingMethod: 'hybrid' })
    );
    const { result } = renderHook(() => useFiscalSettings());
    expect(result.current.accountingMethod).toBe('accrual');
  });

  it('reports isLoading exactly as useCompanySettings reports it', () => {
    useCompanySettings.mockReturnValue(companySettings({}, true));
    const { result } = renderHook(() => useFiscalSettings());
    expect(result.current.isLoading).toBe(true);
  });

  it('defaults to a January fiscal year and accrual basis when the stored blob predates these fields', () => {
    // An already-saved company_settings blob from before this change has no
    // fiscalYearStartMonth/accountingMethod keys at all — not `undefined`
    // written explicitly, simply absent.
    useCompanySettings.mockReturnValue({
      settings: { companyName: 'Acme', ownerName: '', email: '', phone: '', address: '', city: '', state: '', zipCode: '', brandingImage: '' },
      isLoading: false
    });
    const { result } = renderHook(() => useFiscalSettings());
    expect(result.current.fiscalYearStartMonth).toBe(1);
    expect(result.current.accountingMethod).toBe('accrual');
  });
});
