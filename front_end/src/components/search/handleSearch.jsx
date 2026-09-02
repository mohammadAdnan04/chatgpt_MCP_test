// utils/handleSearch.js

"use client";

import axios from "axios";
import Swal from "sweetalert2";

const generateSeed = () => Math.random().toString(36).substring(2, 15);

// Helper function to clean search filter
const cleanSearchFilter = (searchFilter, type = "people") => {
  const cleanedFilter = {};
  const formatHeadcountRange = (s) => {
    const m = String(s || "").match(/^\s*(\d+)(?:\s*-\s*(\d+))?\s*(\+)?\s*$/);
    if (!m) return s;
    const fmt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    const a = fmt(m[1]);
    if (m[3] === "+") return `${a}+`;
    if (m[2]) return `${a}-${fmt(m[2])}`;
    return a;
  };

  for (const key in searchFilter) {
    const value = searchFilter[key];

    if (key === "company_headcount" || key === "experience_at_role" || key === "experience_at_company" || key === "experience" || key === "language") {
      if (Array.isArray(value) && value.length > 0) {
        cleanedFilter[key] = key === "company_headcount" ? value.map(formatHeadcountRange) : value; 
      } else if (
        typeof value === "object" &&
        value !== null &&
        Array.isArray(value.include) &&
        value.include.length > 0
      ) {
        cleanedFilter[key] = key === "company_headcount" ? value.include.map(formatHeadcountRange) : value.include;
      }
    } else if (
      typeof value === "object" &&
      value !== null &&
      ("include" in value || "exclude" in value)
    ) {
      const cleanedValue = {};
      
      const formatCompanyStr = (str) => {
        if (typeof str === 'string' && (key === 'company' || key === 'company_name' || key === 'past_company' || key === 'ex_company')) {
            // Both People and Company searches require Name|||Domain for middleware processing
            if (!str.includes('|||')) {
                // If it's a numeric ID (like linkedin_id), DO NOT format it with |||
                if (/^\d+$/.test(str)) {
                    return str;
                }
                // To avoid sending wise.com|||wise.com when they manually type wise.com,
                // we can attempt to extract a rough name from the domain by stripping the extension.
                // e.g. "wise.com" -> "wise"
                let namePart = str;
                if (str.includes('.') && !str.includes(' ')) {
                    namePart = str.split('.')[0];
                    // Capitalize first letter for better matching
                    namePart = namePart.charAt(0).toUpperCase() + namePart.slice(1);
                }
                return `${namePart}|||${str}`;
            } else {
                // If it ALREADY has a delimiter, let's check if it's the "domain|||domain" problem
                const [name, domain] = str.split('|||');
                if (name === domain && name.includes('.') && !name.includes(' ')) {
                    let extractedName = name.split('.')[0];
                    extractedName = extractedName.charAt(0).toUpperCase() + extractedName.slice(1);
                    return `${extractedName}|||${domain}`;
                }
            }
        }
        return str;
      };

      if (Array.isArray(value.include) && value.include.length > 0) {
        cleanedValue.include = value.include.map(formatCompanyStr);
      }
      if (Array.isArray(value.exclude) && value.exclude.length > 0) {
        cleanedValue.exclude = value.exclude.map(formatCompanyStr);
      }
      if (Object.keys(cleanedValue).length > 0) {
        cleanedFilter[key] = cleanedValue;
      }
    } else if (Array.isArray(value) && value.length > 0) {
        const formatCompanyStr = (str) => {
            if (typeof str === 'string' && (key === 'company' || key === 'company_name' || key === 'past_company' || key === 'ex_company')) {
                // Both People and Company searches require Name|||Domain for middleware processing
                if (!str.includes('|||')) {
                    // If it's a numeric ID (like linkedin_id), DO NOT format it with |||
                    if (/^\d+$/.test(str)) {
                        return str;
                    }
                    let namePart = str;
                    if (str.includes('.') && !str.includes(' ')) {
                        namePart = str.split('.')[0];
                        namePart = namePart.charAt(0).toUpperCase() + namePart.slice(1);
                    }
                    return `${namePart}|||${str}`;
                } else {
                    const [name, domain] = str.split('|||');
                    if (name === domain && name.includes('.') && !name.includes(' ')) {
                        let extractedName = name.split('.')[0];
                        extractedName = extractedName.charAt(0).toUpperCase() + extractedName.slice(1);
                        return `${extractedName}|||${domain}`;
                    }
                }
            }
            return str;
        };
        cleanedFilter[key] = value.map(formatCompanyStr);
    } else if (
        (typeof value === "string" && value.trim() !== "") ||
        (typeof value === "number" && !isNaN(value)) ||
        (typeof value === "boolean")
      ) {
        cleanedFilter[key] = value;
      }
    }
    
    // Explicitly copy excludeListIds since it's not a standard string/array/object filter format
    if (searchFilter.excludeListIds && Array.isArray(searchFilter.excludeListIds) && searchFilter.excludeListIds.length > 0) {
      cleanedFilter.excludeListIds = searchFilter.excludeListIds;
    }

    return cleanedFilter;
  };

