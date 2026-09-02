"use client";

import React, { useState, useEffect, useCallback } from "react";
import DashboardContainer from "@/components/dashboardLayoutContainer";
import JobTitleFilter from "@/components/search/JobTitleFilter";
import IndustryFilter from "@/components/search/IndustryFilter";
import NoOfEmployees from "@/components/search/NoOfEmployees";
import CountryFilter from "@/components/search/CountryFilter";
import SeniorityLevelFilter from "@/components/search/SeniorityLevelFilter";
import HQCompanyLocationFilter from "@/components/search/HQCompanyLocationFilter";
import BehavioralKeywordTargetingFilter from "@/components/search/BehavioralKeywordTargetingFilter";
import YearsInCurrentPositionFilter from "@/components/search/YearsInCurrentPositionFilter";
import YearsInCurrentCompanyFilter from "@/components/search/YearsInCurrentCompanyFilter";
import TotalYearsOfExperienceFilter from "@/components/search/TotalYearsOfExperienceFilter";
import UniversityFilter from "@/components/search/UniversityFilter";
import ExCompanyFilter from "@/components/search/ExCompanyFilter";
import JobChangeFilter from "@/components/search/JobChangeFilter";
import PastRoleFilter from "@/components/search/PastRoleFilter";
import LanguagesFilter from "@/components/search/LanguagesFilter";
import handleSearch from "@/components/search/handleSearch";
import AIPrompt from "@/components/modals/AIPrompt";
import Table from "@/components/shared/Table";
import { Search01Icon } from "hugeicons-react";
import { useAuth } from "@/contexts/AuthContext";
import axios from "axios";

// Helper function to check if search filter has any values
const hasFilterValues = (searchFilter) => {
  if (!searchFilter || Object.keys(searchFilter).length === 0) {
    return false;
  }

  for (const key in searchFilter) {
    const value = searchFilter[key];

    // Check for object filters (include/exclude structure)
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      if (
        value.include &&
        Array.isArray(value.include) &&
        value.include.length > 0
      ) {
        return true;
      }
      if (
        value.exclude &&
        Array.isArray(value.exclude) &&
        value.exclude.length > 0
      ) {
        return true;
      }
    }
    // Check for array filters
    else if (Array.isArray(value) && value.length > 0) {
      return true;
    }
    // Check for string filters
    else if (typeof value === "string" && value.trim() !== "") {
      return true;
    }
    // Check for number filters
    else if (typeof value === "number" && !isNaN(value)) {
      return true;
    }
  }

  return false;
};

// FilterItem Component
const FilterItem = ({
  icon,
  title,
  isExpanded = false,
  onToggle,
  children,
}) => {
  return (
    <div className="w-full p-2.5 flex flex-col gap-3.5 rounded-xl border border-[#E5E6E6] bg-[#FBFBFC]">
      <div
        className="w-full flex items-center gap-3.5 cursor-pointer"
        onClick={onToggle}
      >
        <div className="flex min-w-[30px] h-[30px] p-1.5 justify-center items-center rounded-full bg-[#DEF9FF]">
          <img src={icon} className="select-none" draggable="false" alt="" />
        </div>
        <p className="w-full text-sm text-[#222222] capitalize min-w-fit text-nowrap">
          {title}
        </p>
        <img
          src="/icons/Icon2.svg"
          className={`select-none transition-transform duration-200 ${
            isExpanded ? "rotate-180" : ""
          }`}
          draggable="false"
          alt=""
        />
      </div>
      {isExpanded && (
        <div className="transition-all duration-200 ease-in-out">
          {children}
        </div>
      )}
    </div>
  );
};

// FilterSection Component
const FilterSection = ({ title, children }) => {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[#222222]">{title}</p>
      <div className="flex flex-col gap-1.5">{children}</div>
    </div>
  );
};

