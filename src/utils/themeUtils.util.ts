import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
// StatusType moved to @/types/shared/theme.types.ts
import type { StatusType } from '@/types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Centralized status color system matching dashboard design
export const statusColors = {
  // Invoice statuses - matching dashboard badge styling
  paid: "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200",
  sent: "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200",
  draft: "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-200",

  // Expense statuses
  pending: "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200",
  approved: "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200",
  reimbursed: "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200",

  // General statuses
  active: "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200",
  inactive: "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-200",
  warning: "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200",
  error: "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200",
  overdue: "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200",
} as const;

export function getStatusColor(status: string | undefined | null): string {
  if (!status) {
    return statusColors.draft;
  }
  const normalizedStatus = status.toLowerCase() as StatusType;
  return statusColors[normalizedStatus] || statusColors.draft;
}

// Theme-aware component classes using CSS custom properties
// Based on the dashboard design as the application standard
export const themeClasses = {
  // Layout - Dashboard-inspired page structure
  page: "min-h-screen bg-background",
  pageContainer: "p-6 space-y-6",
  container: "bg-background text-foreground",

  // Headers - Matching dashboard header styling
  pageHeader: "mb-8",
  pageTitle: "text-3xl font-bold text-foreground",
  pageSubtitle: "text-muted-foreground mt-2",
  sectionHeader: "flex justify-between items-center",
  sectionTitle: "text-2xl font-bold text-foreground",
  sectionSubtitle: "text-muted-foreground",

  // Cards - Dashboard card design system
  card: "bg-card text-card-foreground p-6 rounded-lg shadow-xs border border-border",
  cardCompact: "bg-card text-card-foreground p-4 rounded-lg shadow-xs border border-border",
  cardHeader: "border-b border-border pb-4 mb-4",
  cardTitle: "text-lg font-medium text-card-foreground",
  cardContent: "space-y-4",
  cardFooter: "flex items-center p-6 pt-0",
  cardHover: "bg-card text-card-foreground p-6 rounded-lg shadow-xs border border-border hover:shadow-md transition-shadow cursor-pointer",

  // Statistics Cards - Dashboard stats styling
  statCard: "bg-card p-6 rounded-lg shadow-xs border border-border",
  statCardContent: "flex items-center justify-between",
  statLabel: "text-sm font-medium text-muted-foreground",
  statValue: "text-3xl font-bold text-card-foreground",
  statValueMedium: "text-2xl font-bold text-card-foreground",
  statValueSmall: "text-xl font-bold text-card-foreground",

  // Grids - Dashboard layout patterns
  statsGrid: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6",
  statsGridThree: "grid grid-cols-1 md:grid-cols-3 gap-6",
  cardsGrid: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6",
  contentGrid: "grid grid-cols-1 lg:grid-cols-2 gap-6",

  // Form elements
  label: "block text-sm font-medium text-card-foreground mb-2",
  input: "w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-ring focus:border-transparent",
  dateInput: "w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground focus:outline-hidden focus:ring-2 focus:ring-ring focus:border-transparent scheme-light dark:scheme-dark",
  select: "px-4 py-2 bg-background border border-input rounded-lg text-foreground focus:outline-hidden focus:ring-2 focus:ring-ring focus:border-transparent",
  dropdown: "px-4 py-2 bg-background border border-input rounded-lg text-foreground focus:outline-hidden focus:ring-2 focus:ring-ring focus:border-transparent",
  textarea: "w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-ring focus:border-transparent",
  searchInput: "w-full pl-10 pr-4 py-2 bg-background border border-input rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-ring focus:border-transparent",

  // Invoice form specific elements
  invoiceInput: "w-full border-0 border-b-2 border-border dark:border-gray-500 focus:border-primary focus:ring-0 bg-transparent text-card-foreground placeholder:text-muted-foreground",
  invoiceInputRight: "w-full border-0 border-b-2 border-border dark:border-gray-500 focus:border-primary focus:ring-0 text-right bg-transparent text-card-foreground placeholder:text-muted-foreground",
  invoiceLineInput: "w-full border-0 border-b border-gray-300 dark:border-gray-500 focus:border-primary focus:ring-0 bg-transparent text-card-foreground placeholder:text-muted-foreground",

  // Buttons - Dashboard button styling
  button: "inline-flex items-center px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium",
  buttonSecondary: "inline-flex items-center px-4 py-2 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-colors font-medium",
  buttonOutline: "inline-flex items-center px-4 py-2 border border-input bg-background hover:bg-accent hover:text-accent-foreground rounded-lg transition-colors font-medium",
  buttonDestructive: "inline-flex items-center px-4 py-2 bg-destructive text-destructive-foreground rounded-lg hover:bg-destructive/90 transition-colors font-medium",

  // Table styles
  table: "bg-card border border-border rounded-lg overflow-hidden",
  tableBody: "",
  tableHeader: "bg-muted/50 border-b-2 border-border dark:border-gray-500",
  tableRow: "border-b border-border dark:border-gray-600 hover:bg-muted/50 transition-colors",
  tableCell: "text-foreground p-4",
  tableHeaderCell: "text-muted-foreground font-medium p-4",

  // Enhanced borders for better dark mode visibility
  borderLight: "border-gray-200 dark:border-gray-600",
  borderMedium: "border-gray-300 dark:border-gray-500", 
  borderHeavy: "border-gray-400 dark:border-gray-400",
  borderSubtle: "border-gray-100 dark:border-gray-700",
  borderStrong: "border-gray-500 dark:border-gray-300",
  divider: "border-t border-gray-200 dark:border-gray-600",
  dividerHeavy: "border-t-2 border-gray-300 dark:border-gray-500",
  dividerSubtle: "border-t border-gray-100 dark:border-gray-700",

  // Text styles - Dashboard typography system
  heading: "text-card-foreground font-bold",
  subheading: "text-muted-foreground",
  bodyText: "text-foreground",
  mutedText: "text-muted-foreground",
  smallText: "text-sm text-muted-foreground",

  // Status and badges - Consistent with dashboard
  badge: "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
  badgeSuccess: "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200",
  badgeWarning: "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200",
  badgeError: "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200",
  badgeInfo: "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200",
  badgeNeutral: "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-200",

  // Search and filters
  searchContainer: "bg-card p-6 rounded-lg shadow-xs border border-border",
  searchWrapper: "relative max-w-md",
  searchIcon: "absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground",

  // Icon styling - Dashboard icon patterns
  iconLarge: "h-8 w-8",
  iconMedium: "h-6 w-6",
  iconSmall: "h-4 w-4",
  iconButton: "h-4 w-4 mr-2",
} as const;

