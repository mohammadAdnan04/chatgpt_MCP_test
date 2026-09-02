import React, {
  useCallback,
  useState,
  useMemo,
  useEffect,
  useRef,
} from "react";
import axios from "axios";
import JobTitleFilter from "@/components/search/JobTitleFilter";
import NameFilter from "@/components/search/NameFilter";
import IndustryFilter from "@/components/search/IndustryFilter";
import NoOfEmployees from "@/components/search/NoOfEmployees";
import DepartmentFilter from "@/components/search/DepartmentFilter";
import CountryFilter from "@/components/search/CountryFilter";
import CityFilter from "@/components/search/CityFilter";
import SeniorityLevelFilter from "@/components/search/SeniorityLevelFilter";
import HQCompanyLocationFilter from "@/components/search/HQCompanyLocationFilter";
import BehavioralKeywordTargetingFilter from "@/components/search/BehavioralKeywordTargetingFilter";
import YearsInCurrentPositionFilter from "@/components/search/YearsInCurrentPositionFilter";
import YearsInCurrentCompanyFilter from "@/components/search/YearsInCurrentCompanyFilter";
import TotalYearsOfExperienceFilter from "@/components/search/TotalYearsOfExperienceFilter";
import UniversityFilter from "@/components/search/UniversityFilter";
import ExCompanyFilter from "@/components/search/ExCompanyFilter";
import PastCompanyFilter from "@/components/search/PastCompanyFilter";
import JobChangeFilter from "@/components/search/JobChangeFilter";
import PastRoleFilter from "@/components/search/PastRoleFilter";
import LanguagesFilter from "@/components/search/LanguagesFilter";
import CompanyNameFilter from "@/components/search/CompanyNameFilter";
import CompanyRevenueFilter from "@/components/search/CompanyRevenueFilter";
import CompanyFoundedYearFilter from "@/components/search/CompanyFoundedYearFilter";
import handleSearch from "@/components/search/handleSearch";
import { Search01Icon } from "hugeicons-react";
import Swal from "sweetalert2";
import { useAuth } from "@/contexts/AuthContext";

const config = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000",
};