// SearchButton Component
const SearchButton = ({ onClick, setLoadingProgress, disabled = false }) => {
  return (
    <div
      className={`w-full h-[48px] flex items-center justify-center gap-4 self-stretch rounded-xl px-2.5 py-2 transition-all duration-200 ${
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
};

const SubmitAIQuery = ({ onClick, setLoadingProgress }) => {
  return (
    <div
      className="w-full h-[48px] flex items-center justify-center gap-4 self-stretch rounded-xl bg-button px-2.5 cursor-pointer"
      onClick={onClick}
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
};

// Updated EmptyState Component
const EmptyState = ({ hasSavedFilters }) => {
  return (
    <div className="w-full h-full p-4 flex items-center justify-center rounded-2xl border border-[#E5E6E6] bg-[#FBFBFC]">
      <div className="max-w-[310px] flex flex-col items-center text-center gap-4">
        <img
          src="/icons/search.svg"
          className="select-none"
          draggable={false}
          alt=""
        />
        <p className="text-lg font-medium text-[#434343]">
          Use the filter panel to apply filters and start your people search.
        </p>

        {/* Show message if saved filters exist */}
        {hasSavedFilters && (
          <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-800">
              Your last search filters have been automatically loaded.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

const LoadingState = ({ progress = 0 }) => {
  return (
    <div className="w-full h-full p-4 flex items-center justify-center rounded-2xl border border-[#E5E6E6] bg-[#FBFBFC]">
      <div className="max-w-[385px] w-full flex flex-col items-center text-center gap-4">
        <img
          src="/icons/notFoundSearch.png"
          className="select-none"
          draggable={false}
          alt=""
        />
        <p className="text-2xl font-semibold text-[#434343]">Finding People</p>
        <div className="w-full h-2 bg-[#DEDEDE] overflow-hidden rounded-full">
          <div
            className="bg-gradient-to-r from-[#04145C] to-[#00D2FF] h-full transition-all duration-300 ease-out rounded-full"
            style={{ width: `${Math.min(progress, 100)}%` }}
          ></div>
        </div>
        <p className="text-sm text-[#434343]">
          {progress < 30
            ? "Initializing search..."
            : progress < 70
            ? `Searching databases... ${Math.round(progress)}%`
            : progress < 100
            ? `Processing results... ${Math.round(progress)}%`
            : "Search completed!"}
        </p>
      </div>
    </div>
  );
};

const FilterPanel = ({
  setTableData,
  setAllSearchResults,
  setLoading,
  setLoadingProgress,
  setSearched,
  searched,
  setAiSearchQuery,
  searchFilter,
  setSearchFilter,
  filtersLoaded,
}) => {
  const [expandedFilters, setExpandedFilters] = React.useState({
    "Job Title": true, // Job Title starts expanded
  });

  const isSearchDisabled = !hasFilterValues(searchFilter);

  // CORRECTED useEffect:
  // This useEffect now safely checks if a filter needs to be expanded
  // before updating state, preventing an infinite loop.
  useEffect(() => {
    if (filtersLoaded && hasFilterValues(searchFilter)) {
      const newExpanded = { ...expandedFilters };
      let changed = false;

      // Check each filter for values and update only if it's not already expanded
      if (searchFilter.role && !newExpanded["Job Title"]) {
        newExpanded["Job Title"] = true;
        changed = true;
      }
      if (searchFilter.industry && !newExpanded["Industry"]) {
        newExpanded["Industry"] = true;
        changed = true;
      }
      if (searchFilter.company_headcount && !newExpanded["NoOfEmployees"]) {
        newExpanded["NoOfEmployees"] = true;
        changed = true;
      }
      if (searchFilter.location && !newExpanded["Country"]) {
        newExpanded["Country"] = true;
        changed = true;
      }
      if (searchFilter.seniority && !newExpanded["Seniority Level"]) {
        newExpanded["Seniority Level"] = true;
        changed = true;
      }
      if (
        searchFilter.behavioral_keywords &&
        !newExpanded["Behavioral Keyword Targeting"]
      ) {
        newExpanded["Behavioral Keyword Targeting"] = true;
        changed = true;
      }
      if (
        searchFilter.experience_at_role &&
        !newExpanded["years in current position"]
      ) {
        newExpanded["years in current position"] = true;
        changed = true;
      }
      if (
        searchFilter.experience_at_company &&
        !newExpanded["years in current company"]
      ) {
        newExpanded["years in current company"] = true;
        changed = true;
      }
      if (
        searchFilter.experience &&
        !newExpanded["total years of experience"]
      ) {
        newExpanded["total years of experience"] = true;
        changed = true;
      }
      if (searchFilter.school && !newExpanded["university"]) {
        newExpanded["university"] = true;
        changed = true;
      }
      if (searchFilter.company && !newExpanded["ex company"]) {
        newExpanded["ex company"] = true;
        changed = true;
      }
      if (searchFilter.language && !newExpanded["languages"]) {
        newExpanded["languages"] = true;
        changed = true;
      }

      // Only call setState if a change has occurred
      if (changed) {
        setExpandedFilters(newExpanded);
      }
    }
  }, [filtersLoaded, searchFilter, expandedFilters]);

  // CORRECTED: The handleJobTitleChange function now correctly processes the full item object
  const handleJobTitleChange = useCallback((data) => {
    setSearchFilter((prev) => {
      const updated = { ...prev };

      const newRole = {};

      // Safely check if data.include exists and is an array with a length > 0
      if (data?.include?.length > 0) {
        // The parent component expects an array of IDs for the search query
        newRole.include = data.include.map((item) => item.id);
      }

      // Safely check if data.exclude exists and is an array with a length > 0
      if (data?.exclude?.length > 0) {
        // The parent component expects an array of IDs for the search query
        newRole.exclude = data.exclude.map((item) => item.id);
      }

      if (Object.keys(newRole).length === 0) {
        delete updated.role;
      } else {
        updated.role = newRole;
      }

      return updated;
    });
  }, []);

  const handleIndustryChange = useCallback((data) => {
    setSearchFilter((prev) => {
      const updated = { ...prev };

      const newIndustry = {};
      if (data.includes.length > 0) newIndustry.include = data.includes;
      if (data.excludes.length > 0) newIndustry.exclude = data.excludes;

      if (Object.keys(newIndustry).length === 0) {
        delete updated.industry;
      } else {
        updated.industry = newIndustry;
      }

      return updated;
    });
  }, []);

  const handleNoOfEmployeesChange = useCallback((data) => {
    setSearchFilter((prev) => {
      const updated = { ...prev };

      if (Array.isArray(data) && data.length > 0) {
        updated.company_headcount = data;
      } else {
        delete updated.company_headcount;
      }

      return updated;
    });
  }, []);

  const handleCountryChange = useCallback((data) => {
    setSearchFilter((prev) => {
      const updated = { ...prev };

      const newCountry = {};
      if (data.includes.length > 0) newCountry.include = data.includes;
      if (data.excludes.length > 0) newCountry.exclude = data.excludes;

      if (Object.keys(newCountry).length === 0) {
        delete updated.location;
      } else {
        updated.location = newCountry;
      }

      return updated;
    });
  }, []);

  const handleSeniorityLevelChange = useCallback((data) => {
    setSearchFilter((prev) => {
      const updated = { ...prev };

      const newSeniority = {};
      if (data.includes.length > 0) newSeniority.include = data.includes;
      if (data.excludes.length > 0) newSeniority.exclude = data.excludes;

      if (Object.keys(newSeniority).length === 0) {
        delete updated.seniority;
      } else {
        updated.seniority = newSeniority;
      }

      return updated;
    });
  }, []);

  const handleBehavioralKeywordChange = useCallback((data) => {
    setSearchFilter((prev) => {
      const updated = { ...prev };

      if ((Array.isArray(data) && data.length > 0) || (typeof data === "string" && data.trim().length > 0)) {
         updated.behavioral_keywords = data;
       } else {
         delete updated.behavioral_keywords;
       }

      return updated;
    });
  }, []);

  const handleYearsInCurrentPositionChange = useCallback((data) => {
    setSearchFilter((prev) => {
      const updated = { ...prev };

      if (Array.isArray(data) && data.length > 0) {
        updated.experience_at_role = data;
      } else {
        delete updated.experience_at_role;
      }

      return updated;
    });
  }, []);

  const handleYearsInCurrentCompanyChange = useCallback((data) => {
    setSearchFilter((prev) => {
      const updated = { ...prev };

      if (Array.isArray(data) && data.length > 0) {
        updated.experience_at_company = data;
      } else {
        delete updated.experience_at_company;
      }

      return updated;
    });
  }, []);

  const handleTotalYearsOfExperienceChange = useCallback((data) => {
    setSearchFilter((prev) => {
      const updated = { ...prev };

      if (Array.isArray(data) && data.length > 0) {
        updated.experience = data;
      } else {
        delete updated.experience;
      }

      return updated;
    });
  }, []);

  const handleUniversityChange = useCallback((data) => {
    setSearchFilter((prev) => {
      const updated = { ...prev };

      const newRole = {};
      if (data.includes.length > 0) newRole.include = data.includes;
      if (data.excludes.length > 0) newRole.exclude = data.excludes;

      if (Object.keys(newRole).length === 0) {
        delete updated.school;
      } else {
        updated.school = newRole;
      }

      return updated;
    });
  }, []);

  const handleExCompanyChange = useCallback((data) => {
    setSearchFilter((prev) => {
      const updated = { ...prev };

      const newRole = {};
      if (data.includes.length > 0) newRole.include = data.includes;
      if (data.excludes.length > 0) newRole.exclude = data.excludes;

      if (Object.keys(newRole).length === 0) {
        delete updated.company;
      } else {
        updated.company = newRole;
      }

      return updated;
    });
  }, []);

  const handleLanguagesChange = useCallback((data) => {
    setSearchFilter((prev) => {
      const updated = { ...prev };

      if (Array.isArray(data) && data.length > 0) {
        updated.language = data;
      } else {
        delete updated.language;
      }

      return updated;
    });
  }, []);

  const handleSearchClick = () => {
    if (isSearchDisabled) return; // Prevent search if disabled

    handleSearch({
      searchFilter,
      setLoading,
      setLoadingProgress,
      setSearched,
      setTableData,
      setAllSearchResults,
    });
  };

  // Toggle function for expanding/collapsing filters
  const toggleFilter = (filterTitle) => {
    setExpandedFilters((prev) => ({
      ...prev,
      [filterTitle]: !prev[filterTitle],
    }));
  };

  return (
    <div className="min-w-[320px] h-full flex flex-col gap-4">
      {/* Show restored filters notification */}
      {filtersLoaded && hasFilterValues(searchFilter) && (
        <div className="px-3 py-2 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-sm text-green-800 flex items-center gap-2">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
            Saved filters loaded successfully!
          </p>
        </div>
      )}

      <div className="flex flex-col gap-4 h-[78vh] overflow-y-auto">
        <FilterSection title="Filters">
          {/* Job Title Filter (Expanded by default) */}
          <FilterItem
            icon="/icons/Icon1.svg"
            title="Job Title"
            isExpanded={expandedFilters["Job Title"]}
            onToggle={() => toggleFilter("Job Title")}
          >
            <JobTitleFilter
              onChange={handleJobTitleChange}
              initialValue={searchFilter.role}
            />
          </FilterItem>

          <FilterItem
            icon="/icons/Industry.svg"
            title="Industry"
            isExpanded={expandedFilters["Industry"]}
            onToggle={() => toggleFilter("Industry")}
          >
            <IndustryFilter
              onChange={handleIndustryChange}
              initialValue={searchFilter.industry}
            />
          </FilterItem>

          <FilterItem
            icon="/icons/Employees.svg"
            title="# of Employees"
            isExpanded={expandedFilters["NoOfEmployees"]}
            onToggle={() => toggleFilter("NoOfEmployees")}
          >
            <NoOfEmployees
              onChange={handleNoOfEmployeesChange}
              initialValue={searchFilter.company_headcount}
            />
          </FilterItem>

          <FilterItem
            icon="/icons/Country.svg"
            title="Country"
            isExpanded={expandedFilters["Country"]}
            onToggle={() => toggleFilter("Country")}
          >
            <CountryFilter
              onChange={handleCountryChange}
              initialValue={searchFilter.location}
            />
          </FilterItem>

          <FilterItem
            icon="/icons/SeniorityLevel.svg"
            title="Seniority Level"
            isExpanded={expandedFilters["Seniority Level"]}
            onToggle={() => toggleFilter("Seniority Level")}
          >
            <SeniorityLevelFilter
              onChange={handleSeniorityLevelChange}
              initialValue={searchFilter.seniority}
            />
          </FilterItem>

          <FilterItem
            icon="/icons/Company.svg"
            title="HQ Company Location"
            isExpanded={expandedFilters["HQ Company Location"]}
            onToggle={() => toggleFilter("HQ Company Location")}
          >
            <HQCompanyLocationFilter />
          </FilterItem>
        </FilterSection>

        <FilterSection title="Advanced Filters">
          <FilterItem
            icon="/icons/Keyword.svg"
            title="Behavioral Keyword Targeting"
            isExpanded={expandedFilters["Behavioral Keyword Targeting"]}
            onToggle={() => toggleFilter("Behavioral Keyword Targeting")}
          >
            <BehavioralKeywordTargetingFilter
              onChange={handleBehavioralKeywordChange}
              initialValue={searchFilter.behavioral_keywords}
            />
          </FilterItem>

          <FilterItem
            icon="/icons/Job.svg"
            title="Job change"
            isExpanded={expandedFilters["Job change"]}
            onToggle={() => toggleFilter("Job change")}
          >
            <JobChangeFilter />
          </FilterItem>

          <FilterItem
            icon="/icons/currentposition.svg"
            title="years in current position"
            isExpanded={expandedFilters["years in current position"]}
            onToggle={() => toggleFilter("years in current position")}
          >
            <YearsInCurrentPositionFilter
              onChange={handleYearsInCurrentPositionChange}
              initialValue={searchFilter.experience_at_role}
            />
          </FilterItem>

          <FilterItem
            icon="/icons/currentcompany.svg"
            title="years in current company"
            isExpanded={expandedFilters["years in current company"]}
            onToggle={() => toggleFilter("years in current company")}
          >
            <YearsInCurrentCompanyFilter
              onChange={handleYearsInCurrentCompanyChange}
              initialValue={searchFilter.experience_at_company}
            />
          </FilterItem>

          <FilterItem
            icon="/icons/experience.svg"
            title="total years of experience"
            isExpanded={expandedFilters["total years of experience"]}
            onToggle={() => toggleFilter("total years of experience")}
          >
            <TotalYearsOfExperienceFilter
              onChange={handleTotalYearsOfExperienceChange}
              initialValue={searchFilter.experience}
            />
          </FilterItem>

          <FilterItem
            icon="/icons/university.svg"
            title="university"
            isExpanded={expandedFilters["university"]}
            onToggle={() => toggleFilter("university")}
          >
            <UniversityFilter
              onChange={handleUniversityChange}
              initialValue={searchFilter.school}
            />
          </FilterItem>

          <FilterItem
            icon="/icons/university.svg"
            title="ex company"
            isExpanded={expandedFilters["ex company"]}
            onToggle={() => toggleFilter("ex company")}
          >
            <ExCompanyFilter
              onChange={handleExCompanyChange}
              initialValue={searchFilter.company}
            />
          </FilterItem>

          <FilterItem
            icon="/icons/Job.svg"
            title="past role"
            isExpanded={expandedFilters["past role"]}
            onToggle={() => toggleFilter("past role")}
          >
            <PastRoleFilter />
          </FilterItem>

          <FilterItem
            icon="/icons/languages.svg"
            title="languages"
            isExpanded={expandedFilters["languages"]}
            onToggle={() => toggleFilter("languages")}
          >
            <LanguagesFilter
              onChange={handleLanguagesChange}
              initialValue={searchFilter.language}
            />
          </FilterItem>
        </FilterSection>
      </div>
      <div className="flex flex-col w-full gap-1.5">
        <SearchButton
          onClick={handleSearchClick}
          setLoadingProgress={setLoadingProgress}
          disabled={isSearchDisabled}
        />
        {searched == true && (
          <SubmitAIQuery
            setLoadingProgress={setLoadingProgress}
            onClick={() => setAiSearchQuery(true)}
          />
        )}
      </div>
    </div>
  );
};

// Main Dashboard Component (Refactored)
const Dashboard = () => {
  const { user } = useAuth();
  const [tableData, setTableData] = useState([]);
  const [allSearchResults, setAllSearchResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [searched, setSearched] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchFilter, setSearchFilter] = useState({});
  const [aiSearchQuery, setAiSearchQuery] = useState(false);
  const [filtersLoaded, setFiltersLoaded] = useState(false);
  const [hasSavedFilters, setHasSavedFilters] = useState(false);

  // Load saved filters on component mount from local storage
  useEffect(() => {
    // Check if we are in the browser environment
    if (typeof window !== "undefined") {
      try {
        const savedFiltersString = localStorage.getItem("savedSearchFilters");
        if (savedFiltersString) {
          const savedFilters = JSON.parse(savedFiltersString);
          console.log("🎉 Filters restored from local storage:", savedFilters);

          setSearchFilter(savedFilters);
          setHasSavedFilters(true);
          setFiltersLoaded(true); // Mark that filters have been loaded
        }
      } catch (error) {
        console.error(
          "Failed to parse saved filters from local storage:",
          error
        );
        localStorage.removeItem("savedSearchFilters"); // Clear invalid data
        setHasSavedFilters(false);
      }
    }
  }, []); // The empty dependency array ensures this runs only once on mount

  return (
    <DashboardContainer heading="Search">
      <div className="w-full h-full flex gap-1">
        <FilterPanel
          setTableData={setTableData}
          setAllSearchResults={setAllSearchResults}
          setLoading={setLoading}
          setLoadingProgress={setLoadingProgress}
          searched={searched}
          setSearched={setSearched}
          searchFilter={searchFilter}
          setSearchFilter={setSearchFilter}
          setAiSearchQuery={setAiSearchQuery}
          filtersLoaded={filtersLoaded}
        />

        {!searched && <EmptyState hasSavedFilters={hasSavedFilters} />}
        {loading && <LoadingState progress={loadingProgress} />}
        {!loading && searched && (
          <Table
            data={tableData}
            searchFilter={searchFilter}
            setLoading={setLoading}
            setLoadingProgress={setLoadingProgress}
            setSearched={setSearched}
            setTableData={setTableData}
          />
        )}
        {aiSearchQuery && (
          <AIPrompt
            setAiSearchQuery={setAiSearchQuery}
            result={allSearchResults}
            searchFilter={searchFilter}
          />
        )}
      </div>
    </DashboardContainer>
  );
};

export default Dashboard;
