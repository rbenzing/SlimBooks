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
        const settings = await sqliteService.getSetting('date_time_settings');
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

export const formatDate = async (date: Date | string, customFormat?: string): Promise<string> => {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(dateObj.getTime())) {
    return 'Invalid Date';
  }

  const settings = await getDateTimeSettings();
  const format = customFormat || settings.dateFormat;
  const options = getDateFormatOptions(format);

  if (format === 'DD/MM/YYYY') {
    return dateObj.toLocaleDateString('en-GB', options);
  } else if (format === 'YYYY-MM-DD') {
    return dateObj.toISOString().split('T')[0];
  } else if (format === 'DD MMM YYYY') {
    return dateObj.toLocaleDateString('en-GB', options);
  }

  return dateObj.toLocaleDateString('en-US', options);
};

export const formatTime = async (date: Date | string, customFormat?: string): Promise<string> => {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
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
  const dateObj = typeof date === 'string' ? new Date(date) : date;
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

  const dateObj = typeof date === 'string' ? new Date(date) : date;
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
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(dateObj.getTime())) {
    return 'Invalid Date';
  }

  return dateObj.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' });
};

export const formatDateRangeSync = (startDate: Date | string, endDate: Date | string): string => {
  const startObj = typeof startDate === 'string' ? new Date(startDate) : startDate;
  const endObj = typeof endDate === 'string' ? new Date(endDate) : endDate;

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
    return sampleDate.toISOString().split('T')[0];
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