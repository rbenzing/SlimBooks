/**
 * toDateInputValue tests
 *
 * `<input type="date">` only accepts a `yyyy-MM-dd` value. Anything else is
 * silently rejected by the browser and the control renders blank, which in the
 * invoice editor produced an empty "Due Date" field on a record that clearly
 * had one. The API stores due dates as full ISO-8601 timestamps
 * (`2026-08-24T21:03:26.651Z`), so the value has to be narrowed before it
 * reaches the input.
 */

import { describe, it, expect } from 'vitest';
import { toDateInputValue } from '@/utils/formatting';

describe('toDateInputValue', () => {
  it('narrows a full ISO-8601 timestamp to its calendar date', () => {
    expect(toDateInputValue('2026-08-24T21:03:26.651Z')).toBe('2026-08-24');
  });

  it('passes through a value that is already yyyy-MM-dd', () => {
    expect(toDateInputValue('2026-08-24')).toBe('2026-08-24');
  });

  it('does not shift the calendar day across timezones', () => {
    // A UTC timestamp late in the day would roll back to the 23rd if it were
    // reparsed through the local timezone in the Americas.
    expect(toDateInputValue('2026-08-24T23:59:59.000Z')).toBe('2026-08-24');
    // ...and forward to the 25th if reparsed east of UTC.
    expect(toDateInputValue('2026-08-24T00:00:00.000Z')).toBe('2026-08-24');
  });

  it('formats a Date instance using its local calendar parts', () => {
    expect(toDateInputValue(new Date(2026, 7, 24))).toBe('2026-08-24');
  });

  it('pads single-digit months and days', () => {
    expect(toDateInputValue(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('returns an empty string for empty input rather than a fabricated date', () => {
    expect(toDateInputValue(null)).toBe('');
    expect(toDateInputValue(undefined)).toBe('');
    expect(toDateInputValue('')).toBe('');
  });

  it('returns an empty string for an unparseable value', () => {
    expect(toDateInputValue('not a date')).toBe('');
    expect(toDateInputValue(new Date('nope'))).toBe('');
  });
});
