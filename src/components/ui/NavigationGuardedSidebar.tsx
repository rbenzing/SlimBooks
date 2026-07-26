import React, { useState } from 'react';
import { 
  LayoutDashboard, 
  Users, 
  FileText, 
  Settings as SettingsIcon,
  CreditCard,
  LogOut,
  Receipt,
  BarChart
} from 'lucide-react';
import { cn } from '@/utils/themeUtils.util';
import { useAuth } from '@/contexts/AuthContext';
import { useLocation } from 'react-router-dom';
import { useCompanySettings } from '@/hooks/useSettings.hook';

const navigation = [
  { id: 'dashboard', name: 'Dashboard', icon: LayoutDashboard, path: '/' },
  { id: 'clients', name: 'Clients', icon: Users, path: '/clients' },
  { 
    id: 'invoices', 
    name: 'Invoices', 
    icon: FileText, 
    path: '/invoices',
    subItems: [
      { id: 'sent-invoices', name: 'Sent Invoices', path: '/invoices#invoices' },
      { id: 'recurring-templates', name: 'Recurring Templates', path: '/invoices#templates' }
    ]
  },
  { id: 'expenses', name: 'Expenses', icon: Receipt, path: '/expenses' },
  { id: 'reports', name: 'Reports', icon: BarChart, path: '/reports' },
  { 
    id: 'settings', 
    name: 'Settings', 
    icon: SettingsIcon, 
    path: '/settings',
    subItems: [
      { id: 'company', name: 'Company', path: '/settings#company' },
      { id: 'general', name: 'General', path: '/settings#general' },
      { id: 'tax', name: 'Tax Rates', path: '/settings#tax' },
      { id: 'shipping', name: 'Shipping', path: '/settings#shipping' },
      { id: 'email', name: 'Email Settings', path: '/settings#email' },
      { id: 'stripe', name: 'Stripe Integration', path: '/settings#stripe' },
      { id: 'notifications', name: 'Notifications', path: '/settings#notifications' },
      { id: 'appearance', name: 'Appearance', path: '/settings#appearance' },
      { id: 'project', name: 'Project Settings', path: '/settings#project' },
      { id: 'backup', name: 'Backup & Restore', path: '/settings#backup' }
    ]
  },
];

interface NavigationGuardedSidebarProps {
  onNavigate: (path: string) => void;
}

export const NavigationGuardedSidebar: React.FC<NavigationGuardedSidebarProps> = ({ onNavigate }) => {
  const { logout, user } = useAuth();
  const location = useLocation();
  const [_pendingPath, setPendingPath] = useState<string>('');
  const { settings: companySettings } = useCompanySettings();

  const isActive = (path: string) => {
    if (path === '/') {
      return location.pathname === '/';
    }
    if (path.includes('#')) {
      return location.pathname + location.hash === path;
    }
    return location.pathname.startsWith(path);
  };

  const isParentActive = (path: string) => {
    if (path === '/') {
      return location.pathname === '/';
    }
    return location.pathname.startsWith(path);
  };

  const handleNavigation = (path: string) => {
    setPendingPath(path);
    onNavigate(path);
  };

  return (
    <div className="w-full bg-card shadow-lg h-full flex flex-col border-r border-border">
      <div className="flex h-full flex-col">
        {/* Logo/Header */}
        <div className="flex h-16 items-center border-b border-border px-6">
          <div className="flex items-center space-x-2">
            <CreditCard className="h-8 w-8 text-blue-600" />
            <h1 className="text-xl font-bold text-foreground">{companySettings.companyName || 'Slimbooks'}</h1>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 px-4 py-6">
          {navigation.map((item) => {
            const Icon = item.icon;
            const parentActive = isParentActive(item.path);
            return (
              <div key={item.id}>
                <button
                  onClick={() => handleNavigation(item.path)}
                  className={cn(
                    'group flex w-full items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    parentActive && !item.subItems
                      ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  )}
                >
                  <Icon
                    className={cn(
                      'mr-3 h-5 w-5 flex-shrink-0',
                      parentActive && !item.subItems ? 'text-blue-600 dark:text-blue-400' : 'text-muted-foreground group-hover:text-accent-foreground'
                    )}
                  />
                  {item.name}
                </button>
                
                {/* Sub Items */}
                {item.subItems && parentActive && (
                  <div className="ml-6 mt-1 space-y-1">
                    {item.subItems.map((subItem) => {
                      const subActive = isActive(subItem.path);
                      return (
                        <button
                          key={subItem.id}
                          onClick={() => handleNavigation(subItem.path)}
                          className={cn(
                            'group flex w-full items-center rounded-lg px-3 py-2 text-sm transition-colors',
                            subActive
                              ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                              : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                          )}
                        >
                          {subItem.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* User Section */}
        <div className="border-t border-border p-4">
          <div className="flex items-center mb-3">
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">Welcome, {user?.username}</p>
              <p className="text-xs text-muted-foreground">Administrator</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="flex w-full items-center rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
};