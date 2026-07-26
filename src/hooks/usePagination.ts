import { useState, useEffect, useMemo } from 'react';
import {
  getPaginationSettingsAsync,
  getPaginationInfo,
  generatePageNumbers
} from '@/utils/pagination.util';
import type { PaginationSettings } from '@/types';

interface UsePaginationProps<T> {
  data: T[];
  searchTerm?: string;
  filters?: Record<string, unknown>;
}

interface UsePaginationReturn<T> {
  // Paginated data
  paginatedData: T[];
  
  // Pagination state
  currentPage: number;
  itemsPerPage: number;
  totalItems: number;
  totalPages: number;
  
  // Display info
  displayStart: number;
  displayEnd: number;
  pageNumbers: number[];
  
  // Settings
  paginationSettings: PaginationSettings | null;
  
  // Actions
  setCurrentPage: (page: number) => void;
  setItemsPerPage: (size: number) => void;
  goToNextPage: () => void;
  goToPrevPage: () => void;
  goToFirstPage: () => void;
  goToLastPage: () => void;
  
  // State
  canGoNext: boolean;
  canGoPrev: boolean;
  isLoading: boolean;
}

export function usePagination<T>({ 
  data, 
  searchTerm, 
  filters 
}: UsePaginationProps<T>): UsePaginationReturn<T> {
  const [paginationSettings, setPaginationSettings] = useState<PaginationSettings | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [isLoading, setIsLoading] = useState(true);

  // Load pagination settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await getPaginationSettingsAsync();
        setPaginationSettings(settings);
        setItemsPerPage(settings.defaultItemsPerPage);
      } catch (error) {
        console.error('Error loading pagination settings:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadSettings();
  }, []);

  // Calculate pagination info
  const paginationInfo = useMemo(() => {
    return getPaginationInfo(currentPage, itemsPerPage, data.length);
  }, [currentPage, itemsPerPage, data.length]);

  // Generate paginated data
  const paginatedData = useMemo(() => {
    const { startIndex, endIndex } = paginationInfo;
    return data.slice(startIndex, endIndex);
  }, [data, paginationInfo]);

  // Generate page numbers
  const pageNumbers = useMemo(() => {
    if (!paginationSettings) return [];
    return generatePageNumbers(
      currentPage, 
      paginationInfo.totalPages, 
      paginationSettings.maxPageNumbers
    );
  }, [currentPage, paginationInfo.totalPages, paginationSettings]);

  // Reset to page 1 when data changes (search/filters)
  useEffect(() => {
    if (currentPage > paginationInfo.totalPages && paginationInfo.totalPages > 0) {
      setCurrentPage(1);
    }
  }, [searchTerm, filters, paginationInfo.totalPages, currentPage]);

  // Pagination actions
  const goToNextPage = () => {
    setCurrentPage(Math.min(paginationInfo.totalPages, currentPage + 1));
  };

  const goToPrevPage = () => {
    setCurrentPage(Math.max(1, currentPage - 1));
  };

  const goToFirstPage = () => {
    setCurrentPage(1);
  };

  const goToLastPage = () => {
    setCurrentPage(paginationInfo.totalPages);
  };

  const handleSetCurrentPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(paginationInfo.totalPages, page)));
  };

  const handleSetItemsPerPage = (size: number) => {
    if (paginationSettings && size <= paginationSettings.maxItemsPerPage) {
      setItemsPerPage(size);
      setCurrentPage(1);
    }
  };

  return {
    // Paginated data
    paginatedData,
    
    // Pagination state
    currentPage,
    itemsPerPage,
    totalItems: data.length,
    totalPages: paginationInfo.totalPages,
    
    // Display info
    displayStart: paginationInfo.displayStart,
    displayEnd: paginationInfo.displayEnd,
    pageNumbers,
    
    // Settings
    paginationSettings,
    
    // Actions
    setCurrentPage: handleSetCurrentPage,
    setItemsPerPage: handleSetItemsPerPage,
    goToNextPage,
    goToPrevPage,
    goToFirstPage,
    goToLastPage,
    
    // State
    canGoNext: currentPage < paginationInfo.totalPages,
    canGoPrev: currentPage > 1,
    isLoading
  };
}