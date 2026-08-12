import type { DateTimeSettings } from '@/types';
import {
  DEFAULT_DATE_TIME_SETTINGS,
  DATE_FORMAT_OPTIONS,
  TIME_FORMAT_OPTIONS
} from '@/types';

/**
 * Reading stored dates for display.
 *
 * The server stores two things, and they are not the same kind of value:
 *
 *   2026-08-12T13:54:13Z   an instant, UTC — created_at, updated_at, expiries
 *   2026-08-12             a calendar day — due dates, issue dates, payment and
 *                          expense dates
 *
 * An instant is rendered in the viewer's own timezone, because that is what the
 * viewer means by "when". A calendar day is rendered as itself: an invoice due
 * on the 12th is due on the 12th in Auckland and in Los Angeles, and treating it
 * as an instant shows the 11th to half the world.
 *
 * Which format the user sees is theirs to choose, in Settings → General. Both a
 * sync and an async path exist because most of the app renders synchronously —
 * they share one implementation so the two can't disagree, and both read the
 * same settings.
 */

/** Where the sync formatters find the settings before the API answers. */
const STORAGE_KEY = 'slimbooks.dateTimeSettings';

let dateTimeSettingsCache: DateTimeSettings | null = null;
let dateTimeSettingsPromise: Promise<DateTimeSettings> | null = null;

const isDateTimeSettings = (settings: unknown): settings is DateTimeSettings => {
  return (
    typeof settings === 'object' &&
    settings !== null &&
    'dateFormat' in settings &&
    'timeFormat' in settings &&
    typeof (settings as DateTimeSettings).dateFormat === 'string' &&
    typeof (settings as DateTimeSettings).timeFormat === 'string'
  );
};

/**
 * Mirror the settings into localStorage.
 *
 * Without this the synchronous formatters render the first screen in the
 * default format and only pick up the user's choice once something happens to
 * await the API — so a user who set DD/MM/YYYY would watch their dates flip
 * format mid-session. localStorage is readable at first paint, which is the
 * only reason it is used here; the API remains the source of truth.
 */
const rememberDateTimeSettings = (settings: DateTimeSettings): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // A private-mode or quota failure costs the first render its format and
    // nothing else. Never worth failing a page over.
  }
};

