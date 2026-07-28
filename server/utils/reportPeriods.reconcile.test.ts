/**
 * Reconciliation tests for the P&L breakdown.
 *
 * The columns and the Total column are computed from the same records, so the
 * columns must sum to the totals. If bucketing ever drops or double-counts a
 * record the report would silently disagree with itself.
 */

import { describe, it, expect } from 'vitest';
import { buildPeriodBuckets, periodKeyFor, type BreakdownPeriod } from './reportPeriods.util.js';

interface Row { date: string; amount: number }

/** Mirrors how ReportService groups records into columns. */
const bucketise = (rows: Row[], start: string, end: string, period: BreakdownPeriod) => {
  const buckets = buildPeriodBuckets(start, end, period);

  return buckets.map(bucket => ({
    label: bucket.label,
    total: rows
      .filter(row => periodKeyFor(row.date, period) === bucket.key)
      .reduce((sum, row) => sum + row.amount, 0)
  }));
};

const rows: Row[] = [
  { date: '2026-01-15', amount: 100 },
  { date: '2026-02-01', amount: 250 },
  { date: '2026-03-31T23:59:59.000Z', amount: 50 },
  { date: '2026-04-01', amount: 400 },
  { date: '2026-11-30', amount: 75 },
  { date: '2026-12-31', amount: 25 }
];

const grandTotal = rows.reduce((sum, row) => sum + row.amount, 0);

describe('P&L column reconciliation', () => {
  it('quarterly columns sum to the grand total', () => {
    const columns = bucketise(rows, '2026-01-01', '2026-12-31', 'quarterly');
    expect(columns.reduce((sum, c) => sum + c.total, 0)).toBe(grandTotal);
  });

  it('monthly columns sum to the grand total', () => {
    const columns = bucketise(rows, '2026-01-01', '2026-12-31', 'monthly');
    expect(columns.reduce((sum, c) => sum + c.total, 0)).toBe(grandTotal);
  });

  it('places each record in exactly one column', () => {
    const period: BreakdownPeriod = 'quarterly';
    const buckets = buildPeriodBuckets('2026-01-01', '2026-12-31', period);

    for (const row of rows) {
      const matches = buckets.filter(b => b.key === periodKeyFor(row.date, period));
      expect(matches).toHaveLength(1);
    }
  });

  it('assigns quarter boundaries to the correct side', () => {
    const columns = bucketise(rows, '2026-01-01', '2026-12-31', 'quarterly');
    const byLabel = Object.fromEntries(columns.map(c => [c.label, c.total]));

    // 2026-03-31T23:59:59Z belongs to Q1, 2026-04-01 to Q2.
    expect(byLabel['Q1 2026']).toBe(400);
    expect(byLabel['Q2 2026']).toBe(400);
    expect(byLabel['Q4 2026']).toBe(100);
  });

  it('yields empty columns for periods with no activity', () => {
    const columns = bucketise(rows, '2026-01-01', '2026-12-31', 'quarterly');
    expect(columns.find(c => c.label === 'Q3 2026')?.total).toBe(0);
  });

  it('produces a single column for a range inside one quarter', () => {
    // hasBreakdown is false in this case, so the UI shows only the Total column.
    expect(buildPeriodBuckets('2026-01-05', '2026-02-20', 'quarterly')).toHaveLength(1);
  });
});
