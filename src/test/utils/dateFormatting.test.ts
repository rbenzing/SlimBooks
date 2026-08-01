/**
 * Date formatting tests.
 *
 * Every date the user sees goes through here. The recurring hazard in this
 * codebase is mixing local and UTC: `toISOString()` renders a *UTC* calendar
 * day, so using it to display a local date shows the wrong day for anyone whose
 * offset pushes the timestamp across midnight. These tests assert against the
 * date's own local components so they hold in any timezone.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { getSetting, setSetting, isReady } = vi.hoisted(() => ({
  getSetting: vi.fn(),
  setSetting: vi.fn(),
  isReady: vi.fn(() => true)
}));

vi.mock('@/services/sqlite.svc', () => ({ sqliteService: { getSetting, setSetting, isReady } }));

import {
  getDateTimeSettings,
  saveDateTimeSettings,
  formatDate,
  formatTime,
  formatDateTime,
  formatDateRange,
  formatDateSync,
  formatDateRangeSync,
  toDateInputValue,
  getDateFormatPreview,
  getTimeFormatPreview,
  clearDateTimeCache
} from '@/utils/formatting/date.util';

/** The local calendar day of a Date, as yyyy-MM-dd. */
const localCalendarDay = (date: Date) => {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
};

beforeEach(() => {
  vi.clearAllMocks();
  clearDateTimeCache();
  isReady.mockReturnValue(true);
  getSetting.mockResolvedValue(null);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  clearDateTimeCache();
  vi.restoreAllMocks();
});

describe('getDateTimeSettings', () => {
  it('returns the stored formats', async () => {
    getSetting.mockResolvedValue({ dateFormat: 'DD/MM/YYYY', timeFormat: '24-hour' });

    await expect(getDateTimeSettings())
      .resolves.toEqual({ dateFormat: 'DD/MM/YYYY', timeFormat: '24-hour' });
  });

  it('falls back to defaults when nothing is stored', async () => {
    getSetting.mockResolvedValue(null);

    await expect(getDateTimeSettings())
      .resolves.toMatchObject({ dateFormat: expect.any(String), timeFormat: expect.any(String) });
  });

  it('ignores a stored value of the wrong shape', async () => {
    getSetting.mockResolvedValue({ dateFormat: 42 });

    const settings = await getDateTimeSettings();

    expect(typeof settings.dateFormat).toBe('string');
  });

  it('falls back rather than throwing when the read fails', async () => {
    getSetting.mockRejectedValue(new Error('database locked'));

    await expect(getDateTimeSettings()).resolves.toBeTruthy();
  });

  it('does not query before the database is ready', async () => {
    isReady.mockReturnValue(false);

    await expect(getDateTimeSettings()).resolves.toBeTruthy();
    expect(getSetting).not.toHaveBeenCalled();
  });

  it('reads once and serves the rest from cache', async () => {
    getSetting.mockResolvedValue({ dateFormat: 'DD/MM/YYYY', timeFormat: '24-hour' });

    await getDateTimeSettings();
    await getDateTimeSettings();
    await getDateTimeSettings();

    expect(getSetting).toHaveBeenCalledTimes(1);
  });

  it('collapses concurrent reads into one request', async () => {
    getSetting.mockResolvedValue({ dateFormat: 'DD/MM/YYYY', timeFormat: '24-hour' });

    await Promise.all([getDateTimeSettings(), getDateTimeSettings(), getDateTimeSettings()]);

    expect(getSetting).toHaveBeenCalledTimes(1);
  });

  it('re-reads after the cache is cleared', async () => {
    getSetting.mockResolvedValue({ dateFormat: 'DD/MM/YYYY', timeFormat: '24-hour' });
    await getDateTimeSettings();

    clearDateTimeCache();
    await getDateTimeSettings();

    expect(getSetting).toHaveBeenCalledTimes(2);
  });
});