// Utility functions for consistent theming
export const getStatCardClasses = (colorClass?: string) => {
  const baseClasses = themeClasses.statCard;
  return colorClass ? `${baseClasses} ${colorClass}` : baseClasses;
};

export const getButtonClasses = (variant: 'primary' | 'secondary' | 'outline' | 'destructive' = 'primary') => {
  switch (variant) {
    case 'secondary':
      return themeClasses.buttonSecondary;
    case 'outline':
      return themeClasses.buttonOutline;
    case 'destructive':
      return themeClasses.buttonDestructive;
    default:
      return themeClasses.button;
  }
};

export const getIconColorClasses = (color: 'blue' | 'green' | 'purple' | 'red' | 'yellow' | 'orange' = 'blue') => {
  const colorMap = {
    blue: "text-blue-600 dark:text-blue-400",
    green: "text-green-600 dark:text-green-400",
    purple: "text-purple-600 dark:text-purple-400",
    red: "text-red-600 dark:text-red-400",
    yellow: "text-yellow-600 dark:text-yellow-400",
    orange: "text-orange-600 dark:text-orange-400",
  };
  return colorMap[color];
};

// Utility function to get theme-aware border classes
export const getBorderClasses = (intensity: 'subtle' | 'light' | 'medium' | 'heavy' | 'strong' = 'light') => {
  switch (intensity) {
    case 'subtle':
      return themeClasses.borderSubtle;
    case 'light':
      return themeClasses.borderLight;
    case 'medium':
      return themeClasses.borderMedium;
    case 'heavy':
      return themeClasses.borderHeavy;
    case 'strong':
      return themeClasses.borderStrong;
    default:
      return themeClasses.borderLight;
  }
};