const recallDateTimeSettings = (): DateTimeSettings | null => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;

    const parsed: unknown = JSON.parse(stored);
    return isDateTimeSettings(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

/** The settings as far as anything synchronous can know them. */
const currentDateTimeSettings = (): DateTimeSettings =>
  dateTimeSettingsCache ?? recallDateTimeSettings() ?? DEFAULT_DATE_TIME_SETTINGS;

export const getDateTimeSettings = async (): Promise<DateTimeSettings> => {
  if (dateTimeSettingsCache) {
    return dateTimeSettingsCache;
  }

  if (dateTimeSettingsPromise) {
    return dateTimeSettingsPromise;
  }

  dateTimeSettingsPromise = (async () => {
    try {
      const { sqliteService } = await import('@/services/sqlite.svc');

      if (sqliteService.isReady()) {
        const settings = await sqliteService.getSetting('date_time_settings', 'general');
        if (settings && isDateTimeSettings(settings)) {
          const result = {
            dateFormat: settings.dateFormat || DEFAULT_DATE_TIME_SETTINGS.dateFormat,
            timeFormat: settings.timeFormat || DEFAULT_DATE_TIME_SETTINGS.timeFormat
          };
          dateTimeSettingsCache = result;
          rememberDateTimeSettings(result);
          return result;
        }
      }
    } catch (error) {
      console.error('Error loading date/time settings:', error);
    }

    dateTimeSettingsCache = DEFAULT_DATE_TIME_SETTINGS;
    return DEFAULT_DATE_TIME_SETTINGS;
  })();

  const result = await dateTimeSettingsPromise;
  dateTimeSettingsPromise = null;
  return result;
};

export const saveDateTimeSettings = async (settings: DateTimeSettings): Promise<void> => {
  try {
    const { sqliteService } = await import('@/services/sqlite.svc');

    if (sqliteService.isReady()) {
      await sqliteService.setSetting('date_time_settings', settings, 'general');
      dateTimeSettingsCache = settings;
      rememberDateTimeSettings(settings);
    }
  } catch (error) {
    console.error('Error saving date/time settings:', error);
  }
};

const getDateFormatOptions = (format: string): Intl.DateTimeFormatOptions => {
  switch (format) {
    case 'MM/DD/YYYY':
      return { year: 'numeric', month: '2-digit', day: '2-digit' };
    case 'DD/MM/YYYY':
      return { year: 'numeric', month: '2-digit', day: '2-digit' };
    case 'YYYY-MM-DD':
      return { year: 'numeric', month: '2-digit', day: '2-digit' };
    case 'MMM DD, YYYY':
      return { year: 'numeric', month: 'short', day: 'numeric' };
    case 'DD MMM YYYY':
      return { year: 'numeric', month: 'short', day: 'numeric' };
    case 'MMMM DD, YYYY':
      return { year: 'numeric', month: 'long', day: 'numeric' };
    default:
      return { year: 'numeric', month: '2-digit', day: '2-digit' };
  }
};

const getTimeFormatOptions = (format: string): Intl.DateTimeFormatOptions => {
  return {
    hour: '2-digit',
    minute: '2-digit',
    hour12: format === '12-hour'
  };
};

/**
 * `yyyy-MM-dd` built from the date's own local components. `toISOString()`
 * renders the UTC calendar day instead, which is the day either side of the
 * local one for most of the world — the date shown would not match the date
 * the user entered.
 */
const toIsoCalendarDay = (date: Date): string => {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
};

/** The single place a chosen date format is turned into text. */
const applyDateFormat = (date: Date, format: string): string => {
  const options = getDateFormatOptions(format);

  if (format === 'DD/MM/YYYY') {
    return date.toLocaleDateString('en-GB', options);
  }
  if (format === 'YYYY-MM-DD') {
    return toIsoCalendarDay(date);
  }
  if (format === 'DD MMM YYYY') {
    return date.toLocaleDateString('en-GB', options);
  }

  return date.toLocaleDateString('en-US', options);
};

/** The single place a chosen time format is turned into text. */
const applyTimeFormat = (date: Date, format: string): string =>
  date.toLocaleTimeString('en-US', getTimeFormatOptions(format));

const CALENDAR_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * A UTC timestamp written without its `T` or its `Z`.
 *
 * The server no longer produces these — migration 014 rewrote the stored ones —
 * but a database restored from an older backup still holds them, and `Date`
 * reads this shape as *local* time, silently shifting every value by the
 * viewer's offset. Recognising it here costs one regex and removes the only way
 * that shift can still happen.
 */
const LEGACY_SQL_TIMESTAMP = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})$/;

/**
 * Reads a stored date for display.
 *
 * A bare `yyyy-MM-dd` is a calendar day, not an instant, but
 * `new Date('2026-07-31')` parses it as UTC midnight — which is the previous day
 * everywhere west of UTC. Due dates and issue dates are stored in exactly that
 * form, so they must be read as local days. Full timestamps stay instants.
 */
export const parseDisplayDate = (value: Date | string | number): Date => {
  // An instant, exactly as the database stores it: epoch milliseconds.
  if (typeof value === 'number') {
    return new Date(value);
  }

  if (typeof value !== 'string') {
    return value;
  }

  const calendarDate = CALENDAR_DAY.exec(value);
  if (calendarDate) {
    return new Date(Number(calendarDate[1]), Number(calendarDate[2]) - 1, Number(calendarDate[3]));
  }

  const legacy = LEGACY_SQL_TIMESTAMP.exec(value);
  if (legacy) {
    return new Date(`${legacy[1]}T${legacy[2]}Z`);
  }

  return new Date(value);
};

export const formatDate = async (date: Date | string | number, customFormat?: string): Promise<string> => {
  const dateObj = parseDisplayDate(date);
  if (isNaN(dateObj.getTime())) {
    return 'Invalid Date';
  }

  const settings = await getDateTimeSettings();
  return applyDateFormat(dateObj, customFormat || settings.dateFormat);
};

export const formatTime = async (date: Date | string | number, customFormat?: string): Promise<string> => {
  const dateObj = parseDisplayDate(date);
  if (isNaN(dateObj.getTime())) {
    return 'Invalid Time';
  }

  const settings = await getDateTimeSettings();
  return applyTimeFormat(dateObj, customFormat || settings.timeFormat);
};

