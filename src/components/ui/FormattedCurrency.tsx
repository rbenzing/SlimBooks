import React, { useState, useEffect } from 'react';
import { formatCurrency, formatCurrencySync } from '@/utils/formatting';
import { type CurrencySettings } from '@/types';

interface FormattedCurrencyProps {
  amount: number | undefined | null;
  customSettings?: Partial<CurrencySettings>;
  fallback?: string;
  className?: string;
}

export const FormattedCurrency = React.memo<FormattedCurrencyProps>(({
  amount,
  customSettings,
  fallback = '$0.00',
  className = ''
}) => {
  const [formattedAmount, setFormattedAmount] = useState<string>(fallback);

  useEffect(() => {
    const formatAmountAsync = async () => {
      try {
        const formatted = await formatCurrency(amount, customSettings);
        setFormattedAmount(formatted);
      } catch (error) {
        console.error('Error formatting currency:', error);
        setFormattedAmount(fallback);
      }
    };

    formatAmountAsync();
  }, [amount, customSettings, fallback]);

  return <span className={className}>{formattedAmount}</span>;
});

// Simple synchronous currency formatter for basic cases
export const formatCurrencySyncComponent = (amount: number | undefined | null, currency: string = 'USD'): string => {
  return formatCurrencySync(amount, currency);
};

// Hook for currency formatting that can be used in components
export const useCurrencyFormatter = () => {
  const [isLoading, setIsLoading] = useState(false);

  const formatAmount = async (amount: number | undefined | null, customSettings?: Partial<CurrencySettings>): Promise<string> => {
    setIsLoading(true);
    try {
      const formatted = await formatCurrency(amount, customSettings);
      return formatted;
    } catch (error) {
      console.error('Error formatting currency:', error);
      return formatCurrencySync(amount);
    } finally {
      setIsLoading(false);
    }
  };

  const formatAmountSync = (amount: number | undefined | null, currency: string = 'USD'): string => {
    return formatCurrencySync(amount, currency);
  };

  return {
    formatAmount,
    formatAmountSync,
    isLoading
  };
};
