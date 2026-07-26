import React from 'react';
import { themeClasses } from '@/utils/themeUtils.util';
import type { ClientFormData } from '@/types';

interface AddressField {
  key: string;
  label: string;
  placeholder: string;
  required?: boolean;
  type?: 'text' | 'select';
  options?: { value: string; label: string }[];
}

interface CountryAddressConfig {
  fields: AddressField[];
}

const addressConfigs: Record<string, CountryAddressConfig> = {
  USA: {
    fields: [
      { key: 'address', label: 'Street Address', placeholder: '123 Main St' },
      { key: 'city', label: 'City', placeholder: 'New York', required: true },
      { key: 'state', label: 'State', placeholder: 'NY', required: true },
      { key: 'zipCode', label: 'ZIP Code', placeholder: '10001', required: true },
    ]
  },
  Canada: {
    fields: [
      { key: 'address', label: 'Street Address', placeholder: '123 Main St' },
      { key: 'city', label: 'City', placeholder: 'Toronto', required: true },
      { key: 'state', label: 'Province', placeholder: 'ON', required: true },
      { key: 'zipCode', label: 'Postal Code', placeholder: 'M5V 3A8', required: true },
    ]
  },
  UK: {
    fields: [
      { key: 'address', label: 'Address Line 1', placeholder: '123 High Street' },
      { key: 'address2', label: 'Address Line 2', placeholder: 'Apartment, suite, etc.' },
      { key: 'city', label: 'Town/City', placeholder: 'London', required: true },
      { key: 'state', label: 'County', placeholder: 'Greater London' },
      { key: 'zipCode', label: 'Postcode', placeholder: 'SW1A 1AA', required: true },
    ]
  },
  Australia: {
    fields: [
      { key: 'address', label: 'Street Address', placeholder: '123 Main Street' },
      { key: 'city', label: 'Suburb', placeholder: 'Sydney', required: true },
      { key: 'state', label: 'State', placeholder: 'NSW', required: true, type: 'select', options: [
        { value: 'NSW', label: 'New South Wales' },
        { value: 'VIC', label: 'Victoria' },
        { value: 'QLD', label: 'Queensland' },
        { value: 'WA', label: 'Western Australia' },
        { value: 'SA', label: 'South Australia' },
        { value: 'TAS', label: 'Tasmania' },
        { value: 'ACT', label: 'Australian Capital Territory' },
        { value: 'NT', label: 'Northern Territory' },
      ]},
      { key: 'zipCode', label: 'Postcode', placeholder: '2000', required: true },
    ]
  },
  Germany: {
    fields: [
      { key: 'address', label: 'Straße und Hausnummer', placeholder: 'Musterstraße 123' },
      { key: 'city', label: 'Stadt', placeholder: 'Berlin', required: true },
      { key: 'state', label: 'Bundesland', placeholder: 'Berlin' },
      { key: 'zipCode', label: 'Postleitzahl', placeholder: '10115', required: true },
    ]
  },
  France: {
    fields: [
      { key: 'address', label: 'Adresse', placeholder: '123 Rue de la Paix' },
      { key: 'city', label: 'Ville', placeholder: 'Paris', required: true },
      { key: 'state', label: 'Région', placeholder: 'Île-de-France' },
      { key: 'zipCode', label: 'Code Postal', placeholder: '75001', required: true },
    ]
  }
};

interface InternationalAddressFormProps {
  country: string;
  formData: ClientFormData;
  onChange: (field: string, value: string) => void;
  errors?: Record<string, string>;
}

export const InternationalAddressForm: React.FC<InternationalAddressFormProps> = ({
  country,
  formData,
  onChange,
  errors = {}
}) => {
  const config = addressConfigs[country] || addressConfigs.USA;

  return (
    <div className="space-y-4">
      {config.fields.map((field) => (
        <div key={field.key} className={field.key === 'address2' ? 'mt-2' : ''}>
          <label className={themeClasses.label}>
            {field.label} {field.required && <span className="text-red-500">*</span>}
          </label>
          {field.type === 'select' ? (
            <select
              value={formData[field.key] || ''}
              onChange={(e) => onChange(field.key, e.target.value)}
              className={`w-full ${themeClasses.select} ${
                errors[field.key] ? 'border-red-300' : ''
              }`}
            >
              <option value="">Select {field.label}</option>
              {field.options?.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={formData[field.key] || ''}
              onChange={(e) => onChange(field.key, e.target.value)}
              placeholder={field.placeholder}
              className={`${themeClasses.input} ${
                errors[field.key] ? 'border-red-300' : ''
              }`}
            />
          )}
          {errors[field.key] && (
            <p className="text-red-500 text-xs mt-1">{errors[field.key]}</p>
          )}
        </div>
      ))}
    </div>
  );
};