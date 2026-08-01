import { type CurrencySettings } from '@/types';
import {
  DEFAULT_CURRENCY_SETTINGS,
  CURRENCY_OPTIONS,
  SYMBOL_POSITION_OPTIONS,
  DECIMAL_PLACES_OPTIONS,
  THOUSANDS_SEPARATOR_OPTIONS,
  DECIMAL_SEPARATOR_OPTIONS
} from '@/lib/constants';

// Re-export constants for convenient access
export {
  CURRENCY_OPTIONS,
  SYMBOL_POSITION_OPTIONS,
  DECIMAL_PLACES_OPTIONS,
  THOUSANDS_SEPARATOR_OPTIONS,
  DECIMAL_SEPARATOR_OPTIONS
};

let currencySettingsCache: CurrencySettings | null = null;
let currencySettingsPromise: Promise<CurrencySettings> | null = null;

export const getCurrencySymbol = (currencyCode: string): string => {
  const currency = CURRENCY_OPTIONS.find(c => c.value === currencyCode);
  return currency?.symbol || currencyCode;
};

export const getCurrencySettings = async (): Promise<CurrencySettings> => {
  if (currencySettingsCache) {
    return currencySettingsCache;
  }

  if (currencySettingsPromise) {
    return currencySettingsPromise;
  }

  currencySettingsPromise = (async () => {
    try {
      const { sqliteService } = await import('@/services/sqlite.svc');

      if (sqliteService.isReady()) {
        const settings = await sqliteService.getSetting('currency_format_settings') as CurrencySettings;
        if (settings) {
          const result = {
            currency: settings.currency || DEFAULT_CURRENCY_SETTINGS.currency,
            symbolPosition: settings.symbolPosition || DEFAULT_CURRENCY_SETTINGS.symbolPosition,
            decimalPlaces: settings.decimalPlaces ?? DEFAULT_CURRENCY_SETTINGS.decimalPlaces,
            thousandsSeparator: settings.thousandsSeparator || DEFAULT_CURRENCY_SETTINGS.thousandsSeparator,
            decimalSeparator: settings.decimalSeparator || DEFAULT_CURRENCY_SETTINGS.decimalSeparator
          };
          currencySettingsCache = result;
          return result;
        }
      }
    } catch (error) {
      console.error('Error loading currency settings:', error);
    }

    currencySettingsCache = DEFAULT_CURRENCY_SETTINGS;
    return DEFAULT_CURRENCY_SETTINGS;
  })();

  const result = await currencySettingsPromise;
  currencySettingsPromise = null;
  return result;
};

export const saveCurrencySettings = async (settings: CurrencySettings): Promise<void> => {
  try {
    const { sqliteService } = await import('@/services/sqlite.svc');

    if (sqliteService.isReady()) {
      await sqliteService.setSetting('currency_format_settings', settings, 'general');
      currencySettingsCache = settings;
    }
  } catch (error) {
    console.error('Error saving currency settings:', error);
  }
};

const formatNumber = (amount: number, settings: CurrencySettings): string => {
  const { decimalPlaces, thousandsSeparator, decimalSeparator } = settings;

  const rounded = Number(amount.toFixed(decimalPlaces));

  const parts = rounded.toFixed(decimalPlaces).split('.');
  let integerPart = parts[0];
  const decimalPart = parts[1];

  if (thousandsSeparator !== 'none' && integerPart.length > 3) {
    const regex = /(\d)(?=(\d{3})+(?!\d))/g;
    integerPart = integerPart.replace(regex, `$1${thousandsSeparator}`);
  }

  let result = integerPart;
  if (decimalPlaces > 0) {
    result += decimalSeparator + decimalPart;
  }

  return result;
};

/**
 * Places the symbol and sign around an already-formatted magnitude.
 * The minus sign belongs outside the symbol — `-$250.00`, not `$-250.00` —
 * which matters for credit notes and refunds.
 */
const withSymbol = (
  magnitude: string,
  symbol: string,
  isNegative: boolean,
  symbolPosition: CurrencySettings['symbolPosition']
): string => {
  const sign = isNegative ? '-' : '';
  return symbolPosition === 'before'
    ? `${sign}${symbol}${magnitude}`
    : `${sign}${magnitude}${symbol}`;
};

export const formatCurrency = async (
  amount: number | undefined | null,
  customSettings?: Partial<CurrencySettings>
): Promise<string> => {
  const safeAmount = amount || 0;
  const settings = customSettings ? { ...await getCurrencySettings(), ...customSettings } : await getCurrencySettings();

  const symbol = getCurrencySymbol(settings.currency);
  const formattedNumber = formatNumber(Math.abs(safeAmount), settings);

  return withSymbol(formattedNumber, symbol, safeAmount < 0, settings.symbolPosition);
};

export const formatCurrencySync = (
  amount: number | undefined | null,
  currency: string = 'USD'
): string => {
  const safeAmount = amount || 0;
  const symbol = getCurrencySymbol(currency);

  const formatted = Math.abs(safeAmount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  return withSymbol(formatted, symbol, safeAmount < 0, 'before');
};

export const getCurrencyFormatPreview = (settings: CurrencySettings): string => {
  const sampleAmount = 1234.56;
  const symbol = getCurrencySymbol(settings.currency);
  const formattedNumber = formatNumber(sampleAmount, settings);

  return withSymbol(formattedNumber, symbol, false, settings.symbolPosition);
};

export const clearCurrencyCache = (): void => {
  currencySettingsCache = null;
  currencySettingsPromise = null;
};