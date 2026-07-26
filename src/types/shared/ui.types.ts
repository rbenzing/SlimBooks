// UI-specific types and interfaces

import { type ReactNode } from 'react';

// Modal and Dialog types
export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  showCloseButton?: boolean;
}

export interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info';
}

// Toast/Notification types
export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
  actions?: ToastAction[];
}

export interface ToastAction {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary';
}

export interface SelectOption<T = string> {
  value: T;
  label: string;
  disabled?: boolean;
}

// Multi-select component props - contains FormFieldProps properties inline to avoid circular imports
export interface MultiSelectProps<T> {
  // FormFieldProps<T[]> properties
  label: string;
  name: string;
  value: T[];
  onChange: (value: T[]) => void;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  helperText?: string;
  // MultiSelect specific properties
  options: SelectOption<T>[];
  searchable?: boolean;
  clearable?: boolean;
}

// Tab component types
export interface TabItem {
  id: string;
  label: string;
  content: ReactNode;
  disabled?: boolean;
  badge?: number;
}

export interface TabsProps {
  items: TabItem[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  variant?: 'default' | 'pills' | 'underline';
}

// Data display component types
// StatCardProps lives in `@/types/components/ui.types` — component props belong
// under `components/`, and declaring it here too made the barrel ambiguous.

// Chart component types
export interface ChartDataPoint {
  x: string | number;
  y: number;
  label?: string;
  color?: string;
}

export interface ChartProps {
  data: ChartDataPoint[];
  type?: 'line' | 'bar' | 'pie' | 'doughnut';
  title?: string;
  xAxisLabel?: string;
  yAxisLabel?: string;
  height?: number;
  loading?: boolean;
}

// List and Table component types
export interface ListItemProps<T> {
  item: T;
  selected?: boolean;
  onSelect?: (item: T) => void;
  onEdit?: (item: T) => void;
  onDelete?: (item: T) => void;
  actions?: Array<{
    label: string;
    icon?: ReactNode;
    onClick: (item: T) => void;
    variant?: 'primary' | 'secondary' | 'danger';
  }>;
}

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

// Navigation types
export interface NavigationItem {
  id: string;
  label: string;
  path: string;
  icon?: ReactNode;
  badge?: number;
  children?: NavigationItem[];
  exact?: boolean;
}

export interface BreadcrumbItem {
  label: string;
  path?: string;
  current?: boolean;
}

// Layout types
export interface LayoutProps {
  children: ReactNode;
  title?: string;
  breadcrumbs?: BreadcrumbItem[];
  actions?: ReactNode;
  sidebar?: ReactNode;
}

// Loading and error states
export interface LoadingState {
  isLoading: boolean;
  error?: string;
  retry?: () => void;
}

// ErrorBoundaryState lives in `@/types/components/error.types`.

// Theme types
export interface ThemeColors {
  primary: string;
  secondary: string;
  success: string;
  warning: string;
  error: string;
  info: string;
  background: string;
  surface: string;
  text: string;
  textSecondary: string;
  border: string;
}

export interface ThemeConfig {
  colors: ThemeColors;
  borderRadius: string;
  fontFamily: string;
  fontSize: {
    xs: string;
    sm: string;
    base: string;
    lg: string;
    xl: string;
  };
  spacing: {
    xs: string;
    sm: string;
    md: string;
    lg: string;
    xl: string;
  };
}

// Component variant types
export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';

export type InputVariant = 'default' | 'filled' | 'outline';
export type InputSize = 'sm' | 'md' | 'lg';

export type CardVariant = 'default' | 'outlined' | 'elevated';
export type BadgeVariant = 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'error';

// Animation and transition types
export type AnimationType = 'fade' | 'slide' | 'scale' | 'bounce';
export type TransitionDuration = 'fast' | 'normal' | 'slow';