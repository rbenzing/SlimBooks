// Pagination settings utilities for consistent pagination across the application
import type { PaginationSettings } from '@/types';
import { DEFAULT_PAGINATION_SETTINGS } from '@/types';

// Get current pagination settings from SQLite (asynchronous version)
export const getPaginationSettings = async (): Promise<PaginationSettings> => {
  try {
    // Try to access sqliteService if it's available globally
    if (typeof window !== 'undefined' && (window as unknown as { sqliteService?: { isReady(): boolean; getSetting(key: string): Promise<unknown> } }).sqliteService?.isReady()) {
      const sqliteService = (window as unknown as { sqliteService: { getSetting(key: string): Promise<unknown> } }).sqliteService;
      const settings = await sqliteService.getSetting('pagination_settings') as Partial<PaginationSettings>;
      if (settings) {
        return {
          defaultItemsPerPage: settings.defaultItemsPerPage || DEFAULT_PAGINATION_SETTINGS.defaultItemsPerPage,
          availablePageSizes: settings.availablePageSizes || DEFAULT_PAGINATION_SETTINGS.availablePageSizes,
          maxItemsPerPage: settings.maxItemsPerPage || DEFAULT_PAGINATION_SETTINGS.maxItemsPerPage,
          showItemsPerPageSelector: settings.showItemsPerPageSelector !== undefined 
            ? settings.showItemsPerPageSelector 
            : DEFAULT_PAGINATION_SETTINGS.showItemsPerPageSelector,
          showPageNumbers: settings.showPageNumbers !== undefined 
            ? settings.showPageNumbers 
            : DEFAULT_PAGINATION_SETTINGS.showPageNumbers,
          maxPageNumbers: settings.maxPageNumbers || DEFAULT_PAGINATION_SETTINGS.maxPageNumbers
        };
      }
    }
  } catch (error) {
    console.error('Error loading pagination settings:', error);
  }
  return DEFAULT_PAGINATION_SETTINGS;
};

// Async version for components that can handle async operations
export const getPaginationSettingsAsync = async (): Promise<PaginationSettings> => {
  try {
    const { sqliteService } = await import('@/services/sqlite.svc');

    if (sqliteService.isReady()) {
      const settings = await sqliteService.getSetting('pagination_settings') as Partial<PaginationSettings>;
      if (settings) {
        return {
          defaultItemsPerPage: settings.defaultItemsPerPage || DEFAULT_PAGINATION_SETTINGS.defaultItemsPerPage,
          availablePageSizes: settings.availablePageSizes || DEFAULT_PAGINATION_SETTINGS.availablePageSizes,
          maxItemsPerPage: settings.maxItemsPerPage || DEFAULT_PAGINATION_SETTINGS.maxItemsPerPage,
          showItemsPerPageSelector: settings.showItemsPerPageSelector !== undefined 
            ? settings.showItemsPerPageSelector 
            : DEFAULT_PAGINATION_SETTINGS.showItemsPerPageSelector,
          showPageNumbers: settings.showPageNumbers !== undefined 
            ? settings.showPageNumbers 
            : DEFAULT_PAGINATION_SETTINGS.showPageNumbers,
          maxPageNumbers: settings.maxPageNumbers || DEFAULT_PAGINATION_SETTINGS.maxPageNumbers
        };
      }
    }
  } catch (error) {
    console.error('Error loading pagination settings:', error);
  }
  return DEFAULT_PAGINATION_SETTINGS;
};

// Save pagination settings to SQLite
export const savePaginationSettings = async (settings: PaginationSettings): Promise<void> => {
  try {
    // Use dynamic import to avoid circular dependencies
    const { sqliteService } = await import('@/services/sqlite.svc');

    if (sqliteService.isReady()) {
      await sqliteService.setSetting('pagination_settings', settings, 'general');
    }
  } catch (error) {
    console.error('Error saving pagination settings:', error);
  }
};

// Note: Pagination validation is now handled by settingsValidation.ts

// Get pagination info for display
export const getPaginationInfo = (
  currentPage: number, 
  itemsPerPage: number, 
  totalItems: number
): {
  startIndex: number;
  endIndex: number;
  totalPages: number;
  displayStart: number;
  displayEnd: number;
} => {
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  
  return {
    startIndex,
    endIndex,
    totalPages,
    displayStart: startIndex + 1,
    displayEnd: Math.min(endIndex, totalItems)
  };
};

// Generate page numbers for pagination UI
export const generatePageNumbers = (
  currentPage: number,
  totalPages: number,
  maxPageNumbers: number
): number[] => {
  if (totalPages <= maxPageNumbers) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const halfMax = Math.floor(maxPageNumbers / 2);
  let startPage = Math.max(1, currentPage - halfMax);
  const endPage = Math.min(totalPages, startPage + maxPageNumbers - 1);

  // Adjust if we're near the end
  if (endPage - startPage + 1 < maxPageNumbers) {
    startPage = Math.max(1, endPage - maxPageNumbers + 1);
  }

  return Array.from({ length: endPage - startPage + 1 }, (_, i) => startPage + i);
};