/**
 * ClientSelector Component Tests
 * Tests the client selection component (uses standard HTML select element)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ClientSelector } from '@/components/invoices/ClientSelector';
import type { Client } from '@/types';

describe('ClientSelector Component', () => {
  const mockClients: Client[] = [
    {
      id: 1,
      name: 'Acme Corp',
      email: 'contact@acme.com',
      phone: '555-0100',
      company: 'Acme Corporation',
      created_at: Date.parse('2026-02-16'),
      updated_at: Date.parse('2026-02-16')
    },
    {
      id: 2,
      name: 'Test Inc',
      email: 'info@test.com',
      phone: '555-0200',
      company: 'Test Incorporated',
      created_at: Date.parse('2026-02-16'),
      updated_at: Date.parse('2026-02-16')
    }
  ];

  const mockOnClientSelect = vi.fn();

  beforeEach(() => {
    mockOnClientSelect.mockClear();
  });

  describe('Rendering', () => {
    it('should render without crashing', () => {
      render(
        <ClientSelector
          clients={mockClients}
          selectedClient={null}
          onClientSelect={mockOnClientSelect}
        />
      );

      expect(screen.getByText(/bill to/i)).toBeInTheDocument();
    });

    it('should show select dropdown when no client selected', () => {
      render(
        <ClientSelector
          clients={mockClients}
          selectedClient={null}
          onClientSelect={mockOnClientSelect}
        />
      );

      const select = screen.getByRole('combobox');
      expect(select).toBeInTheDocument();
      expect(screen.getByText(/select a client/i)).toBeInTheDocument();
    });

    it('should display selected client info', () => {
      render(
        <ClientSelector
          clients={mockClients}
          selectedClient={mockClients[0]}
          onClientSelect={mockOnClientSelect}
        />
      );

      expect(screen.getByText('Acme Corp')).toBeInTheDocument();
      expect(screen.getByText('Acme Corporation')).toBeInTheDocument();
      expect(screen.getByText('contact@acme.com')).toBeInTheDocument();
    });

    it('should handle empty client list', () => {
      render(
        <ClientSelector
          clients={[]}
          selectedClient={null}
          onClientSelect={mockOnClientSelect}
        />
      );

      expect(screen.getByText(/no clients found/i)).toBeInTheDocument();
    });
  });

  describe('Selection Behavior', () => {
    it('should call onClientSelect when client is chosen from select', () => {
      render(
        <ClientSelector
          clients={mockClients}
          selectedClient={null}
          onClientSelect={mockOnClientSelect}
        />
      );

      const select = screen.getByRole('combobox') as HTMLSelectElement;
      fireEvent.change(select, { target: { value: '1' } });

      expect(mockOnClientSelect).toHaveBeenCalledWith(mockClients[0]);
    });

    it('should clear selection when Change button clicked', () => {
      render(
        <ClientSelector
          clients={mockClients}
          selectedClient={mockClients[0]}
          onClientSelect={mockOnClientSelect}
        />
      );

      const changeButton = screen.getByText(/change/i);
      fireEvent.click(changeButton);

      expect(mockOnClientSelect).toHaveBeenCalledWith(null);
    });
  });

  describe('Disabled State', () => {
    it('should disable select when disabled prop is true', () => {
      render(
        <ClientSelector
          clients={mockClients}
          selectedClient={null}
          onClientSelect={mockOnClientSelect}
          disabled={true}
        />
      );

      const select = screen.getByRole('combobox');
      expect(select).toBeDisabled();
    });

    it('should not show Change button when disabled', () => {
      render(
        <ClientSelector
          clients={mockClients}
          selectedClient={mockClients[0]}
          onClientSelect={mockOnClientSelect}
          disabled={true}
        />
      );

      expect(screen.queryByText(/change/i)).not.toBeInTheDocument();
    });
  });

  describe('Client Display', () => {
    it('should display all clients in select options', () => {
      render(
        <ClientSelector
          clients={mockClients}
          selectedClient={null}
          onClientSelect={mockOnClientSelect}
        />
      );

      const select = screen.getByRole('combobox') as HTMLSelectElement;
      const options = Array.from(select.options).map(opt => opt.textContent);

      expect(options).toContain('Acme Corp - Acme Corporation');
      expect(options).toContain('Test Inc - Test Incorporated');
    });

    it('should show client address when selected', () => {
      const clientWithAddress: Client = {
        ...mockClients[0],
        address: '123 Main St',
        city: 'New York',
        state: 'NY',
        zipCode: '10001'
      };

      render(
        <ClientSelector
          clients={mockClients}
          selectedClient={clientWithAddress}
          onClientSelect={mockOnClientSelect}
        />
      );

      expect(screen.getByText('123 Main St')).toBeInTheDocument();
      expect(screen.getByText(/New York.*NY.*10001/)).toBeInTheDocument();
    });
  });
});
