import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRememberedPeriod } from '@/hooks/useRememberedPeriod.hook';
import { toCalendarDay } from '@/utils/data/period.util';

/**
 * src/test/setup.ts replaces localStorage with vi.fn() stubs that never store
 * anything, so this suite installs a real in-memory Storage. Do not change the
 * shared setup; other suites rely on those stubs.
 */
class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length(): number { return this.store.size; }
  key(index: number): string | null { return Array.from(this.store.keys())[index] ?? null; }
  getItem(key: string): string | null { return this.store.get(key) ?? null; }
  setItem(key: string, value: string): void { this.store.set(key, String(value)); }
  removeItem(key: string): void { this.store.delete(key); }
  clear(): void { this.store.clear(); }
}

const originalLocalStorage = globalThis.localStorage;
let storage: MemoryStorage;

beforeEach(() => {
  storage = new MemoryStorage();
  Object.defineProperty(globalThis, 'localStorage', { value: storage, writable: true, configurable: true });
  Object.defineProperty(window, 'localStorage', { value: storage, writable: true, configurable: true });
});

afterEach(() => {
  Object.defineProperty(globalThis, 'localStorage', { value: originalLocalStorage, writable: true, configurable: true });
  Object.defineProperty(window, 'localStorage', { value: originalLocalStorage, writable: true, configurable: true });
});

describe('useRememberedPeriod', () => {
  it('defaults to fiscal year to date, so an import of this year is visible', () => {
    const { result } = renderHook(() => useRememberedPeriod('expenses'));
    expect(result.current[0]).toBe('this_year');
    expect(result.current[1]).toBeUndefined();
  });

  it('remembers a chosen period', () => {
    const { result } = renderHook(() => useRememberedPeriod('expenses'));
    act(() => result.current[2]('last_month'));
    expect(result.current[0]).toBe('last_month');
    expect(storage.getItem('slimbooks.period.expenses')).toBe('last_month');
  });

  it('restores what was stored on the next mount', () => {
    storage.setItem('slimbooks.period.payments', 'this_quarter');
    const { result } = renderHook(() => useRememberedPeriod('payments'));
    expect(result.current[0]).toBe('this_quarter');
  });

  it('keeps screens independent', () => {
    const expenses = renderHook(() => useRememberedPeriod('expenses'));
    act(() => expenses.result.current[2]('today'));
    const payments = renderHook(() => useRememberedPeriod('payments'));
    expect(payments.result.current[0]).toBe('this_year');
  });

  it('ignores a stored value that is not a period', () => {
    storage.setItem('slimbooks.period.expenses', 'last_fortnight');
    const { result } = renderHook(() => useRememberedPeriod('expenses'));
    expect(result.current[0]).toBe('this_year');
  });

  it('survives storage that throws, because a private window can refuse it', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } },
      writable: true, configurable: true
    });
    const { result } = renderHook(() => useRememberedPeriod('expenses'));
    expect(result.current[0]).toBe('this_year');
    expect(() => act(() => result.current[2]('today'))).not.toThrow();
  });

  /**
   * Defect: a remembered `custom` silently became "this month".
   *
   * The chosen period used to be the only thing persisted; `custom` has no
   * meaning without its date range, so on reload the screen read `custom`
   * from storage with no range to go with it, fell into
   * `getDateRangeForPeriod`'s `default:` branch, and showed month-to-date
   * while the dropdown still said "Custom Range" — recreating the very
   * "imported rows appear to do nothing" complaint this module exists to fix
   * (see ExpenseImportExport's "Show all imported").
   */
  describe('a custom range', () => {
    it('is remembered alongside the period, and survives the next mount', () => {
      const first = renderHook(() => useRememberedPeriod('expenses'));
      const customRange = { start: new Date(2024, 0, 1), end: new Date(2024, 11, 31) };

      act(() => first.result.current[2]('custom', customRange));

      expect(first.result.current[0]).toBe('custom');
      expect(first.result.current[1]?.start && toCalendarDay(first.result.current[1].start)).toBe('2024-01-01');
      expect(first.result.current[1]?.end && toCalendarDay(first.result.current[1].end)).toBe('2024-12-31');

      // A fresh mount simulates the next visit / a page reload.
      const second = renderHook(() => useRememberedPeriod('expenses'));
      expect(second.result.current[0]).toBe('custom');
      expect(second.result.current[1]).toBeDefined();
      expect(toCalendarDay(second.result.current[1]!.start)).toBe('2024-01-01');
      expect(toCalendarDay(second.result.current[1]!.end)).toBe('2024-12-31');
    });

    it('never claims custom without a range to show for it', () => {
      // Simulates data written before this fix, or a partial write: a
      // persisted period of 'custom' with no companion range.
      storage.setItem('slimbooks.period.expenses', 'custom');

      const { result } = renderHook(() => useRememberedPeriod('expenses'));

      expect(result.current[0]).not.toBe('custom');
      expect(result.current[0]).toBe('this_year');
      expect(result.current[1]).toBeUndefined();
    });

    it('forgets the range once a non-custom period is chosen', () => {
      const { result } = renderHook(() => useRememberedPeriod('expenses'));
      const customRange = { start: new Date(2024, 0, 1), end: new Date(2024, 11, 31) };

      act(() => result.current[2]('custom', customRange));
      expect(result.current[1]).toBeDefined();

      act(() => result.current[2]('last_month'));
      expect(result.current[0]).toBe('last_month');
      expect(result.current[1]).toBeUndefined();
      expect(storage.getItem('slimbooks.periodRange.expenses')).toBeNull();

      // And the forgotten range does not resurface on the next mount either.
      const remounted = renderHook(() => useRememberedPeriod('expenses'));
      expect(remounted.result.current[0]).toBe('last_month');
      expect(remounted.result.current[1]).toBeUndefined();
    });
  });
});
