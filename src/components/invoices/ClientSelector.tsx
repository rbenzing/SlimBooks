
import React from 'react';
import { User, Plus } from 'lucide-react';
import { themeClasses } from '@/utils/themeUtils.util';
import { type Client } from '@/types';

interface ClientSelectorProps {
  clients: Client[];
  selectedClient: Client | null;
  onClientSelect: (client: Client) => void;
  disabled?: boolean;
}

export const ClientSelector: React.FC<ClientSelectorProps> = ({ 
  clients, 
  selectedClient, 
  onClientSelect,
  disabled = false 
}) => {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-card-foreground">Bill To:</h3>

      {selectedClient ? (
        <div className={`p-4 border rounded-lg ${
          disabled
            ? 'bg-muted border-border'
            : 'bg-primary/5 border-primary/20'
        }`}>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center mb-2">
                <User className="h-4 w-4 text-muted-foreground mr-2" />
                <span className="font-medium text-card-foreground">{selectedClient.name}</span>
              </div>
              <div className="text-sm text-muted-foreground space-y-1">
                <div>{selectedClient.company}</div>
                <div>{selectedClient.email}</div>
                {selectedClient.phone && <div>{selectedClient.phone}</div>}
                {selectedClient.address && (
                  <div className="mt-2">
                    <div>{selectedClient.address}</div>
                    <div>
                      {selectedClient.city && `${selectedClient.city}, `}
                      {selectedClient.state && `${selectedClient.state} `}
                      {selectedClient.zipCode}
                    </div>
                  </div>
                )}
              </div>
            </div>
            {!disabled && (
              <button
                onClick={() => onClientSelect(null)}
                className="text-sm text-primary hover:text-primary/80"
              >
                Change
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <select
            onChange={(e) => {
              const client = clients.find(c => c.id === parseInt(e.target.value));
              if (client) onClientSelect(client);
            }}
            className={`w-full ${themeClasses.select}`}
            value=""
            disabled={disabled}
          >
            <option value="">Select a client *</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name} - {client.company}
              </option>
            ))}
          </select>
          
          {clients.length === 0 && (
            <div className="text-center p-6 border border-dashed border-border rounded-lg">
              <User className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-muted-foreground mb-3">No clients found</p>
              <button className="flex items-center mx-auto px-3 py-1 text-sm text-primary hover:text-primary/80">
                <Plus className="h-4 w-4 mr-1" />
                Add your first client
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
