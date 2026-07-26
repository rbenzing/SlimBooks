// Global constants for the Slimbooks application
import { type CurrencySettings } from '@/types';

// ===== CURRENCY CONSTANTS =====

export const DEFAULT_CURRENCY_SETTINGS: CurrencySettings = {
  currency: 'USD',
  symbolPosition: 'before',
  decimalPlaces: 2,
  thousandsSeparator: ',',
  decimalSeparator: '.'
};

// Currency format options for the settings UI
export const CURRENCY_OPTIONS = [
  { value: 'USD', label: 'USD - US Dollar', symbol: '$' },
  { value: 'EUR', label: 'EUR - Euro', symbol: '€' },
  { value: 'GBP', label: 'GBP - British Pound', symbol: '£' },
  { value: 'CAD', label: 'CAD - Canadian Dollar', symbol: 'C$' },
  { value: 'AUD', label: 'AUD - Australian Dollar', symbol: 'A$' },
  { value: 'JPY', label: 'JPY - Japanese Yen', symbol: '¥' },
  { value: 'CHF', label: 'CHF - Swiss Franc', symbol: 'CHF' },
  { value: 'CNY', label: 'CNY - Chinese Yuan', symbol: '¥' },
  { value: 'INR', label: 'INR - Indian Rupee', symbol: '₹' },
  { value: 'BRL', label: 'BRL - Brazilian Real', symbol: 'R$' }
] as const;

export const SYMBOL_POSITION_OPTIONS = [
  { value: 'before', label: 'Before amount ($100.00)' },
  { value: 'after', label: 'After amount (100.00$)' }
] as const;

export const DECIMAL_PLACES_OPTIONS = [
  { value: 0, label: '0 decimal places (100)' },
  { value: 1, label: '1 decimal place (100.0)' },
  { value: 2, label: '2 decimal places (100.00)' },
  { value: 3, label: '3 decimal places (100.000)' }
] as const;

export const THOUSANDS_SEPARATOR_OPTIONS = [
  { value: ',', label: 'Comma (1,000.00)' },
  { value: '.', label: 'Period (1.000,00)' },
  { value: ' ', label: 'Space (1 000.00)' },
  { value: 'none', label: 'None (1000.00)' }
] as const;

export const DECIMAL_SEPARATOR_OPTIONS = [
  { value: '.', label: 'Period (100.00)' },
  { value: ',', label: 'Comma (100,00)' }
] as const;

// ===== DATE & TIME CONSTANTS =====

export const DATE_FORMAT_OPTIONS = [
  { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY (12/31/2024)' },
  { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY (31/12/2024)' },
  { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD (2024-12-31)' },
  { value: 'DD-MM-YYYY', label: 'DD-MM-YYYY (31-12-2024)' },
  { value: 'MM-DD-YYYY', label: 'MM-DD-YYYY (12-31-2024)' },
  { value: 'DD.MM.YYYY', label: 'DD.MM.YYYY (31.12.2024)' }
] as const;

export const TIME_FORMAT_OPTIONS = [
  { value: '12-hour', label: '12-hour (2:30 PM)' },
  { value: '24-hour', label: '24-hour (14:30)' }
] as const;

// ===== PAGINATION CONSTANTS =====

export const DEFAULT_ITEMS_PER_PAGE_OPTIONS = [
  { value: 10, label: '10 items' },
  { value: 25, label: '25 items' },
  { value: 50, label: '50 items' },
  { value: 100, label: '100 items' }
] as const;

export const MAX_ITEMS_PER_PAGE_OPTIONS = [
  { value: 100, label: '100 items' },
  { value: 250, label: '250 items' },
  { value: 500, label: '500 items' },
  { value: 1000, label: '1000 items' }
] as const;

export const AVAILABLE_PAGE_SIZES_OPTIONS = [
  { value: [5, 10, 25], label: 'Small (5, 10, 25)' },
  { value: [10, 25, 50], label: 'Medium (10, 25, 50)' },
  { value: [25, 50, 100], label: 'Large (25, 50, 100)' },
  { value: [50, 100, 250], label: 'Extra Large (50, 100, 250)' }
] as const;

export const MAX_PAGE_NUMBERS_OPTIONS = [
  { value: 3, label: '3 pages' },
  { value: 5, label: '5 pages' },
  { value: 7, label: '7 pages' },
  { value: 10, label: '10 pages' }
] as const;

// ===== APPLICATION CONSTANTS =====

// Cache constants
export const CACHE_DURATIONS = {
  CURRENCY_SETTINGS: 5 * 60 * 1000, // 5 minutes
  USER_SETTINGS: 10 * 60 * 1000,    // 10 minutes
  COMPANY_SETTINGS: 15 * 60 * 1000, // 15 minutes
  DATE_TIME_SETTINGS: 10 * 60 * 1000, // 10 minutes
  PAGINATION_SETTINGS: 15 * 60 * 1000 // 15 minutes
} as const;

// Default pagination
export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 1000;

// File upload limits
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;

// Date formats
export const DATE_FORMATS = {
  DISPLAY: 'MMM d, yyyy',
  INPUT: 'yyyy-MM-dd',
  TIMESTAMP: 'yyyy-MM-dd HH:mm:ss'
} as const;