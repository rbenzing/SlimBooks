import { describe, it, expect } from 'vitest';
import {
  isEpochMillis,
  normalizeCalendarDay,
  normalizeUtcTimestamp,
  toEpochMillis,
  utcCalendarDay,
  utcNow,
  utcTimestamp,
  utcTimestampDaysAgo,
  utcTimestampText
} from './utcTime.util.js';

const AT = new Date('2026-08-09T14:30:05.123Z');
const AT_MS = Date.parse('2026-08-09T14:30:05.123Z');

describe('utcTimestamp', () => {
  it('is the instant, in full', () => {
    // Milliseconds are kept now. Under the old text format they changed the
    // width of the value and broke lexicographic ordering; an integer has no
    // width.
    expect(utcTimestamp(AT)).toBe(AT_MS);
  });

  it('is timezone-independent by construction', () => {
    expect(utcTimestamp(new Date('2026-08-09T23:30:00Z'))).toBe(Date.parse('2026-08-09T23:30:00Z'));
  });

  it('orders numerically, which is the point', () => {
    const early = utcTimestamp(new Date('2026-08-09T09:00:00Z'));
    const late = utcTimestamp(new Date('2026-08-09T21:00:00Z'));

    expect(early).toBeLessThan(late);
  });

  it('round-trips through Date exactly', () => {
    expect(new Date(utcTimestamp(AT)).getTime()).toBe(AT_MS);
  });

  it('renders now as an integer', () => {
    expect(isEpochMillis(utcNow())).toBe(true);
  });
});

describe('utcCalendarDay', () => {
  it('renders a bare day', () => {
    expect(utcCalendarDay(AT)).toBe('2026-08-09');
  });
});

describe('utcTimestampDaysAgo', () => {
  it('subtracts whole days', () => {
    expect(utcTimestampDaysAgo(30, AT)).toBe(AT_MS - 30 * 86_400_000);
  });

  it('truncates a fractional window to whole days', () => {
    expect(utcTimestampDaysAgo(30.7, AT)).toBe(utcTimestampDaysAgo(30, AT));
  });

  it('falls back for a nonsense value', () => {
    expect(utcTimestampDaysAgo(Number.NaN, AT)).toBe(utcTimestampDaysAgo(30, AT));
    expect(utcTimestampDaysAgo(Number.POSITIVE_INFINITY, AT)).toBe(utcTimestampDaysAgo(30, AT));
  });

  it('refuses a negative window that would look into the future', () => {
    expect(utcTimestampDaysAgo(-30, AT)).toBe(utcTimestampDaysAgo(30, AT));
  });

  it('crosses a month boundary correctly', () => {
    expect(utcTimestampDaysAgo(10, new Date('2026-03-05T00:00:00Z')))
      .toBe(Date.parse('2026-02-23T00:00:00Z'));
  });
});

describe('toEpochMillis', () => {
  it('passes a number through', () => {
    expect(toEpochMillis(AT_MS)).toBe(AT_MS);
  });

  it('reads a numeric string, which is what a JSON round-trip can produce', () => {
    expect(toEpochMillis(String(AT_MS))).toBe(AT_MS);
  });

  it('reads every text shape a pre-2.2 database held', () => {
    expect(toEpochMillis('2026-08-09T14:30:05Z')).toBe(Date.parse('2026-08-09T14:30:05Z'));
    expect(toEpochMillis('2026-08-09T14:30:05.241Z')).toBe(Date.parse('2026-08-09T14:30:05Z'));
    expect(toEpochMillis('2026-08-09 14:30:05')).toBe(Date.parse('2026-08-09T14:30:05Z'));
    expect(toEpochMillis('2026-08-09T14:30:05')).toBe(Date.parse('2026-08-09T14:30:05Z'));
  });

  it('reads the space form as UTC, never as local time', () => {
    // That shape is outside the ECMAScript grammar, so Date falls back to
    // implementation-defined parsing and V8 reads it as local — every value
    // would shift by the host's offset. It must never reach Date.
    expect(toEpochMillis('2026-08-09 14:30:05')).toBe(Date.parse('2026-08-09T14:30:05Z'));
  });

  it('reads a bare day as its first instant, so it still orders before that day', () => {
    expect(toEpochMillis('2026-08-09')).toBe(Date.parse('2026-08-09T00:00:00Z'));
  });

  it('honours a real offset', () => {
    expect(toEpochMillis('2026-08-09T19:30:05+05:00')).toBe(Date.parse('2026-08-09T14:30:05Z'));
  });

  it('rejects what it cannot read rather than guessing', () => {
    expect(toEpochMillis('not a date')).toBeNull();
    expect(toEpochMillis('')).toBeNull();
    expect(toEpochMillis(null)).toBeNull();
    expect(toEpochMillis(Number.NaN)).toBeNull();
  });

  it('is idempotent', () => {
    const once = toEpochMillis('2026-08-09 14:30:05')!;

    expect(toEpochMillis(once)).toBe(once);
  });
});

describe('isEpochMillis', () => {
  it('accepts only a whole, finite number', () => {
    expect(isEpochMillis(AT_MS)).toBe(true);
    expect(isEpochMillis(0)).toBe(true);
    expect(isEpochMillis(1.5)).toBe(false);
    expect(isEpochMillis('2026-08-09T14:30:05Z')).toBe(false);
    expect(isEpochMillis(Number.NaN)).toBe(false);
    expect(isEpochMillis(undefined)).toBe(false);
  });
});

describe('normalizeCalendarDay', () => {
  it('leaves a bare day alone', () => {
    expect(normalizeCalendarDay('2026-08-09')).toBeNull();
  });

  it('narrows a full timestamp to its UTC day', () => {
    expect(normalizeCalendarDay('2026-08-09T23:30:05.241Z')).toBe('2026-08-09');
    expect(normalizeCalendarDay('2026-08-09 23:30:05')).toBe('2026-08-09');
  });

  it('leaves anything it does not understand alone', () => {
    expect(normalizeCalendarDay('whenever')).toBeNull();
    expect(normalizeCalendarDay(null)).toBeNull();
  });
});

describe('the text helpers migration 014 still needs', () => {
  // 014 shipped in 2.1.1 and is recorded as applied on upgraded databases, so
  // it cannot be edited away — a migration is history. It rewrote one text
  // shape into another; 015 then converts the column to integers.
  it('renders 2.1.1 shape', () => {
    expect(utcTimestampText(AT)).toBe('2026-08-09T14:30:05Z');
  });

  it('normalises the shapes 014 was written to find', () => {
    expect(normalizeUtcTimestamp('2026-08-09 14:30:05')).toBe('2026-08-09T14:30:05Z');
    expect(normalizeUtcTimestamp('2026-08-09T14:30:05.241Z')).toBe('2026-08-09T14:30:05Z');
    expect(normalizeUtcTimestamp('2026-08-09T14:30:05Z')).toBeNull();
  });
});
