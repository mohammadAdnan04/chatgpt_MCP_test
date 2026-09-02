"use client";
import React, { useState, useRef, useEffect } from "react";
import axiosInstance from "@/utils/axiosInstance";
import CompanyLogo from "@/components/shared/CompanyLogo";

const AutoSuggestInput = ({
  placeholder,
  apiUrl,
  queryParam = "keywords",
  additionalParams = null, // New prop to pass dynamic params like country
  accountId,
  onSelect,
  responseSuggestions,
  selectedItems = [],
  showLogo = false,
  allowCustomInput = false, // New prop
  staticSuggestions = null, // New prop for local static lists
  dependencyDependency = null, // New prop to force re-fetch when parent state changes
  customFetch = null, // New prop to use custom fetch function instead of api
}) => {
  const [input, setInput] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [typingTimeout, setTypingTimeout] = useState(null);
  const [dropdownPosition, setDropdownPosition] = useState("bottom"); // Track if suggestions should be above or below
  const inputRef = useRef(null); // Reference to the input field
  const suggestionsRef = useRef(null); // Reference to the suggestions list

  // Function to calculate suggestions list position
  const calculateDropdownPosition = () => {
    // We want to force it downwards (bottom) to prevent it from hiding choices
    // under the top filter panel boundaries or causing layout issues upwards.
    setDropdownPosition("bottom");
  };

  // Recalculate position when suggestions are shown, window resizes, or scrolls
  useEffect(() => {
    if (suggestions.length > 0) {
      calculateDropdownPosition();
      window.addEventListener("resize", calculateDropdownPosition);
      window.addEventListener("scroll", calculateDropdownPosition);
    }
    return () => {
      window.removeEventListener("resize", calculateDropdownPosition);
      window.removeEventListener("scroll", calculateDropdownPosition);
    };
  }, [suggestions.length]);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        inputRef.current &&
        suggestionsRef.current &&
        !inputRef.current.contains(event.target) &&
        !suggestionsRef.current.contains(event.target)
      ) {
        setSuggestions([]);
        setInput("");
      }
    };

    if (suggestions.length > 0) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [suggestions.length]);

  // Remove customFetchRef logic since we are using apiUrl directly now
  // Re-fetch suggestions if a parent dependency changes (like selectedCountry)
  useEffect(() => {
    console.log("[AutoSuggestInput] dependencyDependency changed:", dependencyDependency);
    if (dependencyDependency !== null) {
      console.log("[AutoSuggestInput] Force clearing suggestions due to dependency change");
      // Must clear input and suggestions completely to force a fresh slate for the new dependency
      setInput("");
      setSuggestions([]);
    }
  }, [dependencyDependency]);

  const fetchSuggestions = async (query) => {
    if (customFetch) {
      try {
        const result = await customFetch(query);
        const data = responseSuggestions ? responseSuggestions(result) : result.data;
        setSuggestions(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error("Failed to fetch custom suggestions", error);
        setSuggestions([]);
      }
      return;
    }

    // If static suggestions are provided, filter locally
    if (staticSuggestions && Array.isArray(staticSuggestions)) {
      const uniqueTitles = new Map();
      
      staticSuggestions
        .filter((item) => {
          if (!query) return true; // Show all if query is empty
          const val =
            typeof item === "string" ? item : item.title || item.id || "";
          return val.toLowerCase().includes(query.toLowerCase());
        })
        .forEach((item) => {
          const val = typeof item === "string" ? item : item.title || item.id || "";
          const lowerVal = val.toLowerCase();
          
          // Only keep the first variation we see (case-insensitive deduplication)
          if (!uniqueTitles.has(lowerVal)) {
            uniqueTitles.set(lowerVal, { id: val, title: val });
          }
        });

      setSuggestions(Array.from(uniqueTitles.values()).slice(0, 100)); // Limit to top 100 matches
      return;
    }

    // For external APIs, usually require at least 2 chars
    if (!query || query.length < 2) {
      setSuggestions([]);
      return;
    }

    try {
      // Build params dynamically
      const params = {
        [queryParam]: query,
        account_id: accountId,
        _t: Date.now(), // Force cache bust
      };
      
      // Add any additional params passed from parent (like country)
      if (additionalParams) {
        Object.assign(params, additionalParams);
      }

      console.log(`Fetching suggestions from: ${apiUrl} with params:`, params);
      const response = await axiosInstance.get(apiUrl, { params });
      
      const data = responseSuggestions ? responseSuggestions(response) : response.data;
      setSuggestions(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Failed to fetch suggestions", error);
      setSuggestions([]);
    }
  };

  const handleFocus = () => {
    // Trigger fetch on focus even if input is empty, useful for static lists
    if (staticSuggestions || customFetch) {
      fetchSuggestions(input);
    }
  };

  const handleChange = (e) => {
    const value = e.target.value;
    setInput(value);

    // If static or custom fetch, filter immediately (no debounce needed for local array)
    if (staticSuggestions || customFetch) {
      fetchSuggestions(value);
      return;
    }

    if (typingTimeout) clearTimeout(typingTimeout);
    const timeout = setTimeout(() => {
      if (value.trim().length > 0) {
        fetchSuggestions(value);
      } else {
        setSuggestions([]);
      }
    }, 300);
    setTypingTimeout(timeout);
  };

  const handleSelect = (item) => {
    if (!selectedItems.includes(item.id)) {
      if (onSelect) {
        onSelect({ id: item.id, title: item.title || item.name });
      }
    }
    setInput("");
    setSuggestions([]);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && input.trim()) {
      e.preventDefault();
      const trimmedLower = input.trim().toLowerCase();
      
      // Try to find a matching suggestion first (by name or domain)
      const matchingSuggestion = suggestions.find(item => {
          const title = (item.title || item.name || "").toLowerCase();
          let domain = "";
          if (typeof item.id === 'string' && item.id.includes('|||')) {
              domain = item.id.split('|||')[1].toLowerCase();
          } else if (item.domain) {
              domain = item.domain.toLowerCase();
          }
          return title === trimmedLower || domain === trimmedLower;
      });

      if (matchingSuggestion) {
          handleSelect(matchingSuggestion);
          return;
      }

      if (allowCustomInput) {
        const customItem = { id: input.trim(), title: input.trim() };
        handleSelect(customItem);
      }
    }
  };

  const trimmedInput = input.trim();
  const displaySuggestions = [...suggestions];
  
  if (allowCustomInput && trimmedInput) {
    const trimmedLower = trimmedInput.toLowerCase();
    const matchingSuggestion = suggestions.find(item => {
        const title = (item.title || item.name || "").toLowerCase();
        let domain = "";
        if (typeof item.id === 'string' && item.id.includes('|||')) {
            domain = item.id.split('|||')[1].toLowerCase();
        } else if (item.domain) {
            domain = item.domain.toLowerCase();
        }
        return title === trimmedLower || domain === trimmedLower;
    });

    if (!matchingSuggestion) {
      displaySuggestions.unshift({ id: trimmedInput, title: trimmedInput, isCustom: true });
    }
  }

  return (
    <div className="relative">
      <input
        type="text"
        placeholder={placeholder}
        value={input}
        onChange={handleChange}
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
        ref={inputRef}
        className="input__field !bg-transparent w-full"
      />
      {displaySuggestions.length > 0 && input.trim().length > 0 && (
        <div
          ref={suggestionsRef}
          style={{ display: 'block', visibility: 'visible' }}
          className={`autosuggestion absolute z-[9999] bg-white border rounded shadow-lg w-full max-h-[320px] overflow-y-auto ${
            dropdownPosition === "top" ? "bottom-full mb-1" : "top-full mt-1"
          }`}
        >
          {displaySuggestions.map((item, index) => (
            <div
              key={index}
              className="px-3 py-2 text-sm hover:bg-gray-100 cursor-pointer flex items-center gap-2"
              onClick={() => handleSelect(item)}
            >
              {showLogo && !item.isCustom && (
                <CompanyLogo 
                  companyName={item.title || item.name} 
                  logo={item.logo}
                  className="w-5 h-5" 
                />
              )}
              {item.isCustom ? (
                <span className="text-[#04145C] font-medium">Select "{item.title}"</span>
              ) : (
                <span>{item.title || item.name || "Untitled API Item Text"}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AutoSuggestInput;