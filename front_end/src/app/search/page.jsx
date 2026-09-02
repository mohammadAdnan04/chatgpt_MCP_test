"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import DashboardContainer from "@/components/dashboardLayoutContainer";

import AIPrompt from "@/components/modals/AIPrompt";
import AIBulkPrompt from "@/components/modals/AIBulkPrompt";
import Table from "@/components/shared/Table";
import FilterPanel from "@/components/search/FilterPanel";
import Tabs from "@/components/search/Tabs";
import SemanticControlPanel from "@/components/search/SemanticControlPanel";
import semanticFilterManager from "@/utils/semanticFilter";
import AiFilterChat from "@/components/search/AiFilterChat";
import LoadingState from "@/views/search/LoadingState";
import handleSearch from "@/components/search/handleSearch";
import { getSampleSearchResult, hasMadeRealSearch } from "@/utils/sampleLeads";
import axios from "axios";
import Swal from "sweetalert2";
const config = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000",
};

const hasActiveFilters = (f) => {
  if (!f) return false;
  for (const key in f) {
    const value = f[key];
    if (typeof value === "object" && value !== null) {
      if (
        (Array.isArray(value.include) && value.include.length > 0) ||
        (Array.isArray(value.exclude) && value.exclude.length > 0)
      ) {
        return true;
      }
    } else if (
      (Array.isArray(value) && value.length > 0) ||
      (typeof value === "string" && value.trim() !== "") ||
      (typeof value === "number" && !isNaN(value)) ||
      (typeof value === "boolean")
    ) {
      return true;
    }
  }
  return false;
};

