
import React, { useState, useCallback } from 'react';
import { Upload, Download, FileText, CheckCircle, AlertCircle, X } from 'lucide-react';
import { authenticatedFetch } from '@/utils/api';
import { exportToCSV, parseCSV, validateExpenseData, getDateRangeForPeriod } from '@/utils/data';
import { toast } from 'sonner';
import { themeClasses, getIconColorClasses, getButtonClasses } from '@/utils/themeUtils.util';
import { parseDisplayDate } from '@/utils/formatting';
import { useFiscalSettings } from '@/hooks/useFiscalSettings.hook';
import { ImportResult } from '@/components/ui/ImportResult.cpt';
import {
  type FieldMapping,
  type ImportExportProps,
  type CSVRecord,
  type PreviewDataItem,
  type ExpenseValidationResult,
  type ImportOutcome,
  EXPENSE_FIELDS,
  isExpenseStatus
} from '@/types';

/** The end of the local day named by a calendar-day string, for a custom range. */
const endOfCalendarDay = (day: string): Date => {
  const date = parseDisplayDate(day);
  date.setHours(23, 59, 59, 999);
  return date;
};

export const ExpenseImportExport: React.FC<ImportExportProps> = ({
  onClose,
  onImportComplete,
  currentPeriod,
  currentCustomRange,
  onPeriodChange
}) => {
  const [mode, setMode] = useState<'select' | 'import' | 'export'>('select');
  const [csvData, setCsvData] = useState<CSVRecord[]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [fieldMappings, setFieldMappings] = useState<FieldMapping[]>([]);
  const [previewData, setPreviewData] = useState<PreviewDataItem[]>([]);
  const [validationResults, setValidationResults] = useState<ExpenseValidationResult[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [importOutcome, setImportOutcome] = useState<ImportOutcome | null>(null);
  const [hiddenCount, setHiddenCount] = useState(0);

  const { fiscalYearStartMonth } = useFiscalSettings();

  /** How many of the submitted rows fall outside the caller's current view. */
  const countHidden = (rows: PreviewDataItem[]): number => {
    if (!currentPeriod) return 0;
    const range = currentPeriod === 'custom' && currentCustomRange
      ? currentCustomRange
      : getDateRangeForPeriod(currentPeriod, fiscalYearStartMonth, new Date());
    return rows.filter(row => {
      const date = typeof row.date === 'string' ? parseDisplayDate(row.date) : null;
      return !date || isNaN(date.getTime()) || date < range.start || date > range.end;
    }).length;
  };

  const handleExport = async () => {
    try {
      const response = await authenticatedFetch('/api/expenses');
      const data = await response.json();
      
      if (!data.success || !data.data?.data) {
        toast.error('Failed to fetch expenses for export');
        return;
      }

      const expenses = data.data.data;
      
      if (expenses.length === 0) {
        toast.error('No expenses to export');
        return;
      }
      
      const exportData = expenses.map(expense => ({
        date: expense.date,
        vendor: expense.vendor,
        category: expense.category,
        amount: expense.amount,
        description: expense.description || '',
        status: expense.status || 'pending'
      }));
      
      exportToCSV(exportData, `expenses-${new Date().toISOString().split('T')[0]}.csv`);
      toast.success('Expenses exported successfully');
      onClose();
    } catch (error) {
      toast.error('Failed to export expenses');
      console.error('Export error:', error);
    }
  };

  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const csvText = e.target?.result as string;
        const parsedData = parseCSV(csvText);
        
        if (parsedData.length === 0) {
          toast.error('CSV file is empty or invalid');
          return;
        }

        setCsvData(parsedData);
        setCsvHeaders(Object.keys(parsedData[0]));
        
        // Initialize field mappings
        const initialMappings = EXPENSE_FIELDS.map(field => ({
          csvField: '',
          dbField: field.key
        }));
        setFieldMappings(initialMappings);
        
        setMode('import');
      } catch (error) {
        toast.error('Failed to parse CSV file');
        console.error('CSV parsing error:', error);
      }
    };
    
    reader.readAsText(file);
  }, []);

  const updateFieldMapping = (dbField: string, csvField: string) => {
    setFieldMappings(prev => 
      prev.map(mapping => 
        mapping.dbField === dbField 
          ? { ...mapping, csvField }
          : mapping
      )
    );
  };

  /**
   * Applies the configured field mappings and import defaults to one CSV row.
   * Shared by the preview and the real import so the two can never drift.
   */
  const mapRowToExpense = (row: CSVRecord): PreviewDataItem => {
    const mappedRow: PreviewDataItem = {};

    fieldMappings.forEach(mapping => {
      if (!mapping.csvField) return;

      const raw = row[mapping.csvField] || '';
      let value: string | number = raw;

      if (mapping.dbField === 'amount') {
        // Handle negative amounts and remove currency symbols
        value = Math.abs(parseFloat(raw.replace(/[$,]/g, '')) || 0);
      } else if (mapping.dbField === 'category') {
        // Allow any category, don't restrict to predefined list
        value = raw || 'Other';
      } else if (mapping.dbField === 'status' && !isExpenseStatus(raw)) {
        value = 'pending';
      } else if (mapping.dbField === 'vendor' && !raw && mappedRow.description) {
        // Use description as vendor if vendor field is empty
        value = row[fieldMappings.find(m => m.dbField === 'description')?.csvField || ''] || 'Unknown Vendor';
      }

      mappedRow[mapping.dbField] = value;
    });

    if (!mappedRow.status) mappedRow.status = 'pending';
    if (!mappedRow.category) mappedRow.category = 'Other';
    if (!mappedRow.vendor && mappedRow.description) {
      mappedRow.vendor = mappedRow.description;
    }
    if (!mappedRow.vendor) mappedRow.vendor = 'Unknown Vendor';

    return mappedRow;
  };

  const generatePreview = () => {
    if (csvData.length === 0) return;

    const mappedData = csvData.slice(0, 5).map(mapRowToExpense);

    const validationResults = mappedData.map(row => validateExpenseData(row));
    
    setPreviewData(mappedData);
    setValidationResults(validationResults);
  };

  const handleImport = async () => {
    setIsProcessing(true);
    
    try {
      // Map all CSV data to expense format
      const mappedExpenses = csvData.map(mapRowToExpense);

      // Filter out invalid expenses before sending to bulk import
      const validExpenses = mappedExpenses.filter(expense => {
        const validation = validateExpenseData(expense);
        return validation.isValid;
      });

      if (validExpenses.length === 0) {
        toast.error('No valid expenses to import');
        setIsProcessing(false);
        return;
      }

      // Use bulk import endpoint
      const response = await authenticatedFetch('/api/expenses/bulk-import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ expenses: validExpenses })
      });
      
      const result = await response.json();

      if (!result.data) {
        throw new Error(result.error || 'Import failed');
      }

      const outcome: ImportOutcome = result.data;
      setImportOutcome(outcome);
      setHiddenCount(countHidden(validExpenses));
      onImportComplete();
    } catch (error) {
      toast.error(`Failed to import expenses: ${error.message || error}`);
      console.error('Import error:', error);
    }

    setIsProcessing(false);
  };

  if (mode === 'select') {
    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
        <div className={`${themeClasses.card} w-full max-w-md`}>
          <div className="flex justify-between items-center mb-4">
            <h2 className={themeClasses.cardTitle}>Import/Export Expenses</h2>
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className={themeClasses.iconSmall} />
            </button>
          </div>

          <div className="space-y-4">
            <button
              onClick={() => setMode('export')}
              className="w-full flex items-center justify-center p-4 border-2 border-dashed border-border rounded-lg hover:border-primary hover:bg-accent transition-colors"
            >
              <Download className={`${themeClasses.iconMedium} ${getIconColorClasses('blue')} mr-3`} />
              <div className="text-left">
                <div className="font-medium text-foreground">Export Expenses</div>
                <div className="text-sm text-muted-foreground">Download all expenses as CSV</div>
              </div>
            </button>

            <button
              onClick={() => document.getElementById('expense-csv-upload')?.click()}
              className="w-full flex items-center justify-center p-4 border-2 border-dashed border-border rounded-lg hover:border-primary hover:bg-accent transition-colors"
            >
              <Upload className={`${themeClasses.iconMedium} ${getIconColorClasses('blue')} mr-3`} />
              <div className="text-left">
                <div className="font-medium text-foreground">Import Expenses</div>
                <div className="text-sm text-muted-foreground">Upload CSV file to import</div>
              </div>
            </button>

            <input
              id="expense-csv-upload"
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              className="hidden"
            />
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'export') {
    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
        <div className={`${themeClasses.card} w-full max-w-md`}>
          <div className="flex justify-between items-center mb-4">
            <h2 className={themeClasses.cardTitle}>Export Expenses</h2>
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className={themeClasses.iconSmall} />
            </button>
          </div>

          <div className="text-center py-6">
            <FileText className={`h-12 w-12 ${getIconColorClasses('blue')} mx-auto mb-4`} />
            <p className="text-muted-foreground mb-6">Export all expenses to a CSV file for backup or analysis.</p>

            <div className="space-y-3">
              <button
                onClick={handleExport}
                className={getButtonClasses('primary')}
              >
                Download CSV
              </button>
              <button
                onClick={() => setMode('select')}
                className={getButtonClasses('secondary')}
              >
                Back
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className={`${themeClasses.card} w-full max-w-4xl max-h-[90vh] overflow-y-auto`}>
        <div className="flex justify-between items-center mb-6">
          <h2 className={themeClasses.cardTitle}>{importOutcome ? 'Import Results' : 'Import Expenses'}</h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className={themeClasses.iconSmall} />
          </button>
        </div>

        {importOutcome ? (
          <ImportResult
            outcome={importOutcome}
            hiddenCount={hiddenCount}
            onShowImported={(earliest, latest) => {
              onPeriodChange?.('custom', { start: parseDisplayDate(earliest), end: endOfCalendarDay(latest) });
              onClose();
            }}
            onDone={onClose}
          />
        ) : (
        <div className="space-y-6">
          {/* Field Mapping */}
          <div>
            <h3 className="text-lg font-medium text-foreground mb-4">Map CSV Fields</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {EXPENSE_FIELDS.map(field => (
                <div key={field.key} className="flex items-center space-x-3">
                  <div className="w-32">
                    <label className="text-sm font-medium text-foreground">
                      {field.label}
                      {field.required && <span className="text-destructive">*</span>}
                    </label>
                  </div>
                  <select
                    value={fieldMappings.find(m => m.dbField === field.key)?.csvField || ''}
                    onChange={(e) => updateFieldMapping(field.key, e.target.value)}
                    className={themeClasses.select}
                  >
                    <option value="">Select CSV Column</option>
                    {csvHeaders.map(header => (
                      <option key={header} value={header}>{header}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <button
              onClick={generatePreview}
              className={`${getButtonClasses('primary')} mt-4`}
            >
              Generate Preview
            </button>
          </div>

          {/* Preview */}
          {previewData.length > 0 && (
            <div>
              <h3 className="text-lg font-medium text-foreground mb-4">Preview (First 5 Records)</h3>
              <div className="overflow-x-auto">
                <table className={themeClasses.table}>
                  <thead className="bg-muted">
                    <tr>
                      <th className="px-4 py-2 text-left text-sm font-medium text-foreground">Status</th>
                      {EXPENSE_FIELDS.map(field => (
                        <th key={field.key} className="px-4 py-2 text-left text-sm font-medium text-foreground">
                          {field.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.map((row, index) => (
                      <tr key={index} className="border-t border-border">
                        <td className="px-4 py-2">
                          {validationResults[index]?.isValid ? (
                            <CheckCircle className={`${themeClasses.iconSmall} ${getIconColorClasses('green')}`} />
                          ) : (
                            <AlertCircle className={`${themeClasses.iconSmall} ${getIconColorClasses('red')}`} />
                          )}
                        </td>
                        {EXPENSE_FIELDS.map(field => (
                          <td key={field.key} className="px-4 py-2 text-sm text-foreground">
                            {field.key === 'amount' ? `$${row[field.key] || 0}` : (row[field.key] || '-')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-between">
            <button
              onClick={() => setMode('select')}
              className={getButtonClasses('secondary')}
            >
              Back
            </button>
            <div className="space-x-3">
              <button
                onClick={handleImport}
                disabled={isProcessing || previewData.length === 0}
                className={`${getButtonClasses('primary')} disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {isProcessing ? 'Importing...' : 'Import Expenses'}
              </button>
            </div>
          </div>
        </div>
        )}
      </div>
    </div>
  );
};
