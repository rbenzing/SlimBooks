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
    const buckets = buildPeriodBuckets('2026-01-01', '2026-12-31', 'quarterly', 1);

    expect(buckets.map(b => b.label)).toEqual(['Q1 2026', 'Q2 2026', 'Q3 2026', 'Q4 2026']);
  });

  it('gives each quarter the right inclusive bounds', () => {
    const [q1, , , q4] = buildPeriodBuckets('2026-01-01', '2026-12-31', 'quarterly', 1);

    expect(q1.start).toBe('2026-01-01');
    expect(q1.end).toBe('2026-03-31');
    expect(q4.start).toBe('2026-10-01');
    expect(q4.end).toBe('2026-12-31');
  });

  it('includes the quarter a partial range starts and ends in', () => {
    const buckets = buildPeriodBuckets('2026-02-15', '2026-05-10', 'quarterly', 1);

    expect(buckets.map(b => b.label)).toEqual(['Q1 2026', 'Q2 2026']);
  });

  it('spans a year boundary', () => {
    const buckets = buildPeriodBuckets('2025-11-01', '2026-02-28', 'quarterly', 1);

    expect(buckets.map(b => b.label)).toEqual(['Q4 2025', 'Q1 2026']);
  });
});

describe('buildPeriodBuckets - monthly', () => {
  it('produces one bucket per calendar month', () => {
    const buckets = buildPeriodBuckets('2026-01-01', '2026-03-31', 'monthly', 1);

    expect(buckets.map(b => b.label)).toEqual(['Jan 2026', 'Feb 2026', 'Mar 2026']);
  });

  it('ends each month on its real last day', () => {
    const [jan, feb] = buildPeriodBuckets('2026-01-01', '2026-02-28', 'monthly', 1);

    expect(jan.end).toBe('2026-01-31');
    expect(feb.end).toBe('2026-02-28');
  });

  it('handles a leap February', () => {
    const [feb] = buildPeriodBuckets('2024-02-01', '2024-02-29', 'monthly', 1);

    expect(feb.end).toBe('2024-02-29');
  });

  it('spans a year boundary', () => {
    const buckets = buildPeriodBuckets('2025-12-01', '2026-01-31', 'monthly', 1);

    expect(buckets.map(b => b.label)).toEqual(['Dec 2025', 'Jan 2026']);
  });
});

describe('buildPeriodBuckets - degenerate ranges', () => {
  it('returns a single bucket when the range sits inside one period', () => {
    expect(buildPeriodBuckets('2026-01-05', '2026-01-20', 'monthly', 1)).toHaveLength(1);
    expect(buildPeriodBuckets('2026-01-05', '2026-02-20', 'quarterly', 1)).toHaveLength(1);
  });

  it('returns no buckets when the range is inverted or unparseable', () => {
    expect(buildPeriodBuckets('2026-12-31', '2026-01-01', 'monthly', 1)).toEqual([]);
    expect(buildPeriodBuckets('', '2026-01-01', 'monthly', 1)).toEqual([]);
    expect(buildPeriodBuckets('not-a-date', 'also-not', 'quarterly', 1)).toEqual([]);
  });
});

describe('periodKeyFor', () => {
  it('assigns a date to its calendar month', () => {
    expect(periodKeyFor('2026-03-17', 'monthly', 1)).toBe('2026-03');
  });

  it('assigns a date to its calendar quarter', () => {
    expect(periodKeyFor('2026-03-17', 'quarterly', 1)).toBe('2026-Q1');
    expect(periodKeyFor('2026-07-01', 'quarterly', 1)).toBe('2026-Q3');
  });

  it('reads the calendar date out of a full ISO timestamp', () => {
    // A timestamp column (e.g. reports.created_at) reaches here as an ISO
    // string; the day must not shift.
    expect(periodKeyFor('2026-03-31T23:59:59.000Z', 'monthly', 1)).toBe('2026-03');
  });

  it('returns null for a value it cannot place', () => {
    expect(periodKeyFor('', 'monthly', 1)).toBeNull();
    expect(periodKeyFor('nonsense', 'quarterly', 1)).toBeNull();
  });

  it('agrees with the bucket a date falls into', () => {
    const buckets = buildPeriodBuckets('2026-01-01', '2026-12-31', 'quarterly', 1);
    const key = periodKeyFor('2026-08-09', 'quarterly', 1);

    expect(buckets.find(b => b.key === key)?.label).toBe('Q3 2026');
  });
});

describe('fiscal quarters', () => {
  it('labels a calendar-year quarter unchanged when the year starts in January', () => {
    expect(periodKeyFor('2026-08-12', 'quarterly', 1)).toBe('2026-Q3');
  });

  it('puts August in Q1 when the fiscal year starts in July', () => {
    expect(periodKeyFor('2026-08-12', 'quarterly', 7)).toBe('FY2027-Q1');
  });

  it('puts June in Q4 of the fiscal year that started the previous July', () => {
    expect(periodKeyFor('2026-06-30', 'quarterly', 7)).toBe('FY2026-Q4');
  });

  it('leaves monthly keys alone whatever the fiscal year', () => {
    expect(periodKeyFor('2026-08-12', 'monthly', 7)).toBe('2026-08');
  });

  it('builds fiscal quarter buckets across a year boundary', () => {
    const buckets = buildPeriodBuckets('2025-07-01', '2026-06-30', 'quarterly', 7);
    expect(buckets.map(b => b.key)).toEqual(['FY2026-Q1', 'FY2026-Q2', 'FY2026-Q3', 'FY2026-Q4']);
  });

  /**
   * A November start puts a quarter's END in January — month 11 + 2. Computing
   * that end by adding to the start month without wrapping produces "2026-13-01",
   * which is not a date. Only fiscal starts in {2,3,5,6,8,9,11,12} have a quarter
   * that crosses the year end this way, and none of them was covered until a
   * latent overflow was found and fixed here.
   */
  it('ends a quarter that crosses the calendar year in January, not month 13', () => {
    const buckets = buildPeriodBuckets('2025-11-01', '2026-10-31', 'quarterly', 11);

    expect(buckets.map(b => b.key)).toEqual(['FY2026-Q1', 'FY2026-Q2', 'FY2026-Q3', 'FY2026-Q4']);
    expect(buckets.map(b => b.end)).toEqual(['2026-01-31', '2026-04-30', '2026-07-31', '2026-10-31']);
    for (const bucket of buckets) {
      expect(bucket.end).toMatch(/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/);
    }
  });

  it.each([2, 3, 5, 6, 8, 9, 11, 12])(
    'produces only real months for a fiscal year starting in month %i',
    (startMonth) => {
      const buckets = buildPeriodBuckets('2025-01-01', '2027-12-31', 'quarterly', startMonth);

      expect(buckets.length).toBeGreaterThan(0);
      for (const bucket of buckets) {
        expect(bucket.start).toMatch(/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/);
        expect(bucket.end).toMatch(/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/);
        expect(bucket.start <= bucket.end).toBe(true);
      }
    }
  );
});
