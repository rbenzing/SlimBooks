// Layout component prop types

export interface SidebarProps {
  isOpen?: boolean;
  onToggle?: () => void;
}

export interface ResponsiveSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export interface ResponsiveLayoutProps {
  children: React.ReactNode;
  showSidebar?: boolean;
}
