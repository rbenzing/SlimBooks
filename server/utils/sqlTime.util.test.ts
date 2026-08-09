import { describe, it, expect } from 'vitest';
import { sqlTimestamp, sqlTimestampDaysAgo } from './sqlTime.util.js';

const AT = new Date('2026-08-09T14:30:05.123Z');

describe('sqlTimestamp', () => {
  it('renders the shape both backends store', () => {
    // datetime('now') and DATE_FORMAT(UTC_TIMESTAMP(),'%Y-%m-%d %H:%i:%s')
    // both produce this. The columns are TEXT, so a different shape would
    // compare lexicographically against a different format.
    expect(sqlTimestamp(AT)).toBe('2026-08-09 14:30:05');
  });

  it('drops sub-second precision rather than rounding it', () => {
    expect(sqlTimestamp(new Date('2026-08-09T14:30:05.999Z'))).toBe('2026-08-09 14:30:05');
  });

  it('works in UTC regardless of the host timezone', () => {
    // The process may run anywhere; the stored values are always UTC.
    expect(sqlTimestamp(new Date('2026-08-09T23:30:00Z'))).toBe('2026-08-09 23:30:00');
    expect(sqlTimestamp(new Date('2026-08-10T00:30:00Z'))).toBe('2026-08-10 00:30:00');
  });
});

describe('sqlTimestampDaysAgo', () => {
  it('subtracts whole days', () => {
    expect(sqlTimestampDaysAgo(30, AT)).toBe('2026-07-10 14:30:05');
  });

  it('truncates a fractional window to whole days', () => {
    expect(sqlTimestampDaysAgo(30.7, AT)).toBe(sqlTimestampDaysAgo(30, AT));
  });

  it('falls back for a nonsense value', () => {
    expect(sqlTimestampDaysAgo(Number.NaN, AT)).toBe(sqlTimestampDaysAgo(30, AT));
    expect(sqlTimestampDaysAgo(Number.POSITIVE_INFINITY, AT)).toBe(sqlTimestampDaysAgo(30, AT));
  });

  it('refuses a negative window that would look into the future', () => {
    expect(sqlTimestampDaysAgo(-30, AT)).toBe(sqlTimestampDaysAgo(30, AT));
  });

  it('crosses a month boundary correctly', () => {
    expect(sqlTimestampDaysAgo(10, new Date('2026-03-05T00:00:00Z'))).toBe('2026-02-23 00:00:00');
  });
});
