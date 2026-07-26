
import { useState, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { toast } from 'sonner';
import { themeClasses } from '@/utils/themeUtils.util';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/hooks/useTheme.hook';
import { getToken } from '@/utils/api';
import type { SettingsTabRef } from '@/types';

export const AppearanceSettingsTab = forwardRef<SettingsTabRef>((props, ref) => {
  const { isAdmin, user } = useAuth();
  const { theme, setTheme: setGlobalTheme } = useTheme();
  const [invoiceTemplate, setInvoiceTemplate] = useState('modern-blue');
  const [pdfFormat, setPdfFormat] = useState('A4');
  const [isLoaded, setIsLoaded] = useState(false);
  const [saveError, setSaveError] = useState<string>('');

  // Manual save function for Save button
  const saveSettings = useCallback(async () => {
    if (!isLoaded) return;
    
    // Clear any previous error
    setSaveError('');
    
    // Check if user has admin privileges before attempting save
    if (!isAdmin) {
      const error = 'Admin privileges required to save settings. Contact your administrator.';
      setSaveError(error);
      console.error('Settings save blocked:', error, 'User role:', user?.role);
      throw new Error(error);
    }

    try {
      const settingsToSave = {
        'invoice_template': { value: invoiceTemplate, category: 'appearance' },
        'pdf_format': { value: { format: pdfFormat }, category: 'appearance' }
      };

      const response = await fetch('/api/settings/appearance', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getToken()}`
        },
        body: JSON.stringify({ settings: settingsToSave })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || 'Failed to save appearance settings');
      }

      setSaveError(''); // Clear any previous errors on success
      toast.success('Appearance settings saved successfully');
    } catch (error) {
      console.error('Error saving appearance settings:', error);
      
      // Set user-friendly error message
      if (error.message?.includes('Authentication required')) {
        setSaveError('Authentication failed. Please try logging in again.');
      } else if (error.message?.includes('Admin access required') || error.message?.includes('Insufficient permissions')) {
        setSaveError('Admin privileges required to save settings.');
      } else {
        setSaveError(`Failed to save settings: ${error.message}`);
      }
      toast.error(`Failed to save appearance settings: ${error.message}`);
      throw error;
    }
  }, [isLoaded, invoiceTemplate, pdfFormat, isAdmin, user?.role]);

  // Load settings from database on component mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        // Use dynamic import to avoid circular dependencies
        const { sqliteService } = await import('@/services/sqlite.svc');
        
        if (!sqliteService.isReady()) {
          await sqliteService.initialize();
        }

        const settings = await sqliteService.getAllSettings('appearance');

        // Migrate from localStorage if database settings don't exist
        if (!settings || (!settings.theme && !settings.invoice_template)) {
          const localTemplate = localStorage.getItem('invoiceTemplate') || 'modern-blue';
          setInvoiceTemplate(localTemplate);
          setPdfFormat('A4'); // Default PDF format

          // Save to database and clear localStorage
          await sqliteService.setMultipleSettings({
            'invoice_template': { value: localTemplate, category: 'appearance' },
            'pdf_format': { value: { format: 'A4' }, category: 'appearance' }
          });
          
          // Let useTheme hook handle theme migration
          localStorage.removeItem('invoiceTemplate');
        } else {
          // Use database settings with proper type checking
          // Theme is already handled by useTheme hook
          if (settings?.invoice_template && typeof settings.invoice_template === 'string') {
            setInvoiceTemplate(settings.invoice_template);
          }
          if (settings?.pdf_format) {
            const pdfFormatValue = typeof settings.pdf_format === 'object' && settings.pdf_format !== null && 'format' in settings.pdf_format
              ? (settings.pdf_format as { format: string }).format
              : typeof settings.pdf_format === 'string'
              ? settings.pdf_format
              : 'A4';
            setPdfFormat(pdfFormatValue || 'A4');
          }
        }

        setIsLoaded(true);
      } catch (error) {
        console.error('Error loading appearance settings:', error);
        setIsLoaded(true);
      }
    };

    loadSettings();
  }, []);

  // Theme changes are now handled by useTheme hook

  // Expose saveSettings method to parent component
  useImperativeHandle(ref, () => ({ saveSettings }), [saveSettings]);

  const handleThemeChange = (newTheme: string) => {
    setGlobalTheme(newTheme as 'light' | 'dark' | 'system');
  };

  const handleInvoiceTemplateChange = (newTemplate: string) => {
    setInvoiceTemplate(newTemplate);
  };

  return (
    <div className="bg-card rounded-lg shadow-sm border border-border p-6">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-lg font-medium text-card-foreground">Appearance</h3>
        {!isAdmin && (
          <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">
            Read Only - Admin access required
          </span>
        )}
      </div>
      
      {saveError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-700">{saveError}</p>
        </div>
      )}
      
      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-muted-foreground mb-2">Theme</label>
          <select
            value={theme}
            onChange={(e) => handleThemeChange(e.target.value)}
            disabled={!isAdmin}
            className={`w-full ${themeClasses.select} ${!isAdmin ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-muted-foreground mb-2">Invoice Template</label>
          <select
            value={invoiceTemplate}
            onChange={(e) => handleInvoiceTemplateChange(e.target.value)}
            disabled={!isAdmin}
            className={`w-full ${themeClasses.select} ${!isAdmin ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            <option value="modern-blue">Modern Blue</option>
            <option value="classic-white">Classic White</option>
            <option value="professional-gray">Professional Gray</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-muted-foreground mb-2">PDF Format</label>
          <select
            value={pdfFormat}
            onChange={(e) => setPdfFormat(e.target.value)}
            disabled={!isAdmin}
            className={`w-full ${themeClasses.select} ${!isAdmin ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            <option value="A4">A4 (210 × 297 mm)</option>
            <option value="Letter">Letter (8.5 × 11 in)</option>
            <option value="Legal">Legal (8.5 × 14 in)</option>
            <option value="A3">A3 (297 × 420 mm)</option>
          </select>
          <p className="text-xs text-muted-foreground mt-1">
            Choose the default paper size for PDF invoices and reports
          </p>
        </div>

      </div>
    </div>
  );
});

AppearanceSettingsTab.displayName = 'AppearanceSettingsTab';
