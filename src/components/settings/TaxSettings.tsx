
import { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Plus, Edit2, Trash2 } from 'lucide-react';
import { themeClasses } from '@/utils/themeUtils.util';
import { type TaxRate, validateTaxRateArray } from '@/types';
import type { SettingsTabRef } from '@/types';

export const TaxSettings = forwardRef<SettingsTabRef>((props, ref) => {
  const [taxRates, setTaxRates] = useState<TaxRate[]>([]);
  const [isEditing, setIsEditing] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', rate: 0 });

  // Expose saveSettings method to parent component (no-op for tax settings as they save immediately)
  useImperativeHandle(ref, () => ({
    saveSettings: async () => {
      // Tax rates are saved immediately when added/edited, no additional save needed
      return Promise.resolve();
    }
  }), []);

  useEffect(() => {
    const loadTaxRates = async () => {
      try {
        // Use dynamic import to avoid circular dependencies
        const { sqliteService } = await import('@/services/sqlite.svc');
        
        if (!sqliteService.isReady()) {
          await sqliteService.initialize();
        }

        // Stored as `tax.tax_rates`, so the category has to be given here too
        // or the read looks for a key that was never written.
        const saved = await sqliteService.getSetting('tax_rates', 'tax');
        if (saved) {
          setTaxRates(validateTaxRateArray(saved));
        } else {
          // Default tax rates
          const defaultRates = [
            { id: '1', name: 'No Tax', rate: 0, isDefault: true },
            { id: '2', name: 'State Tax', rate: 8.25, isDefault: false },
            { id: '3', name: 'City Tax', rate: 2.5, isDefault: false }
          ];
          setTaxRates(defaultRates);
          await sqliteService.setSetting('tax_rates', defaultRates, 'tax');
        }
      } catch (error) {
        console.error('Error loading tax rates:', error);
      }
    };

    loadTaxRates();
  }, []);

  const saveTaxRates = async (rates: TaxRate[]) => {
    setTaxRates(rates);
    try {
      // Use dynamic import to avoid circular dependencies
      const { sqliteService } = await import('@/services/sqlite.svc');
      await sqliteService.setSetting('tax_rates', rates, 'tax');
    } catch (error) {
      console.error('Error saving tax rates:', error);
    }
  };

  const addTaxRate = () => {
    const newRate: TaxRate = {
      id: Date.now().toString(),
      name: 'New Tax Rate',
      rate: 0,
      isDefault: false
    };
    const updated = [...taxRates, newRate];
    saveTaxRates(updated);
    setIsEditing(newRate.id);
    setEditForm({ name: newRate.name, rate: newRate.rate });
  };

  const startEdit = (rate: TaxRate) => {
    setIsEditing(rate.id);
    setEditForm({ name: rate.name, rate: rate.rate });
  };

  const saveEdit = () => {
    if (!isEditing) return;
    
    const updated = taxRates.map(rate => 
      rate.id === isEditing 
        ? { ...rate, name: editForm.name, rate: editForm.rate }
        : rate
    );
    saveTaxRates(updated);
    setIsEditing(null);
  };

  const deleteTaxRate = (id: string) => {
    const updated = taxRates.filter(rate => rate.id !== id);
    saveTaxRates(updated);
  };

  const setDefault = (id: string) => {
    const updated = taxRates.map(rate => ({
      ...rate,
      isDefault: rate.id === id
    }));
    saveTaxRates(updated);
  };

  return (
    <div className="bg-card rounded-lg shadow-sm border border-border p-6">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-lg font-medium text-card-foreground">Tax Rates</h3>
        <button
          onClick={addTaxRate}
          className="flex items-center px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Tax Rate
        </button>
      </div>

      <div className="space-y-3">
        {taxRates.map((rate) => (
          <div key={rate.id} className="flex items-center justify-between p-4 border border-border rounded-lg">
            {isEditing === rate.id ? (
              <div className="flex items-center space-x-3 flex-1">
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className={themeClasses.input.replace('w-full', '')}
                />
                <input
                  type="number"
                  step="0.01"
                  value={editForm.rate}
                  onChange={(e) => setEditForm({ ...editForm, rate: parseFloat(e.target.value) || 0 })}
                  className={`${themeClasses.input.replace('w-full', '')} w-20`}
                />
                <span className="text-sm text-muted-foreground">%</span>
                <button
                  onClick={saveEdit}
                  className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
                >
                  Save
                </button>
                <button
                  onClick={() => setIsEditing(null)}
                  className="px-3 py-1 bg-muted text-muted-foreground rounded text-sm hover:bg-muted/80"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-center space-x-3">
                  <div>
                    <span className="font-medium text-card-foreground">{rate.name}</span>
                    {rate.isDefault && (
                      <span className="ml-2 px-2 py-1 bg-primary/10 text-primary text-xs rounded">
                        Default
                      </span>
                    )}
                  </div>
                  <span className="text-muted-foreground">{rate.rate}%</span>
                </div>
                <div className="flex items-center space-x-2">
                  {!rate.isDefault && (
                    <button
                      onClick={() => setDefault(rate.id)}
                      className="px-2 py-1 text-primary hover:bg-accent hover:text-accent-foreground rounded text-sm"
                    >
                      Set Default
                    </button>
                  )}
                  <button
                    onClick={() => startEdit(rate)}
                    className="p-1 text-muted-foreground hover:text-foreground"
                  >
                    <Edit2 className="h-4 w-4" />
                  </button>
                  {rate.id !== '1' && (
                    <button
                      onClick={() => deleteTaxRate(rate.id)}
                      className="p-1 text-destructive hover:text-destructive/80"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
});

TaxSettings.displayName = 'TaxSettings';