describe('saveDateTimeSettings', () => {
  it('stores under the general category', async () => {
    await saveDateTimeSettings({ dateFormat: 'YYYY-MM-DD', timeFormat: '24-hour' });

    expect(setSetting).toHaveBeenCalledWith(
      'date_time_settings',
      { dateFormat: 'YYYY-MM-DD', timeFormat: '24-hour' },
      'general'
    );
  });

  it('makes the new format take effect immediately', async () => {
    // Without updating the cache the UI keeps rendering the old format.
    getSetting.mockResolvedValue({ dateFormat: 'MM/DD/YYYY', timeFormat: '12-hour' });
    await getDateTimeSettings();

    await saveDateTimeSettings({ dateFormat: 'YYYY-MM-DD', timeFormat: '24-hour' });

    await expect(getDateTimeSettings())
      .resolves.toMatchObject({ dateFormat: 'YYYY-MM-DD' });
  });

  it('does not throw when the write fails', async () => {
    setSetting.mockRejectedValue(new Error('read-only database'));

    await expect(saveDateTimeSettings({ dateFormat: 'YYYY-MM-DD', timeFormat: '24-hour' }))
      .resolves.toBeUndefined();
  });
});

describe('formatDate', () => {
  it('renders the ISO format as the local calendar day', async () => {
    // toISOString() renders the UTC day, which is the previous or next day for
    // most of the world — the date shown would not match the date stored.
    const evening = new Date(2026, 6, 31, 20, 0, 0);

    await expect(formatDate(evening, 'YYYY-MM-DD')).resolves.toBe(localCalendarDay(evening));
  });

  it('renders a morning timestamp as the same local day', async () => {
    const morning = new Date(2026, 6, 31, 1, 0, 0);

    await expect(formatDate(morning, 'YYYY-MM-DD')).resolves.toBe(localCalendarDay(morning));
  });

  it('renders the ISO format for a bare calendar date unchanged', async () => {
    await expect(formatDate('2026-07-31', 'YYYY-MM-DD')).resolves.toBe('2026-07-31');
  });

  it('reads a bare calendar date as that day in every format', async () => {
    // A date string with no time parses as UTC midnight, which is the previous
    // day west of UTC. Due dates and issue dates are stored exactly like this,
    // so the whole app would show them a day early.
    await expect(formatDate('2026-07-31', 'MM/DD/YYYY')).resolves.toBe('07/31/2026');
    await expect(formatDate('2026-07-31', 'DD/MM/YYYY')).resolves.toBe('31/07/2026');
    await expect(formatDate('2026-07-31', 'MMM DD, YYYY')).resolves.toMatch(/31/);
  });

  it('reads a bare calendar date the same way in the synchronous formatter', () => {
    expect(formatDateSync('2026-07-31')).toBe('07/31/2026');
  });

  it('renders day-first and month-first formats differently', async () => {
    const date = new Date(2026, 0, 2, 12, 0, 0);

    const dayFirst = await formatDate(date, 'DD/MM/YYYY');
    const monthFirst = await formatDate(date, 'MM/DD/YYYY');

    expect(dayFirst).toBe('02/01/2026');
    expect(monthFirst).toBe('01/02/2026');
  });

  it('renders the long-month formats with a month name', async () => {
    const date = new Date(2026, 0, 2, 12, 0, 0);

    await expect(formatDate(date, 'MMM DD, YYYY')).resolves.toMatch(/Jan/);
    await expect(formatDate(date, 'MMMM DD, YYYY')).resolves.toMatch(/January/);
    await expect(formatDate(date, 'DD MMM YYYY')).resolves.toMatch(/Jan/);
  });

  it('uses the stored format when none is given', async () => {
    getSetting.mockResolvedValue({ dateFormat: 'DD/MM/YYYY', timeFormat: '24-hour' });

    await expect(formatDate(new Date(2026, 0, 2, 12, 0, 0))).resolves.toBe('02/01/2026');
  });

  it('says so plainly for an unparseable date', async () => {
    await expect(formatDate('not a date')).resolves.toBe('Invalid Date');
  });

  it('falls back to a month-first rendering for an unknown format', async () => {
    await expect(formatDate(new Date(2026, 0, 2, 12, 0, 0), 'CLINGON')).resolves.toBe('01/02/2026');
  });
});

