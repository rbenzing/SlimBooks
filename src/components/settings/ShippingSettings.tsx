
import { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Plus, Edit2, Trash2 } from 'lucide-react';
import { themeClasses } from '@/utils/themeUtils.util';
import { type ShippingRate, validateShippingRateArray } from '@/types';
import type { SettingsTabRef } from '@/types';

export const ShippingSettings = forwardRef<SettingsTabRef>((props, ref) => {
  const [shippingRates, setShippingRates] = useState<ShippingRate[]>([]);
  const [isEditing, setIsEditing] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', amount: 0 });

  // Expose saveSettings method to parent component (no-op for shipping settings as they save immediately)
  useImperativeHandle(ref, () => ({
    saveSettings: async () => {
      // Shipping rates are saved immediately when added/edited, no additional save needed
      return Promise.resolve();
    }
  }), []);

  useEffect(() => {
    const loadShippingRates = async () => {
      try {
        // Use dynamic import to avoid circular dependencies
        const { sqliteService } = await import('@/services/sqlite.svc');
        
        if (!sqliteService.isReady()) {
          await sqliteService.initialize();
        }

        const saved = await sqliteService.getSetting('shipping_rates');
        if (saved) {
          setShippingRates(validateShippingRateArray(saved));
        } else {
          // Migrate from localStorage if it exists
          const localStorageData = localStorage.getItem('shipping_rates');
          let defaultRates;

          if (localStorageData) {
            defaultRates = JSON.parse(localStorageData);
            // Clear localStorage after migration
            localStorage.removeItem('shipping_rates');
          } else {
            defaultRates = [
              { id: '1', name: 'No Shipping', amount: 0, isDefault: true },
              { id: '2', name: 'Standard Shipping', amount: 10, isDefault: false },
              { id: '3', name: 'Express Shipping', amount: 25, isDefault: false },
              { id: '4', name: 'Overnight Shipping', amount: 50, isDefault: false }
            ];
          }

          setShippingRates(defaultRates);
          await sqliteService.setSetting('shipping_rates', defaultRates, 'shipping');
        }
      } catch (error) {
        console.error('Error loading shipping rates:', error);
      }
    };

    loadShippingRates();
  }, []);

  const saveShippingRates = async (rates: ShippingRate[]) => {
    setShippingRates(rates);
    try {
      // Use dynamic import to avoid circular dependencies
      const { sqliteService } = await import('@/services/sqlite.svc');
      await sqliteService.setSetting('shipping_rates', rates, 'shipping');
    } catch (error) {
      console.error('Error saving shipping rates:', error);
    }
  };

  const addShippingRate = () => {
    const newRate: ShippingRate = {
      id: Date.now().toString(),
      name: 'New Shipping Rate',
      amount: 0,
      isDefault: false
    };
    const updated = [...shippingRates, newRate];
    saveShippingRates(updated);
    setIsEditing(newRate.id);
    setEditForm({ name: newRate.name, amount: newRate.amount });
  };

  const startEdit = (rate: ShippingRate) => {
    setIsEditing(rate.id);
    setEditForm({ name: rate.name, amount: rate.amount });
  };

  const saveEdit = () => {
    if (!isEditing) return;
    
    const updated = shippingRates.map(rate => 
      rate.id === isEditing 
        ? { ...rate, name: editForm.name, amount: editForm.amount }
        : rate
    );
    saveShippingRates(updated);
    setIsEditing(null);
  };

  const deleteShippingRate = (id: string) => {
    const updated = shippingRates.filter(rate => rate.id !== id);
    saveShippingRates(updated);
  };

  const setDefault = (id: string) => {
    const updated = shippingRates.map(rate => ({
      ...rate,
      isDefault: rate.id === id
    }));
    saveShippingRates(updated);
  };

  return (
    <div className="bg-card rounded-lg shadow-sm border border-border p-6">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-lg font-medium text-card-foreground">Shipping Rates</h3>
        <button
          onClick={addShippingRate}
          className="flex items-center px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Shipping Rate
        </button>
      </div>

      <div className="space-y-3">
        {shippingRates.map((rate) => (
          <div key={rate.id} className="flex items-center justify-between p-4 border border-border rounded-lg">
            {isEditing === rate.id ? (
              <div className="flex items-center space-x-3 flex-1">
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className={themeClasses.input.replace('w-full', '')}
                />
                <span className="text-sm text-muted-foreground">$</span>
                <input
                  type="number"
                  step="0.01"
                  value={editForm.amount}
                  onChange={(e) => setEditForm({ ...editForm, amount: parseFloat(e.target.value) || 0 })}
                  className={`${themeClasses.input.replace('w-full', '')} w-20`}
                />
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
                  <span className="text-muted-foreground">${rate.amount.toFixed(2)}</span>
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
                      onClick={() => deleteShippingRate(rate.id)}
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

ShippingSettings.displayName = 'ShippingSettings';
