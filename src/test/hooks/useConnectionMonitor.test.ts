/**
 * useConnectionMonitor tests.
 *
 * This hook decides whether the app tells the user it is offline. Two failures
 * matter: polling forever after the backend is plainly gone (which hammers a
 * struggling server), and staying stuck in retry mode after it comes back.
 * The interval must also be torn down on unmount — a surviving timer keeps
 * fetching against a component that no longer exists.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useConnectionMonitor } from '@/hooks/useConnectionMonitor';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

const healthy = () => ({ ok: true, status: 200 }) as Response;
const unhealthy = (status = 503) => ({ ok: false, status }) as Response;

/** Lets pending promise callbacks run without advancing the clock. */
const flush = async () => {
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
};

/** Options that keep the timers short enough to drive explicitly. */
const fastOptions = { checkInterval: 1000, retryInterval: 500, maxRetries: 3 };

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  fetchMock.mockResolvedValue(healthy());
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('initial state', () => {
  it('starts optimistic so the app does not flash an offline banner', () => {
    const { result } = renderHook(() => useConnectionMonitor(fastOptions));

    expect(result.current.isConnected).toBe(true);
    expect(result.current.isChecking).toBe(false);
    expect(result.current.retryCount).toBe(0);
    expect(result.current.lastError).toBeNull();
  });

  it('does not poll until monitoring is started', () => {
    renderHook(() => useConnectionMonitor(fastOptions));

    vi.advanceTimersByTime(5000);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('startConnectionMonitoring', () => {
  it('checks the health endpoint immediately', async () => {
    const { result } = renderHook(() => useConnectionMonitor(fastOptions));

    await act(async () => { result.current.startConnectionMonitoring(); });

    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/health$/);
  });

  it('keeps polling on the healthy interval', async () => {
    const { result } = renderHook(() => useConnectionMonitor(fastOptions));
    await act(async () => { result.current.startConnectionMonitoring(); });
    const afterInitial = fetchMock.mock.calls.length;

    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });

    expect(fetchMock.mock.calls.length).toBeGreaterThan(afterInitial);
  });

  it('reports a disconnection when the server answers with an error', async () => {
    fetchMock.mockResolvedValue(unhealthy());
    const { result } = renderHook(() => useConnectionMonitor(fastOptions));

    await act(async () => { result.current.startConnectionMonitoring(); });

    await flush();
    expect(result.current.isConnected).toBe(false);
    expect(result.current.lastError).toMatch(/503/);
  });

  it('reports a disconnection when the request throws', async () => {
    fetchMock.mockRejectedValue(new Error('Failed to fetch'));
    const { result } = renderHook(() => useConnectionMonitor(fastOptions));

    await act(async () => { result.current.startConnectionMonitoring(); });

    await flush();
    expect(result.current.isConnected).toBe(false);
    expect(result.current.lastError).toBe('Failed to fetch');
  });

  it('ignores a second start rather than running two pollers', async () => {
    // Two intervals would double the request rate against a sick server.
    const { result } = renderHook(() => useConnectionMonitor(fastOptions));
    await act(async () => { result.current.startConnectionMonitoring(); });
    const afterFirst = fetchMock.mock.calls.length;

    await act(async () => { result.current.startConnectionMonitoring(); });

    expect(fetchMock.mock.calls.length).toBe(afterFirst);
  });
});

describe('retry behaviour', () => {
  it('switches to the shorter retry interval once disconnected', async () => {
    fetchMock.mockResolvedValue(unhealthy());
    const { result } = renderHook(() => useConnectionMonitor(fastOptions));
    await act(async () => { result.current.startConnectionMonitoring(); });
    const afterInitial = fetchMock.mock.calls.length;

    // Shorter than checkInterval, so a call here proves retry mode engaged.
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });

    expect(fetchMock.mock.calls.length).toBeGreaterThan(afterInitial);
  });

  it('counts each retry', async () => {
    fetchMock.mockResolvedValue(unhealthy());
    const { result } = renderHook(() => useConnectionMonitor(fastOptions));
    await act(async () => { result.current.startConnectionMonitoring(); });

    await act(async () => { await vi.advanceTimersByTimeAsync(500); });

    await flush();
    expect(result.current.retryCount).toBeGreaterThan(0);
  });

  it('gives up after the maximum number of retries', async () => {
    // Otherwise the app polls a dead backend forever.
    fetchMock.mockResolvedValue(unhealthy());
    const { result } = renderHook(() => useConnectionMonitor(fastOptions));
    await act(async () => { result.current.startConnectionMonitoring(); });

    await act(async () => { await vi.advanceTimersByTimeAsync(500 * 10); });

    await flush();
    expect(result.current.hasExceededMaxRetries).toBe(true);
    const afterGivingUp = fetchMock.mock.calls.length;

    await act(async () => { await vi.advanceTimersByTimeAsync(500 * 5); });
    expect(fetchMock.mock.calls.length).toBe(afterGivingUp);
  });

  it('recovers and clears the error when the server returns', async () => {
    fetchMock.mockResolvedValue(unhealthy());
    const { result } = renderHook(() => useConnectionMonitor(fastOptions));
    await act(async () => { result.current.startConnectionMonitoring(); });
    await flush();
    expect(result.current.isConnected).toBe(false);

    fetchMock.mockResolvedValue(healthy());
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });

    await flush();
    expect(result.current.isConnected).toBe(true);
    expect(result.current.lastError).toBeNull();
    expect(result.current.retryCount).toBe(0);
  });

  it('resets the retry count on request', async () => {
    fetchMock.mockResolvedValue(unhealthy());
    const { result } = renderHook(() => useConnectionMonitor(fastOptions));
    await act(async () => { result.current.startConnectionMonitoring(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    await flush();
    expect(result.current.retryCount).toBeGreaterThan(0);

    act(() => { result.current.resetRetryCount(); });

    expect(result.current.retryCount).toBe(0);
  });

  it('reports exceeding the maximum only once it has', () => {
    const { result } = renderHook(() => useConnectionMonitor(fastOptions));

    expect(result.current.hasExceededMaxRetries).toBe(false);
  });
});

describe('teardown', () => {
  it('stops polling when asked', async () => {
    const { result } = renderHook(() => useConnectionMonitor(fastOptions));
    await act(async () => { result.current.startConnectionMonitoring(); });

    act(() => { result.current.stopConnectionMonitoring(); });
    const afterStop = fetchMock.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });

    expect(fetchMock.mock.calls.length).toBe(afterStop);
  });

  it('stops polling when the component unmounts', async () => {
    // A surviving interval fetches against a component that is gone.
    const { result, unmount } = renderHook(() => useConnectionMonitor(fastOptions));
    await act(async () => { result.current.startConnectionMonitoring(); });

    unmount();
    const afterUnmount = fetchMock.mock.calls.length;
    await vi.advanceTimersByTimeAsync(5000);

    expect(fetchMock.mock.calls.length).toBe(afterUnmount);
  });

  it('can be restarted after being stopped', async () => {
    const { result } = renderHook(() => useConnectionMonitor(fastOptions));
    await act(async () => { result.current.startConnectionMonitoring(); });
    act(() => { result.current.stopConnectionMonitoring(); });
    const afterStop = fetchMock.mock.calls.length;

    await act(async () => { result.current.startConnectionMonitoring(); });

    expect(fetchMock.mock.calls.length).toBeGreaterThan(afterStop);
  });

  it('stopping before starting is harmless', () => {
    const { result } = renderHook(() => useConnectionMonitor(fastOptions));

    expect(() => act(() => { result.current.stopConnectionMonitoring(); })).not.toThrow();
  });
});

describe('configuration', () => {
  it('queries the configured base url', async () => {
    const { result } = renderHook(() =>
      useConnectionMonitor({ ...fastOptions, baseUrl: 'https://books.test/api' })
    );

    await act(async () => { result.current.startConnectionMonitoring(); });

    expect(String(fetchMock.mock.calls[0][0])).toBe('https://books.test/api/health');
  });

  it('sends an abort signal so a hung request cannot wedge the poller', async () => {
    const { result } = renderHook(() => useConnectionMonitor(fastOptions));

    await act(async () => { result.current.startConnectionMonitoring(); });

    expect((fetchMock.mock.calls[0][1] as RequestInit).signal).toBeTruthy();
  });
});
