import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { PaginationSettings } from '@/types';

interface PaginationControlsProps {
  currentPage: number;
  totalPages: number;
  itemsPerPage: number;
  totalItems: number;
  displayStart: number;
  displayEnd: number;
  pageNumbers: number[];
  paginationSettings: PaginationSettings | null;
  
  onPageChange: (page: number) => void;
  onItemsPerPageChange: (size: number) => void;
  onNextPage: () => void;
  onPrevPage: () => void;
  
  canGoNext: boolean;
  canGoPrev: boolean;
  
  className?: string;
  itemType?: string; // e.g., "expenses", "invoices", "clients"
}

export const PaginationControls: React.FC<PaginationControlsProps> = ({
  currentPage,
  totalPages,
  itemsPerPage,
  totalItems,
  displayStart,
  displayEnd,
  pageNumbers,
  paginationSettings,
  onPageChange,
  onItemsPerPageChange,
  onNextPage,
  onPrevPage,
  canGoNext,
  canGoPrev,
  className = "",
  itemType = "items"
}) => {
  if (!paginationSettings || totalItems === 0) {
    return null;
  }

  return (
    <div className={`bg-card rounded-lg shadow-sm border border-border p-4 ${className}`}>
      <div className="flex items-center justify-between flex-wrap gap-4">
        {/* Results info */}
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground">
            Showing {displayStart} to {displayEnd} of {totalItems} {itemType}
          </span>
          
          {paginationSettings.showItemsPerPageSelector && (
            <div className="flex items-center gap-2">
              <label className="text-sm text-muted-foreground">Show:</label>
              <select
                value={itemsPerPage}
                onChange={(e) => onItemsPerPageChange(Number(e.target.value))}
                className="text-sm border border-input rounded-md px-2 py-1 bg-background"
              >
                {paginationSettings.availablePageSizes.map(size => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
              <span className="text-sm text-muted-foreground">per page</span>
            </div>
          )}
        </div>

        {/* Pagination buttons */}
        {paginationSettings.showPageNumbers && totalPages > 1 && (
          <div className="flex items-center gap-2">
            <button
              onClick={onPrevPage}
              disabled={!canGoPrev}
              className="flex items-center gap-1 px-3 py-2 text-sm border border-input rounded-md hover:bg-accent hover:text-accent-foreground disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </button>
            
            <div className="flex items-center gap-1">
              {/* Page numbers */}
              {pageNumbers.map((pageNum) => (
                <button
                  key={pageNum}
                  onClick={() => onPageChange(pageNum)}
                  className={`px-3 py-2 text-sm rounded-md ${
                    currentPage === pageNum
                      ? 'bg-primary text-primary-foreground'
                      : 'border border-input hover:bg-accent hover:text-accent-foreground'
                  }`}
                >
                  {pageNum}
                </button>
              ))}
              
              {/* Show ellipsis and last page if needed */}
              {totalPages > paginationSettings.maxPageNumbers && 
               currentPage < totalPages - Math.floor(paginationSettings.maxPageNumbers / 2) && (
                <>
                  <span className="px-2 py-2 text-sm text-muted-foreground">...</span>
                  <button
                    onClick={() => onPageChange(totalPages)}
                    className="px-3 py-2 text-sm border border-input rounded-md hover:bg-accent hover:text-accent-foreground"
                  >
                    {totalPages}
                  </button>
                </>
              )}
            </div>

            <button
              onClick={onNextPage}
              disabled={!canGoNext}
              className="flex items-center gap-1 px-3 py-2 text-sm border border-input rounded-md hover:bg-accent hover:text-accent-foreground disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};