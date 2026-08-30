import React, { useState, useEffect } from 'react';
import { Calendar, X } from 'lucide-react';
import { type DateRange } from '@/types';
import {
  getDateRangeForPeriod,
  dateRangeFilterOptions,
  toCalendarDay,
  type DateRangePeriod
} from '@/utils/data';
import { formatDateRangeSync } from '@/utils/formatting';
import { cn } from '@/utils/themeUtils.util';
import { useFiscalSettings } from '@/hooks/useFiscalSettings.hook';

interface DateRangeFilterProps {
  value: DateRangePeriod;
  customRange?: DateRange;
  onChange: (period: DateRangePeriod, customRange?: DateRange) => void;
  className?: string;
  disabled?: boolean;
}

export const DateRangeFilter: React.FC<DateRangeFilterProps> = ({
  value,
  customRange,
  onChange,
  className,
  disabled = false
}) => {
  const { fiscalYearStartMonth } = useFiscalSettings();
  const [isCustomMode, setIsCustomMode] = useState(value === 'custom');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  // Update custom date inputs when customRange prop changes
  useEffect(() => {
    if (value === 'custom' && customRange) {
      setCustomStartDate(toCalendarDay(customRange.start));
      setCustomEndDate(toCalendarDay(customRange.end));
      setIsCustomMode(true);
    } else {
      setIsCustomMode(false);
    }
  }, [value, customRange]);

  const handlePeriodChange = (period: DateRangePeriod) => {
    if (period === 'custom') {
      setIsCustomMode(true);
      // Set default custom range to this month if no custom range exists
      if (!customRange) {
        const thisMonth = getDateRangeForPeriod('this_month', fiscalYearStartMonth, new Date());
        setCustomStartDate(toCalendarDay(thisMonth.start));
        setCustomEndDate(toCalendarDay(thisMonth.end));
        onChange(period, thisMonth);
      } else {
        onChange(period, customRange);
      }
    } else {
      setIsCustomMode(false);
      onChange(period);
    }
  };

  const handleCustomDateChange = () => {
    if (customStartDate && customEndDate) {
      const startDate = new Date(customStartDate);
      const endDate = new Date(customEndDate);
      
      // Ensure end date is not before start date
      if (endDate < startDate) {
        return;
      }

      // Set to start and end of day for proper filtering
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);

      const customDateRange: DateRange = {
        start: startDate,
        end: endDate
      };
      
      onChange('custom', customDateRange);
    }
  };

  const handleClearCustom = () => {
    setIsCustomMode(false);
    setCustomStartDate('');
    setCustomEndDate('');
    onChange('this_year'); // Default back to fiscal year to date
  };

  return (
    <div className={cn("flex flex-col space-y-2", className)}>
      {/* Period Dropdown */}
      <div className="flex items-center space-x-2">
        <div className="relative">
          <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <select
            value={value}
            onChange={(e) => handlePeriodChange(e.target.value as DateRangePeriod)}
            disabled={disabled}
            className={cn(
              "pl-10 pr-4 py-2 bg-background border border-input rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent",
              disabled && "opacity-50 cursor-not-allowed"
            )}
          >
            {dateRangeFilterOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

      </div>

      {/* Custom Date Range Inputs */}
      {isCustomMode && (
        <div className="flex items-center space-x-2 p-3 bg-muted/50 rounded-lg border">
          <div className="flex items-center space-x-2 flex-1">
            <label className="text-sm font-medium text-foreground">From:</label>
            <input
              type="date"
              value={customStartDate}
              onChange={(e) => setCustomStartDate(e.target.value)}
              onBlur={handleCustomDateChange}
              disabled={disabled}
              className={cn(
                "px-3 py-2 bg-background border border-input rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent",
                disabled && "opacity-50 cursor-not-allowed"
              )}
            />
          </div>

          <div className="flex items-center space-x-2 flex-1">
            <label className="text-sm font-medium text-foreground">To:</label>
            <input
              type="date"
              value={customEndDate}
              onChange={(e) => setCustomEndDate(e.target.value)}
              onBlur={handleCustomDateChange}
              disabled={disabled}
              className={cn(
                "px-3 py-2 bg-background border border-input rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent",
                disabled && "opacity-50 cursor-not-allowed"
              )}
            />
          </div>

          <button
            onClick={handleClearCustom}
            disabled={disabled}
            className={cn(
              "p-1 text-muted-foreground hover:text-red-600 transition-colors",
              disabled && "opacity-50 cursor-not-allowed"
            )}
            title="Clear custom range"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Custom Range Display */}
      {isCustomMode && customRange && (
        <div className="text-sm text-muted-foreground">
          Selected: {formatDateRangeSync(customRange.start, customRange.end)}
        </div>
      )}
    </div>
  );
};