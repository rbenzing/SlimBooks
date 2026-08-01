import type { DateTimeSettings } from '@/types';
import {
  DEFAULT_DATE_TIME_SETTINGS,
  DATE_FORMAT_OPTIONS,
  TIME_FORMAT_OPTIONS
} from '@/types';

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

/**
 * Reads a stored date for display. A bare `yyyy-MM-dd` is a calendar day, not
 * an instant, but `new Date('2026-07-31')` parses it as UTC midnight — which is
 * the previous day everywhere west of UTC. Due dates and issue dates are stored
 * in exactly that form, so they must be read as local days. Full timestamps
 * stay instants.
 */
export const parseDisplayDate = (value: Date | string): Date => {
  if (typeof value !== 'string') {
    return value;
  }

  const calendarDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (calendarDate) {
    return new Date(Number(calendarDate[1]), Number(calendarDate[2]) - 1, Number(calendarDate[3]));
  }

  return new Date(value);
};

export const formatDate = async (date: Date | string, customFormat?: string): Promise<string> => {
  const dateObj = parseDisplayDate(date);
  if (isNaN(dateObj.getTime())) {
    return 'Invalid Date';
  }

  const settings = await getDateTimeSettings();
  const format = customFormat || settings.dateFormat;
  const options = getDateFormatOptions(format);

  if (format === 'DD/MM/YYYY') {
    return dateObj.toLocaleDateString('en-GB', options);
  } else if (format === 'YYYY-MM-DD') {
    return toIsoCalendarDay(dateObj);
  } else if (format === 'DD MMM YYYY') {
    return dateObj.toLocaleDateString('en-GB', options);
  }

  return dateObj.toLocaleDateString('en-US', options);
};

export const formatTime = async (date: Date | string, customFormat?: string): Promise<string> => {
  const dateObj = parseDisplayDate(date);
  if (isNaN(dateObj.getTime())) {
    return 'Invalid Time';
  }

  const settings = await getDateTimeSettings();
  const format = customFormat || settings.timeFormat;
  const options = getTimeFormatOptions(format);

  return dateObj.toLocaleTimeString('en-US', options);
};

export const formatDateTime = async (
  date: Date | string,
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
  startDate: Date | string,
  endDate: Date | string,
  customFormat?: string
): Promise<string> => {
  const start = await formatDate(startDate, customFormat);
  const end = await formatDate(endDate, customFormat);
  return `${start} - ${end}`;
};

/**
 * Narrows a date to the `yyyy-MM-dd` value an `<input type="date">` accepts.
 * The API stores dates as full ISO-8601 timestamps, which the control rejects
 * silently and renders as blank. Returns '' when there is nothing to show, so
 * an absent date never becomes a fabricated one.
 */
export const toDateInputValue = (date: Date | string | null | undefined): string => {
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

export const formatDateSync = (date: Date | string | null | undefined): string => {
  if (!date) {
    return 'Invalid Date';
  }
  const dateObj = parseDisplayDate(date);
  if (isNaN(dateObj.getTime())) {
    return 'Invalid Date';
  }

  return dateObj.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' });
};

export const formatDateRangeSync = (startDate: Date | string, endDate: Date | string): string => {
  const startObj = parseDisplayDate(startDate);
  const endObj = parseDisplayDate(endDate);

  if (isNaN(startObj.getTime()) || isNaN(endObj.getTime())) {
    return 'Invalid Date Range';
  }

  const start = startObj.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' });
  const end = endObj.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' });
  return `${start} - ${end}`;
};

export const getDateFormatPreview = (format: string): string => {
  const sampleDate = new Date(2024, 11, 31);
  const options = getDateFormatOptions(format);

  if (format === 'DD/MM/YYYY') {
    return sampleDate.toLocaleDateString('en-GB', options);
  } else if (format === 'YYYY-MM-DD') {
    return toIsoCalendarDay(sampleDate);
  } else if (format === 'DD MMM YYYY') {
    return sampleDate.toLocaleDateString('en-GB', options);
  }

  return sampleDate.toLocaleDateString('en-US', options);
};

export const getTimeFormatPreview = (format: string): string => {
  const sampleDate = new Date(2024, 11, 31, 14, 30);
  const options = getTimeFormatOptions(format);
  return sampleDate.toLocaleTimeString('en-US', options);
};

export const clearDateTimeCache = (): void => {
  dateTimeSettingsCache = null;
  dateTimeSettingsPromise = null;
};

export { DATE_FORMAT_OPTIONS, TIME_FORMAT_OPTIONS, DEFAULT_DATE_TIME_SETTINGS };