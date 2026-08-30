import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useFiscalSettings } from '@/hooks/useFiscalSettings.hook';

const getAllSettings = vi.fn();
vi.mock('@/services/sqlite.svc', () => ({
  sqliteService: { getAllSettings: (...args: unknown[]) => getAllSettings(...args) }
}));

describe('useFiscalSettings', () => {
  beforeEach(() => getAllSettings.mockReset());

  it('defaults to a January fiscal year and accrual basis when nothing is stored', async () => {
    getAllSettings.mockResolvedValue({});
    const { result } = renderHook(() => useFiscalSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.fiscalYearStartMonth).toBe(1);
    expect(result.current.accountingMethod).toBe('accrual');
  });

  it('reads a stored July fiscal year', async () => {
    getAllSettings.mockResolvedValue({ fiscal_year_start_month: 7, accounting_method: 'cash' });
    const { result } = renderHook(() => useFiscalSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.fiscalYearStartMonth).toBe(7);
    expect(result.current.accountingMethod).toBe('cash');
  });

  it('coerces a numeric string, because settings values round-trip as text', async () => {
    getAllSettings.mockResolvedValue({ fiscal_year_start_month: '10' });
    const { result } = renderHook(() => useFiscalSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.fiscalYearStartMonth).toBe(10);
  });

  it('falls back to January for an out-of-range month rather than producing a broken year', async () => {
    getAllSettings.mockResolvedValue({ fiscal_year_start_month: 13 });
    const { result } = renderHook(() => useFiscalSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.fiscalYearStartMonth).toBe(1);
  });

  it('falls back to accrual for an unrecognised accounting method', async () => {
    getAllSettings.mockResolvedValue({ accounting_method: 'hybrid' });
    const { result } = renderHook(() => useFiscalSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.accountingMethod).toBe('accrual');
  });
});
