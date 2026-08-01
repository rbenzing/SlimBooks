// UI component prop types

import type { LucideIcon } from 'lucide-react';

/** The colour palette shared by stat icons and stat values. */
export type StatColor = 'blue' | 'green' | 'purple' | 'red' | 'yellow' | 'orange';

export interface StatCardProps {
  label: string;
  value: React.ReactNode;
  /** Omit for the stacked report layout; supply for the management layout. */
  icon?: LucideIcon;
  iconColor?: StatColor;
  /** Colours the figure itself, as the report screens do. */
  valueColor?: StatColor;
  size?: 'default' | 'medium' | 'small';
}

export interface StatCardGridProps {
  children: React.ReactNode;
  /** Grid classes for the row; each screen keeps its own column layout. */
  className?: string;
}

export interface FormattedDateProps {
  date: string | Date;
  format?: string;
}

export interface FormattedCurrencyProps {
  amount: number;
  currency?: string;
}

export interface PaginationControlsProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  itemsPerPage?: number;
  onItemsPerPageChange?: (itemsPerPage: number) => void;
}

export interface DateRangeFilterProps {
  startDate?: string;
  endDate?: string;
  onRangeChange: (start: string, end: string) => void;
  presets?: Array<{ label: string; value: string }>;
}

export interface DashboardChartProps {
  data: Array<{ label: string; value: number }>;
  title?: string;
  type?: 'line' | 'bar' | 'pie';
}

export interface ConnectionLostDialogProps {
  isOpen: boolean;
  onRetry: () => void;
}

export interface InternationalAddressFormProps {
  formData: Record<string, string>;
  onChange: (field: string, value: string) => void;
  country?: string;
}
