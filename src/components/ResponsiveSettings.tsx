import { useState, useEffect, useRef, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Save, ChevronDown } from 'lucide-react';
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
import { cn } from '@/utils/themeUtils.util';
import type { SettingsTabRef } from '@/types';

interface SettingsTab {
  id: string;
  name: string;
  enabled?: boolean;
}

const baseTabs: SettingsTab[] = [
  { id: 'company', name: 'Company' },
  { id: 'general', name: 'General' },
  { id: 'tax', name: 'Tax Rates' },
  { id: 'shipping', name: 'Shipping' },
  { id: 'email', name: 'Email Settings' },
  { id: 'notifications', name: 'Notifications' },
  { id: 'appearance', name: 'Appearance' },
  { id: 'project', name: 'Project Settings' },
  { id: 'backup', name: 'Backup & Restore' }
];

export const ResponsiveSettings = () => {
  const [activeTab, setActiveTab] = useState('company');
  const [isLoading, setIsLoading] = useState(false);
  const [isMobileTabsOpen, setIsMobileTabsOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const projectSettingsRef = useRef<ProjectSettingsRef>(null);
  const { settings: projectSettings } = useProjectSettings();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Refs for all settings tabs
  const companySettingsRef = useRef<SettingsTabRef>(null);
  const generalSettingsRef = useRef<SettingsTabRef>(null);
  const taxSettingsRef = useRef<SettingsTabRef>(null);
  const shippingSettingsRef = useRef<SettingsTabRef>(null);
  const emailSettingsRef = useRef<SettingsTabRef>(null);
  const stripeSettingsRef = useRef<SettingsTabRef>(null);
  const notificationSettingsRef = useRef<SettingsTabRef>(null);
  const appearanceSettingsRef = useRef<SettingsTabRef>(null);

  // Add conditional tabs
  const availableTabs = useMemo<SettingsTab[]>(() => [
    ...baseTabs,
    ...(projectSettings?.stripe?.enabled ? [{ id: 'stripe', name: 'Stripe Integration' }] : [])
  ], [projectSettings?.stripe?.enabled]);

  useEffect(() => {
    const hash = location.hash.replace('#', '');
    const tabIds = availableTabs.map(tab => tab.id);
    
    if (hash && tabIds.includes(hash)) {
      setActiveTab(hash);
    } else if (hash === 'stripe' && !projectSettings?.stripe?.enabled) {
      setActiveTab('project');
    } else {
      setActiveTab('company');
    }
  }, [location.hash, projectSettings?.stripe?.enabled, availableTabs]);

  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId);
    navigate(`/settings#${tabId}`);
    setIsMobileTabsOpen(false);
  };

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


  const currentTab = availableTabs.find(tab => tab.id === activeTab);

  const renderTabContent = () => {
    switch (activeTab) {
      case 'company': return <CompanySettings ref={companySettingsRef} />;
      case 'general': return <GeneralSettingsTab ref={generalSettingsRef} />;
      case 'tax': return <TaxSettings ref={taxSettingsRef} />;
      case 'shipping': return <ShippingSettings ref={shippingSettingsRef} />;
      case 'email': return <EmailSettings ref={emailSettingsRef} />;
      case 'stripe': return projectSettings?.stripe?.enabled ? <StripeSettingsTab ref={stripeSettingsRef} /> : null;
      case 'notifications': return <NotificationSettingsTab ref={notificationSettingsRef} />;
      case 'appearance': return <AppearanceSettingsTab ref={appearanceSettingsRef} />;
      case 'project': return <ProjectSettingsTab ref={projectSettingsRef} />;
      case 'backup': return <DatabaseBackupSection />;
      default: return <CompanySettings ref={companySettingsRef} />;
    }
  };

  return (
    <div className={cn(themeClasses.page, "ml-0 lg:ml-0")}>
      <div className={themeClasses.pageContainer}>
        {/* Header */}
        <div className={cn(themeClasses.sectionHeader, "flex-col sm:flex-row gap-4 sm:gap-0")}>
          <div className="flex-1">
            <h1 className={themeClasses.sectionTitle}>Settings</h1>
            <p className={themeClasses.sectionSubtitle}>Manage your application preferences and integrations</p>
          </div>
          <button
            onClick={handleSaveSettings}
            disabled={isLoading}
            className={cn(getButtonClasses('primary'), "w-full sm:w-auto")}
          >
            <Save className={themeClasses.iconButton} />
            {isLoading ? 'Saving...' : 'Save Settings'}
          </button>
        </div>

        {/* Mobile Tab Selector */}
        <div className="lg:hidden mb-6">
          <button
            onClick={() => setIsMobileTabsOpen(!isMobileTabsOpen)}
            className="flex w-full items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-left text-sm font-medium hover:bg-accent"
          >
            <span>{currentTab?.name || 'Select Setting'}</span>
            <ChevronDown className={cn(
              "h-4 w-4 transition-transform",
              isMobileTabsOpen && "rotate-180"
            )} />
          </button>
          
          {isMobileTabsOpen && (
            <div className="mt-2 space-y-1 rounded-lg border border-border bg-card p-2 shadow-lg">
              {availableTabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  className={cn(
                    "flex w-full items-center rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    activeTab === tab.id
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  {tab.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Desktop Tab Navigation */}
        <div className="hidden lg:block mb-8">
          <div className="relative">
            {/* Scrollable Tab Container */}
            <div 
              ref={scrollContainerRef}
              className="overflow-x-auto scrollbar-hide"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
              <div className="flex space-x-1 border-b border-border min-w-max">
                {availableTabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => handleTabChange(tab.id)}
                    className={cn(
                      "whitespace-nowrap px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-px",
                      activeTab === tab.id
                        ? "border-primary text-primary bg-accent/50"
                        : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground"
                    )}
                  >
                    {tab.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="space-y-6">
          {renderTabContent()}
        </div>
      </div>
    </div>
  );
};