/**
 * API Mocking Utilities for Tests
 * Provides helpers to mock fetch responses and validate request/response types
 */

import { vi } from 'vitest';
import type { Invoice, Client, Payment, Expense } from '@/types';

export interface MockResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/**
 * Create a mock successful API response
 */
export function mockSuccessResponse<T>(data: T): MockResponse<T> {
  return {
    success: true,
    data
  };
}

/**
 * Create a mock error API response
 */
export function mockErrorResponse(error: string): MockResponse {
  return {
    success: false,
    error
  };
}

/**
 * Mock fetch to return a successful response
 */
export function mockFetchSuccess<T>(data: T) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => mockSuccessResponse(data),
  } as Response);
}

/**
 * Mock fetch to return an error response
 */
export function mockFetchError(status: number, error: string) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: async () => mockErrorResponse(error),
  } as Response);
}

/**
 * Get the last fetch call details
 */
export function getLastFetchCall() {
  const mockFetch = global.fetch as any;
  if (!mockFetch.mock || !mockFetch.mock.calls.length) {
    return null;
  }

  const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
  return {
    url: lastCall[0],
    options: lastCall[1]
  };
}

/**
 * Validate that request body matches expected type structure
 */
export function validateRequestBody<T>(expectedKeys: (keyof T)[]): boolean {
  const lastCall = getLastFetchCall();
  if (!lastCall || !lastCall.options?.body) {
    return false;
  }

  const body = JSON.parse(lastCall.options.body);
  return expectedKeys.every(key => key in body || body.data?.[key] !== undefined);
}

/**
 * Create mock data for testing
 */
export const mockData = {
  client: (id = 1): Client => ({
    id,
    name: `Test Client ${id}`,
    email: `client${id}@test.com`,
    phone: '555-0100',
    company: 'Test Corp',
    address: '123 Test St',
    city: 'Test City',
    state: 'TS',
    zipCode: '12345',
    country: 'Test Country',
    created_at: Date.parse('2026-02-16T00:00:00Z'),
    updated_at: Date.parse('2026-02-16T00:00:00Z')
  }),

  invoice: (id = 1, clientId = 1): Invoice => ({
    id,
    invoice_number: `INV-${String(id).padStart(3, '0')}`,
    client_id: clientId,
    design_template_id: undefined,
    recurring_template_id: undefined,
    amount: 1000,
    tax_amount: 100,
    total_amount: 1100,
    status: 'draft',
    due_date: '2026-03-01',
    issue_date: '2026-02-01',
    description: 'Test invoice',
    type: 'one-time',
    shipping_amount: 0,
    email_status: 'not_sent',
    created_at: Date.parse('2026-02-16T00:00:00Z'),
    updated_at: Date.parse('2026-02-16T00:00:00Z')
  }),

  payment: (id = 1, invoiceId = 1): Payment => ({
    id,
    date: '2026-02-16',
    client_name: 'Test Client',
    invoice_id: invoiceId,
    amount: 500,
    method: 'bank_transfer',
    status: 'received',
    created_at: Date.parse('2026-02-16T00:00:00Z'),
    updated_at: Date.parse('2026-02-16T00:00:00Z')
  }),

  expense: (id = 1): Expense => ({
    id,
    date: '2026-02-16',
    vendor: 'Office Supplies Inc',
    category: 'Office Supplies',
    amount: 150,
    description: 'Office chairs',
    currency: 'USD',
    created_at: Date.parse('2026-02-16T00:00:00Z'),
    updated_at: Date.parse('2026-02-16T00:00:00Z')
  })
};