export const formatDateTime = async (
  date: Date | string | number,
  customDateFormat?: string,
  customTimeFormat?: string
): Promise<string> => {
  const dateObj = parseDisplayDate(date);
  if (isNaN(dateObj.getTime())) {
    return 'Invalid Date/Time';
  }

  const formattedDate = await formatDate(dateObj, customDateFormat);
  const formattedTime = await formatTime(dateObj, customTimeFormat);

  return `${formattedDate} ${formattedTime}`;
};

export const formatDateRange = async (
  startDate: Date | string | number,
  endDate: Date | string | number,
  customFormat?: string
): Promise<string> => {
  const start = await formatDate(startDate, customFormat);
  const end = await formatDate(endDate, customFormat);
  return `${start} - ${end}`;
};

/**
 * Narrows a date to the `yyyy-MM-dd` value an `<input type="date">` accepts.
 * A full timestamp is rejected silently by the control and renders as blank.
 * Returns '' when there is nothing to show, so an absent date never becomes a
 * fabricated one.
 */
export const toDateInputValue = (date: Date | string | number | null | undefined): string => {
  if (!date) {
    return '';
  }

  if (typeof date === 'string') {
    // Take the calendar portion verbatim so the day never shifts by timezone.
    const isoDate = /^(\d{4}-\d{2}-\d{2})/.exec(date);
    if (isoDate) {
      return isoDate[1];
    }
  }

  const dateObj = parseDisplayDate(date);
  if (isNaN(dateObj.getTime())) {
    return '';
  }

  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${dateObj.getFullYear()}-${month}-${day}`;
};

/**
 * The date, in the user's chosen format, without awaiting anything.
 *
 * Used by the list and detail views, which render synchronously. This used to
 * hard-code `MM/DD/YYYY` in `en-US`, so eleven screens ignored the format the
 * user had chosen in Settings while the four that awaited `formatDate`
 * honoured it — the same invoice showed two different dates depending on where
 * you looked at it.
 */
export const formatDateSync = (date: Date | string | number | null | undefined): string => {
  if (!date) {
    return 'Invalid Date';
  }
  const dateObj = parseDisplayDate(date);
  if (isNaN(dateObj.getTime())) {
    return 'Invalid Date';
  }

  return applyDateFormat(dateObj, currentDateTimeSettings().dateFormat);
};

/** The time of day, in the user's chosen format, in their own timezone. */
export const formatTimeSync = (date: Date | string | number | null | undefined): string => {
  if (!date) {
    return 'Invalid Time';
  }
  const dateObj = parseDisplayDate(date);
  if (isNaN(dateObj.getTime())) {
    return 'Invalid Time';
  }

  return applyTimeFormat(dateObj, currentDateTimeSettings().timeFormat);
};

/** Date and time together, both in the user's chosen formats. */
export const formatDateTimeSync = (date: Date | string | number | null | undefined): string => {
  if (!date) {
    return 'Invalid Date/Time';
  }
  const dateObj = parseDisplayDate(date);
  if (isNaN(dateObj.getTime())) {
    return 'Invalid Date/Time';
  }

  return `${formatDateSync(dateObj)} ${formatTimeSync(dateObj)}`;
};

export const formatDateRangeSync = (
  startDate: Date | string | number,
  endDate: Date | string | number
): string => {
  const startObj = parseDisplayDate(startDate);
  const endObj = parseDisplayDate(endDate);

  if (isNaN(startObj.getTime()) || isNaN(endObj.getTime())) {
    return 'Invalid Date Range';
  }

  return `${formatDateSync(startObj)} - ${formatDateSync(endObj)}`;
};

export const getDateFormatPreview = (format: string): string =>
  applyDateFormat(new Date(2024, 11, 31), format);

export const getTimeFormatPreview = (format: string): string =>
  applyTimeFormat(new Date(2024, 11, 31, 14, 30), format);

export const clearDateTimeCache = (): void => {
  dateTimeSettingsCache = null;
  dateTimeSettingsPromise = null;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clear if storage is unavailable.
  }
};

export { DATE_FORMAT_OPTIONS, TIME_FORMAT_OPTIONS, DEFAULT_DATE_TIME_SETTINGS };