// --- ExcludeListsDropdown Component ---
const ExcludeListsDropdown = ({ searchFilter, setSearchFilter, searchMode }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("my"); // "my" or "team"
  const [userLists, setUserLists] = useState([]);
  const [loading, setLoading] = useState(false);
  const [listSearchQuery, setListSearchQuery] = useState("");
  const wrapperRef = useRef(null);
  const { isGuest, user } = useAuth(); // Get guest status and user

  const fetchLists = async () => {
      if (isGuest) return; // Don't fetch for guests
      setLoading(true);
      try {
        const token = typeof window !== "undefined" ? localStorage.getItem("auth-token") : null;
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
        const res = await axios.get(`${apiUrl}/api/list?includeTeam=true`, {
          withCredentials: true,
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const lists = Array.isArray(res.data) ? res.data : [];
        const filteredLists = lists.filter(l => (l.listType || 'people') === (searchMode || 'people'));
        setUserLists(filteredLists);
      } catch (e) {
        console.error("Failed to fetch exclude lists:", e);
        setUserLists([]);
      } finally {
        setLoading(false);
      }
    };

  const toggle = () => {
    const next = !isOpen;
    setIsOpen(next);
    if (next) fetchLists();
    else setListSearchQuery(""); // Reset search when closing
  };

  const handleListToggle = (listId) => {
    setSearchFilter(prev => {
      const current = prev.excludeListIds || [];
      const newIds = current.includes(listId)
        ? current.filter(id => id !== listId)
        : [...current, listId];
      
      return { ...prev, excludeListIds: newIds };
    });
  };

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (e) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target)) setIsOpen(false);
    };
    const onKeyDown = (e) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  const excludedCount = (searchFilter.excludeListIds || []).length;

  const currentUserId = user?.id || user?._id;

  const filteredUserLists = userLists.filter(list => 
    list.name.toLowerCase().includes(listSearchQuery.toLowerCase())
  );

  const myLists = filteredUserLists.filter(list => list.creatorId === currentUserId || list.createdBy === currentUserId);
  const teamLists = filteredUserLists.filter(list => list.creatorId !== currentUserId && list.createdBy !== currentUserId);

  const listsToDisplay = activeTab === "my" ? myLists : teamLists;

  const handleSelectAll = () => {
    const idsToAdd = listsToDisplay.map(l => l._id);
    setSearchFilter(prev => {
      const current = prev.excludeListIds || [];
      const newIds = Array.from(new Set([...current, ...idsToAdd]));
      return { ...prev, excludeListIds: newIds };
    });
  };

  const handleClearAll = () => {
    const idsToRemove = listsToDisplay.map(l => l._id);
    setSearchFilter(prev => {
      const current = prev.excludeListIds || [];
      const newIds = current.filter(id => !idsToRemove.includes(id));
      return { ...prev, excludeListIds: newIds };
    });
  };

  return (
    <div className="relative flex items-center" ref={wrapperRef}>
      <button
        onClick={toggle}
        className="inline-flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-50 cursor-pointer"
        title="Exclude Lists"
      >
        Exclude Lists {excludedCount > 0 && <span className="bg-red-100 text-red-700 text-xs font-bold px-1.5 py-0.5 rounded-full">{excludedCount}</span>}
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-72 bg-white border border-gray-200 rounded-xl shadow-xl z-[10000]">
          <div className="flex border-b border-gray-100">
            <button
              onClick={() => setActiveTab('my')}
              className={`flex-1 py-2.5 text-xs font-semibold text-center transition-colors ${activeTab === 'my' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/30' : 'text-gray-500 hover:bg-gray-50'}`}
            >
              My Lists
            </button>
            <button
              onClick={() => setActiveTab('team')}
              className={`flex-1 py-2.5 text-xs font-semibold text-center transition-colors ${activeTab === 'team' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/30' : 'text-gray-500 hover:bg-gray-50'}`}
            >
              Team Lists
            </button>
          </div>
          
          <div className="px-4 py-2 border-b border-gray-100">
            <input
              type="text"
              className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="Search lists..."
              value={listSearchQuery}
              onChange={(e) => setListSearchQuery(e.target.value)}
              onClick={(e) => e.stopPropagation()} // prevent closing
            />
          </div>

          {/* Select All / Clear All Controls */}
          {!loading && listsToDisplay.length > 0 && (
            <div className="flex justify-between items-center px-4 py-2 bg-gray-50 border-b border-gray-100">
              <button 
                onClick={handleSelectAll}
                className="text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors"
              >
                Select All
              </button>
              <button 
                onClick={handleClearAll}
                className="text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors"
              >
                Clear All
              </button>
            </div>
          )}

          {loading ? (
            <div className="px-4 py-3 text-sm text-gray-500 text-center">Loading...</div>
          ) : listsToDisplay.length === 0 ? (
            <div className="px-4 py-3 text-sm text-gray-500 text-center">No lists found</div>
          ) : (
            <ul className="max-h-64 overflow-auto py-1">
              {listsToDisplay.map((list) => {
                const isSelected = (searchFilter.excludeListIds || []).includes(list._id);
                return (
                  <li key={list._id}>
                    <label className="flex items-center gap-3 px-4 py-2 hover:bg-gray-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleListToggle(list._id)}
                        className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 shrink-0"
                      />
                      <span className="text-sm text-gray-700 truncate">
                        {list.name}
                        {activeTab === "team" && list.creatorName && (
                          <span className="text-xs text-gray-400 ml-1">({list.creatorName})</span>
                        )}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

// --- LoadFilterDropdown Component ---
const LoadFilterDropdown = ({ onLoad, searchFilter, setSearchFilter, setSearched, onToggleHide, filtersHidden }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [savedFilters, setSavedFilters] = useState([]);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const wrapperRef = useRef(null);

  const fetchFilters = async () => {
    setLoading(true);
    try {
      const token =
        typeof window !== "undefined"
          ? localStorage.getItem("auth-token")
          : null;
      const res = await axios.get(`${config.apiUrl}/api/filters/get-Filter`, {
        withCredentials: true,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      const data = res?.data?.data;
      const list = Array.isArray(data)
        ? data.map((f) => ({
            id: f._id,
            name: f.filterName,
            filters: f.filters,
          }))
        : [];

      setSavedFilters(list);
    } catch (e) {
      if (axios.isAxiosError(e) && e.response?.status === 404) {
        // Do nothing on 404
      } else {
        console.error("Failed to fetch saved filters:", e);
      }
      setSavedFilters([]);
    } finally {
      setLoading(false);
    }
  };

  const toggle = () => {
    const next = !isOpen;
    setIsOpen(next);
    if (next) fetchFilters();
  };

  const handleDelete = async (e, id) => {
    e.stopPropagation();

    const result = await Swal.fire({
      title: "Are you sure?",
      text: "Do you want to delete this saved search?",
      imageUrl: "/icons/mawsool-warning.webp",
      imageAlt: "Custom alert icon",
      showCancelButton: true,
      confirmButtonText: "Yes, delete it!",
      cancelButtonText: "Cancel",
      customClass: {
        confirmButton: "swal-confirm-button",
        cancelButton: "swal-cancel-button",
      },
    });

    if (!result.isConfirmed) return;

    setDeletingId(id);
    try {
      const token =
        typeof window !== "undefined"
          ? localStorage.getItem("auth-token")
          : null;
      await axios.delete(`${config.apiUrl}/api/filters/delete`, {
        withCredentials: true,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        data: { filterId: id },
      });
      setSavedFilters((prev) => prev.filter((f) => f.id !== id));
      Swal.fire({
        title: "Deleted!",
        text: `The saved search has been deleted.`,
        imageUrl: "/icons/mawsool-success.webp",
        imageAlt: "Custom alert icon",
        timer: 1500,
        showConfirmButton: false,
      });
    } catch (e) {
      console.error("Delete failed:", e);
      Swal.fire({
        icon: "error",
        title: "Error deleting filter",
        text: "Failed to delete filter. Please try again.",
      });
    } finally {
      setDeletingId(null);
    }
  };

  const handleClearFilters = () => {
    setSearchFilter({}); // Clear all filters
    setSearched(false); // Set searched to false to hide SubmitAIQuery
    // Swal.fire({
    //   title: "Filters Cleared",
    //   text: "All filters have been cleared.",
    //   imageUrl: "/icons/mawsool-success.webp",
    //   imageAlt: "Custom alert icon",
    //   timer: 1500,
    //   showConfirmButton: false,
    // });
  };

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (e) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target)) setIsOpen(false);
    };
    const onKeyDown = (e) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  const hasFilters = hasFilterValues(searchFilter); // Check if filters are set

  return (
    <div className="relative flex items-center gap-2" ref={wrapperRef}>
      <button
        onClick={toggle}
        className="inline-flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-50 cursor-pointer"
        title="Saved Filters"
        aria-label="Saved Filters"
      >
        Saved Filters
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {hasFilters && (
        <button
          onClick={handleClearFilters}
          className="inline-flex items-center justify-center p-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 cursor-pointer"
          title="Clear Filters"
          aria-label="Clear Filters"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}

      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-72 bg-white border border-gray-200 rounded-xl shadow-xl z-[10000]">
          <div className="px-4 py-3 text-base font-semibold text-gray-800 text-xs">
            All Saved Searches
          </div>

          {loading ? (
            <div className="px-4 py-3 text-sm text-gray-500">Loading...</div>
          ) : savedFilters.length === 0 ? (
            <div className="px-4 py-3 text-sm text-gray-500">
              No saved searches
            </div>
          ) : (
            <ul className="max-h-64 overflow-auto py-1">
              {savedFilters.map((f, idx) => (
                <li key={f.id}>
                  <div
                    className="group flex items-center justify-between px-3 py-2 hover:bg-gray-100 cursor-pointer"
                    onClick={() => {
                      onLoad(f);
                      setIsOpen(false);
                    }}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <svg
                        className="w-4 h-4 text-gray-600 flex-shrink-0"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                      >
                        <rect
                          x="3"
                          y="3"
                          width="18"
                          height="18"
                          rx="2"
                          ry="2"
                        ></rect>
                        <path d="M3 9h18M9 21V9"></path>
                      </svg>
                      <span className="text-sm text-gray-800 truncate max-w-[12rem]">
                        {f.name}
                      </span>
                    </div>

                    <button
                      className="p-1 text-red-500 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => handleDelete(e, f.id)}
                      disabled={deletingId === f.id}
                      title="Delete"
                    >
                      {deletingId === f.id ? (
                        <div className="animate-spin h-4 w-4 border-2 border-red-500 border-t-transparent rounded-full" />
                      ) : (
                        <svg
                          className="w-4 h-4"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M19 7l-1 12a2 2 0 01-2 2H8a2 2 0 01-2-2L5 7m3 0V4a1 1 0 011-1h6a1 1 0 011 1v3M4 7h16"
                          />
                        </svg>
                      )}
                    </button>
                  </div>

                  {idx < savedFilters.length - 1 && (
                    <div className="mx-3 h-px bg-gray-200" />
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

// --- Helper Functions and Components ---
  const hasFilterValues = (searchFilter) => {
  if (!searchFilter) return false;
  for (const key in searchFilter) {
    if (key === "expand_job_titles") continue;
    const value = searchFilter[key];
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      // Special case for Revenue/Range filters that might just use "include" without being an array sometimes
      // But typically they are arrays.
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

const FilterItem = React.memo(
  ({ icon, title, isExpanded, onToggle, children, disabled = false, active = false, onClear }) => (
    <div
      className={`allfilterwap-main w-full p-2.5 flex flex-col gap-3.5 rounded-xl border bg-[#FBFBFC] transition-all duration-200 ${
        disabled ? "opacity-50 pointer-events-none" : ""
      } ${active ? "filter-active filter-pulse" : "border-[#E5E6E6]"}`}
    >
      <div
        className={`w-full flex items-center justify-between ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}
        onClick={disabled ? undefined : onToggle}
      >
        <div className="flex items-center gap-3.5 flex-1 min-w-0">
          <div className="flex min-w-[30px] h-[30px] p-1.5 justify-center items-center rounded-full bg-[#DEF9FF] shrink-0">
            <img src={icon} className="select-none" draggable="false" alt="" />
          </div>
          <p className="text-sm text-[#222222] capitalize truncate">
            {title}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {active && onClear && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClear();
              }}
              className="text-[10px] font-medium text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 px-2 py-1 rounded transition-colors"
              title={`Clear ${title} filter`}
            >
              Clear
            </button>
          )}
          <img
            src="/icons/Icon2.svg"
            className={`select-none transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
            draggable="false"
            alt=""
          />
        </div>
      </div>
      {isExpanded && (
        <div className="transition-all duration-200 ease-in-out">
          {children}
        </div>
      )}
    </div>
  )
);

const FilterSection = ({
  title,
  children,
  onLoadFilter,
  showLoadDropdown = false,
  searchFilter,
  setSearchFilter,
  setSearched, // Add setSearched to props
  activeFilterCount = 0,
  searchMode, // Added searchMode
}) => (
  <div className="flex flex-col gap-4">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <p className="text-[#222222]">{title === "Filters" ? "Active Filters" : title}</p>
        {title === "Filters" && (
          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${activeFilterCount > 0 ? 'bg-[#04145C] text-white' : 'bg-[#E9E9E9] text-[#717171]'}`}>
            {activeFilterCount}
          </span>
        )}
      </div>
      {showLoadDropdown && (
          <div className="flex items-center gap-2">
            <ExcludeListsDropdown
              searchFilter={searchFilter}
              setSearchFilter={setSearchFilter}
              searchMode={searchMode}
            />
          </div>
        )}
    </div>
    <div className="flex flex-col gap-1.5">{children}</div>
  </div>
);

const SearchButton = ({ onClick, disabled = false }) => (
  <div
    className={`searchbtn-submit w-full h-[48px] flex items-center justify-center gap-4 self-stretch rounded-xl px-2.5 py-2 transition-all duration-200 ${
      disabled
        ? "bg-[#cfcfcf] cursor-not-allowed"
        : "bg-[#04145C] cursor-pointer hover:bg-[#03124A]"
    }`}
    onClick={disabled ? undefined : onClick}
  >
    <div className="flex items-center gap-1">
      <Search01Icon size={16} color={disabled ? "#999" : "#FFFFFF"} />
      <p
        className={`text-sm font-medium ${
          disabled ? "text-[#999]" : "text-white"
        }`}
      >
        Search Filter
      </p>
    </div>
  </div>
);

const SubmitAIQuery = ({ onClick, disabled }) => (
  <div
    className={`submitAiQuery-btn w-full h-[48px] flex items-center justify-center gap-4 self-stretch rounded-xl px-2.5 ${disabled ? 'bg-gray-300 cursor-not-allowed opacity-50' : 'bg-button cursor-pointer'}`}
    onClick={disabled ? undefined : onClick}
  >
    <div className="flex items-center gap-1">
      <img
        src="/icons/magicAI.svg"
        className="select-none"
        draggable="false"
        alt=""
      />
      <p className="text-sm font-medium text-white">Submit AI Query -bulk data request-</p>
    </div>
  </div>
);

// --- Main FilterPanel Component ---
const FilterPanel = ({
  setTableData,
  setLoading,
  setLoadingProgress,
  setSearched,
  searched,
  setCursor,
  setAiSearchQuery,
  searchFilter,
  savedFilterId,
  itemsPerPage,
  setSearchFilter,
  className,
  step,
  setCurrentPage,
  searchMode = "people",
  isAiStep2,
  currentAiStep,
}) => {
  const [expandedFilters, setExpandedFilters] = useState({
    "Job Title": true,
    "Company Name": true,
  });
  const { getSubscriptions, personalCredits, poolCredits, user } = useAuth();
  const [userPlan, setUserPlan] = useState('free');
  const [loadingPlan, setLoadingPlan] = useState(true);

  // Exact Match state for First/Last Name
  const exactMatchEnabled = searchFilter.name_exact_match !== false;


  const handleAiQueryClick = () => {
    // Dynamically check the plan at click time to avoid stale state
    const currentPlan = userPlan !== "free" ? userPlan : (user?.planKey || user?.orgId?.planKey || "free");

    // Check if user is on a free plan
    if (!currentPlan || currentPlan.toLowerCase() === "free") {
      Swal.fire({
        icon: "lock",
        title: "Premium Feature",
        text: "The AI Query feature is only available on paid plans.",
        showCancelButton: true,
        confirmButtonText: "Upgrade Plan",
        cancelButtonText: "Cancel",
        customClass: {
          confirmButton: "swal-confirm-button",
          cancelButton: "swal-cancel-button",
        },
      }).then((result) => {
        if (result.isConfirmed) {
          window.location.href = "/setting/planOverview";
        }
      });
      return;
    }

    const totalCredits = (personalCredits || 0) + (poolCredits || 0);
    if (totalCredits < 100) {
      Swal.fire({
        icon: "warning",
        title: "Insufficient Credits",
        text: "You need at least 100 credits to submit an AI Query.",
        showCancelButton: true,
        confirmButtonText: "Buy Credits",
        cancelButtonText: "Cancel",
        customClass: {
          confirmButton: "swal-confirm-button",
          cancelButton: "swal-cancel-button",
        },
      }).then((result) => {
        if (result.isConfirmed) {
          window.location.href = "/setting/planOverview";
        }
      });
      return;
    }
    setAiSearchQuery(true);
  };

  useEffect(() => {
    const fetchUserPlan = async () => {
      try {
        const subscriptionData = await getSubscriptions();
        console.log("User subscription in FilterPanel:", subscriptionData);
        const actualPlanKey = subscriptionData?.planKey || user?.planKey || user?.orgId?.planKey || "free";
        setUserPlan(actualPlanKey);
      } catch (error) {
        console.error("Failed to fetch user subscription:", error);
        const fallbackPlanKey = user?.planKey || user?.orgId?.planKey || "free";
        setUserPlan(fallbackPlanKey);
      } finally {
        setLoadingPlan(false);
      }
    };

    fetchUserPlan();
  }, [getSubscriptions, user]);

  // console.log("User plan:", userPlan);

  const isSearchDisabled = !hasFilterValues(searchFilter);
  const [filtersHidden, setFiltersHidden] = useState(false);

  const handleFilterChange = useCallback(
    (key, data, isObject = false) => {
      setSearchFilter((prev) => {
        const updated = { ...prev };
        
        if (data === null || data === undefined) {
          delete updated[key];
        } else if (isObject) {
          const newObject = {};

          // Check if data itself has 'include' or 'exclude' directly
          // This handles the simplified payload from CompanyRevenueFilter
          if (data.include && Array.isArray(data.include)) {
             newObject.include = data.include;
             if (data.includeLabels) newObject.includeLabels = data.includeLabels;
          } else if (data.includes?.length > 0) {
            // Legacy/Standard format
            newObject.include = data.includes;
            if (data.includesTitles) {
              newObject.includeLabels = data.includesTitles;
            }
          }

          if (data.exclude && Array.isArray(data.exclude)) {
             newObject.exclude = data.exclude;
             if (data.excludeLabels) newObject.excludeLabels = data.excludeLabels;
          } else if (data.excludes?.length > 0) {
            // Legacy/Standard format
            newObject.exclude = data.excludes;
            if (data.excludesTitles) {
              newObject.excludeLabels = data.excludesTitles;
            }
          }

          if (Object.keys(newObject).length === 0) {
            delete updated[key];
          } else {
            updated[key] = newObject;
          }
        } else if (
          (Array.isArray(data) && data.length > 0) ||
          (typeof data === "string" && data.trim().length > 0) ||
          (typeof data === "boolean")
        ) {
          updated[key] = data;
        } else {
          delete updated[key];
        }
        return updated;
      });
    },
    [setSearchFilter]
  );

  const handleSearchClick = () => {
    if (isSearchDisabled) return;
    if (setCurrentPage) setCurrentPage(1);
    handleSearch({
      searchFilter,
      limit: itemsPerPage,
      savedFilterId,
      setLoading,
      setLoadingProgress,
      setSearched,
      setTableData,
      setCursor,
      itemsPerPage,
      type: searchMode,
    });
  };

  const toggleFilter = (filterTitle) => {
    setExpandedFilters((prev) => ({
      ...prev,
      [filterTitle]: !prev[filterTitle],
    }));
  };

  const handleLoadFilterFromDropdown = (filter) => {
    // console.log("Loading filter:", filter);
    setSearchFilter(filter.filters);
    setSearched(false);
    setTableData([]);
    setCursor(null);
    if (setCurrentPage) setCurrentPage(1);

    setTimeout(() => {
      handleSearch({
        searchFilter: filter.filters,
        limit: itemsPerPage,
        passedCursor: null,
        savedFilterId,
        setLoading,
        setLoadingProgress,
        setSearched,
        setTableData,
        setCursor,
        type: searchMode,
      });
    }, 100);
  };

  const filterConfigs = useMemo(
    () => {
      if (searchMode === "companies") {
        return [
          {
            title: "Filters",
            items: [
              {
                icon: "/icons/name.svg",
                title: "Company Name",
                Component: CompanyNameFilter,
                key: "company_name",
                isObject: true,
              },
              {
                icon: "/icons/Country.svg",
                title: "Location / Country",
                Component: CountryFilter,
                key: "location",
                isObject: true,
              },
              {
                icon: "/icons/Industry.svg",
                title: "Industry",
                Component: IndustryFilter,
                key: "industry",
                isObject: true,
              },
              {
                icon: "/icons/Employees.svg",
                title: "Employee Headcount",
                Component: NoOfEmployees,
                key: "company_headcount",
                isObject: true,
              },
              {
                icon: "/icons/Company.svg",
                title: "Revenue",
                Component: CompanyRevenueFilter,
                key: "revenue",
                isObject: true,
              },
              {
                icon: "/icons/Country.svg",
                title: "City",
                Component: CityFilter,
                key: "city",
                isObject: true,
              },
              {
                icon: "/icons/Company.svg",
                title: "Founded Year",
                Component: CompanyFoundedYearFilter,
                key: "founded_year",
                isObject: true,
              },
            ],
          },
        ];
      }
      return [
      {
        title: "Filters",
        items: [
          {
            icon: "/icons/Icon1.svg",
            title: "Job Title",
            Component: JobTitleFilter,
            key: "role",
            isObject: true,
          },
          {
            icon: "/icons/name.svg",
            title: "Name",
            Component: NameFilter,
            key: "name_group",
            isObject: false,
          },
          {
            icon: "/icons/Country.svg",
            title: "Country",
            Component: CountryFilter,
            key: "location",
            isObject: true,
          },
          {
            icon: "/icons/Industry.svg",
            title: "Industry",
            Component: IndustryFilter,
            key: "industry",
            isObject: true,
          },
          {
            icon: "/icons/Employees.svg",
            title: "# of Employees",
            Component: NoOfEmployees,
            key: "company_headcount",
            isObject: true,
          },
          {
            icon: "/icons/Company.svg",
            title: "company",
            Component: ExCompanyFilter,
            key: "company",
            isObject: true,
          },
          {
             icon: "/icons/Country.svg",
             title: "HQ Location",
             Component: HQCompanyLocationFilter,
             key: "company_location",
             isObject: true,
           },
          {
            icon: "/icons/Country.svg",
            title: "City",
            Component: CityFilter,
            key: "city",
            isObject: true,
          },
          {
            icon: "/icons/Department.svg",
            title: "Department",
            Component: DepartmentFilter,
            key: "function",
            isObject: true,
          },
          {
            icon: "/icons/SeniorityLevel.svg",
            title: "Seniority Level",
            Component: SeniorityLevelFilter,
            key: "seniority",
            isObject: true,
          },
        ],
      },
      {
        title: "Advanced Filters",
        items: [
          {
            icon: "/icons/Keyword.svg",
            title: "Behavioral Keyword Targeting",
            Component: BehavioralKeywordTargetingFilter,
            key: "behavioral_keywords",
            isObject: false,
          },
          {
            icon: "/icons/currentposition.svg",
            title: "years in current company",
            Component: YearsInCurrentPositionFilter,
            key: "experience_at_role",
            isObject: true,
          },
          /*
          {
            icon: "/icons/currentcompany.svg",
            title: "years in current company",
            Component: YearsInCurrentCompanyFilter,
            key: "experience_at_company",
            isObject: true,
          },
          */
          {
            icon: "/icons/experience.svg",
            title: "total years of experience",
            Component: TotalYearsOfExperienceFilter,
            key: "experience",
            isObject: true,
          },
          {
            icon: "/icons/university.svg",
            title: "university",
            Component: UniversityFilter,
            key: "school",
            isObject: true,
          },
          {
            icon: "/icons/Job.svg",
            title: "Past & Current Role",
            Component: PastRoleFilter,
            key: "past_role",
            isObject: true,
          },
          {
            icon: "/icons/languages.svg",
            title: "languages",
            Component: LanguagesFilter,
            key: "language",
            isObject: true,
          },
          /*
          {
            icon: "/icons/Job.svg",
            title: "Changed Jobs (90 Days)",
            Component: JobChangeFilter,
            key: "changed_jobs",
            isObject: false,
          },
          */
          {
            icon: "/icons/Company.svg",
            title: "Past Company",
            Component: PastCompanyFilter,
            key: "past_company",
            isObject: true,
          },
        ],
      },
    ];
    },
    [searchMode]
  );

  const activeFilterCount = useMemo(() => {
    let count = 0;
    filterConfigs.forEach((section) => {
      section.items.forEach((item) => {
        if (!item || !item.key) return;
        if (item.key === "name_group") {
          if ((typeof searchFilter.first_name === "string" && searchFilter.first_name.trim() !== "") ||
              (typeof searchFilter.last_name === "string" && searchFilter.last_name.trim() !== "")) {
            count += 1;
          }
          return;
        }
        const value = searchFilter[item.key];
        if (!value) return;
        const isActive = (typeof value === "object" && value !== null && !Array.isArray(value))
          ? ((Array.isArray(value.include) && value.include.length > 0) || (Array.isArray(value.exclude) && value.exclude.length > 0))
          : ((Array.isArray(value) && value.length > 0) || (typeof value === "string" && value.trim() !== "") || (typeof value === "number" && !isNaN(value)) || (typeof value === "boolean"));
        if (isActive) count += 1;
      });
    });
    // Add excludeListIds to the count
    if (searchFilter.excludeListIds && searchFilter.excludeListIds.length > 0) {
      count += 1;
    }
    return count;
  }, [searchFilter, filterConfigs]);

  useEffect(() => {
    const filtersWithValues = {};

    filterConfigs.forEach((section) => {
      section.items.forEach((item) => {
        if (!item || !item.key) return;

        if (item.key === "name_group") {
          if ((typeof searchFilter.first_name === "string" && searchFilter.first_name.trim() !== "") ||
              (typeof searchFilter.last_name === "string" && searchFilter.last_name.trim() !== "")) {
            filtersWithValues[item.title] = true;
          }
          return;
        }

        if (searchFilter[item.key]) {
          const value = searchFilter[item.key];
          const hasValue =
            (typeof value === "object" && value !== null && !Array.isArray(value) &&
              (value.include?.length > 0 || value.exclude?.length > 0)) ||
            (Array.isArray(value) && value.length > 0) ||
            (typeof value === "string" && value.trim() !== "") ||
            (typeof value === "number" && !isNaN(value)) ||
            (typeof value === "boolean");

          if (hasValue) {
            filtersWithValues[item.title] = true;
          }
        }
      });
    });

    if (Object.keys(filtersWithValues).length > 0) {
      setExpandedFilters((prev) => {
        let hasChanges = false;
        const next = { ...prev };
        for (const key in filtersWithValues) {
          if (!prev[key]) {
            next[key] = true;
            hasChanges = true;
          }
        }
        return hasChanges ? next : prev;
      });
    }
  }, [searchFilter, filterConfigs]);

  return (
    <div className={`min-w-[320px] h-full flex flex-col gap-4 relative`}>
      {/* Overlay when AI Prompt is in Step 2 */}
      {currentAiStep === 2 && (
        <div className="absolute inset-0 bg-black/40 z-50 rounded-xl pointer-events-auto transition-all duration-300" />
      )}
      {/* Removed standalone Active Filters indicator; count moved next to Filters title */}
      <div
        id="filters-panel"
        className={`filter-panel flex flex-col gap-4 ${filtersHidden ? 'hidden' : 'h-[840px] overflow-y-auto'} ${className}`}
      >
        {filterConfigs.map((section, index) => (
          <FilterSection
            key={section.title}
            title={section.title}
            onLoadFilter={handleLoadFilterFromDropdown}
            showLoadDropdown={index === 0}
            searchFilter={searchFilter}
            setSearchFilter={setSearchFilter}
            setSearched={setSearched} // Pass setSearched to FilterSection
            activeFilterCount={activeFilterCount}
            onToggleHide={() => setFiltersHidden((prev)=> !prev)}
            filtersHidden={filtersHidden}
            searchMode={searchMode}
          >
            {section.items.filter((item) => item && item.title && item.Component).map((item) => {
              const { icon, title, Component, key, isObject } = item;
              const value = key ? searchFilter[key] : null;
              const onChange = key
                ? (data) => handleFilterChange(key, data, isObject)
                : null;
              const isDisabled = section.title === "Advanced Filters" && userPlan === "BASIC";
              const isActive = (() => {
                if (key === "name_group") {
                  return (
                    (typeof searchFilter.first_name === "string" && searchFilter.first_name.trim() !== "") ||
                    (typeof searchFilter.last_name === "string" && searchFilter.last_name.trim() !== "")
                  );
                }
                if (!value) return false;
                if (typeof value === "object" && value !== null && !Array.isArray(value)) {
                  return (
                    (Array.isArray(value.include) && value.include.length > 0) ||
                    (Array.isArray(value.exclude) && value.exclude.length > 0)
                  );
                }
                if (Array.isArray(value)) return value.length > 0;
                if (typeof value === "string") return value.trim() !== "";
                if (typeof value === "number") return !isNaN(value);
                if (typeof value === "boolean") return true;
                return false;
              })();

              return (
                <FilterItem
                  key={title}
                  icon={icon}
                  title={title}
                  isExpanded={!!expandedFilters[title]}
                  onToggle={() => toggleFilter(title)}
                  disabled={isDisabled}
                  active={isActive}
                  onClear={() => {
                    if (key === "name_group") {
                      handleFilterChange("first_name", null, false);
                      handleFilterChange("last_name", null, false);
                    } else {
                      handleFilterChange(key, null, isObject);
                    }
                  }}
                >
                  {(() => {
                    const extraProps = {};
                    if (key === "role" || key === "past_role") {
                      extraProps.expandJobTitlesValue = searchFilter.expand_job_titles;
                      extraProps.onChangeExpandJobTitles = (nextValue) =>
                        handleFilterChange("expand_job_titles", nextValue, false);
                    }
                    if (key === "name_group") {
                      extraProps.firstNameValue = searchFilter.first_name;
                      extraProps.lastNameValue = searchFilter.last_name;
                      extraProps.onChangeFirstName = (nextValue) =>
                        handleFilterChange("first_name", nextValue, false);
                      extraProps.onChangeLastName = (nextValue) =>
                        handleFilterChange("last_name", nextValue, false);
                      extraProps.exactMatchEnabled = exactMatchEnabled;
                      extraProps.onChangeExactMatch = (nextValue) =>
                        handleFilterChange("name_exact_match", nextValue, false);
                    }
                    return (
                  <Component
                    onChange={onChange}
                    value={value}
                    initialValue={value}
                    key={title}
                    disabled={isDisabled}
                    searchMode={searchMode}
                    selectedCountry={searchFilter.location}
                    {...extraProps}
                  />
                    );
                  })()}
                </FilterItem>
              );
            })}
          </FilterSection>
        ))}
      </div>
      <div className="flex flex-col w-full gap-1.5">
        <SearchButton onClick={handleSearchClick} disabled={isSearchDisabled || isAiStep2} />
        {(searched || step == 4) && (!currentAiStep || currentAiStep === 0) && (
          <div className={step !== undefined ? "pointer-events-none" : ""}>
            <SubmitAIQuery onClick={handleAiQueryClick} disabled={isAiStep2} />
          </div>
        )}
      </div>
    </div>
  );
};

export default FilterPanel;
