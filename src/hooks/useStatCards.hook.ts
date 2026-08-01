// Whether the summary cards at the top of the list and report screens are shown.
import { useAppearanceSettings } from '@/hooks/useSettings.hook';

/**
 * Reads the "show summary cards" preference.
 *
 * Defaults to showing them, including while the setting is still loading — a
 * screen that flashed its cards away and back on every navigation would be
 * worse than ignoring the preference for a moment.
 */
export const useShowStatCards = (): boolean => {
  const { settings } = useAppearanceSettings();

  // The defaults are `as const`, so the literal `true` has to be widened before
  // it can be compared against a stored value.
  const stored = (settings as Record<string, unknown> | undefined)?.show_stat_cards;

  return stored !== false;
};
