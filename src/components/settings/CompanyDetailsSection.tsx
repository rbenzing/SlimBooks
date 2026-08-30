
import React from 'react';
import { cn, themeClasses } from '@/utils/themeUtils.util';
import { type CompanySettings } from '@/types';
import { toFiscalMonth, toAccountingMethod } from '@/hooks/useSettings.hook';

/**
 * Calendar month names for the fiscal-year-start dropdown.
 * `date.util.ts` formats stored dates for display and does not export month
 * names, so this is not a fourth date-formatting path — it is a fixed list
 * of choices for a settings dropdown, unrelated to rendering a stored value.
 */
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

interface CompanyDetailsSectionProps {
  settings: CompanySettings;
  onInputChange: <K extends keyof CompanySettings>(field: K, value: CompanySettings[K]) => void;
}

export const CompanyDetailsSection: React.FC<CompanyDetailsSectionProps> = ({
  settings,
  onInputChange
}) => {
  return (
    <>
      {/* Company Details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-muted-foreground mb-2">Company Name *</label>
          <input
            type="text"
            value={settings.companyName}
            onChange={(e) => onInputChange('companyName', e.target.value)}
            className={themeClasses.input}
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-muted-foreground mb-2">Owner Name</label>
          <input
            type="text"
            value={settings.ownerName}
            onChange={(e) => onInputChange('ownerName', e.target.value)}
            className={themeClasses.input}
          />
        </div>
      </div>

      {/* Contact Information */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-muted-foreground mb-2">Email</label>
          <input
            type="email"
            value={settings.email}
            onChange={(e) => onInputChange('email', e.target.value)}
            className={themeClasses.input}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-muted-foreground mb-2">Phone</label>
          <input
            type="tel"
            value={settings.phone}
            onChange={(e) => onInputChange('phone', e.target.value)}
            className={themeClasses.input}
          />
        </div>
      </div>

      {/* Address */}
      <div>
        <label className="block text-sm font-medium text-muted-foreground mb-2">Address</label>
        <input
          type="text"
          value={settings.address}
          onChange={(e) => onInputChange('address', e.target.value)}
          className={themeClasses.input}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-muted-foreground mb-2">City</label>
          <input
            type="text"
            value={settings.city}
            onChange={(e) => onInputChange('city', e.target.value)}
            className={themeClasses.input}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-muted-foreground mb-2">State</label>
          <input
            type="text"
            value={settings.state}
            onChange={(e) => onInputChange('state', e.target.value)}
            className={themeClasses.input}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-muted-foreground mb-2">Zip Code</label>
          <input
            type="text"
            value={settings.zipCode}
            onChange={(e) => onInputChange('zipCode', e.target.value)}
            className={themeClasses.input}
          />
        </div>
      </div>

      {/* Fiscal Settings */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="fiscalYearStartMonth" className="block text-sm font-medium text-muted-foreground mb-2">
            Fiscal year starts
          </label>
          <select
            id="fiscalYearStartMonth"
            className={cn(themeClasses.select, 'w-full')}
            value={settings.fiscalYearStartMonth}
            onChange={(e) => onInputChange('fiscalYearStartMonth', toFiscalMonth(e.target.value))}
          >
            {MONTH_NAMES.map((name, index) => (
              <option key={name} value={index + 1}>{name}</option>
            ))}
          </select>
          <p className={cn(themeClasses.smallText, 'mt-2')}>
            Drives &ldquo;This quarter&rdquo; and &ldquo;This year&rdquo; everywhere, including report columns.
          </p>
        </div>
        <div>
          <label htmlFor="accountingMethod" className="block text-sm font-medium text-muted-foreground mb-2">
            Accounting basis
          </label>
          <select
            id="accountingMethod"
            className={cn(themeClasses.select, 'w-full')}
            value={settings.accountingMethod}
            onChange={(e) => onInputChange('accountingMethod', toAccountingMethod(e.target.value))}
          >
            <option value="accrual">Accrual — count invoices when issued</option>
            <option value="cash">Cash — count invoices that have been paid</option>
          </select>
        </div>
      </div>
    </>
  );
};