const SavedFiltersDropdown = ({ savedFilters, onLoad, onDelete, loading }) => {
  if (loading) {
    return (
      <div className="flex justify-center w-full">
        <div className="px-6 py-3 rounded-xl bg-[#E5E6E6] text-[#999] flex items-center gap-2">
          <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-400 border-t-transparent"></div>
          Loading saved filters...
        </div>
      </div>
    );
  }

  if (savedFilters.length === 0) {
    return (
      <div className="flex justify-center w-full">
        <div className="px-6 py-3 rounded-xl bg-[#E5E6E6] text-[#999]">
          No saved filters found
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 w-full max-w-md mx-auto">
      <h3 className="text-sm font-medium text-[#222] text-center mb-2">
        Saved Filters
      </h3>
      <div className="max-h-48 overflow-y-auto space-y-2">
        {savedFilters.map((savedFilter, index) => (
          <div
            key={savedFilter.id || index}
            className="flex items-center justify-between p-3 rounded-xl border border-[#E5E6E6] bg-white hover:bg-[#f5f5f5] transition-colors"
          >
            <div className="flex-1">
              <p className="text-sm font-medium text-[#222]">
                {savedFilter.name || ("Saved Filter " + (index + 1))}
              </p>
              <p className="text-xs text-[#666] mt-1">
                {new Date(
                  savedFilter.createdAt || savedFilter.updatedAt
                ).toLocaleDateString()}{" "}
                at{" "}
                {new Date(
                  savedFilter.createdAt || savedFilter.updatedAt
                ).toLocaleTimeString()}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onLoad(savedFilter)}
                className="px-3 py-1 text-xs bg-[#04145C] text-white rounded-lg hover:bg-[#03124A] transition-colors"
              >
                Load
              </button>
              <button
                onClick={() => onDelete(savedFilter.id)}
                className="px-3 py-1 text-xs bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// Load Saved Filters Button Component
const LoadFiltersButton = ({ onClick, hasFilters, loading }) => {
  return (
    <div className="flex justify-center w-full">
      <button
        onClick={onClick}
        disabled={loading}
        className={`px-6 py-3 rounded-xl font-medium text-sm transition-all duration-200 flex items-center gap-2 ${
          loading
            ? "bg-[#E5E6E6] text-[#999] cursor-not-allowed"
            : "bg-[#00D2FF] text-[#04145C] hover:bg-[#00C4E6] cursor-pointer shadow-sm hover:shadow-md"
        }`}
      >
        {loading && (
          <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-400 border-t-transparent"></div>
        )}
        {loading ? "Loading..." : "📁 Load Saved Filters"}
        {!loading && hasFilters > 0 && (
          <span className="bg-[#04145C] text-white text-xs px-2 py-1 rounded-full ml-1">
            {hasFilters}
          </span>
        )}
      </button>
    </div>
  );
};

// Save Button Component
const SaveButton = ({ searchFilter, onSave, isLoading = false }) => {
  const hasFilters = () => {
    if (!searchFilter) return false;
    for (const key in searchFilter) {
      const value = searchFilter[key];
      if (typeof value === "object" && value !== null) {
        if (
          (Array.isArray(value.include) && value.include.length > 0) ||
          (Array.isArray(value.exclude) && value.exclude.length > 0)
        ) {
          return true;
        }
      } else if (
        (Array.isArray(value) && value.length > 0) ||
        (typeof value === "string" && value.trim() !== "") ||
        (typeof value === "number" && !isNaN(value))
      ) {
        return true;
      }
    }
    return false;
  };

  const handleSaveClick = () => {
    if (hasFilters() && !isLoading) {
      onSave(searchFilter);
    }
  };

  const isDisabled = !hasFilters() || isLoading;

  return (
    <div className="flex justify-center w-full">
      <button
        onClick={handleSaveClick}
        disabled={isDisabled}
        className={`px-6 py-3 rounded-xl font-medium text-sm transition-all duration-200 flex items-center gap-2 ${
          isDisabled
            ? "bg-[#E5E6E6] text-[#999] cursor-not-allowed"
            : "bg-[#04145C] text-white hover:bg-[#03124A] cursor-pointer shadow-sm hover:shadow-md"
        }`}
      >
        {isLoading && (
          <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
        )}
        {isLoading ? "Saving..." : "Save Search Filters"}
      </button>
    </div>
  );
};

// Main Dashboard Component
const Dashboard = () => {
  const [tableData, setTableData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [searched, setSearched] = useState(false);
  const [loadingFilters, setLoadingFilters] = useState(false);
  const [cursor, setCursor] = useState(null);
  const [searchFilter, setSearchFilter] = useState({});
  const [currentPage, setCurrentPage] = useState(1);
  const [aiSearchQuery, setAiSearchQuery] = useState(false);
  const [aiBulkSearchQuery, setAiBulkSearchQuery] = useState(false); // New state for bulk AI query modal
  const [paginationLoading, setPaginationLoading] = useState(false); // New state for pagination loading
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [filterKey, setFilterKey] = useState(0); // Key to force FilterPanel re-render
  const [savedFilters, setSavedFilters] = useState([]); // Key to force FilterPanel re-render
  const [showSavedFilters, setShowSavedFilters] = useState(false);
  const [activeSavedFilterId, setActiveSavedFilterId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [filtersVisible, setFiltersVisible] = useState(process.env.NEXT_PUBLIC_HIDE_AI_MODE === 'true' ? true : false);
  const [resumePromptVisible, setResumePromptVisible] = useState(false);
  const [resumeCandidate, setResumeCandidate] = useState(null);
  const [isAiStep2, setIsAiStep2] = useState(false); // Track AI Prompt verification step
  const [currentAiStep, setCurrentAiStep] = useState(0); // Track the exact step of AI Prompt
  const [aiContext, setAiContext] = useState(null); // Added state for aiContext
  const [isAiMode, setIsAiMode] = useState(process.env.NEXT_PUBLIC_HIDE_AI_MODE === 'true' ? false : true); // New state for AI Mode toggle
  const [searchMode, setSearchModeState] = useState("people");
  const searchModeRef = useRef("people");
  const setSearchMode = useCallback((mode) => {
    searchModeRef.current = mode;
    setSearchModeState(mode);
  }, []);
  const [tableSearchMode, setTableSearchMode] = useState("people"); // Tracks the search mode of the currently displayed results
  const savedPopoverRef = useRef(null);
  const SESSION_STATE_KEY = "mawsool:searchState";

  // State variables for save modal
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [newFilterName, setNewFilterName] = useState("");

  // Keys we may have used when saving
  const LOCAL_LIST_KEY = "searchFilters_saved"; // array of { id, name, filters, ... }
  const LOCAL_SINGLE_KEY = "savedSearchFilters"; // plain filters object (Table fallback)

  const didAutoLoadRef = useRef(false);

  // Cache for switching tabs
  const stateCache = useRef({
    people: {
      tableData: [],
      searchFilter: {},
      searched: false,
      cursor: null,
      currentPage: 1,
      filterKey: 0,
      tableSearchMode: "people",
      itemsPerPage: 10,
      isClientPagination: false,
      allRankedItems: []
    },
    companies: {
      tableData: [],
      searchFilter: {},
      searched: false,
      cursor: null,
      currentPage: 1,
      filterKey: 100, // Different key seed for companies
      tableSearchMode: "companies",
      itemsPerPage: 10,
      isClientPagination: false,
      allRankedItems: []
    }
  });

  const envSemantic = process.env.NEXT_PUBLIC_SEMANTIC_ENABLED === "true";
  const [semanticSettings, setSemanticSettings] = useState({ enabled: envSemantic, threshold: 0.7 });

  const [isClientPagination, setIsClientPagination] = useState(false);
  const [allRankedItems, setAllRankedItems] = useState([]);

  const applySamplePreview = useCallback(() => {
    if (hasMadeRealSearch()) return false;
    if (searchModeRef.current !== "people") return false;
    setTableData(getSampleSearchResult());
    setSearched(true);
    setLoading(false);
    setLoadingProgress(0);
    setCurrentPage(1);
    setCursor(null);
    setIsClientPagination(false);
    setAllRankedItems([]);
    setTableSearchMode("people");
    return true;
  }, []);

  const setSearchFilterWithClear = useCallback((updater) => {
    setActiveSavedFilterId(null);
    setSearchFilter(updater);
  }, []);

  const setTableDataWithSemantic = useCallback(async (data) => {
    try {
      // Prevent updates if the search result doesn't match the current mode
      if (data.searchMode && data.searchMode !== searchModeRef.current) {
        return;
      }

      if (!semanticSettings.enabled) {
        setTableData(data);
        setIsClientPagination(false);
        setAllRankedItems([]);
        return;
      }
      const jobTitleFilter = searchFilter?.job_title || "";
      const roleFilter = searchFilter?.role || "";
      const industryFilter = searchFilter?.industry || "";
      let effectiveJobTitleFilter = jobTitleFilter;
      if (!effectiveJobTitleFilter && roleFilter) {
        if (roleFilter.includeLabels && Object.keys(roleFilter.includeLabels).length > 0) {
          const names = Object.values(roleFilter.includeLabels);
          effectiveJobTitleFilter = names.join(" ");
        } else if (Array.isArray(roleFilter.include)) {
          effectiveJobTitleFilter = roleFilter.include.map((id) => String(id)).join(" ");
        } else {
          effectiveJobTitleFilter = String(roleFilter || "");
        }
      }
      let industryQuery = "";
      if (industryFilter && typeof industryFilter === "object") {
        if (industryFilter.includeLabels && typeof industryFilter.includeLabels === "object") {
          const labels = Object.values(industryFilter.includeLabels);
          industryQuery = labels.join(" ");
        } else if (Array.isArray(industryFilter.include)) {
          industryQuery = industryFilter.include.map((id) => String(id)).join(" ");
        }
      } else if (typeof industryFilter === "string") {
        industryQuery = industryFilter;
      }
      if (!data || !Array.isArray(data.items)) {
        setTableData(data);
        setIsClientPagination(false);
        setAllRankedItems([]);
        return;
      }

      // If we received a large batch (likely 100), we should enable client pagination
      const receivedItems = data.items;
      const shouldUseClientPagination = receivedItems.length > itemsPerPage;

      // Update table search mode if provided in the data payload (from handleSearch)
      if (data.searchMode && (data.searchMode === "people" || data.searchMode === "companies")) {
        setTableSearchMode(data.searchMode);
      }

      const rankedItems = await semanticFilterManager.filterResults(
        receivedItems,
        String(effectiveJobTitleFilter || ""),
        String(industryQuery || ""),
        "",
        null,
        semanticSettings.threshold
      );
      
      if (shouldUseClientPagination) {
        setIsClientPagination(true);
        setAllRankedItems(rankedItems);
        // Set first page
        const firstPageItems = rankedItems.slice(0, itemsPerPage);
        const finalData = { 
          ...data, 
          items: firstPageItems,
          paging: { 
            ...data.paging, 
            total_count: data.paging?.total_count || rankedItems.length 
          } 
        };
        setTableData(finalData);
        setCurrentPage(1);
      } else {
        setIsClientPagination(false);
        setAllRankedItems([]);
        const finalData = { ...data, items: rankedItems };
        setTableData(finalData);
      }
    } catch (e) {
      console.error("Semantic filter error:", e);
      setTableData(data);
      setIsClientPagination(false);
    }
  }, [semanticSettings.enabled, semanticSettings.threshold, searchFilter, setTableData, itemsPerPage, searchMode]);

  const handleClientPageChange = useCallback((page) => {
      setCurrentPage(page);
      if (isClientPagination) {
        const startIndex = (page - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        const pageItems = allRankedItems.slice(startIndex, endIndex);
        // If we have items locally, slice and render
        if (pageItems.length > 0) {
          setTableData(prev => ({
            ...prev,
            items: pageItems
          }));
        } else {
          // Out of local items: fetch the next server page using our proxy pagination
          handleSearch({
            searchFilter,
            limit: itemsPerPage,
            passedCursor: page,
            setLoading,
            setLoadingProgress,
            setSearched,
            setTableData: setTableDataWithSemantic,
            setCursor,
            type: searchMode, // Ensure we use the current searchMode
          });
        }
        const tableContainer = document.querySelector('.overflow-auto');
        if (tableContainer) tableContainer.scrollTop = 0;
      }
  }, [isClientPagination, allRankedItems, itemsPerPage, searchFilter, setLoading, setLoadingProgress, setSearched, setTableDataWithSemantic, setCursor, searchMode]); // Added searchMode

  // New function to load filters from dropdown
  // const handleLoadFilterFromDropdown = (filter) => {
  //   console.log("Loading filter:", filter);
  //   // Apply the filter to your search
  //   setSearchFilter(filter.filters);
  //   setSearched(false);
  //   setTableData([]);
  //   setCursor(null);
  //   setFilterKey((k) => k + 1); // Force FilterPanel re-render

  //   // Trigger a search with the loaded filter
  //   setTimeout(() => {
  //     handleSearch({
  //       searchFilter: filter.filters,
  //       limit: itemsPerPage,
  //       passedCursor: null,
  //       setLoading,
  //       setLoadingProgress,
  //       setSearched,
  //       setTableData,
  //       setCursor,
  //     });
  //   }, 100);
  // };

  const handleTabChange = (mode) => {
    // Save current state to cache
    stateCache.current[searchModeRef.current] = {
      tableData,
      searchFilter,
      searched,
      cursor,
      currentPage,
      filterKey,
      tableSearchMode,
      itemsPerPage,
      isClientPagination,
      allRankedItems
    };

    // Load next state
    const nextState = stateCache.current[mode];

    setSearchMode(mode);
    setTableData(nextState.tableData);
    setSearchFilter(nextState.searchFilter);
    setSearched(nextState.searched);
    setCursor(nextState.cursor);
    setCurrentPage(nextState.currentPage);
    setFilterKey(nextState.filterKey + 1); // Force re-render of FilterPanel
    setTableSearchMode(nextState.tableSearchMode);
    setItemsPerPage(nextState.itemsPerPage);
    setIsClientPagination(nextState.isClientPagination);
    setAllRankedItems(nextState.allRankedItems);
    if (mode === "people" && !hasMadeRealSearch() && !hasActiveFilters(nextState.searchFilter)) {
      applySamplePreview();
    }
  };

  const applyFiltersAndRun = useCallback(
    async (filters, savedFilterId = null, overrideMode = null, forceRun = false) => {
      const modeToUse = overrideMode || searchMode;
      if (overrideMode && overrideMode !== searchMode) {
        setSearchMode(overrideMode);
      }

      // Reset UI so FilterPanel shows the loaded values cleanly
      setSearchFilter({});
      setSearched(false);
      setTableData([]);
      setCursor(null);
      setCurrentPage(1);
      setFilterKey((k) => k + 1);
      setActiveSavedFilterId(savedFilterId || null);

      setSearchFilter(filters);

      if (!hasActiveFilters(filters) && !savedFilterId) {
        applySamplePreview();
        return;
      }

      // Auto-run the search with these filters
      await handleSearch({
        searchFilter: filters,
        limit: itemsPerPage,
        passedCursor: null,
        savedFilterId: savedFilterId || null,
        setLoading,
        setLoadingProgress,
        setSearched,
        setTableData: setTableDataWithSemantic,
        setCursor,
        type: modeToUse, // Ensure searchMode is passed here
      });
      try {
        if (typeof window !== "undefined") {
          const payload = { filters, timestamp: Date.now() };
          sessionStorage.setItem("mawsool:lastSearchFilters", JSON.stringify(payload));
        }
      } catch {}
    },
    [
      itemsPerPage,
      setLoading,
      setLoadingProgress,
      setSearched,
      setTableData,
      setCursor,
      setSearchFilter,
      setFilterKey,
      searchMode, // Added searchMode
      applySamplePreview
    ]
  );

  const handleSeeEmployees = useCallback(async (company) => {
    // Save the current company search state before switching
    stateCache.current[searchModeRef.current] = {
      tableData,
      searchFilter,
      searched,
      cursor,
      currentPage,
      filterKey,
      tableSearchMode,
      itemsPerPage,
      isClientPagination,
      allRankedItems
    };

    const companyId = `${company.name}|||${company.domain || company.name}`;
    const newFilters = {
      company: {
        include: [companyId],
        exclude: [],
        includeLabels: { [companyId]: company.name },
        excludeLabels: {},
        includes: [companyId],
        excludes: [],
        includesTitles: { [companyId]: company.name },
        excludesTitles: {},
      }
    };

    setSearchMode("people");
    setTableSearchMode("people");
    setSearchFilter(newFilters);
    setSearched(false);
    setTableData([]);
    setCursor(null);
    setCurrentPage(1);
    setFilterKey((k) => k + 1);
    setActiveSavedFilterId(null);

    await handleSearch({
      searchFilter: newFilters,
      limit: itemsPerPage,
      passedCursor: null,
      savedFilterId: null,
      setLoading,
      setLoadingProgress,
      setSearched,
      setTableData: setTableDataWithSemantic,
      setCursor,
      type: "people",
    });
  }, [
    tableData,
    searchFilter,
    searched,
    cursor,
    currentPage,
    filterKey,
    tableSearchMode,
    itemsPerPage,
    isClientPagination,
    allRankedItems,
    setSearchMode,
    setSearchFilter,
    setSearched,
    setTableData,
    setCursor,
    setCurrentPage,
    setFilterKey,
    setActiveSavedFilterId,
    setLoading,
    setLoadingProgress,
    setTableDataWithSemantic
  ]);

  useEffect(() => {
    if (didAutoLoadRef.current) return;
    didAutoLoadRef.current = true;

    let restoredRealSearch = false;
    try {
      if (typeof window !== "undefined") {
        const rawState = sessionStorage.getItem(SESSION_STATE_KEY);
        if (rawState) {
          const state = JSON.parse(rawState);
          if (state && typeof state === "object") {
            const filters = state.searchFilter || {};
            const savedFilterId = state.savedFilterId || null;
            setItemsPerPage(10);
            setCurrentPage(1);
            setSearchFilter({});
            setSearched(false);
            setTableData([]);
            setCursor(null);
            setIsClientPagination(false);
            setAllRankedItems([]);
            setFilterKey((k) => k + 1);
            try { sessionStorage.removeItem(SESSION_STATE_KEY); } catch {}
            if (hasActiveFilters(filters) || savedFilterId) {
              restoredRealSearch = true;
              applyFiltersAndRun(filters, savedFilterId, null, true);
            }
          }
        }
      }
    } catch {}

    if (!restoredRealSearch) {
      applySamplePreview();
    }

    try {
      if (typeof window !== "undefined") {
        const raw = sessionStorage.getItem("mawsool:lastSearchFilters");
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.filters && hasActiveFilters(parsed.filters)) {
            setResumeCandidate(parsed);
            setResumePromptVisible(true);
            return;
          }
        }
      }
    } catch {}

    (async () => {
      try {
        const token =
          typeof window !== "undefined"
            ? localStorage.getItem("auth-token")
            : null;

        const res = await axios.get(config.apiUrl + "/api/filters/get-Filter", {
          withCredentials: true,
          headers: token ? { Authorization: 'Bearer ' + token } : {},
        });

        const list = res?.data?.data;
        if (Array.isArray(list) && list.length > 0) {
          const latest = list.reduce((acc, cur) => {
            const accTime = new Date(acc.updatedAt || acc.createdAt || 0).getTime();
            const curTime = new Date(cur.updatedAt || cur.createdAt || 0).getTime();
            return curTime > accTime ? cur : acc;
          }, list[0]);
          if (latest && latest.filters && typeof latest.filters === "object") {
            setResumeCandidate({ filters: latest.filters, timestamp: Date.now() });
            setResumePromptVisible(true);
          }
        }
      } catch (err) {
        if (axios.isAxiosError(err) && err.response?.status === 404) {
           // Do nothing on 404, just means no saved filters exist
        } else {
          console.error("Failed to load saved filter:", err);
        }
      }
    })();
  }, [applyFiltersAndRun, applySamplePreview, config.apiUrl]);

  useEffect(() => {
    try {
      if (typeof window !== "undefined" && !loading) {
        if (!hasActiveFilters(searchFilter) && !activeSavedFilterId) {
          sessionStorage.removeItem(SESSION_STATE_KEY);
          return;
        }
        const state = {
          searchFilter,
          savedFilterId: activeSavedFilterId || null,
          timestamp: Date.now()
        };
        sessionStorage.setItem(SESSION_STATE_KEY, JSON.stringify(state));
      }
    } catch {}
  }, [loading, searchFilter, activeSavedFilterId]);

  // LocalStorage helper functions
  const SAVED_FILTERS_KEY = "searchFilters_saved";

  // below: funciton is to test the data manulaly. if api is properly working Faheem you can remove it. and also other funcitons as well which are not in use okay[huziafa]
  const seedOneSavedFilter = () => {
    const manual = {
      id: Date.now().toString(),
      name: "Manual Test Filter " + new Date().toLocaleString(),
      filters: {
        industry: {
          include: ["4"],
          includeLabels: { 4: "Software Development" },
          exclude: ["51"],
          excludeLabels: { 51: "Civil Engineering" },
        },
        role: {
          include: ["9"],
          includeLabels: { 9: "Software Engineer" },
          exclude: ["245"],
          excludeLabels: { 245: "Professional" },
        },
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const existing = JSON.parse(
      localStorage.getItem(SAVED_FILTERS_KEY) || "[]"
    );
    const updated = [manual, ...existing].slice(0, 10);

    localStorage.setItem(SAVED_FILTERS_KEY, JSON.stringify(updated));
    // console.log("✅ Seeded saved filter to localStorage:", manual);
    setSavedFilters(updated);
  };

  const getSavedFiltersFromStorage = () => {
    try {
      const saved = localStorage.getItem(SAVED_FILTERS_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch (error) {
      console.error("Error reading saved filters from localStorage:", error);
      return [];
    }
  };
  useEffect(() => {
    if (searchFilter && Object.keys(searchFilter).length > 0) {
      console.log("✅ Applied Search Filters:", searchFilter);
    } else {
      console.log("❌ No filters applied");
    }
  }, [searchFilter]);

  const saveFiltersToStorage = (filters) => {
    try {
      localStorage.setItem(SAVED_FILTERS_KEY, JSON.stringify(filters));
      return true;
    } catch (error) {
      console.error("Error saving filters to localStorage:", error);
      return false;
    }
  };

  // Fetch saved filters from API
  const fetchSavedFilters = async () => {
    setLoadingFilters(true);
    try {
      const token =
        typeof window !== "undefined" ? localStorage.getItem("auth-token") : null;
      const res = await axios.get(config.apiUrl + "/api/filters/get-Filter", {
        withCredentials: true,
        headers: token ? { Authorization: 'Bearer ' + token } : {},
      });
      const data = res?.data?.data;
      const list = Array.isArray(data)
        ? data.map((f) => ({ id: f._id, name: f.filterName, filters: f.filters, createdAt: f.createdAt, updatedAt: f.updatedAt }))
        : [];
      setSavedFilters(list);
    } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 404) {
            // No saved filters found is an expected state for new users
            setSavedFilters([]);
        } else {
            console.error("Error fetching saved filters:", error);
            setSavedFilters([]);
        }
      } finally {
      setLoadingFilters(false);
    }
  };

  // Load saved filters on component mount
  useEffect(() => {
    fetchSavedFilters();
  }, []);

  // Load a specific saved filter
  const loadSavedFilter = async (savedFilter) => {
    const filtersToLoad = savedFilter.filters || savedFilter;
    await applyFiltersAndRun(filtersToLoad, savedFilter.id);
    setShowSavedFilters(false);
  };

  useEffect(() => {
    if (!showSavedFilters) return;
    const onPointerDown = (e) => {
      if (!savedPopoverRef.current) return;
      if (!savedPopoverRef.current.contains(e.target)) {
        setShowSavedFilters(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [showSavedFilters]);

  const deleteSavedFilter = async (filterId) => {
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("auth-token") : null;
      await axios.delete(config.apiUrl + "/api/filters/delete", {
        withCredentials: true,
        headers: token ? { Authorization: 'Bearer ' + token } : {},
        data: { filterId },
      });
      await fetchSavedFilters();
    } catch (error) {
      console.error("Error deleting saved filter:", error);
    }
  };

  const handleSaveFilters = React.useCallback(
    async (filters) => {
      try {
        setIsSaving(true);
        const token =
          typeof window !== "undefined"
            ? localStorage.getItem("auth-token")
            : null;

        await axios.post(
          config.apiUrl + "/api/filters/save",
          { filters },
          {
            withCredentials: true,
            headers: token ? { Authorization: 'Bearer ' + token } : {},
          }
        );

        // console.log("✅ Saved search filters to API.");
         Swal.fire({
          title: "Filter saved",
          text: "Filter saved successfully!",
          imageUrl: "/icons/mawsool-success.webp",
          imageAlt: "Custom alert icon",
          timer: 1500,
          showConfirmButton: false,
        })
      } catch (e) {
        console.error("Save failed:", e);
        Swal.fire({
          icon: "error",
          title: "Failed to save search",
          text: "Failed to save search. Please try again.",
        });
      } finally {
        setIsSaving(false);
      }
    },
    [config.apiUrl]
  );

  // Function to handle opening the save modal
  const handleSaveButtonClick = () => {
    setNewFilterName("");
    setShowSaveModal(true);
  };

  // Function to handle the actual saving after naming
  const handleSaveNamedFilter = async () => {
    if (!newFilterName.trim()) {
      Swal.fire({
        icon: "warning",
        title: "Invalid filter name",
        text: "Please enter a name for your filter",
      });
      return;
    }

    setIsSaving(true);

    try {
      const token = localStorage.getItem("auth-token");

      // Create a structure for the new filter with the name
      const newFilter = {
        filterName: newFilterName,
        filters: searchFilter,
      };

      // Call the create endpoint instead of save
      const response = await axios.post(
        config.apiUrl + "/api/filters/create",
        newFilter,
        {
          withCredentials: true,
          headers: token ? { Authorization: 'Bearer ' + token } : {},
        }
      );

      const createdId = response?.data?.data?._id ? String(response.data.data._id) : null;

      // Also update localStorage for consistency
      const newSavedFilter = {
        id: createdId || Date.now().toString(),
        name: newFilterName,
        filters: searchFilter,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const currentFilters = getSavedFiltersFromStorage();
      const updatedStorageFilters = [newSavedFilter, ...currentFilters];
      saveFiltersToStorage(updatedStorageFilters);
      setSavedFilters(updatedStorageFilters);

      setActiveSavedFilterId(createdId || null);

      // console.log("✅ Created new filter:", newFilterName);

      // Close modal before showing alert
      setShowSaveModal(false);
      setIsSaving(false);

      // Show success message after modal is closed
      setTimeout(() => {
        Swal.fire({
          title: "Filter saved",
          text: "Filter \"" + newFilterName + "\" saved successfully.",
          imageUrl: "/icons/mawsool-success.webp",
          imageAlt: "Custom alert icon",
          timer: 1500,
          showConfirmButton: false,
        })
      }, 100);
    } catch (err) {
      console.error("Error creating filter:", err);

      // Show specific error message if provided by backend
      const errorMsg =
        err.response?.data?.msg || "Failed to save filter. Please try again.";

      setIsSaving(false);
      setShowSaveModal(false);

      setTimeout(() => {
        Swal.fire({
          icon: "error",
          title: "Failed to save filter",
          text: errorMsg,
        });
      }, 100);
    }
  };

  const loadLatestSavedFilter = () => {
    try {
      const raw = localStorage.getItem(SAVED_FILTERS_KEY);
      const list = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(list) || list.length === 0) {
        Swal.fire({
          icon: "warning",
          title: "No saved searches found",
          text: "Please create a new search filter.",
        });
        return;
      }

      // pick the most recent (you saved new items at the front)
      const latest = list[0];
      const filtersToLoad = latest.filters || latest;

      // Clear current filter state first
      setSearchFilter({});
      setTimeout(() => {
        setSearchFilter(filtersToLoad);
        setSearched(false);
        setTableData([]);
        setCurrentPage(1);
        setFilterKey((k) => k + 1); // force FilterPanel re-render
        // console.log("✅ Loaded saved filters:", filtersToLoad);
        Swal.fire({
          icon: "success",
          title: "Loaded saved search",
          text: "Loaded: " + (latest.name || "Latest Saved Search"),
        });
      }, 50);
    } catch (e) {
      console.error("Failed to load saved filters:", e);
      Swal.fire({
        icon: "error",
        title: "Error loading saved search",
        text: "Failed to load saved search. Please try again.",
      });
    }
  };

  return (
    <DashboardContainer
      heading={
         <div className="flex flex-col">
           <span className="leading-none">Search</span>
           <button
             onClick={() => {
               setIsAiMode(!isAiMode);
               if (isAiMode) {
                 // Turning off AI Mode: make sure filters are visible so they can search manually
                 setFiltersVisible(true);
               } else {
                 // Turning on AI Mode: hide filters so they see the chat
                 setFiltersVisible(false);
               }
             }}
             className={`mt-2 relative flex items-center w-24 h-7 rounded-full p-1 cursor-pointer transition-all duration-300 ${
               isAiMode
                 ? 'bg-amber-500 shadow-[0_0_12px_rgba(245,158,11,0.8)] border border-amber-400'
                 : 'bg-gray-300 border border-transparent'
             } ${process.env.NEXT_PUBLIC_HIDE_AI_MODE === 'true' ? 'hidden' : ''}`}
           >
             <span
               className={`absolute text-[10px] font-bold text-white transition-all duration-300 ${
                 isAiMode ? 'left-2 drop-shadow-sm' : 'right-2'
               }`}
             >
               {isAiMode ? 'AI MODE' : 'MANUAL'}
             </span>
             <div
               className={`bg-white w-5 h-5 rounded-full shadow-md transform transition-transform duration-300 ease-in-out flex items-center justify-center ${
                 isAiMode ? 'translate-x-[68px] shadow-[0_0_8px_rgba(255,255,255,0.8)]' : 'translate-x-0'
               }`}
             >
               {isAiMode && <span className="text-[10px]">✨</span>}
             </div>
           </button>
         </div>
       }
      actions={
        !isAiMode && (
          <button
            onClick={() => setFiltersVisible((v) => !v)}
            className={`btn-toggle-modern min-w-[140px] ${isAiStep2 ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}`}
            aria-controls="filters-panel"
            aria-expanded={filtersVisible ? "true" : "false"}
            aria-label={filtersVisible ? "Hide filters" : "Show filters"}
            title={filtersVisible ? "Hide filters" : "Show filters"}
            disabled={isAiStep2}
          >
            <span className={`btn-arrow ${filtersVisible ? "rotate-180" : "rotate-0"}`} aria-hidden="true">→</span>
            <span className="ml-1 btn-toggle-label">
              {filtersVisible ? "Hide Filters" : "Show Filters"}
            </span>
          </button>
        )
      }
    >
      <div className="w-full h-full flex flex-col gap-2">
        {/* Only show top tabs if we are not in AI mode and have searched/have filters */}
        {!isAiMode && (filtersVisible || searched || (searchFilter && Object.keys(searchFilter).length > 0)) && (
          <div className={`px-1 ${isAiStep2 ? 'opacity-50 pointer-events-none' : ''}`}>
               <Tabs activeTab={searchMode} onTabChange={handleTabChange} />
          </div>
        )}
        {/* <div className="mb-2">
          <SemanticControlPanel
            enabled={semanticSettings.enabled}
            threshold={semanticSettings.threshold}
            onToggle={(v) => setSemanticSettings((s) => ({ ...s, enabled: v }))}
            onThreshold={(v) => setSemanticSettings((s) => ({ ...s, threshold: v }))}
          />
        </div> */}
        {resumePromptVisible && resumeCandidate && (
          <div className="w-full px-4 py-2 rounded-lg border border-[#E5E6E6] bg-white flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm text-[#222]">Resume last search?</span>
              <span className="text-xs text-[#666]">{new Date(resumeCandidate.timestamp).toLocaleTimeString()}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={async () => {
                  setResumePromptVisible(false);
                  await applyFiltersAndRun(resumeCandidate.filters);
                }}
                className="px-3 py-1 text-xs bg-[#04145C] text-white rounded-lg hover:bg-[#03124A]"
              >
                Resume
              </button>
              <button
                onClick={() => {
                  setResumePromptVisible(false);
                }}
                className="px-3 py-1 text-xs bg-[#E5E6E6] text-[#222] rounded-lg hover:bg-[#ddd]"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}
        <div className="w-full h-full flex gap-2">
          {filtersVisible && !isAiMode && (
          <div className="flex flex-col shrink-0 overflow-hidden w-full md:w-[340px] transition-[width] duration-300">
            <div className="flex items-center gap-2 mt-2 mb-3">
              <div className="relative" ref={savedPopoverRef}>
                <button
                  onClick={() => setShowSavedFilters((v)=>{ const next = !v; if (next) fetchSavedFilters(); return next; })}
                  className={`btn-toggle-modern ${isAiStep2 ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}`}
                  title="Saved Filters"
                  aria-label="Saved Filters"
                  disabled={isAiStep2}
                >
                  <span className="btn-toggle-label text-xs">Saved Filters</span>
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                </button>
                {showSavedFilters && (
                  <div className="absolute top-full left-0 mt-2 w-56 bg-white border border-[#E5E6E6] rounded-xl shadow-lg z-50">
                    {loadingFilters ? (
                      <div className="px-3 py-2 text-xs text-[#666]">Loading...</div>
                    ) : savedFilters.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-[#666]">No saved filters</div>
                    ) : (
                      <ul className="max-h-48 overflow-auto py-1">
                        {savedFilters.map((sf)=> (
                          <li key={sf.id}>
                            <div
                              className="group flex items-center justify-between px-3 py-2 hover:bg-gray-100 cursor-pointer"
                              onClick={()=> loadSavedFilter(sf)}
                            >
                              <span className="text-xs text-[#222] truncate max-w-[9rem]">{sf.name || "Saved Filter"}</span>
                              <button
                                className="p-1 text-red-500 hover:text-red-600 opacity-70 hover:opacity-100"
                                onClick={(e)=> { e.stopPropagation(); deleteSavedFilter(sf.id); }}
                                aria-label="Delete saved filter"
                                title="Delete"
                              >
                                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
              <button
                onClick={() => {
                  setActiveSavedFilterId(null);
                  setSearchFilter({});
                  setCursor(null);
                  setCurrentPage(1);
                  if (!applySamplePreview()) {
                    setSearched(false);
                    setTableData([]);
                  }
                }}
                className={`btn-toggle-danger min-w-[140px] ${isAiStep2 ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}`}
                title="Clear Filters"
                aria-label="Clear Filters"
                disabled={isAiStep2}
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                <span className="btn-toggle-label text-xs">Clear Filters</span>
              </button>
            </div>
            <div id="filters-panel" className="w-full">
              <FilterPanel
                key={filterKey}
                setTableData={setTableDataWithSemantic}
                setLoading={setLoading}
                setLoadingProgress={setLoadingProgress}
                searched={searched}
                setSearched={setSearched}
                setCursor={setCursor}
                searchFilter={searchFilter}
                setSearchFilter={setSearchFilterWithClear}
                savedFilterId={activeSavedFilterId}
                setAiSearchQuery={setAiBulkSearchQuery} // Pass the new bulk search setter
                itemsPerPage={itemsPerPage}
                setCurrentPage={setCurrentPage}
                searchMode={searchMode}
                isAiStep2={isAiStep2}
                currentAiStep={currentAiStep}
              />
            </div>
          </div>
          )}
          <div className="flex-1 min-w-0 transition-all duration-300 relative flex flex-col gap-4">
            {/* NEW: Render AIPrompt Step 2 backdrop inside the table container so it naturally aligns */}
            {aiSearchQuery && <div id="ai-prompt-backdrop-container"></div>}
            
            {isAiMode && (
              <AiFilterChat 
                  searchFilter={searchFilter} 
                  setSearchFilter={setSearchFilterWithClear} 
                  searchMode={searchMode}
                  isSearched={searched}
                  setFiltersVisible={setFiltersVisible}
                  filtersVisible={filtersVisible}
                  onTabChange={handleTabChange}
                  setAiSearchQuery={setAiSearchQuery}
                  setAiContext={setAiContext}
                  forceFullPage={true}
                />
            )}
            
            {loading && <LoadingState progress={loadingProgress} searchMode={searchMode} />}
            
            {!loading && searched && !isAiMode && (
              <Table
                data={tableData}
                cursor={cursor}
                searchFilter={searchFilter}
                savedFilterId={activeSavedFilterId}
                setLoading={setPaginationLoading}
                setLoadingProgress={setLoadingProgress}
                setSearched={setSearched}
                setTableData={setTableDataWithSemantic}
                setCursor={setCursor}
                setItemsPerPage={setItemsPerPage}
                onSaveFilters={handleSaveButtonClick}
                onSeeEmployees={handleSeeEmployees}
                isSaving={isSaving}
                currentPage={currentPage}
                setCurrentPage={handleClientPageChange}
                isLoading={paginationLoading} // Pass new prop
                isClientPagination={isClientPagination}
                searchMode={tableSearchMode}
              />
            )}
          </div>
        </div>

        {/* Existing AI Prompt Modal for AI Mode Search */}
        {aiSearchQuery && (
              <AIPrompt
                setAiSearchQuery={setAiSearchQuery}
                result={tableData}
                searchFilter={searchFilter}
              searchMode={searchMode}
              aiContext={aiContext}
              isSearching={loading}
              onStepChange={(step) => {
                if (step === 0) {
                  setAiSearchQuery(false);
                }
                setIsAiStep2(step === 1 || step === 2); // Keep ALL buttons disabled on step 1 AND step 2
                setCurrentAiStep(step); // Track the exact step
              }}
              onSearchRequest={() => applyFiltersAndRun(searchFilter, activeSavedFilterId)}
            />
          )}

        {/* New AI Prompt Modal for Submit AI Query (Bulk Request) */}
        {aiBulkSearchQuery && (
              <AIBulkPrompt
                setAiSearchQuery={setAiBulkSearchQuery}
                result={tableData}
                searchFilter={searchFilter}
                searchMode={searchMode}
                aiContext={aiContext}
                isSearching={loading}
                onStepChange={(step) => {
                  if (step === 0) {
                    setAiBulkSearchQuery(false);
                  }
                }}
            />
          )}
      </div>

      {showSaveModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 "
            onClick={() => !isSaving && setShowSaveModal(false)}
          />

          {/* Modal Card */}
          <div className="relative w-[560px] max-w-[92vw] bg-white rounded-xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4">
              <h3 className="text-base font-semibold text-gray-900">
                Save Search
              </h3>
              <button
                onClick={() => !isSaving && setShowSaveModal(false)}
                className="p-1 text-gray-400 hover:text-gray-600"
                aria-label="Close"
              >
                <svg
                  className="w-5 h-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="px-6 pb-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Search Name
              </label>
              <input
                type="text"
                value={newFilterName}
                onChange={(e) => setNewFilterName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newFilterName.trim() && !isSaving) {
                    handleSaveNamedFilter();
                  }
                }}
                placeholder="Search Name"
                className="w-full h-11 px-4 rounded-lg border border-gray-300 focus:outline-none placeholder:text-gray-400"
                autoFocus
              />
            </div>

            {/* Footer */}
            <div className="px-6 pb-5 mt-5">
              <button
                onClick={handleSaveNamedFilter}
                disabled={!newFilterName.trim() || isSaving}
                className={`px-4 py-2 flex items-center justify-center gap-4 self-stretch rounded-xl  text-white
    ${
      !newFilterName.trim() || isSaving
        ? "bg-gray-300 cursor-not-allowed"
        : "bg-button cursor-pointer hover:bg-opacity-90"
    }
  `}
              >
                {isSaving && (
                  <span className="inline-block animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                )}
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardContainer>
  );
};

export default Dashboard;
