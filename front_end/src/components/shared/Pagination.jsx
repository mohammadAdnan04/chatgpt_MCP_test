"use client";

import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import handleSearch from "@/components/search/handleSearch";
import Swal from "sweetalert2";
import { useAuth } from "@/contexts/AuthContext";

const getSearchHardStopPage = (planKey) => {
  const plan = String(planKey || "FREE").toUpperCase();
  if (plan === "BASIC" || plan === "PRO" || plan === "PREMIUM") return 100;
  return 15;
};

const Pagination = ({
  className,
  currentPage,
  cursor,
  searchFilter,
  savedFilterId,
  setLoading,
  setLoadingProgress,
  setSearched,
  setTableData,
  setCursor,
  onPageChange,
  isClientPagination = false,
  totalItems = 0,
  searchMode = "people", // Add this prop
}) => {
  const { user } = useAuth();
  const SEARCH_HARD_STOP_PAGE = getSearchHardStopPage(user?.planKey || user?.orgId?.planKey);
  const computedMaxPage = totalItems === -1
    ? SEARCH_HARD_STOP_PAGE
    : Math.max(1, Math.ceil((Number(totalItems) || 0) / 10));
  const maxPage = savedFilterId
    ? computedMaxPage
    : Math.min(computedMaxPage, SEARCH_HARD_STOP_PAGE);

 const handlePageChange = (page) => {
   if (typeof onPageChange === "function") {
     onPageChange(page);
   }
 };

  const showPageLimitAlert = () => {
    Swal.fire({
      icon: "info",
      title: "Limit Reached",
      text: SEARCH_HARD_STOP_PAGE >= 100
        ? "You've reached the 100-page search limit. Use Bulk Reveal to get more leads."
        : "You've reached the 15-page search limit. Use Bulk Reveal to get more leads.",
      confirmButtonColor: "#3b82f6",
    });
  };

  const runSearchForPage = async (page) => {
    if (page < 1 || page > maxPage) return;

    if (page > SEARCH_HARD_STOP_PAGE && !savedFilterId) {
      showPageLimitAlert();
      return;
    }

    const filterObj = searchFilter && typeof searchFilter === "object" ? searchFilter : {};
    const hasIncludeExclude = Object.values(filterObj).some((value) => {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        return (Array.isArray(value.include) && value.include.length > 0)
          || (Array.isArray(value.exclude) && value.exclude.length > 0);
      }
      if (Array.isArray(value)) return value.length > 0;
      if (typeof value === "string") return value.trim() !== "";
      if (typeof value === "number") return !isNaN(value);
      if (typeof value === "boolean") return true;
      return false;
    });
    if (!savedFilterId && !hasIncludeExclude) {
      return;
    }

    handlePageChange(page);
    if (isClientPagination) return;

    if (setLoading) setLoading(true);

    try {
      await handleSearch({
        searchFilter,
        passedCursor: page,
        savedFilterId,
        setLoading,
        setLoadingProgress,
        setSearched,
        setTableData,
        setCursor,
        type: searchMode,
      });
    } catch (e) {
      console.error("Pagination search error:", e);
      if (setLoading) setLoading(false);
    }
  };

  const handleNextPage = async () => {
    if (currentPage >= SEARCH_HARD_STOP_PAGE && !savedFilterId) {
      showPageLimitAlert();
      return;
    }

    const nextPage = (currentPage || 1) + 1;
    await runSearchForPage(nextPage);
  };

  const handlePrevPage = async () => {
    if (currentPage > 1) {
      const prevPage = (currentPage || 1) - 1;
      await runSearchForPage(prevPage);
    }
  };

  const isSnapshotMode = Boolean(savedFilterId);
  const safeCurrent = Math.min(Math.max(1, currentPage || 1), maxPage);

  const buildSnapshotPages = () => {
    if (maxPage <= 9) return Array.from({ length: maxPage }, (_, i) => i + 1);

    const windowStartCount = 8;
    const nearStart = safeCurrent <= 6;
    const nearEnd = safeCurrent >= maxPage - 5;

    if (nearStart) {
      return [...Array.from({ length: windowStartCount }, (_, i) => i + 1), "…", maxPage];
    }

    if (nearEnd) {
      const start = Math.max(1, maxPage - (windowStartCount - 1));
      return [1, "…", ...Array.from({ length: maxPage - start + 1 }, (_, i) => start + i)];
    }

    const start = Math.max(2, safeCurrent - 2);
    const end = Math.min(maxPage - 1, safeCurrent + 2);
    return [1, "…", ...Array.from({ length: end - start + 1 }, (_, i) => start + i), "…", maxPage];
  };

  return (
    <div className={`flex items-center justify-center gap-2 p-6 ${className}`}>
      {isSnapshotMode ? (
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrevPage}
            disabled={safeCurrent <= 1}
            className="h-8 px-3 rounded-[8px] border border-[#E5E6E6] text-xs text-[#6B7271] bg-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            &lt; Back
          </button>

          <div className="flex items-center gap-1">
            {buildSnapshotPages().map((p, idx) => {
              if (p === "…") {
                return (
                  <span key={`dots_${idx}`} className="text-xs text-[#6B7271] px-1">
                    …
                  </span>
                );
              }

              const isActive = p === safeCurrent;
              return (
                <button
                  key={`p_${p}`}
                  onClick={() => runSearchForPage(p)}
                  className={`h-8 min-w-8 px-2 rounded-[8px] border text-xs transition-colors ${
                    isActive
                      ? "bg-black text-white border-black"
                      : "bg-white text-[#6B7271] border-[#E5E6E6] hover:bg-[#F6F7F7]"
                  }`}
                >
                  {p}
                </button>
              );
            })}
          </div>

          <button
            onClick={handleNextPage}
            disabled={safeCurrent >= maxPage}
            className="h-8 px-3 rounded-[8px] border border-[#E5E6E6] text-xs text-[#6B7271] bg-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next &gt;
          </button>
        </div>
      ) : (
        <>
          <button
            onClick={handlePrevPage}
            disabled={!currentPage || currentPage <= 1}
            className="w-7 h-7 rounded-[7px] bg-[#EEEEEF] hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </button>

          <span className="text-sm text-gray-600 font-medium px-2">{safeCurrent}</span>

          <button
            onClick={handleNextPage}
            disabled={safeCurrent >= maxPage}
            className="w-7 h-7 rounded-[7px] bg-gray-200 hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
          >
            <ChevronRight className="w-5 h-5 text-gray-600" />
          </button>
        </>
      )}
    </div>
  );
};

export default Pagination;
