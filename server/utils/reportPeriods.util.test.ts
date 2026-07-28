/**
 * Period-bucketing tests for the P&L breakdown.
 *
 * `generateProfitLossData` hardcoded `periodColumns: []` and
 * `hasBreakdown: false`, so the monthly/quarterly columns the README advertises
 * for yearly reports never rendered.
 */

import { describe, it, expect } from 'vitest';
import { buildPeriodBuckets, periodKeyFor } from './reportPeriods.util.js';

describe('buildPeriodBuckets - quarterly', () => {
  it('covers a full calendar year with four quarters', () => {
    const buckets = buildPeriodBuckets('2026-01-01', '2026-12-31', 'quarterly');

    expect(buckets.map(b => b.label)).toEqual(['Q1 2026', 'Q2 2026', 'Q3 2026', 'Q4 2026']);
  });

  it('gives each quarter the right inclusive bounds', () => {
    const [q1, , , q4] = buildPeriodBuckets('2026-01-01', '2026-12-31', 'quarterly');

    expect(q1.start).toBe('2026-01-01');
    expect(q1.end).toBe('2026-03-31');
    expect(q4.start).toBe('2026-10-01');
    expect(q4.end).toBe('2026-12-31');
  });

  it('includes the quarter a partial range starts and ends in', () => {
    const buckets = buildPeriodBuckets('2026-02-15', '2026-05-10', 'quarterly');

    expect(buckets.map(b => b.label)).toEqual(['Q1 2026', 'Q2 2026']);
  });

  it('spans a year boundary', () => {
    const buckets = buildPeriodBuckets('2025-11-01', '2026-02-28', 'quarterly');

    expect(buckets.map(b => b.label)).toEqual(['Q4 2025', 'Q1 2026']);
  });
});

describe('buildPeriodBuckets - monthly', () => {
  it('produces one bucket per calendar month', () => {
    const buckets = buildPeriodBuckets('2026-01-01', '2026-03-31', 'monthly');

    expect(buckets.map(b => b.label)).toEqual(['Jan 2026', 'Feb 2026', 'Mar 2026']);
  });

  it('ends each month on its real last day', () => {
    const [jan, feb] = buildPeriodBuckets('2026-01-01', '2026-02-28', 'monthly');

    expect(jan.end).toBe('2026-01-31');
    expect(feb.end).toBe('2026-02-28');
  });

  it('handles a leap February', () => {
    const [feb] = buildPeriodBuckets('2024-02-01', '2024-02-29', 'monthly');

    expect(feb.end).toBe('2024-02-29');
  });

  it('spans a year boundary', () => {
    const buckets = buildPeriodBuckets('2025-12-01', '2026-01-31', 'monthly');

    expect(buckets.map(b => b.label)).toEqual(['Dec 2025', 'Jan 2026']);
  });
});

describe('buildPeriodBuckets - degenerate ranges', () => {
  it('returns a single bucket when the range sits inside one period', () => {
    expect(buildPeriodBuckets('2026-01-05', '2026-01-20', 'monthly')).toHaveLength(1);
    expect(buildPeriodBuckets('2026-01-05', '2026-02-20', 'quarterly')).toHaveLength(1);
  });

  it('returns no buckets when the range is inverted or unparseable', () => {
    expect(buildPeriodBuckets('2026-12-31', '2026-01-01', 'monthly')).toEqual([]);
    expect(buildPeriodBuckets('', '2026-01-01', 'monthly')).toEqual([]);
    expect(buildPeriodBuckets('not-a-date', 'also-not', 'quarterly')).toEqual([]);
  });
});

describe('periodKeyFor', () => {
  it('assigns a date to its calendar month', () => {
    expect(periodKeyFor('2026-03-17', 'monthly')).toBe('2026-03');
  });

  it('assigns a date to its calendar quarter', () => {
    expect(periodKeyFor('2026-03-17', 'quarterly')).toBe('2026-Q1');
    expect(periodKeyFor('2026-07-01', 'quarterly')).toBe('2026-Q3');
  });

  it('reads the calendar date out of a full ISO timestamp', () => {
    // Invoices store created_at as a timestamp; the day must not shift.
    expect(periodKeyFor('2026-03-31T23:59:59.000Z', 'monthly')).toBe('2026-03');
  });

  it('returns null for a value it cannot place', () => {
    expect(periodKeyFor('', 'monthly')).toBeNull();
    expect(periodKeyFor('nonsense', 'quarterly')).toBeNull();
  });

  it('agrees with the bucket a date falls into', () => {
    const buckets = buildPeriodBuckets('2026-01-01', '2026-12-31', 'quarterly');
    const key = periodKeyFor('2026-08-09', 'quarterly');

    expect(buckets.find(b => b.key === key)?.label).toBe('Q3 2026');
  });
});
