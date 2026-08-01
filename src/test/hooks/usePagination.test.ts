/**
 * usePagination tests.
 *
 * Every list screen (invoices, clients, expenses, payments) slices its data
 * through this hook. Bugs here either hide records or strand the user on an
 * empty page after a filter change.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type * as PaginationUtil from '@/utils/pagination.util';

const { getPaginationSettingsAsync } = vi.hoisted(() => ({
  getPaginationSettingsAsync: vi.fn()
}));

vi.mock('@/utils/pagination.util', async () => {
  const actual = await vi.importActual<typeof PaginationUtil>('@/utils/pagination.util');
  return { ...actual, getPaginationSettingsAsync };
});

import { usePagination } from '@/hooks/usePagination';

const SETTINGS = {
  defaultItemsPerPage: 10,
  availablePageSizes: [10, 25, 50, 100],
  maxItemsPerPage: 100,
  showItemsPerPageSelector: true,
  showPageNumbers: true,
  maxPageNumbers: 5
};

const makeData = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i + 1 }));

/** Renders the hook and waits for settings to land. */
const renderPaginated = async (count: number, extra: Record<string, unknown> = {}) => {
  const view = renderHook(() => usePagination({ data: makeData(count), ...extra }));
  await waitFor(() => expect(view.result.current.isLoading).toBe(false));
  return view;
};

beforeEach(() => {
  vi.clearAllMocks();
  getPaginationSettingsAsync.mockResolvedValue(SETTINGS);
});

describe('usePagination', () => {
  it('starts on page 1 with the configured page size', async () => {
    const { result } = await renderPaginated(25);

    expect(result.current.currentPage).toBe(1);
    expect(result.current.itemsPerPage).toBe(10);
    expect(result.current.paginatedData).toHaveLength(10);
    expect(result.current.paginatedData[0].id).toBe(1);
  });

  it('reports totals and page count', async () => {
    const { result } = await renderPaginated(25);

    expect(result.current.totalItems).toBe(25);
    expect(result.current.totalPages).toBe(3);
    expect(result.current.displayStart).toBe(1);
    expect(result.current.displayEnd).toBe(10);
  });

  it('slices the correct window on a later page', async () => {
    const { result } = await renderPaginated(25);

    act(() => result.current.setCurrentPage(2));

    expect(result.current.paginatedData[0].id).toBe(11);
    expect(result.current.displayStart).toBe(11);
    expect(result.current.displayEnd).toBe(20);
  });

  it('clamps the last page to the real record count', async () => {
    const { result } = await renderPaginated(25);

    act(() => result.current.goToLastPage());

    expect(result.current.currentPage).toBe(3);
    expect(result.current.paginatedData).toHaveLength(5);
    expect(result.current.displayEnd).toBe(25);
  });

  it('will not page past either end', async () => {
    const { result } = await renderPaginated(25);

    act(() => result.current.goToPrevPage());
    expect(result.current.currentPage).toBe(1);

    act(() => result.current.goToLastPage());
    act(() => result.current.goToNextPage());
    expect(result.current.currentPage).toBe(3);
  });

  it('rejects an out-of-range page number', async () => {
    const { result } = await renderPaginated(25);

    act(() => result.current.setCurrentPage(99));
    expect(result.current.currentPage).toBe(3);

    act(() => result.current.setCurrentPage(-5));
    expect(result.current.currentPage).toBe(1);
  });

  it('exposes whether paging is possible in each direction', async () => {
    const { result } = await renderPaginated(25);

    expect(result.current.canGoPrev).toBe(false);
    expect(result.current.canGoNext).toBe(true);

    act(() => result.current.goToLastPage());
    expect(result.current.canGoPrev).toBe(true);
    expect(result.current.canGoNext).toBe(false);
  });

  it('changing the page size returns to page 1', async () => {
    const { result } = await renderPaginated(100);

    act(() => result.current.setCurrentPage(5));
    act(() => result.current.setItemsPerPage(25));

    expect(result.current.itemsPerPage).toBe(25);
    expect(result.current.currentPage).toBe(1);
  });

  it('refuses a page size above the configured maximum', async () => {
    const { result } = await renderPaginated(100);

    act(() => result.current.setItemsPerPage(500));

    expect(result.current.itemsPerPage).toBe(10);
  });

  it('does not strand the user on a page that no longer exists', async () => {
    // Filtering down to fewer records must not leave them on an empty page.
    const { result, rerender } = renderHook(
      ({ data, searchTerm }) => usePagination({ data, searchTerm }),
      { initialProps: { data: makeData(100), searchTerm: '' } }
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.setCurrentPage(8));
    expect(result.current.currentPage).toBe(8);

    rerender({ data: makeData(12), searchTerm: 'narrowed' });

    await waitFor(() => expect(result.current.currentPage).toBe(1));
    expect(result.current.paginatedData.length).toBeGreaterThan(0);
  });

  it('handles an empty data set without dividing by zero', async () => {
    const { result } = await renderPaginated(0);

    expect(result.current.totalPages).toBe(0);
    expect(result.current.paginatedData).toEqual([]);
    expect(result.current.canGoNext).toBe(false);
    expect(result.current.canGoPrev).toBe(false);
  });

  it('produces a page-number window no wider than configured', async () => {
    const { result } = await renderPaginated(500);

    expect(result.current.pageNumbers.length).toBeLessThanOrEqual(SETTINGS.maxPageNumbers);
    expect(result.current.pageNumbers).toContain(result.current.currentPage);
  });

  it('still paginates when settings fail to load', async () => {
    getPaginationSettingsAsync.mockRejectedValue(new Error('offline'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHook(() => usePagination({ data: makeData(25) }));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.paginatedData.length).toBeGreaterThan(0);
    spy.mockRestore();
  });
});
