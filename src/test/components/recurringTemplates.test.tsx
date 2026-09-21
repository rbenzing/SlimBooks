/**
 * Recurring invoice template routing tests.
 *
 * Two defects covered here:
 *
 * 1. Wrong table. `/api/templates` is backed by `invoice_design_templates`;
 *    recurring templates live in `recurring_invoice_templates` behind
 *    `/api/recurring-templates`. TemplatesTab *listed* from the recurring
 *    endpoint but created, updated and deleted through the design-template one,
 *    so saving or deleting a recurring template silently hit an unrelated
 *    design template that happened to share the numeric id.
 *
 * 2. `recurring_invoice_templates` has no `status` column — it has `is_active`.
 *    The editor carried a write-only `status` field that never round-tripped,
 *    and hardcoded `is_active` on save, which re-activated paused templates.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const { authenticatedFetch } = vi.hoisted(() => ({ authenticatedFetch: vi.fn() }));

vi.mock('@/utils/api', () => ({ authenticatedFetch }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

import { TemplatesTab } from '@/components/invoices/TemplatesTab';
import { CreateRecurringInvoicePage } from '@/components/invoices/CreateRecurringInvoicePage';

const client = {
  id: 7,
  name: 'Acme Corporation',
  email: 'contact@acme.com',
  created_at: Date.parse('2026-07-25'),
  updated_at: Date.parse('2026-07-25')
};

const recurringTemplate = {
  id: 3,
  name: 'Monthly retainer',
  client_id: 7,
  amount: 1200,
  frequency: 'monthly',
  payment_terms: 'net_30',
  next_invoice_date: '2026-09-01',
  is_active: 0,
  line_items: JSON.stringify([
    { id: '1', description: 'Retainer', quantity: 1, unit_price: 1200, total: 1200 }
  ]),
  tax_amount: 0,
  shipping_amount: 0,
  notes: 'Thanks!',
  client_name: 'Acme Corporation',
  client_email: 'contact@acme.com'
};

const ok = (body: unknown): Response =>
  ({ ok: true, status: 200, json: async () => body }) as Response;

/** Every URL the components request, in call order. */
const requestedUrls = () => authenticatedFetch.mock.calls.map((c) => c[0] as string);

const callFor = (method: string, match: RegExp) =>
  authenticatedFetch.mock.calls.find(
    ([url, init]) => match.test(url as string) && (init as RequestInit | undefined)?.method === method
  );

beforeEach(() => {
  vi.clearAllMocks();
  authenticatedFetch.mockImplementation(async (url: string) => {
    if (url.startsWith('/api/recurring-templates/active')) return ok({ success: true, data: [recurringTemplate] });
    if (url.startsWith('/api/recurring-templates')) return ok({ success: true, data: recurringTemplate });
    // Deliberately slow. The editor loads the template first and the client
    // second, and the save button stays disabled until the client lands. With
    // an instant mock both resolve in the same flush, so a test that clicks
    // too early still passes here and fails only under a loaded full run.
    // The delay makes that ordering explicit, so the race is caught in
    // isolation rather than at random in CI.
    if (url.startsWith('/api/clients/')) {
      await new Promise(resolve => setTimeout(resolve, 50));
      return ok({ success: true, data: client });
    }
    if (url === '/api/clients') return ok({ success: true, data: [client] });
    if (url.startsWith('/api/templates')) return ok({ success: true, data: null });
    return ok({ success: true, data: null });
  });
});

describe('TemplatesTab', () => {
  const renderTab = () =>
    render(
      <MemoryRouter>
        <TemplatesTab />
      </MemoryRouter>
    );

  it('deletes through the recurring-template endpoint, not the design-template one', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderTab();
    await screen.findByText('Monthly retainer');

    fireEvent.click(screen.getAllByRole('button', { name: 'Delete Template' })[0]);

    await waitFor(() => expect(callFor('DELETE', /recurring-templates/)).toBeTruthy());
    // A DELETE to /api/templates/:id would destroy an unrelated design template.
    expect(callFor('DELETE', /^\/api\/templates\//)).toBeUndefined();

    confirmSpy.mockRestore();
  });

  it('never addresses the design-template endpoint at all', async () => {
    renderTab();
    await screen.findByText('Monthly retainer');

    expect(requestedUrls().some((url) => /^\/api\/templates(\/|$)/.test(url))).toBe(false);
  });
});

describe('CreateRecurringInvoicePage', () => {
  const renderEditor = () =>
    render(
      <MemoryRouter initialEntries={['/recurring-invoices/edit/3']}>
        <Routes>
          <Route
            path="/recurring-invoices/edit/:id"
            element={<CreateRecurringInvoicePage onBack={vi.fn()} />}
          />
        </Routes>
      </MemoryRouter>
    );

  /**
   * Clicks Save once the editor is genuinely ready to save.
   *
   * The client arrives in a *second* request, issued after the template loads,
   * and `isValidForSave` gates the button on it. `findByDisplayValue` resolves
   * as soon as the name renders — which happens before that client request is
   * awaited — so clicking at that moment hits a disabled button, React
   * swallows the event, and the PUT is never issued. The wait that follows
   * then polls for a request that a lost click can no longer produce, so a
   * longer timeout does not help; the click has to happen after the button is
   * enabled. Under a loaded full-suite run this raced and failed these three
   * tests at random.
   */
  const clickSave = async () => {
    const save = await screen.findByRole('button', { name: /update template|save template/i });
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);
  };

  it('loads the template from the recurring-template endpoint', async () => {
    renderEditor();

    await waitFor(() =>
      expect(requestedUrls()).toContain('/api/recurring-templates/3')
    );
    expect(requestedUrls()).not.toContain('/api/templates/3');
  });

  it('hydrates the editor from the recurring template record', async () => {
    renderEditor();

    expect(await screen.findByDisplayValue('Monthly retainer')).toBeInTheDocument();
  });

  it('saves through the recurring-template endpoint', async () => {
    renderEditor();
    await screen.findByDisplayValue('Monthly retainer');

    await clickSave();

    await waitFor(() => expect(callFor('PUT', /recurring-templates\/3/)).toBeTruthy());
    expect(callFor('PUT', /^\/api\/templates\//)).toBeUndefined();
  });

  it('sends is_active as a boolean and no phantom status field', async () => {
    renderEditor();
    await screen.findByDisplayValue('Monthly retainer');

    await clickSave();

    await waitFor(() => expect(callFor('PUT', /recurring-templates\/3/)).toBeTruthy());

    const [, init] = callFor('PUT', /recurring-templates\/3/)!;
    const { templateData } = JSON.parse((init as RequestInit).body as string);

    expect(templateData).not.toHaveProperty('status');
    expect(typeof templateData.is_active).toBe('boolean');
  });

  it('preserves a paused template instead of silently re-activating it', async () => {
    // The stored template has is_active: 0. Saving an unrelated edit must not
    // turn the schedule back on.
    renderEditor();
    await screen.findByDisplayValue('Monthly retainer');

    await clickSave();

    await waitFor(() => expect(callFor('PUT', /recurring-templates\/3/)).toBeTruthy());

    const [, init] = callFor('PUT', /recurring-templates\/3/)!;
    const { templateData } = JSON.parse((init as RequestInit).body as string);

    expect(templateData.is_active).toBe(false);
  });
});
