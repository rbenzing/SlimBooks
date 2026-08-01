
import React, { useState, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { toast } from 'sonner';
import { Calendar, Clock, FileText, DollarSign, List } from 'lucide-react';
import { themeClasses } from '@/utils/themeUtils.util';
import {
  getDateTimeSettings,
  DATE_FORMAT_OPTIONS,
  TIME_FORMAT_OPTIONS,
  getDateFormatPreview,
  getTimeFormatPreview
} from '@/utils/formatting';
import {
  getInvoiceNumberSettings,
  getInvoiceNumberPreview,
  getSuggestedPrefixes
} from '@/utils/business/numbering.util';
import {
  getCurrencySettings,
  CURRENCY_OPTIONS,
  SYMBOL_POSITION_OPTIONS,
  DECIMAL_PLACES_OPTIONS,
  THOUSANDS_SEPARATOR_OPTIONS,
  DECIMAL_SEPARATOR_OPTIONS,
  getCurrencyFormatPreview
} from '@/utils/formatting';
import { getPaginationSettingsAsync } from '@/utils/pagination.util';
import {
  DEFAULT_ITEMS_PER_PAGE_OPTIONS,
  MAX_ITEMS_PER_PAGE_OPTIONS,
  AVAILABLE_PAGE_SIZES_OPTIONS,
  MAX_PAGE_NUMBERS_OPTIONS
} from '@/types';
import { validatePaginationSettings } from '@/utils/settingsValidation';
import { getToken } from '@/utils/api';
import type { DateTimeSettings, InvoiceNumberSettings, PaginationSettings, CurrencySettings } from '@/types';
import type { SettingsTabRef } from '@/types';

export const GeneralSettingsTab = forwardRef<SettingsTabRef>((props, ref) => {
  const [dateTimeSettings, setDateTimeSettings] = useState<DateTimeSettings>({ dateFormat: 'MM/DD/YYYY', timeFormat: '12-hour' });
  const [invoiceSettings, setInvoiceSettings] = useState<InvoiceNumberSettings>({ prefix: 'INV' });
  const [currencySettings, setCurrencySettings] = useState<CurrencySettings>({
    currency: 'USD',
    symbolPosition: 'before',
    decimalPlaces: 2,
    thousandsSeparator: ',',
    decimalSeparator: '.'
  });
  const [paginationSettings, setPaginationSettings] = useState<PaginationSettings>({
    defaultItemsPerPage: 25,
    availablePageSizes: [10, 25, 50, 100],
    maxItemsPerPage: 500,
    showItemsPerPageSelector: true,
    showPageNumbers: true,
    maxPageNumbers: 5
  });
  const [timeZone, setTimeZone] = useState('America/New_York');
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        // Use dynamic import to avoid circular dependencies
        const { sqliteService } = await import('@/services/sqlite.svc');
        
        if (!sqliteService.isReady()) {
          await sqliteService.initialize();
        }

        // Use the new bulk settings API for better efficiency
        try {
          const allSettings = await sqliteService.getAllSettings('general');

          // Load settings from bulk response with proper type checking
          if (allSettings && typeof allSettings.default_timezone === 'string') {
            setTimeZone(allSettings.default_timezone);
          }
          if (allSettings && allSettings.currency_format_settings && typeof allSettings.currency_format_settings === 'object') {
            setCurrencySettings(allSettings.currency_format_settings as CurrencySettings);
          }
          if (allSettings && allSettings.date_time_settings && typeof allSettings.date_time_settings === 'object') {
            setDateTimeSettings(allSettings.date_time_settings as DateTimeSettings);
          }
          if (allSettings && allSettings.invoice_number_settings && typeof allSettings.invoice_number_settings === 'object') {
            setInvoiceSettings(allSettings.invoice_number_settings as InvoiceNumberSettings);
          }
          if (allSettings && allSettings.pagination_settings && typeof allSettings.pagination_settings === 'object') {
            setPaginationSettings(allSettings.pagination_settings as PaginationSettings);
          }
        } catch (bulkError) {
          console.warn('Bulk settings API failed, falling back to individual calls:', bulkError);

          // Fallback to individual calls if bulk API fails
          const savedTimeZone = await sqliteService.getSetting('default_timezone', 'general');
          const savedInvoiceSettings = await getInvoiceNumberSettings();
          const savedDateTimeSettings = await getDateTimeSettings();
          const savedCurrencySettings = await getCurrencySettings();
          const savedPaginationSettings = await getPaginationSettingsAsync();

          if (savedTimeZone && typeof savedTimeZone === 'string') {
            setTimeZone(savedTimeZone);
          }
          setInvoiceSettings(savedInvoiceSettings);
          setDateTimeSettings(savedDateTimeSettings);
          setCurrencySettings(savedCurrencySettings);
          setPaginationSettings(savedPaginationSettings);
        }

        setIsLoaded(true);
      } catch (error) {
        console.error('Error loading general settings:', error);
        setIsLoaded(true);
      }
    };

    loadSettings();
  }, []);

  // Manual save function for Save button
  const saveSettings = useCallback(async () => {
    if (!isLoaded) return;

    try {
      // Use bulk save for better efficiency
      const settingsToSave = {
        'date_time_settings': { value: dateTimeSettings, category: 'general' },
        'invoice_number_settings': { value: invoiceSettings, category: 'general' },
        'currency_format_settings': { value: currencySettings, category: 'general' },
        'pagination_settings': { value: validatePaginationSettings(paginationSettings), category: 'general' },
        'default_timezone': { value: timeZone, category: 'general' }
      };

      const response = await fetch('/api/settings/', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getToken()}`
        },
        body: JSON.stringify({ settings: settingsToSave })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || 'Failed to save general settings');
      }

      toast.success('General settings saved successfully');
    } catch (error) {
      console.error('Error saving general settings:', error);
      toast.error(`Failed to save general settings: ${error.message}`);
      throw error;
    }
  }, [isLoaded, dateTimeSettings, invoiceSettings, currencySettings, paginationSettings, timeZone]);

  // Expose saveSettings method to parent component
  useImperativeHandle(ref, () => ({ saveSettings }), [saveSettings]);


  const handleDateFormatChange = (format: string) => {
    setDateTimeSettings(prev => ({ ...prev, dateFormat: format }));
  };

  const handleTimeFormatChange = (format: string) => {
    setDateTimeSettings(prev => ({ ...prev, timeFormat: format }));
  };

  const handleInvoicePrefixChange = (prefix: string) => {
    setInvoiceSettings(prev => ({ ...prev, prefix: prefix.toUpperCase() }));
  };

  const handleCurrencyChange = (field: keyof CurrencySettings, value: string | number) => {
    setCurrencySettings(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="bg-card rounded-lg shadow-sm border border-border p-6">
      <h3 className="text-lg font-medium text-card-foreground mb-6">General Settings</h3>
      <div className="space-y-6">
        {/* Currency Settings */}
        <div className="space-y-4">
          <div className="flex items-center mb-4">
            <DollarSign className="h-4 w-4 text-primary mr-2" />
            <h4 className="text-sm font-medium text-muted-foreground">Currency Format</h4>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-2">Currency</label>
              <select
                className={`w-full ${themeClasses.select}`}
                value={currencySettings.currency}
                onChange={(e) => handleCurrencyChange('currency', e.target.value)}
              >
                {CURRENCY_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-2">Symbol Position</label>
              <select
                className={`w-full ${themeClasses.select}`}
                value={currencySettings.symbolPosition}
                onChange={(e) => handleCurrencyChange('symbolPosition', e.target.value)}
              >
                {SYMBOL_POSITION_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-2">Decimal Places</label>
              <select
                className={`w-full ${themeClasses.select}`}
                value={currencySettings.decimalPlaces}
                onChange={(e) => handleCurrencyChange('decimalPlaces', parseInt(e.target.value))}
              >
                {DECIMAL_PLACES_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-2">Thousands Separator</label>
              <select
                className={`w-full ${themeClasses.select}`}
                value={currencySettings.thousandsSeparator}
                onChange={(e) => handleCurrencyChange('thousandsSeparator', e.target.value)}
              >
                {THOUSANDS_SEPARATOR_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-4">
            <label className="block text-sm font-medium text-muted-foreground mb-2">Decimal Separator</label>
            <select
              className={`w-full md:w-1/2 ${themeClasses.select}`}
              value={currencySettings.decimalSeparator}
              onChange={(e) => handleCurrencyChange('decimalSeparator', e.target.value)}
            >
              {DECIMAL_SEPARATOR_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-4 p-3 bg-muted/50 rounded-md">
            <p className="text-xs text-muted-foreground mb-1">Preview:</p>
            <p className="text-sm font-medium text-card-foreground">
              {getCurrencyFormatPreview(currencySettings)}
            </p>
          </div>
        </div>

        {/* Time Zone Settings */}
        <div>
          <label className="block text-sm font-medium text-muted-foreground mb-2">Time Zone</label>
          <select
            className={`w-full ${themeClasses.select}`}
            value={timeZone}
            onChange={(e) => setTimeZone(e.target.value)}
          >
            <option value="America/New_York">America/New_York (EST/EDT)</option>
            <option value="America/Los_Angeles">America/Los_Angeles (PST/PDT)</option>
            <option value="America/Chicago">America/Chicago (CST/CDT)</option>
            <option value="America/Denver">America/Denver (MST/MDT)</option>
            <option value="Europe/London">Europe/London (GMT/BST)</option>
            <option value="Europe/Paris">Europe/Paris (CET/CEST)</option>
            <option value="Asia/Tokyo">Asia/Tokyo (JST)</option>
            <option value="Australia/Sydney">Australia/Sydney (AEST/AEDT)</option>
          </select>
        </div>

        {/* Date Format Settings */}
        <div>
          <div className="flex items-center mb-2">
            <Calendar className="h-4 w-4 text-primary mr-2" />
            <label className="block text-sm font-medium text-muted-foreground">Date Format</label>
          </div>
          <select
            className={`w-full ${themeClasses.select}`}
            value={dateTimeSettings.dateFormat}
            onChange={(e) => handleDateFormatChange(e.target.value)}
          >
            {DATE_FORMAT_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground mt-1">
            Preview: {getDateFormatPreview(dateTimeSettings.dateFormat)}
          </p>
        </div>

        {/* Time Format Settings */}
        <div>
          <div className="flex items-center mb-2">
            <Clock className="h-4 w-4 text-primary mr-2" />
            <label className="block text-sm font-medium text-muted-foreground">Time Format</label>
          </div>
          <select
            className={`w-full ${themeClasses.select}`}
            value={dateTimeSettings.timeFormat}
            onChange={(e) => handleTimeFormatChange(e.target.value)}
          >
            {TIME_FORMAT_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground mt-1">
            Preview: {getTimeFormatPreview(dateTimeSettings.timeFormat)}
          </p>
        </div>

        {/* Invoice Prefix Settings */}
        <div>
          <div className="flex items-center mb-2">
            <FileText className="h-4 w-4 text-primary mr-2" />
            <label className="block text-sm font-medium text-muted-foreground">Invoice Number Prefix</label>
          </div>
          <div className="flex space-x-2">
            <input
              type="text"
              className={`flex-1 ${themeClasses.input}`}
              value={invoiceSettings.prefix}
              onChange={(e) => handleInvoicePrefixChange(e.target.value)}
              placeholder="Enter prefix (e.g., INV, INVOICE)"
              maxLength={10}
            />
            <select
              className={`${themeClasses.select} w-32`}
              value=""
              onChange={(e) => e.target.value && handleInvoicePrefixChange(e.target.value)}
            >
              <option value="">Quick Select</option>
              {getSuggestedPrefixes().map(prefix => (
                <option key={prefix} value={prefix}>
                  {prefix}
                </option>
              ))}
            </select>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Preview: {getInvoiceNumberPreview(invoiceSettings.prefix)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Note: Changing the prefix will only affect new invoices. Existing invoices will keep their current numbers.
          </p>
        </div>

        {/* Pagination Settings */}
        <div className="space-y-4">
          <div className="flex items-center mb-4">
            <List className="h-4 w-4 text-primary mr-2" />
            <h4 className="text-sm font-medium text-muted-foreground">Pagination Settings</h4>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Default Items Per Page */}
            <div>
              <label className="block text-sm font-medium text-card-foreground mb-2">
                Default Items Per Page
              </label>
              <select
                value={paginationSettings.defaultItemsPerPage}
                onChange={(e) => setPaginationSettings({
                  ...paginationSettings,
                  defaultItemsPerPage: Number(e.target.value)
                })}
                className={themeClasses.select}
              >
                {DEFAULT_ITEMS_PER_PAGE_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Maximum Items Per Page */}
            <div>
              <label className="block text-sm font-medium text-card-foreground mb-2">
                Maximum Items Per Page
              </label>
              <select
                value={paginationSettings.maxItemsPerPage}
                onChange={(e) => setPaginationSettings({
                  ...paginationSettings,
                  maxItemsPerPage: Number(e.target.value)
                })}
                className={themeClasses.select}
              >
                {MAX_ITEMS_PER_PAGE_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Available Page Sizes */}
            <div>
              <label className="block text-sm font-medium text-card-foreground mb-2">
                Available Page Sizes
              </label>
              <select
                value={JSON.stringify(paginationSettings.availablePageSizes)}
                onChange={(e) => setPaginationSettings({
                  ...paginationSettings,
                  availablePageSizes: JSON.parse(e.target.value)
                })}
                className={themeClasses.select}
              >
                {AVAILABLE_PAGE_SIZES_OPTIONS.map(option => (
                  <option key={JSON.stringify(option.value)} value={JSON.stringify(option.value)}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Max Page Numbers */}
            <div>
              <label className="block text-sm font-medium text-card-foreground mb-2">
                Page Numbers to Show
              </label>
              <select
                value={paginationSettings.maxPageNumbers}
                onChange={(e) => setPaginationSettings({
                  ...paginationSettings,
                  maxPageNumbers: Number(e.target.value)
                })}
                className={themeClasses.select}
              >
                {MAX_PAGE_NUMBERS_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Pagination Feature Toggles */}
          <div className="space-y-3">
            <div className="flex items-center">
              <input
                type="checkbox"
                id="showItemsPerPageSelector"
                checked={paginationSettings.showItemsPerPageSelector}
                onChange={(e) => setPaginationSettings({
                  ...paginationSettings,
                  showItemsPerPageSelector: e.target.checked
                })}
                className="rounded border-border"
              />
              <label htmlFor="showItemsPerPageSelector" className="ml-2 text-sm text-card-foreground">
                Show items per page selector
              </label>
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                id="showPageNumbers"
                checked={paginationSettings.showPageNumbers}
                onChange={(e) => setPaginationSettings({
                  ...paginationSettings,
                  showPageNumbers: e.target.checked
                })}
                className="rounded border-border"
              />
              <label htmlFor="showPageNumbers" className="ml-2 text-sm text-card-foreground">
                Show page numbers
              </label>
            </div>
          </div>

          <p className="text-xs text-muted-foreground mt-1">
            These settings control pagination behavior across invoices, expenses, clients, and payments.
          </p>
        </div>
      </div>
    </div>
  );
});

GeneralSettingsTab.displayName = 'GeneralSettingsTab';
