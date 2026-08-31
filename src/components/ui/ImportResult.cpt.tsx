import React from 'react';
import { CheckCircle, AlertCircle, Copy, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import { themeClasses, getButtonClasses, getIconColorClasses } from '@/utils/themeUtils.util';
import { formatDateRangeSync } from '@/utils/formatting';
import type { ImportOutcome } from '@/types';

interface ImportResultProps {
  outcome: ImportOutcome;
  /** How many of the rows that landed fall outside the list's current view. */
  hiddenCount: number;
  onShowImported: (earliest: string, latest: string) => void;
  onDone: () => void;
}

/**
 * What a bulk import actually did, on screen instead of in the browser console.
 * Used identically by the expense, payment and client import panels — see
 * ExpenseImportExport.tsx, PaymentImportExport.tsx and ClientImportExport.tsx.
 */
export const ImportResult: React.FC<ImportResultProps> = ({ outcome, hiddenCount, onShowImported, onDone }) => {
  const { imported, failed, errors, span } = outcome;

  const handleCopyErrors = () => {
    navigator.clipboard.writeText(errors.join('\n'))
      .then(() => toast.success('Errors copied to clipboard'))
      .catch(() => toast.error('Failed to copy errors'));
  };

  const handleShowImported = () => {
    if (span) onShowImported(span.earliest, span.latest);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div className={themeClasses.statCard}>
          <div className={themeClasses.statCardContent}>
            <div>
              <p className={themeClasses.statLabel}>Imported</p>
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">{imported}</p>
            </div>
            <CheckCircle className={`${themeClasses.iconLarge} ${getIconColorClasses('green')}`} />
          </div>
        </div>
        <div className={themeClasses.statCard}>
          <div className={themeClasses.statCardContent}>
            <div>
              <p className={themeClasses.statLabel}>Failed</p>
              <p className="text-2xl font-bold text-red-600 dark:text-red-400">{failed}</p>
            </div>
            <AlertCircle className={`${themeClasses.iconLarge} ${getIconColorClasses('red')}`} />
          </div>
        </div>
      </div>

      {imported === 0 ? (
        <div className="flex items-center rounded-lg border border-border bg-muted/50 p-3 text-sm text-foreground">
          <AlertCircle className={`${themeClasses.iconSmall} ${getIconColorClasses('red')} mr-2`} />
          Nothing was imported.
        </div>
      ) : span ? (
        <div className="flex items-center text-sm text-muted-foreground">
          <Calendar className={`${themeClasses.iconSmall} mr-2`} />
          Imported rows span {formatDateRangeSync(span.earliest, span.latest)}.
        </div>
      ) : null}

      {errors.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-foreground">Why rows failed</h3>
            <button
              type="button"
              onClick={handleCopyErrors}
              className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <Copy className={`${themeClasses.iconSmall} mr-1`} />
              Copy
            </button>
          </div>
          <ul className="max-h-48 overflow-y-auto space-y-1 rounded-lg border border-border bg-muted/50 p-3">
            {errors.map((error, index) => (
              <li key={index} className="text-sm text-foreground">{error}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex justify-end space-x-3">
        {/*
          `span` as well as `hiddenCount`: the count is derived from the rows
          the browser submitted, so when every row fails it is still positive
          while `span` is null — and the handler needs the span. Without this
          the button renders on an all-failed import and does nothing at all.
        */}
        {hiddenCount > 0 && span && (
          <button type="button" onClick={handleShowImported} className={getButtonClasses('secondary')}>
            Show all imported
          </button>
        )}
        <button type="button" onClick={onDone} className={getButtonClasses('primary')}>
          Done
        </button>
      </div>
    </div>
  );
};
