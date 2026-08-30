import { useCallback, useState } from 'react';
import { type DateRangePeriod, dateRangeFilterOptions } from '@/utils/data/period.util';

const DEFAULT_PERIOD: DateRangePeriod = 'this_year';
const VALID = new Set(dateRangeFilterOptions.map(option => option.value));

const keyFor = (screen: string): string => `slimbooks.period.${screen}`;

const read = (screen: string): DateRangePeriod => {
  try {
    const stored = localStorage.getItem(keyFor(screen));
    return stored && VALID.has(stored as DateRangePeriod)
      ? (stored as DateRangePeriod)
      : DEFAULT_PERIOD;
  } catch {
    // A private window, cleared site data, or a browser set to block storage.
    return DEFAULT_PERIOD;
  }
};

/**
 * The period a screen opens on, remembered per screen.
 *
 * Fiscal-year-to-date by default: an import is almost always historical, and a
 * one-month window made imported rows invisible. This is a per-viewer
 * convenience, not data — a fresh browser simply gets the default.
 */
export const useRememberedPeriod = (
  screen: string
): [DateRangePeriod, (period: DateRangePeriod) => void] => {
  const [period, setPeriod] = useState<DateRangePeriod>(() => read(screen));

  const remember = useCallback((next: DateRangePeriod): void => {
    setPeriod(next);
    try {
      localStorage.setItem(keyFor(screen), next);
    } catch {
      // Not being able to remember is not a reason to fail the interaction.
    }
  }, [screen]);

  return [period, remember];
};
