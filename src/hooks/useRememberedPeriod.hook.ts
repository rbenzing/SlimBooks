import { useCallback, useState } from 'react';
import { type DateRangePeriod, dateRangeFilterOptions, toCalendarDay } from '@/utils/data/period.util';
import { parseDisplayDate } from '@/utils/formatting/date.util';
import { type DateRange } from '@/types';

const DEFAULT_PERIOD: DateRangePeriod = 'this_year';
const VALID = new Set(dateRangeFilterOptions.map(option => option.value));

const periodKeyFor = (screen: string): string => `slimbooks.period.${screen}`;
const rangeKeyFor = (screen: string): string => `slimbooks.periodRange.${screen}`;

const readRange = (screen: string): DateRange | undefined => {
  try {
    const stored = localStorage.getItem(rangeKeyFor(screen));
    if (!stored) return undefined;

    const parsed: unknown = JSON.parse(stored);
    if (
      !parsed || typeof parsed !== 'object' ||
      typeof (parsed as { start?: unknown }).start !== 'string' ||
      typeof (parsed as { end?: unknown }).end !== 'string'
    ) {
      return undefined;
    }

    const start = parseDisplayDate((parsed as { start: string }).start);
    const end = parseDisplayDate((parsed as { end: string }).end);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return undefined;

    return { start, end };
  } catch {
    return undefined;
  }
};

/**
 * The period (and, for `custom`, the range that goes with it) a screen opens
 * on, remembered per screen.
 *
 * `custom` is meaningless without its date range, so it is never returned
 * without one: a stored `custom` whose companion range is missing or
 * unreadable falls back to the default rather than leaving a caller to
 * combine `period === 'custom'` with an undefined range and land in
 * `getDateRangeForPeriod`'s month-to-date fallback while still labelled
 * "Custom Range". That mismatch — the screen claiming a period it isn't
 * showing — is what let "Show all imported" (a custom range set right after
 * an import) revert to month-to-date on the next visit, silently hiding the
 * rows the user had just confirmed were there.
 */
const read = (screen: string): { period: DateRangePeriod; range?: DateRange } => {
  try {
    const stored = localStorage.getItem(periodKeyFor(screen));
    const period = stored && VALID.has(stored as DateRangePeriod)
      ? (stored as DateRangePeriod)
      : DEFAULT_PERIOD;

    if (period !== 'custom') {
      return { period };
    }

    const range = readRange(screen);
    return range ? { period, range } : { period: DEFAULT_PERIOD };
  } catch {
    // A private window, cleared site data, or a browser set to block storage.
    return { period: DEFAULT_PERIOD };
  }
};

export const useRememberedPeriod = (
  screen: string
): [DateRangePeriod, DateRange | undefined, (period: DateRangePeriod, customRange?: DateRange) => void] => {
  const [initial] = useState(() => read(screen));
  const [period, setPeriod] = useState<DateRangePeriod>(initial.period);
  const [range, setRange] = useState<DateRange | undefined>(initial.range);

  const remember = useCallback((next: DateRangePeriod, nextRange?: DateRange): void => {
    const rangeToKeep = next === 'custom' ? nextRange : undefined;
    setPeriod(next);
    setRange(rangeToKeep);
    try {
      localStorage.setItem(periodKeyFor(screen), next);
      if (rangeToKeep) {
        localStorage.setItem(rangeKeyFor(screen), JSON.stringify({
          start: toCalendarDay(rangeToKeep.start),
          end: toCalendarDay(rangeToKeep.end)
        }));
      } else {
        localStorage.removeItem(rangeKeyFor(screen));
      }
    } catch {
      // Not being able to remember is not a reason to fail the interaction.
    }
  }, [screen]);

  return [period, range, remember];
};
