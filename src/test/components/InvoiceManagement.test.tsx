/**
 * InvoiceManagement tab routing tests.
 *
 * This screen used to carry a third `activeTab === 'edit'` branch that rendered
 * <EditInvoicePage /> when the pathname contained '/invoices/edit/'. The router
 * sends that path straight to EditInvoicePage, so the branch was unreachable —
 * and had it ever run it would have mounted the editor with no `:id` param,
 * leaving it stuck on "Loading..." forever.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/components/invoices/InvoicesTab', () => ({
  InvoicesTab: () => <div data-testid="invoices-tab" />
}));

vi.mock('@/components/invoices/TemplatesTab', () => ({
  TemplatesTab: () => <div data-testid="templates-tab" />
}));

import { InvoiceManagement } from '@/components/InvoiceManagement';

const renderAt = (entry: string) =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <InvoiceManagement />
    </MemoryRouter>
  );

describe('InvoiceManagement', () => {
  it('shows the invoice list by default', () => {
    renderAt('/invoices');

    expect(screen.getByTestId('invoices-tab')).toBeInTheDocument();
    expect(screen.queryByTestId('templates-tab')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Sent Invoices' })).toBeInTheDocument();
  });

  it('shows recurring templates for the #templates hash', () => {
    renderAt('/invoices#templates');

    expect(screen.getByTestId('templates-tab')).toBeInTheDocument();
    expect(screen.queryByTestId('invoices-tab')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Recurring Templates' })).toBeInTheDocument();
  });

  it('never mounts the invoice editor, even on an edit pathname', () => {
    // The editor owns /invoices/edit/:id via the router; this screen must not
    // try to render it without a route param.
    renderAt('/invoices/edit/1');

    expect(screen.queryByText(/loading\.\.\./i)).not.toBeInTheDocument();
    expect(screen.queryByText(/invoice not found/i)).not.toBeInTheDocument();
    expect(screen.getByTestId('invoices-tab')).toBeInTheDocument();
  });

  it('always offers both tabs', () => {
    renderAt('/invoices');

    expect(screen.getByRole('button', { name: 'Sent Invoices' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Recurring Templates' })).toBeInTheDocument();
  });

  it('offers the action button matching the active tab', () => {
    const { unmount } = renderAt('/invoices');
    expect(screen.getByRole('button', { name: /create invoice/i })).toBeInTheDocument();
    unmount();

    renderAt('/invoices#templates');
    expect(screen.getByRole('button', { name: /create template/i })).toBeInTheDocument();
  });

  it('switches tabs without throwing', () => {
    renderAt('/invoices');

    expect(() =>
      fireEvent.click(screen.getByRole('button', { name: 'Recurring Templates' }))
    ).not.toThrow();
  });
});
