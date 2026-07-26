// Component to handle async date formatting
import React, { useState, useEffect } from 'react';
import { formatDate } from '@/utils/formatting';

interface FormattedDateProps {
  date: Date | string;
  customFormat?: string;
  fallback?: string;
}

export const FormattedDate = React.memo<FormattedDateProps>(({
  date,
  customFormat,
  fallback = 'Invalid Date'
}) => {
  const [formattedDate, setFormattedDate] = useState<string>(fallback);

  useEffect(() => {
    const formatDateAsync = async () => {
      try {
        const formatted = await formatDate(date, customFormat);
        setFormattedDate(formatted);
      } catch (error) {
        console.error('Error formatting date:', error);
        setFormattedDate(fallback);
      }
    };

    formatDateAsync();
  }, [date, customFormat, fallback]);

  return <>{formattedDate}</>;
});

// Simple synchronous date formatter for basic cases
export const formatDateSync = (date: Date | string): string => {
  try {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(dateObj.getTime())) {
      return 'Invalid Date';
    }
    return dateObj.toLocaleDateString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  } catch {
    return 'Invalid Date';
  }
};

// Simple synchronous date range formatter
export const formatDateRangeSync = (startDate: Date | string, endDate: Date | string): string => {
  const start = formatDateSync(startDate);
  const end = formatDateSync(endDate);
  return `${start} - ${end}`;
};
