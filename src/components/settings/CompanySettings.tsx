
import { forwardRef, useImperativeHandle } from 'react';
import { Building } from 'lucide-react';
import { BrandingImageSection } from './BrandingImageSection';
import { CompanyDetailsSection } from './CompanyDetailsSection';
import { TaxRatesSection } from './TaxRatesSection';
import { type CompanySettings as CompanySettingsType } from '@/types/shared/common.types';
import { useCompanySettings } from '@/hooks/useSettings.hook';
import { themeClasses } from '@/utils/themeUtils.util';
import type { SettingsTabRef } from '@/types';

export const CompanySettings = forwardRef<SettingsTabRef>((props, ref) => {
  const {
    settings,
    setSettings,
    saveSettings,
    isLoading,
    error
  } = useCompanySettings();

  // Expose saveSettings method to parent component
  useImperativeHandle(ref, () => ({
    saveSettings: async () => {
      try {
        await saveSettings();
      } catch (error) {
        console.error('Error saving company settings:', error);
        throw error;
      }
    }
  }), [saveSettings]);

  const handleImageUpload = (logoPath: string) => {
    setSettings(prev => ({ ...prev, brandingImage: logoPath }));
  };

  const handleImageDelete = () => {
    setSettings(prev => ({ ...prev, brandingImage: '' }));
  };

  const handleInputChange = <K extends keyof CompanySettingsType>(field: K, value: CompanySettingsType[K]) => {
    setSettings(prev => ({ ...prev, [field]: value }));
  };

  // Show loading state
  if (isLoading) {
    return (
      <div className="bg-card rounded-lg shadow-sm border border-border p-6">
        <div className="flex items-center mb-6">
          <Building className="h-5 w-5 text-primary mr-2" />
          <h3 className="text-lg font-medium text-card-foreground">Company Information</h3>
        </div>
        <div className="flex justify-center py-8">
          <div className="text-muted-foreground">Loading company settings...</div>
        </div>
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div className="bg-card rounded-lg shadow-sm border border-border p-6">
        <div className="flex items-center mb-6">
          <Building className="h-5 w-5 text-primary mr-2" />
          <h3 className="text-lg font-medium text-card-foreground">Company Information</h3>
        </div>
        <div className="text-center py-8">
          <div className="text-destructive mb-2">Error loading settings</div>
          <div className="text-sm text-muted-foreground">{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-lg shadow-sm border border-border p-6">
      <div className="flex items-center mb-6">
        <Building className="h-5 w-5 text-primary mr-2" />
        <h3 className="text-lg font-medium text-card-foreground">Company Information</h3>
      </div>

      <div className="space-y-6">
        <BrandingImageSection
          settings={settings}
          onImageUpload={handleImageUpload}
          onImageDelete={handleImageDelete}
        />
        <CompanyDetailsSection
          settings={settings}
          onInputChange={handleInputChange}
        />
        <div className={themeClasses.divider} />
        <TaxRatesSection />
      </div>
    </div>
  );
});

CompanySettings.displayName = 'CompanySettings';
