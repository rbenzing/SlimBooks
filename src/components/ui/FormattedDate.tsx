// Component to handle async date formatting
import React, { useState, useEffect } from 'react';
import { formatDate } from '@/utils/formatting';

/**
 * Re-exported, not reimplemented.
 *
 * This module used to carry its own `formatDateSync` that hard-coded
 * `MM/DD/YYYY` in `en-US` and parsed with a bare `new Date(...)`. Eleven screens
 * import it, so eleven screens ignored the user's chosen date format and showed
 * a bare `yyyy-MM-dd` due date as the previous day for every viewer west of
 * UTC. The import path is kept; the implementation is the one in date.util.ts.
 */
export { formatDateSync, formatDateRangeSync } from '@/utils/formatting';

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
