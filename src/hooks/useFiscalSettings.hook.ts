import { useCompanySettings, toFiscalMonth, toAccountingMethod } from '@/hooks/useSettings.hook';

export interface FiscalSettings {
  fiscalYearStartMonth: number;
  accountingMethod: 'cash' | 'accrual';
  isLoading: boolean;
}

/**
 * Fiscal year start month and accounting basis are two fields on the company
 * settings blob (`useCompanySettings`), not their own settings rows — reading
 * from the same source `useCompanySettings` uses is what makes a save from
 * the Company settings tab visible here. `toFiscalMonth`/`toAccountingMethod`
 * are applied again on top of what that hook returns rather than trusted to
 * have already run: the blob round-trips through JSON, so a month can arrive
 * as `7` or `"7"`, and this hook's own contract (a valid 1-12 month, a
 * recognised method) should hold regardless of what upstream did.
 */
export const useFiscalSettings = (): FiscalSettings => {
  const { settings, isLoading } = useCompanySettings();

  return {
    fiscalYearStartMonth: toFiscalMonth(settings.fiscalYearStartMonth),
    accountingMethod: toAccountingMethod(settings.accountingMethod),
    isLoading
  };
};
