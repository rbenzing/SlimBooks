/**
 * EditInvoicePage Component Tests
 *
 * Covers the load path that previously rendered "Invoice not found" for every
 * invoice, plus the field-hydration bugs that survive that fix:
 *  - `authenticatedFetch` resolves to a `Response`, so the body must be read
 *    with `.json()`; reading `.data` off the Response yields `undefined`.
 *  - `due_date` arrives as a full ISO-8601 timestamp but `<input type="date">`
 *    only accepts `yyyy-MM-dd`.
 *  - A freshly loaded form must not report itself as dirty.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Invoice, Client } from '@/types';

const { authenticatedFetch } = vi.hoisted(() => ({
  authenticatedFetch: vi.fn()
}));

vi.mock('@/utils/api', () => ({ authenticatedFetch }));

vi.mock('@/services/sqlite.svc', () => ({
  sqliteService: {
    isReady: () => true,
    getSetting: vi.fn().mockResolvedValue(null)
  }
}));

vi.mock('@/utils/emailConfig.util', () => ({
  getEmailConfigurationStatus: vi.fn().mockResolvedValue({
    canSendEmails: false,
    isConfigured: false
  })
}));

vi.mock('@/services/pdf.svc', () => ({
  pdfService: { downloadInvoicePDF: vi.fn() }
}));

vi.mock('@/services/invoices.svc', () => ({
  invoiceService: {
    updateEmailStatus: vi.fn(),
    sendInvoiceEmail: vi.fn(),
    markInvoiceAsSent: vi.fn()
  }
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() }
}));

import { EditInvoicePage } from '@/components/invoices/EditInvoicePage';

const client: Client = {
  id: 1,
  name: 'Acme Corporation',
  email: 'contact@acme.com',
  phone: '(555) 123-4567',
  company: 'Acme Corporation',
  created_at: '2026-07-25',
  updated_at: '2026-07-25'
};

const invoice = {
  id: 1,
  invoice_number: 'INV-001',
  client_id: 1,
  amount: 1500,
  tax_amount: 120,
  total_amount: 1620,
  status: 'sent',
  // The API returns a full ISO-8601 timestamp, not a calendar date.
  due_date: '2026-08-24T21:03:26.651Z',
  notes: 'Sample invoice for development',
  line_items: JSON.stringify([
    { id: 1, description: 'Consulting', quantity: 10, unit_price: 150, total: 1500 }
  ])
} as unknown as Invoice;

/** Minimal stand-in for the `Response` that `authenticatedFetch` resolves to. */
const jsonResponse = (body: unknown): Response =>
  ({ ok: true, status: 200, json: async () => body }) as Response;

const mockApi = (overrides: Record<string, unknown> = {}) => {
  authenticatedFetch.mockImplementation(async (url: string) => {
    if (url.startsWith('/api/invoices/')) {
      return jsonResponse({ success: true, data: { ...invoice, ...overrides } });
    }
    if (url === '/api/clients') {
      return jsonResponse({ success: true, data: [client] });
    }
    return jsonResponse({ success: true, data: null });
  });
};

const renderPage = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/invoices/edit/1']}>
        <Routes>
          <Route path="/invoices/edit/:id" element={<EditInvoicePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
};

describe('EditInvoicePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi();
  });

  describe('Loading the invoice', () => {
    it('renders the invoice instead of "Invoice not found"', async () => {
      renderPage();

      expect(await screen.findByDisplayValue('INV-001')).toBeInTheDocument();
      expect(screen.queryByText(/invoice not found/i)).not.toBeInTheDocument();
    });

    it('reads the response body with .json() rather than a .data property', async () => {
      // Guards the original defect: `authenticatedFetch` resolves to a Response,
      // which has no `.data`, so `.data` was always undefined and the component
      // fell through to the not-found branch.
      const json = vi.fn().mockResolvedValue({ success: true, data: invoice });
      authenticatedFetch.mockImplementation(async (url: string) =>
        url.startsWith('/api/invoices/')
          ? ({ ok: true, status: 200, json } as unknown as Response)
          : jsonResponse({ success: true, data: [client] })
      );

      renderPage();

      await screen.findByDisplayValue('INV-001');
      expect(json).toHaveBeenCalled();
    });

    it('shows "Invoice not found" when the API returns no record', async () => {
      authenticatedFetch.mockResolvedValue(jsonResponse({ success: true, data: null }));

      renderPage();

      expect(await screen.findByText(/invoice not found/i)).toBeInTheDocument();
    });

    it('shows "Invoice not found" when the invoice request fails', async () => {
      authenticatedFetch.mockRejectedValue(new Error('HTTP 404: Not Found'));

      renderPage();

      expect(await screen.findByText(/invoice not found/i)).toBeInTheDocument();
    });
  });

  describe('Field hydration', () => {
    it('populates the due date input from an ISO-8601 timestamp', async () => {
      renderPage();
      await screen.findByDisplayValue('INV-001');

      const dueDate = document.querySelector<HTMLInputElement>('input[type="date"]');
      expect(dueDate).not.toBeNull();
      expect(dueDate!.value).toBe('2026-08-24');
    });

    it('leaves the due date input empty when the record has no due date', async () => {
      mockApi({ due_date: null });

      renderPage();
      await screen.findByDisplayValue('INV-001');

      const dueDate = document.querySelector<HTMLInputElement>('input[type="date"]');
      expect(dueDate!.value).toBe('');
    });

    it('hydrates line items and derived totals from the record', async () => {
      renderPage();

      expect(await screen.findByDisplayValue('Consulting')).toBeInTheDocument();
      expect(screen.getAllByText('$1,500.00').length).toBeGreaterThan(0);
    });

    it('reconstructs a line item for a legacy invoice that has none', async () => {
      // Invoices predating the line_items column carry only description +
      // amount. Falling back to a blank row made the editor show a $0.00 total
      // for a $1,500 invoice, and saving wrote that 0 back over the real value.
      mockApi({ line_items: null, items: null, description: 'Consulting services' });

      renderPage();

      expect(await screen.findByDisplayValue('Consulting services')).toBeInTheDocument();

      // Line amount, subtotal, invoice total and amount due should all carry the
      // record's amount. (Tax and shipping legitimately stay at $0.00.)
      expect(screen.getAllByText('$1,500.00').length).toBeGreaterThanOrEqual(3);
    });

    it('still shows one blank row when there is nothing to reconstruct from', async () => {
      mockApi({ line_items: null, items: null, description: null, amount: 0 });

      renderPage();
      await screen.findByDisplayValue('INV-001');

      expect(screen.getByPlaceholderText('Item description')).toHaveValue('');
    });

    it('selects the invoice client once clients have loaded', async () => {
      renderPage();

      expect(await screen.findByText('contact@acme.com')).toBeInTheDocument();
    });
  });

  describe('Dirty tracking', () => {
    it('does not mark a freshly loaded invoice as dirty', async () => {
      renderPage();
      await screen.findByDisplayValue('INV-001');

      // The save button is only enabled for a valid form; a pristine form must
      // not trip the unsaved-changes guard, so navigating away is unguarded.
      await waitFor(() => {
        const event = new Event('beforeunload', { cancelable: true });
        window.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(false);
      });
    });
  });
});
