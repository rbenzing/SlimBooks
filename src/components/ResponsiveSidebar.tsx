import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Users,
  FileText,
  Settings as SettingsIcon,
  CreditCard,
  LogOut,
  Receipt,
  BarChart,
  Banknote,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  UserCog,
  type LucideIcon
} from 'lucide-react';
import { cn } from '@/utils/themeUtils.util';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { useFormNavigation } from '@/hooks/useFormNavigation';
import { useCompanySettings } from '@/hooks/useSettings.hook';

interface NavigationItem {
  id: string;
  name: string;
  icon: LucideIcon;
  path: string;
  /** Present only on entries whose route the API itself gates to admins. */
  adminOnly?: boolean;
}

const navigation: NavigationItem[] = [
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
  { id: 'users', name: 'Users', icon: UserCog, path: '/users', adminOnly: true },
  {
    id: 'settings',
    name: 'Settings',
    icon: SettingsIcon,
    path: '/settings'
  },
];

interface ResponsiveSidebarProps {
  onNavigationAttempt?: (path: string) => void;
}

export const ResponsiveSidebar: React.FC<ResponsiveSidebarProps> = ({ onNavigationAttempt }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { settings: companySettings } = useCompanySettings();

  // Hiding the entry is presentation only. The API returns 403 to a
  // non-admin who navigates to /users directly, and that is the real
  // access control.
  const visibleNavigation = navigation.filter(item => !item.adminOnly || user?.role === 'admin');

  // Responsive state
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  
  const isOnFormPage = location.pathname.includes('/new') || location.pathname.includes('/edit') || 
                       location.pathname.includes('/create');

  const { confirmNavigation, NavigationGuard } = useFormNavigation({
    isDirty: true,
    isEnabled: isOnFormPage && (location.pathname.includes('/invoices') || location.pathname.includes('/recurring')),
    entityType: 'invoice'
  });

  // Close mobile menu on route change
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  // Handle screen size changes
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setIsMobileMenuOpen(false);
      }
      if (window.innerWidth >= 1280) {
        setIsCollapsed(false);
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize(); // Check initial size
    
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isActive = (path: string) => {
    if (path === '/') {
      return location.pathname === '/';
    }
    if (path.includes('#')) {
      if (path === '/invoices#invoices') {
        return (location.pathname === '/invoices' && location.hash === '#invoices') ||
               (location.pathname === '/invoices' && !location.hash) ||
               (location.pathname.includes('/invoices/create')) ||
               (location.pathname.includes('/invoices/edit/'));
      }
      if (path === '/invoices#templates') {
        return (location.pathname === '/invoices' && location.hash === '#templates') ||
               location.pathname.includes('/recurring-invoices');
      }
      return location.pathname + location.hash === path;
    }
    return location.pathname.startsWith(path);
  };

  const handleNavigation = (path: string) => {
    if (onNavigationAttempt && isOnFormPage) {
      onNavigationAttempt(path);
    } else if (isOnFormPage && (location.pathname.includes('/invoices') || location.pathname.includes('/recurring'))) {
      confirmNavigation(path);
    } else {
      // For settings, just navigate to the base path - tabs handled within the component
      if (path === '/settings') {
        navigate('/settings');
        return;
      }
      
      // Handle other hash-based routes
      if (path.includes('#')) {
        const [basePath, hash] = path.split('#');
        if (location.pathname === basePath) {
          window.location.hash = hash;
          return;
        }
      }
      navigate(path);
    }
  };


  const SidebarContent = ({ isMobile = false }) => (
    <div className="h-full flex flex-col">
      {/* Mobile Header */}
      {isMobile && (
        <div className="flex h-16 items-center justify-between border-b border-border px-4 lg:hidden">
          <div className="flex items-center space-x-2">
            <CreditCard className="h-6 w-6 text-primary" />
            <h1 className="text-lg font-bold text-card-foreground">{companySettings.companyName || 'Slimbooks'}</h1>
          </div>
          <button
            onClick={() => setIsMobileMenuOpen(false)}
            className="p-2 rounded-lg hover:bg-accent"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      )}

      {/* Desktop Header */}
      {!isMobile && (
        <div className="flex h-16 items-center justify-between border-b border-border px-6">
          <div className="flex items-center space-x-2">
            <CreditCard className={cn("h-8 w-8 text-primary", isCollapsed && "h-6 w-6")} />
            {!isCollapsed && <h1 className="text-xl font-bold text-card-foreground">{companySettings.companyName || 'Slimbooks'}</h1>}
          </div>
          {/* Collapse Button */}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="hidden xl:block p-1.5 rounded-lg hover:bg-accent transition-colors"
          >
            {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>
      )}

      {/* Navigation */}
      <nav className={cn("flex-1 space-y-1 px-4 py-6 overflow-y-auto", isCollapsed && "px-2")}>
        {visibleNavigation.map((item) => {
          const Icon = item.icon;
          const itemActive = isActive(item.path);
          
          return (
            <div key={item.id}>
              <button
                onClick={() => handleNavigation(item.path)}
                className={cn(
                  'group flex w-full items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  itemActive
                    ? 'bg-accent text-accent-foreground border border-border'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                  isCollapsed && 'justify-center px-2'
                )}
                title={isCollapsed ? item.name : undefined}
              >
                <Icon
                  className={cn(
                    'h-5 w-5 flex-shrink-0',
                    !isCollapsed && 'mr-3',
                    itemActive 
                      ? 'text-primary' 
                      : 'text-muted-foreground group-hover:text-muted-foreground'
                  )}
                />
                {!isCollapsed && item.name}
              </button>
            </div>
          );
        })}
      </nav>

      {/* User Section */}
      <div className="border-t border-border p-4">
        {!isCollapsed ? (
          <>
            <div className="flex items-center mb-3">
              <div className="flex-1">
                <p className="text-sm font-medium text-card-foreground truncate">
                  Welcome, Admin
                </p>
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
          </>
        ) : (
          <button 
            onClick={logout}
            className="flex w-full items-center justify-center rounded-lg px-2 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            title="Sign Out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile Menu Button */}
      <button
        onClick={() => setIsMobileMenuOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 rounded-lg bg-card border border-border shadow-lg hover:bg-accent"
      >
        <Menu className="h-5 w-5" />
      </button>


      {/* Mobile Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="lg:hidden fixed inset-0 z-40 bg-black/50" 
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Mobile Sidebar */}
      <div className={cn(
        "lg:hidden fixed left-0 top-0 z-50 h-full w-80 bg-card shadow-xl transform transition-transform duration-300",
        isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <SidebarContent isMobile={true} />
      </div>

      {/* Desktop Sidebar */}
      <div className={cn(
        "hidden lg:flex bg-card shadow-lg h-full transition-all duration-300",
        isCollapsed ? "w-16" : "w-64 min-w-[200px]"
      )}>
        <div className="w-full">
          <SidebarContent />
        </div>
      </div>

      <NavigationGuard />
    </>
  );
};