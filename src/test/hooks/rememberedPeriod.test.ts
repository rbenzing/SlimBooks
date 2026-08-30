import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRememberedPeriod } from '@/hooks/useRememberedPeriod.hook';

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
  });

  it('remembers a chosen period', () => {
    const { result } = renderHook(() => useRememberedPeriod('expenses'));
    act(() => result.current[1]('last_month'));
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
    act(() => expenses.result.current[1]('today'));
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
    expect(() => act(() => result.current[1]('today'))).not.toThrow();
  });
});
