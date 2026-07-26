
import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { Save } from 'lucide-react';
import { TaxSettings } from './settings/TaxSettings';
import { ShippingSettings } from './settings/ShippingSettings';
import { CompanySettings } from './settings/CompanySettings';
import { GeneralSettingsTab } from './settings/GeneralSettingsTab';
import { EmailSettings } from './settings/EmailSettings';
import { StripeSettingsTab } from './settings/StripeSettingsTab';
import { NotificationSettingsTab } from './settings/NotificationSettingsTab';
import { AppearanceSettingsTab } from './settings/AppearanceSettingsTab';
import { ProjectSettingsTab, type ProjectSettingsRef } from './settings/ProjectSettingsTab';
import { DatabaseBackupSection } from './settings/DatabaseBackupSection';
import { themeClasses, getButtonClasses } from '@/utils/themeUtils.util';
import { toast } from 'sonner';
import { useProjectSettings } from '@/hooks/useProjectSettings';
import type { SettingsTabRef } from '@/types';

export const Settings = () => {
  const [activeTab, setActiveTab] = useState('company');
  const [isLoading, setIsLoading] = useState(false);
  const location = useLocation();

  // Refs for all settings tabs
  const companySettingsRef = useRef<SettingsTabRef>(null);
  const generalSettingsRef = useRef<SettingsTabRef>(null);
  const taxSettingsRef = useRef<SettingsTabRef>(null);
  const shippingSettingsRef = useRef<SettingsTabRef>(null);
  const emailSettingsRef = useRef<SettingsTabRef>(null);
  const stripeSettingsRef = useRef<SettingsTabRef>(null);
  const notificationSettingsRef = useRef<SettingsTabRef>(null);
  const appearanceSettingsRef = useRef<SettingsTabRef>(null);
  const projectSettingsRef = useRef<ProjectSettingsRef>(null);

  const { settings: projectSettings } = useProjectSettings();

  useEffect(() => {
    const hash = location.hash.replace('#', '');
    const availableTabs = ['company', 'general', 'tax', 'shipping', 'email', 'notifications', 'appearance', 'project', 'backup'];
    
    // Add stripe tab only if the integration is enabled
    if (projectSettings?.stripe?.enabled) {
      availableTabs.push('stripe');
    }
    
    if (hash && availableTabs.includes(hash)) {
      setActiveTab(hash);
    } else if (hash === 'stripe' && !projectSettings?.stripe?.enabled) {
      // If trying to access stripe tab but it's disabled, redirect to project settings
      setActiveTab('project');
    } else {
      setActiveTab('company');
    }
  }, [location.hash, projectSettings?.stripe?.enabled]);

  const handleSaveSettings = async () => {
    setIsLoading(true);
    try {
      // Get the appropriate settings ref based on active tab
      let settingsRef: SettingsTabRef | ProjectSettingsRef | null = null;

      switch (activeTab) {
        case 'company':
          settingsRef = companySettingsRef.current;
          break;
        case 'general':
          settingsRef = generalSettingsRef.current;
          break;
        case 'tax':
          settingsRef = taxSettingsRef.current;
          break;
        case 'shipping':
          settingsRef = shippingSettingsRef.current;
          break;
        case 'email':
          settingsRef = emailSettingsRef.current;
          break;
        case 'stripe':
          settingsRef = stripeSettingsRef.current;
          break;
        case 'notifications':
          settingsRef = notificationSettingsRef.current;
          break;
        case 'appearance':
          settingsRef = appearanceSettingsRef.current;
          break;
        case 'project':
          settingsRef = projectSettingsRef.current;
          break;
        default:
          // For backup and other tabs that don't have save functionality
          toast.info('This tab does not have saveable settings');
          return;
      }

      if (settingsRef && settingsRef.saveSettings) {
        await settingsRef.saveSettings();
        toast.success('Settings saved successfully');
      } else {
        console.warn(`No save method available for ${activeTab} tab`);
        toast.error('Save method not available for this tab');
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error(`Failed to save settings: ${(error as Error).message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={themeClasses.page}>
      <div className={themeClasses.pageContainer}>
        {/* Header */}
        <div className={themeClasses.sectionHeader}>
          <div>
            <h1 className={themeClasses.sectionTitle}>Settings</h1>
            <p className={themeClasses.sectionSubtitle}>Manage your application preferences and integrations</p>
          </div>
          <button
            onClick={handleSaveSettings}
            disabled={isLoading}
            className={getButtonClasses('primary')}
          >
            <Save className={themeClasses.iconButton} />
            {isLoading ? 'Saving...' : 'Save Settings'}
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="border-b border-border mb-6">
          <nav className="-mb-px flex space-x-8">
            {[
              { key: 'company', label: 'Company' },
              { key: 'general', label: 'General' },
              { key: 'tax', label: 'Tax' },
              { key: 'shipping', label: 'Shipping' },
              { key: 'email', label: 'Email' },
              ...(projectSettings?.stripe?.enabled ? [{ key: 'stripe', label: 'Stripe' }] : []),
              { key: 'notifications', label: 'Notifications' },
              { key: 'appearance', label: 'Appearance' },
              { key: 'project', label: 'Project' },
              { key: 'backup', label: 'Backup' }
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => {
                  setActiveTab(tab.key);
                  window.location.hash = tab.key;
                }}
                className={`
                  py-2 px-1 border-b-2 font-medium text-sm transition-colors
                  ${activeTab === tab.key 
                    ? 'border-primary text-primary' 
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                  }
                `}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="space-y-6">
          {activeTab === 'company' && <CompanySettings ref={companySettingsRef} />}
          {activeTab === 'general' && <GeneralSettingsTab ref={generalSettingsRef} />}
          {activeTab === 'tax' && <TaxSettings ref={taxSettingsRef} />}
          {activeTab === 'shipping' && <ShippingSettings ref={shippingSettingsRef} />}
          {activeTab === 'email' && <EmailSettings ref={emailSettingsRef} />}
          {activeTab === 'stripe' && projectSettings?.stripe?.enabled && <StripeSettingsTab ref={stripeSettingsRef} />}
          {activeTab === 'notifications' && <NotificationSettingsTab ref={notificationSettingsRef} />}
          {activeTab === 'appearance' && <AppearanceSettingsTab ref={appearanceSettingsRef} />}
          {activeTab === 'project' && <ProjectSettingsTab ref={projectSettingsRef} />}
          {activeTab === 'backup' && <DatabaseBackupSection />}
        </div>
      </div>
    </div>
  );
};
