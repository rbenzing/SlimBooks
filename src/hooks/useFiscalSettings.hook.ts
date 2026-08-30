import { useEffect, useState } from 'react';
import { sqliteService } from '@/services/sqlite.svc';

export interface FiscalSettings {
  fiscalYearStartMonth: number;
  accountingMethod: 'cash' | 'accrual';
  isLoading: boolean;
}

/**
 * Settings values round-trip through a TEXT column, so a month arrives as
 * either 7 or "7". An unusable value falls back to the calendar year rather
 * than producing a fiscal year nobody can reconcile.
 */
const toFiscalMonth = (value: unknown): number => {
  const month = Number(value);
  return Number.isInteger(month) && month >= 1 && month <= 12 ? month : 1;
};

const toAccountingMethod = (value: unknown): 'cash' | 'accrual' =>
  value === 'cash' ? 'cash' : 'accrual';

export const useFiscalSettings = (): FiscalSettings => {
  const [fiscalYearStartMonth, setFiscalYearStartMonth] = useState(1);
  const [accountingMethod, setAccountingMethod] = useState<'cash' | 'accrual'>('accrual');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async (): Promise<void> => {
      try {
        const settings = await sqliteService.getAllSettings('company');
        if (cancelled) return;
        setFiscalYearStartMonth(toFiscalMonth(settings?.fiscal_year_start_month));
        setAccountingMethod(toAccountingMethod(settings?.accounting_method));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void load();
    return () => { cancelled = true; };
  }, []);

  return { fiscalYearStartMonth, accountingMethod, isLoading };
};
