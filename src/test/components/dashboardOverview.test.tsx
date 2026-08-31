/**
 * DashboardOverview behaviour: the chart must plot the same fiscal span the
 * stat cards total (Defect 2), and choosing "Custom Range" must give the
 * viewer somewhere to enter one (Defect 3) — the plain <select> used to
 * offer the option with no date inputs anywhere on the page.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type * as UseSettingsHook from '@/hooks/useSettings.hook';

const { authenticatedFetch } = vi.hoisted(() => ({ authenticatedFetch: vi.fn() }));
vi.mock('@/utils/api', () => ({ authenticatedFetch, API_BASE: '/api' }));

vi.mock('@/services/sqlite.svc', () => ({
  sqliteService: { isReady: () => true, getSetting: vi.fn().mockResolvedValue(null) }
}));

// Fiscal year starting in July makes a January-based chart visibly wrong.
vi.mock('@/hooks/useSettings.hook', async () => {
  const actual = await vi.importActual<typeof UseSettingsHook>('@/hooks/useSettings.hook');
  return {
    ...actual,
    useCompanySettings: () => ({
      settings: { fiscalYearStartMonth: 7, accountingMethod: 'accrual' },
      isLoading: false
    })
  };
});

const { dashboardChartSpy } = vi.hoisted(() => ({ dashboardChartSpy: vi.fn() }));
vi.mock('@/components/DashboardChart', () => ({
  default: (props: unknown) => {
    dashboardChartSpy(props);
    return <div data-testid="dashboard-chart" />;
  }
}));

import { DashboardOverview } from '@/components/DashboardOverview';

beforeEach(() => {
  vi.clearAllMocks();
  authenticatedFetch.mockImplementation((url: string) => {
    if (url.includes('/api/invoices')) {
      return Promise.resolve({ ok: true, json: async () => ({ data: { invoices: [] } }) });
    }
    if (url.includes('/api/clients')) {
      return Promise.resolve({ ok: true, json: async () => ({ data: [] }) });
    }
    if (url.includes('/api/expenses')) {
      return Promise.resolve({ ok: true, json: async () => ({ data: { data: [] } }) });
    }
    return Promise.resolve({ ok: true, json: async () => ({}) });
  });
});

describe('DashboardOverview and the chart agree on a fiscal span', () => {
  it('passes the chart the same fiscal-year-to-date range the stat cards use', async () => {
    render(<DashboardOverview />);

    await waitFor(() => expect(dashboardChartSpy).toHaveBeenCalled());

    const props = dashboardChartSpy.mock.calls[dashboardChartSpy.mock.calls.length - 1][0] as {
      dateRange?: { start: Date; end: Date };
    };

    // Fiscal year starts 1 July, whatever the current year — a January start
    // would mean the chart is still walking the calendar year.
    expect(props.dateRange?.start.getMonth()).toBe(6);
    expect(props.dateRange?.start.getDate()).toBe(1);
  });
});

describe('DashboardOverview custom range', () => {
  it('offers a way to enter a range when Custom Range is chosen', async () => {
    render(<DashboardOverview />);
    await waitFor(() => expect(authenticatedFetch).toHaveBeenCalled());

    expect(document.querySelectorAll('input[type="date"]')).toHaveLength(0);

    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'custom' } });

    await waitFor(() => {
      expect(document.querySelectorAll('input[type="date"]')).toHaveLength(2);
    });
  });
});
