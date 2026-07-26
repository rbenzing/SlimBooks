
import React, { useState, useCallback } from 'react';
import { Upload, Download, FileText, CheckCircle, AlertCircle, X } from 'lucide-react';
import { authenticatedFetch } from '@/utils/api';
import { exportToCSV, parseCSV, validateClientData } from '@/utils/data';
import { toast } from 'sonner';
import { themeClasses, getIconColorClasses, getButtonClasses } from '@/utils/themeUtils.util';
import { type ClientValidationResult } from '@/types';
import { type FieldMapping, type ImportExportProps, type PreviewDataItem, CLIENT_FIELDS } from '@/types';

// CLIENT_FIELDS now imported from shared types

export const ClientImportExport: React.FC<ImportExportProps> = ({ onClose, onImportComplete }) => {
  const [mode, setMode] = useState<'select' | 'import' | 'export'>('select');
  const [csvData, setCsvData] = useState<Array<Record<string, string | number | boolean | null | undefined>>>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [fieldMappings, setFieldMappings] = useState<FieldMapping[]>([]);
  const [previewData, setPreviewData] = useState<PreviewDataItem[]>([]);
  const [validationResults, setValidationResults] = useState<ClientValidationResult[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleExport = async () => {
    try {
      const response = await authenticatedFetch('/api/clients');
      const data = await response.json();
      
      if (!data.success || !data.data.clients) {
        toast.error('Failed to fetch clients for export');
        return;
      }

      const clients = data.data.clients;
      
      if (clients.length === 0) {
        toast.error('No clients to export');
        return;
      }

      const exportData = clients.map(client => ({
        name: client.name,
        first_name: client.first_name || '',
        last_name: client.last_name || '',
        email: client.email,
        phone: client.phone || '',
        company: client.company || '',
        address: client.address || '',
        city: client.city || '',
        state: client.state || '',
        zipCode: client.zipCode || '',
        country: client.country || ''
      }));

      exportToCSV(exportData, `clients-${new Date().toISOString().split('T')[0]}.csv`);
      toast.success('Clients exported successfully');
      onClose();
    } catch (error) {
      toast.error('Failed to export clients');
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
        const initialMappings = CLIENT_FIELDS.map(field => ({
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

  const generatePreview = () => {
    if (csvData.length === 0) return;

    const mappedData = csvData.slice(0, 5).map(row => {
      const mappedRow: Record<string, string | number | boolean> = {};
      fieldMappings.forEach(mapping => {
        if (mapping.csvField) {
          mappedRow[mapping.dbField] = row[mapping.csvField] || '';
        }
      });
      return mappedRow;
    });

    const validationResults = mappedData.map(row => validateClientData(row));
    
    setPreviewData(mappedData);
    setValidationResults(validationResults);
  };

  const handleImport = async () => {
    setIsProcessing(true);
    
    try {
      const validClients = [];
      
      for (const row of csvData) {
        const mappedRow: Record<string, string | number | boolean> = {};
        fieldMappings.forEach(mapping => {
          if (mapping.csvField) {
            mappedRow[mapping.dbField] = row[mapping.csvField] || '';
          }
        });

        // Handle name combination logic
        if (!mappedRow.name && (mappedRow.first_name || mappedRow.last_name)) {
          // If no full name but we have first/last name, combine them
          const firstName = mappedRow.first_name || '';
          const lastName = mappedRow.last_name || '';
          mappedRow.name = `${firstName} ${lastName}`.trim();
        } else if (mappedRow.name && !mappedRow.first_name && !mappedRow.last_name) {
          // If we have full name but no first/last, try to split it
          const nameParts = String(mappedRow.name).trim().split(' ');
          if (nameParts.length >= 2) {
            mappedRow.first_name = nameParts[0];
            mappedRow.last_name = nameParts.slice(1).join(' ');
          } else if (nameParts.length === 1) {
            mappedRow.first_name = nameParts[0];
            mappedRow.last_name = '';
          }
        }

        const validation = validateClientData(mappedRow);
        if (validation.isValid) {
          validClients.push(mappedRow);
        }
      }

      if (validClients.length === 0) {
        toast.error('No valid clients to import');
        setIsProcessing(false);
        return;
      }

      // Use bulk import endpoint
      const response = await authenticatedFetch('/api/clients/bulk-import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ clients: validClients })
      });
      
      const result = await response.json();
      
      if (result.success) {
        toast.success(`Import completed: ${result.data.imported} clients imported${result.data.failed > 0 ? `, ${result.data.failed} failed` : ''}`);
        
        // Show detailed errors if any
        if (result.data.failed > 0 && result.data.errors.length > 0) {
          console.warn('Import errors:', result.data.errors);
          toast.warning(`${result.data.failed} clients failed to import. Check console for details.`);
        }
      } else {
        throw new Error(result.error || 'Import failed');
      }

      onImportComplete();
      onClose();
    } catch (error) {
      toast.error('Failed to import clients');
      console.error('Import error:', error);
    }
    
    setIsProcessing(false);
  };

  if (mode === 'select') {
    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
        <div className={`${themeClasses.card} w-full max-w-md`}>
          <div className="flex justify-between items-center mb-4">
            <h2 className={themeClasses.cardTitle}>Import/Export Clients</h2>
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
                <div className="font-medium text-foreground">Export Clients</div>
                <div className="text-sm text-muted-foreground">Download all clients as CSV</div>
              </div>
            </button>

            <button
              onClick={() => document.getElementById('csv-upload')?.click()}
              className="w-full flex items-center justify-center p-4 border-2 border-dashed border-border rounded-lg hover:border-primary hover:bg-accent transition-colors"
            >
              <Upload className={`${themeClasses.iconMedium} ${getIconColorClasses('blue')} mr-3`} />
              <div className="text-left">
                <div className="font-medium text-foreground">Import Clients</div>
                <div className="text-sm text-muted-foreground">Upload CSV file to import</div>
              </div>
            </button>

            <input
              id="csv-upload"
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
            <h2 className={themeClasses.cardTitle}>Export Clients</h2>
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className={themeClasses.iconSmall} />
            </button>
          </div>

          <div className="text-center py-6">
            <FileText className={`h-12 w-12 ${getIconColorClasses('blue')} mx-auto mb-4`} />
            <p className="text-muted-foreground mb-6">Export all clients to a CSV file for backup or migration.</p>

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
          <h2 className={themeClasses.cardTitle}>Import Clients</h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className={themeClasses.iconSmall} />
          </button>
        </div>

        <div className="space-y-6">
          {/* Field Mapping */}
          <div>
            <h3 className="text-lg font-medium text-foreground mb-4">Map CSV Fields</h3>
            <div className="mb-4 p-3 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">
                <strong>Name Options:</strong> You can map either "Full Name" OR separate "First Name" and "Last Name" fields.
                If you provide both, the system will use the full name. If you only provide first/last names, they will be combined automatically.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {CLIENT_FIELDS.map(field => (
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
                      {CLIENT_FIELDS.map(field => (
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
                        {CLIENT_FIELDS.map(field => (
                          <td key={field.key} className="px-4 py-2 text-sm text-foreground">
                            {row[field.key] || '-'}
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
                {isProcessing ? 'Importing...' : 'Import Clients'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
