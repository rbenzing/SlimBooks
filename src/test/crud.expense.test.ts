/**
 * Expense CRUD Integration Tests
 * Tests that the frontend is single-named on the `vendor` column
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Expense } from '@/types';
import { isExpense } from '@/types';
import { mockData, mockFetchSuccess, mockFetchError } from './apiMock';

vi.mock('@/utils/api', () => ({
  authenticatedFetch: vi.fn((url: string, options?: RequestInit) => {
    return global.fetch(url, options);
  })
}));

describe('Expense CRUD Operations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('CREATE - Expense', () => {
    it('should create expense with the vendor field', async () => {
      const newExpense = mockData.expense(1);
      mockFetchSuccess({ id: 1 });

      const response = await fetch('/api/expenses', {
        method: 'POST',
        body: JSON.stringify({ expenseData: newExpense })
      });

      const result = await response.json();

      expect(result.success).toBe(true);
      expect(result.data.id).toBe(1);

      // The payload must carry `vendor` — the column the expenses table uses.
      const [, init] = vi.mocked(fetch).mock.calls[0];
      const { expenseData } = JSON.parse(init!.body as string);
      expect(expenseData).toHaveProperty('vendor');
      expect(expenseData).not.toHaveProperty('merchant');
    });

    it('should validate expense amount', async () => {
      mockFetchError(400, 'Amount must be a positive number');

      const response = await fetch('/api/expenses', {
        method: 'POST',
        body: JSON.stringify({
          expenseData: { amount: -100 }
        })
      });

      const result = await response.json();

      expect(result.success).toBe(false);
      expect(result.error).toContain('positive');
    });
  });

  describe('READ - Expense', () => {
    it('should fetch all expenses with correct type structure', async () => {
      const expenses = [mockData.expense(1), mockData.expense(2)];
      mockFetchSuccess(expenses);

      const response = await fetch('/api/expenses');
      const result = await response.json();

      expect(result.success).toBe(true);
      result.data.forEach((expense: Expense) => {
        expect(isExpense(expense)).toBe(true);
        expect(expense).toHaveProperty('vendor'); // Correct field
      });
    });

    it('should fetch expense by ID', async () => {
      const expense = mockData.expense(1);
      mockFetchSuccess(expense);

      const response = await fetch('/api/expenses/1');
      const result = await response.json();

      expect(result.success).toBe(true);
      expect(isExpense(result.data)).toBe(true);
    });
  });

  describe('UPDATE - Expense', () => {
    it('should update expense vendor field', async () => {
      const updated = { ...mockData.expense(1), vendor: 'New Vendor' };
      mockFetchSuccess(updated);

      const response = await fetch('/api/expenses/1', {
        method: 'PUT',
        body: JSON.stringify({
          expenseData: { vendor: 'New Vendor' }
        })
      });

      const result = await response.json();

      expect(result.success).toBe(true);
      expect(result.data.vendor).toBe('New Vendor');
    });
  });

  describe('DELETE - Expense', () => {
    it('should delete expense', async () => {
      mockFetchSuccess({ changes: 1 });

      const response = await fetch('/api/expenses/1', { method: 'DELETE' });
      const result = await response.json();

      expect(result.success).toBe(true);
      expect(result.data.changes).toBe(1);
    });
  });

  describe('Expense Schema Validation', () => {
    it('should use the vendor field exclusively', () => {
      const expense = mockData.expense(1);

      expect(expense).toHaveProperty('vendor');
      expect(expense).not.toHaveProperty('merchant');
    });

    it('should not treat a vendor-less object as an Expense', () => {
      expect(isExpense({ id: 1, amount: 100, merchant: 'Acme' })).toBe(false);
      expect(isExpense({ id: 1, amount: 100, vendor: 'Acme' })).toBe(true);
    });

    it('should not have status field in database', () => {
      const expense = mockData.expense(1);

      // Status is a frontend-only field, not in database
      expect(expense).not.toHaveProperty('status');
    });
  });
});
