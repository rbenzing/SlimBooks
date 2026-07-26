
import React from 'react';
import { 
  LayoutDashboard, 
  Users, 
  FileText, 
  Settings as SettingsIcon,
  CreditCard,
  LogOut,
  Receipt,
  BarChart,
  Banknote
} from 'lucide-react';
import { cn } from '@/utils/themeUtils.util';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { useFormNavigation } from '@/hooks/useFormNavigation';
import { useCompanySettings } from '@/hooks/useSettings.hook';

const navigation = [
  { id: 'dashboard', name: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
  { id: 'clients', name: 'Clients', icon: Users, path: '/clients' },
  {
    id: 'invoices',
    name: 'Invoices',
    icon: FileText,
    path: '/invoices#invoices'
  },
  { id: 'expenses', name: 'Expenses', icon: Receipt, path: '/expenses' },
  { id: 'payments', name: 'Payments', icon: Banknote, path: '/payments' },
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

interface SidebarProps {
  onNavigationAttempt?: (path: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ onNavigationAttempt }) => {
  const { logout, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { settings: companySettings } = useCompanySettings();
  
  const isOnFormPage = location.pathname.includes('/new') || location.pathname.includes('/edit') || 
                       location.pathname.includes('/create');

  const { confirmNavigation, NavigationGuard } = useFormNavigation({
    isDirty: true,
    isEnabled: isOnFormPage && (location.pathname.includes('/invoices') || location.pathname.includes('/recurring')),
    entityType: 'invoice'
  });

  const isActive = (path: string) => {
    if (path === '/') {
      return location.pathname === '/';
    }
    if (path.includes('#')) {
      // Special handling for invoice sub-items
      if (path === '/invoices#invoices') {
        // Active for main invoices page, create, and edit (but not recurring)
        return (location.pathname === '/invoices' && location.hash === '#invoices') ||
               (location.pathname === '/invoices' && !location.hash) ||
               (location.pathname.includes('/invoices/create')) ||
               (location.pathname.includes('/invoices/edit/'));
      }
      if (path === '/invoices#templates') {
        // Active for recurring templates
        return (location.pathname === '/invoices' && location.hash === '#templates') ||
               location.pathname.includes('/recurring-invoices');
      }
      // Special handling for settings sub-items
      if (path === '/settings#company') {
        // Company is active when on /settings with no hash (default) or with #company hash
        return (location.pathname === '/settings' && location.hash === '#company') ||
               (location.pathname === '/settings' && !location.hash);
      }
      return location.pathname + location.hash === path;
    }
    return location.pathname.startsWith(path);
  };

  const isParentActive = (path: string) => {
    if (path === '/') {
      return location.pathname === '/';
    }
    if (path === '/invoices' || path === '/invoices#invoices') {
      // Parent is active for all invoice-related pages including both tabs
      return location.pathname.startsWith('/invoices') ||
             location.pathname.includes('/recurring-invoices') ||
             (location.pathname === '/invoices' && location.hash === '#invoices') ||
             (location.pathname === '/invoices' && location.hash === '#templates') ||
             (location.pathname === '/invoices' && !location.hash);
    }
    return location.pathname.startsWith(path);
  };

  const handleNavigation = (path: string) => {
    if (onNavigationAttempt && isOnFormPage) {
      onNavigationAttempt(path);
    } else if (isOnFormPage && (location.pathname.includes('/invoices') || location.pathname.includes('/recurring'))) {
      confirmNavigation(path);
    } else {
      // Smart navigation for hash-based routes to prevent white flash
      if (path.includes('#')) {
        const [basePath, hash] = path.split('#');
        if (location.pathname === basePath) {
          // Already on the same route, just update the hash
          window.location.hash = hash;
          return;
        }
      }
      navigate(path);
    }
  };

  return (
    <div className="w-full bg-card shadow-lg h-full flex flex-col">
      <div className="flex h-full flex-col">
        {/* Logo/Header */}
        <div className="flex h-16 items-center border-b border-border px-6">
          <div className="flex items-center space-x-2">
            <CreditCard className="h-8 w-8 text-primary" />
            <h1 className="text-xl font-bold text-card-foreground">{companySettings.companyName || 'Slimbooks'}</h1>
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
                      ? 'bg-accent text-accent-foreground border border-border'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  )}
                >
                  <Icon
                    className={cn(
                      'mr-3 h-5 w-5 flex-shrink-0',
                      parentActive && !item.subItems 
                        ? 'text-primary' 
                        : 'text-muted-foreground group-hover:text-muted-foreground'
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
                              ? 'bg-accent text-accent-foreground border border-border'
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
              <p className="text-sm font-medium text-card-foreground">Welcome, {user?.username}</p>
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

      <NavigationGuard />
    </div>
  );
};
