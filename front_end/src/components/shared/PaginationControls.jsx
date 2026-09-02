"use client";

import { ChevronDown } from "lucide-react";
import { useState, useEffect } from "react";
import Pagination from "./Pagination";
import { formatCompactNumber } from "@/utils/formatCompactNumber";

const PaginationControls = ({
  currentPage = 1,
  totalItems = 512,
  itemsPerPage: initialItemsPerPage = 10,
  onPageSizeChange,
  onPageChange,
  cursor,
  searchFilter,
  savedFilterId,
  setLoading,
  setLoadingProgress,
  setSearched,
  setTableData,
  setCursor,
  loadedItemsCount = 0,
  isClientPagination = false, // Add this
  searchMode = "people", // Add this prop
  formattedTotal = null, // Add this prop
}) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const itemsPerPage = 10;

  // Load saved page size from localStorage on mount
  useEffect(() => {}, []);

  // Compute range based on current page and page size
  // Note: itemsPerPage is fixed to 10.
  // startItem = (1-1)*10 + 1 = 1
  // endItem = 1 + 10 - 1 = 10
  const startItem = (totalItems > 0 || totalItems === -1) ? (currentPage - 1) * itemsPerPage + 1 : 0;
  // Use loadedItemsCount to be precise (e.g., if last page has 4 items)
  const endItem = totalItems === -1 
    ? startItem + itemsPerPage - 1 
    : Math.min(startItem + itemsPerPage - 1, totalItems);

  const handlePageSizeChange = async () => {};
  
  // Custom wrapper for onPageChange to support client-side pagination
  const handlePageChangeWrapper = (page) => {
    // Note: We do NOT trigger setLoading(true) here anymore because Pagination.jsx does it right before handleSearch.
    // Doing it here might be redundant or cause race conditions if onPageChange triggers re-render.
    
    if (isClientPagination && onPageChange) {
      onPageChange(page); // This calls handleClientPageChange in Dashboard
    } else if (onPageChange) {
      onPageChange(page); // Standard behavior
    }
  };

  return (
    <div className="flex items-center justify-between w-full pt-4">
      <div className="flex items-center gap-2.5">
        <span className="text-xs text-[#6B7271] leading-[130%]">
          {setLoading && !isClientPagination ? (
             // If we are in server mode, we can show "Searching for Companies..." or "Searching for People..." based on mode
             // BUT, we don't have isLoading prop passed down to this text specifically.
             // We can just rely on the main Table loader overlay.
             // However, user said: "shows searching for people while its searching for company"
             // This text is likely in the Table.jsx overlay or similar.
             `Showing ${startItem}-${endItem}`
          ) : (
             `Showing ${startItem}-${endItem}`
          )}
        </span>
        {/* Page size fixed to 10; dropdown removed */}
        <span className="text-xs text-[#6B7271] leading-[130%]">
          of {formattedTotal || formatCompactNumber(totalItems)}
        </span>
      </div>

      <Pagination
        className="!p-0"
        currentPage={currentPage}
        onPageChange={handlePageChangeWrapper}
        cursor={cursor}
        searchFilter={searchFilter}
        savedFilterId={savedFilterId}
        setLoading={setLoading}
        setLoadingProgress={setLoadingProgress}
        setSearched={setSearched}
        setTableData={setTableData}
        setCursor={setCursor}
        isClientPagination={isClientPagination}
        totalItems={totalItems}
        searchMode={searchMode}
      />
    </div>
  );
};

export default PaginationControls;
