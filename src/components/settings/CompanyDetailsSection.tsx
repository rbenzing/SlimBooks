
import React from 'react';
import { themeClasses } from '@/utils/themeUtils.util';
import { type CompanySettings } from '@/types';

interface CompanyDetailsSectionProps {
  settings: CompanySettings;
  onInputChange: (field: keyof CompanySettings, value: string) => void;
}

export const CompanyDetailsSection: React.FC<CompanyDetailsSectionProps> = ({
  settings,
  onInputChange
}) => {
  return (
    <>
      {/* Company Details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-muted-foreground mb-2">Company Name *</label>
          <input
            type="text"
            value={settings.companyName}
            onChange={(e) => onInputChange('companyName', e.target.value)}
            className={themeClasses.input}
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-muted-foreground mb-2">Owner Name</label>
          <input
            type="text"
            value={settings.ownerName}
            onChange={(e) => onInputChange('ownerName', e.target.value)}
            className={themeClasses.input}
          />
        </div>
      </div>

      {/* Contact Information */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-muted-foreground mb-2">Email</label>
          <input
            type="email"
            value={settings.email}
            onChange={(e) => onInputChange('email', e.target.value)}
            className={themeClasses.input}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-muted-foreground mb-2">Phone</label>
          <input
            type="tel"
            value={settings.phone}
            onChange={(e) => onInputChange('phone', e.target.value)}
            className={themeClasses.input}
          />
        </div>
      </div>

      {/* Address */}
      <div>
        <label className="block text-sm font-medium text-muted-foreground mb-2">Address</label>
        <input
          type="text"
          value={settings.address}
          onChange={(e) => onInputChange('address', e.target.value)}
          className={themeClasses.input}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-muted-foreground mb-2">City</label>
          <input
            type="text"
            value={settings.city}
            onChange={(e) => onInputChange('city', e.target.value)}
            className={themeClasses.input}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-muted-foreground mb-2">State</label>
          <input
            type="text"
            value={settings.state}
            onChange={(e) => onInputChange('state', e.target.value)}
            className={themeClasses.input}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-muted-foreground mb-2">Zip Code</label>
          <input
            type="text"
            value={settings.zipCode}
            onChange={(e) => onInputChange('zipCode', e.target.value)}
            className={themeClasses.input}
          />
        </div>
      </div>
    </>
  );
};