// Generic function to perform a search with a specified limit
const handleSearch = async ({
  searchFilter,
  limit,
  // limit = 24, // Default limit is 12
  passedCursor = null,
  savedFilterId = null,
  setLoading,
  setLoadingProgress,
  setSearched,
  setTableData,
  setCursor,
  type = "people",
}) => {
  const cleanedFilter = cleanSearchFilter(searchFilter, type);
  if (!savedFilterId && (!cleanedFilter || Object.keys(cleanedFilter).length === 0)) {
    if (setLoading) setLoading(false);
    if (setSearched) setSearched(false);
    return;
  }

  try {
    if (typeof window !== "undefined") {
      sessionStorage.setItem("hasMadeRealSearch", "true");
    }
  } catch {}

  if (setLoading) setLoading(true);
  if (setSearched) setSearched(true);
  if (setLoadingProgress) setLoadingProgress(0);

  const finalLimit = limit || 10; // Default to 10 items as requested

  const progressInterval = setInterval(() => {
    if (setLoadingProgress) {
      setLoadingProgress((prev) => {
        if (prev >= 90) {
          clearInterval(progressInterval);
          return prev;
        }
        const increment = prev < 50 ? Math.random() * 15 + 5 : Math.random() * 10 + 3;
        return Math.min(prev + increment, 90);
      });
    }
  }, 200);
  try {
    // Determine page number from passedCursor (default to 1)
    const page = passedCursor && !isNaN(passedCursor) ? parseInt(passedCursor, 10) : 1;

    let searchSeed = typeof sessionStorage !== "undefined" ? sessionStorage.getItem('search_seed') : null;
    // If page is 1 or no cursor is passed, we assume it's a new search and we should generate a new seed
    if (!passedCursor || page === 1 || !searchSeed) {
        searchSeed = generateSeed();
        if (typeof sessionStorage !== "undefined") {
            sessionStorage.setItem('search_seed', searchSeed);
        }
    }

    // Use local backend proxy instead of direct external API
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    let url = `${apiUrl}/api/proxy/search`;
    
    // --- SPECIAL HANDLING FOR SIMILAR COMPANIES ---
    if (cleanedFilter.similar_company) {
        // We use the MAIN search endpoint but pass the 'similar_company' filter
        // This allows HybridService to handle it properly and combine it with other filters
        console.log(`[handleSearch] Similar Company Filter Detected: ${cleanedFilter.similar_company}`);
        
        // Ensure type is companies
        type = "companies"; 
        
        // Do NOT return early or change URL.
        // Let it fall through to the standard POST /api/proxy/search
        // The backend (HybridService) is already configured to detect 'similar_company' in filters
        // and route it to MawsoolService.getSimilarCompanies(id, filters)
    }
    // ----------------------------------------------

    console.log(`[handleSearch] Sending request to: ${url}`, {
        filters: cleanedFilter,
        page: page,
        limit: finalLimit,
        type: type
    });

    // Increase timeout for frontend request as well
    const response = await axios.post(
      url,
      {
        filters: cleanedFilter,
        page: page,
        limit: finalLimit,
        type: type, 
        seed: searchSeed,
        savedFilterId: savedFilterId || undefined
      },
      {
        headers: {
          accept: "application/json",
        },
        withCredentials: true,
        timeout: 130000, // 130s timeout (longer than backend's 120s)
      }
    );

    const responseData = response.data;
    if (responseData?.snapshot_failed) {
      Swal.fire({
        title: "Snapshot Failed",
        text: responseData.message || "Saved search snapshot failed to build. Please save the search again.",
        imageUrl: "/icons/mawsool-error.webp",
        imageAlt: "Custom alert icon",
        confirmButtonText: "OK",
        customClass: {
          confirmButton: "swal-confirm-button",
        },
      });
      return;
    }
    if (responseData?.pending) {
      Swal.fire({
        title: "Preparing Snapshot",
        text: responseData.message || "Saved search snapshot is still being prepared. Please try again shortly.",
        imageUrl: "/icons/mawsool-error.webp",
        imageAlt: "Custom alert icon",
        confirmButtonText: "OK",
        customClass: {
          confirmButton: "swal-confirm-button",
        },
      });
      return;
    }

    if (responseData && (responseData.items || Array.isArray(responseData.items))) {
      if (setTableData) {
        // Ensure data format matches Table expectations (include paging)
        // If items are missing but total is present, treat as empty result
        const items = responseData.items || [];
        const total = responseData.total || 0;
        const paging = responseData.paging || { 
            total_count: typeof total === 'number' ? total : (parseInt(String(total).replace(/[^0-9]/g, '')) || items.length),
            page: page,
            limit: finalLimit 
        };

        setTableData({
          items: items,
          total: total,
          paging: paging,
          searchMode: type // Include the search mode used for this result
        });
      }

      if (setCursor && responseData.cursor) {
        setCursor(responseData.cursor);
      } else if (setCursor) {
        setCursor(null); // Clear cursor if no next page
      }
    } else {
      console.error("❌ Invalid response format:", responseData);
      if (setTableData) {
      setTableData([]);
    }
    }
  } catch (error) {
    console.error("❌ Search failed:", error);
    console.error("Error details:", error.response?.data);
    
    // Skip 401 errors here because they are handled globally by AuthContext
    if (error.response?.status !== 401) {
      let title = "Search Error";
      let text = "Something went wrong";

      // Handle specific Pagination Limit error
      if (error.response?.status === 403 && error.response?.data?.error === "Access denied.") {
          title = "Upgrade Required";
          const maxPage = Number(error.response?.data?.maxPage) || 15;
          text = `You've reached the ${maxPage}-page search limit. Use Bulk Reveal to get more leads.`;
      } 
      // Handle other errors using backend message if available
      else if (error.response?.data?.error) {
          title = error.response?.data?.title || "Error";
          text = error.response?.data?.error;
      }

      Swal.fire({
          title: title,
          text: text,
          imageUrl: "/icons/mawsool-error.webp",
          imageAlt: "Custom alert icon",
          confirmButtonText: "OK",
          customClass: {
            confirmButton: "swal-confirm-button",
          },
        })
    }
  } finally {
    clearInterval(progressInterval);
    if (setLoadingProgress) setLoadingProgress(100);
    if (setLoading) {
      setTimeout(() => {
        setLoading(false);
      }, 300);
    }
  }
};

export default handleSearch;
