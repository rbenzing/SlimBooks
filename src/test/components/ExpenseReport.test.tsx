/**
 * ExpenseReport rendering tests.
 *
 * The report rendered an "Expenses by Status" breakdown via
 * `Object.entries(reportData.expensesByStatus)`, but the expenses table has no
 * `status` column and `/api/reports/generate/expense` returns only
 * `{ expenses, expensesByCategory, totalAmount, totalCount }`. The missing key
 * made `Object.entries(undefined)` throw
 * "Cannot convert undefined or null to object" and blanked the page.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const { authenticatedFetch } = vi.hoisted(() => ({ authenticatedFetch: vi.fn() }));

vi.mock('@/utils/api', () => ({ authenticatedFetch, API_BASE: '/api' }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { ExpenseReport } from '@/components/reports/ExpenseReport';

/** Exactly what the server sends — note the absence of `expensesByStatus`. */
const serverPayload = {
  expenses: [
    { id: 1, date: '2026-07-01', vendor: 'Acme Supplies', category: 'Office', amount: 125.5 },
    { id: 2, date: '2026-07-02', vendor: 'Cloud Host', category: 'Software', amount: 40 }
  ],
  expensesByCategory: { Office: 125.5, Software: 40 },
  totalAmount: 165.5,
  totalCount: 2
};

const renderReport = () =>
  render(<ExpenseReport onBack={vi.fn()} onSave={vi.fn()} />);

beforeEach(() => {
  vi.clearAllMocks();
  authenticatedFetch.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ success: true, data: serverPayload })
  } as Response);
});

describe('ExpenseReport', () => {
  it('renders the report from the payload the API actually returns', async () => {
    renderReport();

    await waitFor(() => expect(authenticatedFetch).toHaveBeenCalled());
    expect(await screen.findByText('Expenses by Category')).toBeInTheDocument();
  });

  it('renders every category returned by the API', async () => {
    renderReport();

    // Categories appear in the breakdown card and again in the expense table.
    expect((await screen.findAllByText('Office')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Software').length).toBeGreaterThan(0);
  });

  it('breaks down by vendor, grouped from the returned expenses', async () => {
    renderReport();

    expect(await screen.findByText('Expenses by Vendor')).toBeInTheDocument();
    expect(screen.getAllByText('Acme Supplies').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Cloud Host').length).toBeGreaterThan(0);
  });

  it('renders the approval-status breakdown', async () => {
    authenticatedFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: { ...serverPayload, expensesByStatus: { pending: 125.5, approved: 40 } }
      })
    } as Response);

    renderReport();

    expect(await screen.findByText('Expenses by Status')).toBeInTheDocument();
    expect(screen.getByText('pending')).toBeInTheDocument();
    expect(screen.getByText('approved')).toBeInTheDocument();
  });

  it('survives a payload with no status breakdown', async () => {
    // Guards the original crash: Object.entries(undefined) threw
    // "Cannot convert undefined or null to object" and blanked the page.
    renderReport();

    expect(await screen.findByText('Expenses by Category')).toBeInTheDocument();
  });

  it('survives an empty result set without throwing', async () => {
    authenticatedFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: { expenses: [], expensesByCategory: {}, totalAmount: 0, totalCount: 0 }
      })
    } as Response);

    renderReport();

    expect(await screen.findByText('Expenses by Category')).toBeInTheDocument();
  });
});