describe('formatTime', () => {
  it('renders a twelve-hour clock with a meridiem', async () => {
    const result = await formatTime(new Date(2026, 0, 2, 14, 30), '12-hour');

    expect(result).toMatch(/02:30/);
    expect(result).toMatch(/PM/i);
  });

  it('renders a twenty-four-hour clock without one', async () => {
    const result = await formatTime(new Date(2026, 0, 2, 14, 30), '24-hour');

    expect(result).toMatch(/14:30/);
    expect(result).not.toMatch(/PM/i);
  });

  it('says so plainly for an unparseable time', async () => {
    await expect(formatTime('not a time')).resolves.toBe('Invalid Time');
  });
});

describe('formatDateTime', () => {
  it('joins the date and the time', async () => {
    const result = await formatDateTime(new Date(2026, 0, 2, 14, 30), 'MM/DD/YYYY', '24-hour');

    expect(result).toBe('01/02/2026 14:30');
  });

  it('says so plainly for an unparseable value', async () => {
    await expect(formatDateTime('rubbish')).resolves.toBe('Invalid Date/Time');
  });
});

describe('formatDateRange', () => {
  it('renders both ends in the same format', async () => {
    const result = await formatDateRange(
      new Date(2026, 0, 2, 12), new Date(2026, 1, 3, 12), 'MM/DD/YYYY'
    );

    expect(result).toBe('01/02/2026 - 02/03/2026');
  });

  it('renders a synchronous range the same way', () => {
    expect(formatDateRangeSync(new Date(2026, 0, 2, 12), new Date(2026, 1, 3, 12)))
      .toBe('01/02/2026 - 02/03/2026');
  });

  it('says so plainly when either end is unparseable', () => {
    expect(formatDateRangeSync('rubbish', new Date())).toBe('Invalid Date Range');
    expect(formatDateRangeSync(new Date(), 'rubbish')).toBe('Invalid Date Range');
  });
});

describe('formatDateSync', () => {
  it('renders a date without waiting on settings', () => {
    expect(formatDateSync(new Date(2026, 0, 2, 12))).toBe('01/02/2026');
  });

  it('says so plainly for a missing or unparseable date', () => {
    expect(formatDateSync(null)).toBe('Invalid Date');
    expect(formatDateSync(undefined)).toBe('Invalid Date');
    expect(formatDateSync('')).toBe('Invalid Date');
    expect(formatDateSync('rubbish')).toBe('Invalid Date');
  });
});

describe('toDateInputValue', () => {
  it('takes the calendar portion of an ISO timestamp verbatim', () => {
    // Reparsing would shift the day; the control would then show a date the
    // user never entered.
    expect(toDateInputValue('2026-07-31T23:30:00.000Z')).toBe('2026-07-31');
  });

  it('passes a bare calendar date through', () => {
    expect(toDateInputValue('2026-07-31')).toBe('2026-07-31');
  });

  it('renders a Date as its local calendar day', () => {
    const evening = new Date(2026, 6, 31, 20, 0);

    expect(toDateInputValue(evening)).toBe(localCalendarDay(evening));
  });

  it('returns empty rather than inventing a date', () => {
    expect(toDateInputValue(null)).toBe('');
    expect(toDateInputValue(undefined)).toBe('');
    expect(toDateInputValue('')).toBe('');
    expect(toDateInputValue('rubbish')).toBe('');
  });
});

describe('format previews', () => {
  it('previews the ISO format as the sample date, not the day either side', () => {
    // The preview is what the user picks a format by; showing the wrong day
    // makes the ISO option look broken.
    expect(getDateFormatPreview('YYYY-MM-DD')).toBe('2024-12-31');
  });

  it('previews each date format distinctly', () => {
    const previews = [
      'MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD', 'MMM DD, YYYY', 'MMMM DD, YYYY'
    ].map(getDateFormatPreview);

    expect(new Set(previews).size).toBe(previews.length);
  });

  it('previews the same day in every format', () => {
    for (const format of ['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD']) {
      expect(getDateFormatPreview(format)).toMatch(/31/);
      expect(getDateFormatPreview(format)).toMatch(/2024/);
    }
  });

  it('previews both clock formats', () => {
    expect(getTimeFormatPreview('12-hour')).toMatch(/PM/i);
    expect(getTimeFormatPreview('24-hour')).not.toMatch(/PM/i);
    expect(getTimeFormatPreview('24-hour')).toMatch(/14:30/);
  });
});
