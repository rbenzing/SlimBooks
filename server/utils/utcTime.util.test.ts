import { describe, it, expect } from 'vitest';
import {
  isUtcTimestamp,
  normalizeCalendarDay,
  normalizeUtcTimestamp,
  utcCalendarDay,
  utcNow,
  utcTimestamp,
  utcTimestampDaysAgo
} from './utcTime.util.js';

const AT = new Date('2026-08-09T14:30:05.123Z');

describe('utcTimestamp', () => {
  it('renders the one shape every timestamp column holds', () => {
    expect(utcTimestamp(AT)).toBe('2026-08-09T14:30:05Z');
  });

  it('drops sub-second precision rather than rounding it', () => {
    expect(utcTimestamp(new Date('2026-08-09T14:30:05.999Z'))).toBe('2026-08-09T14:30:05Z');
  });

  it('works in UTC regardless of the host timezone', () => {
    // The process may run anywhere; the stored values are always UTC.
    expect(utcTimestamp(new Date('2026-08-09T23:30:00Z'))).toBe('2026-08-09T23:30:00Z');
    expect(utcTimestamp(new Date('2026-08-10T00:30:00Z'))).toBe('2026-08-10T00:30:00Z');
  });

  it('is fixed width, so string order is time order', () => {
    // The whole point of the format. Sorting and range scans on these columns
    // are lexicographic, because they are TEXT on both backends.
    const early = utcTimestamp(new Date('2026-08-09T09:00:00Z'));
    const late = utcTimestamp(new Date('2026-08-09T21:00:00Z'));

    expect(early.length).toBe(late.length);
    expect(early < late).toBe(true);
  });

  it('round-trips through Date as the same instant', () => {
    // What the browser does with it. If this ever fails, every displayed time
    // is wrong by the viewer's UTC offset.
    expect(new Date(utcTimestamp(AT)).getTime()).toBe(Math.floor(AT.getTime() / 1000) * 1000);
  });

  it('renders now in the same shape', () => {
    expect(isUtcTimestamp(utcNow())).toBe(true);
  });
});

describe('utcCalendarDay', () => {
  it('renders a bare day', () => {
    expect(utcCalendarDay(AT)).toBe('2026-08-09');
  });
});

describe('utcTimestampDaysAgo', () => {
  it('subtracts whole days', () => {
    expect(utcTimestampDaysAgo(30, AT)).toBe('2026-07-10T14:30:05Z');
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
    expect(utcTimestampDaysAgo(10, new Date('2026-03-05T00:00:00Z'))).toBe('2026-02-23T00:00:00Z');
  });
});

describe('normalizeUtcTimestamp', () => {
  it('leaves a canonical value alone', () => {
    // Null is what stops migration 014 rewriting every row on every boot.
    expect(normalizeUtcTimestamp('2026-08-09T14:30:05Z')).toBeNull();
  });

  it('truncates the millisecond form insertRecord used to write', () => {
    expect(normalizeUtcTimestamp('2026-08-09T14:30:05.241Z')).toBe('2026-08-09T14:30:05Z');
  });

  it('converts the space form the column defaults used to produce', () => {
    expect(normalizeUtcTimestamp('2026-08-09 14:30:05')).toBe('2026-08-09T14:30:05Z');
  });

  it('reads the space form as UTC, not as local time', () => {
    // The reason for the whole change: Date would read this as local, so it
    // must never reach Date. Asserted as an instant, not as text.
    const normalized = normalizeUtcTimestamp('2026-08-09 14:30:05')!;

    expect(new Date(normalized).getTime()).toBe(Date.parse('2026-08-09T14:30:05Z'));
  });

  it('treats an offset-less ISO string as UTC', () => {
    expect(normalizeUtcTimestamp('2026-08-09T14:30:05')).toBe('2026-08-09T14:30:05Z');
  });

  it('reads a bare day as its first instant, so it still sorts before that day', () => {
    expect(normalizeUtcTimestamp('2026-08-09')).toBe('2026-08-09T00:00:00Z');
  });

  it('converts a value carrying a real offset', () => {
    expect(normalizeUtcTimestamp('2026-08-09T19:30:05+05:00')).toBe('2026-08-09T14:30:05Z');
  });

  it('leaves anything it does not understand alone', () => {
    expect(normalizeUtcTimestamp('not a date')).toBeNull();
    expect(normalizeUtcTimestamp('')).toBeNull();
    expect(normalizeUtcTimestamp(null)).toBeNull();
    expect(normalizeUtcTimestamp(42)).toBeNull();
  });

  it('is idempotent', () => {
    const once = normalizeUtcTimestamp('2026-08-09 14:30:05')!;

    expect(normalizeUtcTimestamp(once)).toBeNull();
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

  it('is idempotent', () => {
    const once = normalizeCalendarDay('2026-08-09T23:30:05.241Z')!;

    expect(normalizeCalendarDay(once)).toBeNull();
  });
});

describe('isUtcTimestamp', () => {
  it('accepts only the canonical shape', () => {
    expect(isUtcTimestamp('2026-08-09T14:30:05Z')).toBe(true);
    expect(isUtcTimestamp('2026-08-09 14:30:05')).toBe(false);
    expect(isUtcTimestamp('2026-08-09T14:30:05.241Z')).toBe(false);
    expect(isUtcTimestamp('2026-08-09')).toBe(false);
    expect(isUtcTimestamp(undefined)).toBe(false);
  });
});
