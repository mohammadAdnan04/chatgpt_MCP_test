"use client";

import React, { useState, useEffect, useMemo } from "react";
import FilterTag from "@/components/search/FilterTag";
import { INDUSTRY_GROUPS } from "@/constants/industryGroups";

const ChevronDown = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M6 9l6 6 6-6" />
  </svg>
);

const ChevronRight = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M9 18l6-6-6-6" />
  </svg>
);

const SearchIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="8" />
    <path d="M21 21l-4.35-4.35" />
  </svg>
);

const GroupedCheckboxList = ({ itemsSelected, onChange, placeholder, groupsData, isFlat }) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedGroups, setExpandedGroups] = useState({});

  const filteredGroups = useMemo(() => {
    if (!searchTerm) return {};
    let lowerSearch = searchTerm.toLowerCase().trim();

    // Map common aliases to their full industry names
    const aliases = {
      "it": "information technology",
      "hr": "human resources",
      "pr": "public relations",
      "vc": "venture capital",
      "ai": "artificial intelligence"
    };

    if (aliases[lowerSearch]) {
      lowerSearch = aliases[lowerSearch];
    }

    // Helper to match word boundaries or full phrases
    const matchesSearch = (text, search) => {
      const lowerText = text.toLowerCase();
      if (search.includes(" ")) {
        return lowerText.includes(search);
      }
      // Check if any word in the text starts with the search term
      const words = lowerText.split(/[\s,&]+/); // split by space, comma, or ampersand
      return words.some(word => word.startsWith(search));
    };

    const parentMatchesObj = {};
    const childMatchesObj = {};

    for (const [group, children] of Object.entries(groupsData || {})) {
      const parentMatches = matchesSearch(group, lowerSearch);
      
      // Filter children so we only show relevant ones if the parent doesn't match directly
      const matchingChildren = children.filter((c) => matchesSearch(c, lowerSearch));
      
      if (parentMatches) {
        // If parent matches, prioritize it in the first bucket
        parentMatchesObj[group] = children;
      } else if (matchingChildren.length > 0) {
        // If only some children match, put it in the secondary bucket
        childMatchesObj[group] = matchingChildren;
      }
    }
    
    // Combine them: parents first, then children
    return { ...parentMatchesObj, ...childMatchesObj };
  }, [searchTerm, groupsData]);

  const handleGroupToggle = (group) => {
    setExpandedGroups((prev) => ({ ...prev, [group]: !prev[group] }));
  };

  const handleGroupCheck = (group, children, isChecked) => {
    if (isChecked) {
      const newItems = [...itemsSelected];
      children.forEach((c) => {
        if (!newItems.includes(c)) newItems.push(c);
      });
      onChange(newItems);
    } else {
      const newItems = itemsSelected.filter((item) => !children.includes(item));
      onChange(newItems);
    }
  };

  const handleChildCheck = (child, isChecked) => {
    if (isChecked) {
      if (!itemsSelected.includes(child)) {
        onChange([...itemsSelected, child]);
      }
    } else {
      onChange(itemsSelected.filter((item) => item !== child));
    }
  };

  return (
    <div className="flex flex-col gap-2 border border-gray-200 rounded-md bg-white">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100">
        <SearchIcon />
        <input
          type="text"
          placeholder={placeholder}
          className="w-full text-sm outline-none bg-transparent"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>
      {searchTerm.length > 0 && (
        <div className="max-h-60 overflow-y-auto p-2 flex flex-col gap-1">
          {Object.keys(filteredGroups).length === 0 && (
            <p className="text-xs text-gray-500 p-2">No industries found.</p>
          )}
          {Object.entries(filteredGroups).map(([group, children]) => {
          const allChecked = children.every((c) => itemsSelected.includes(c));
          const someChecked = children.some((c) => itemsSelected.includes(c));
          const isExpanded = !!expandedGroups[group] || searchTerm.length > 0;

          return (
            <div key={group} className="flex flex-col">
              <div className="flex items-center gap-2 py-1 px-1 hover:bg-gray-50 rounded-md">
                {!isFlat && (
                  <div
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleGroupToggle(group);
                    }}
                    className="text-gray-500 cursor-pointer p-0.5"
                  >
                    {isExpanded ? <ChevronDown /> : <ChevronRight />}
                  </div>
                )}
                <label className="flex items-center gap-2 flex-1 cursor-pointer m-0">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    ref={(input) => {
                      if (input) input.indeterminate = !allChecked && someChecked;
                    }}
                    onChange={(e) =>
                      handleGroupCheck(group, children, e.target.checked)
                    }
                    className="cursor-pointer"
                  />
                  <span className="text-sm font-medium text-gray-700 select-none flex-1">
                    {group} {!isFlat && <span className="text-xs text-gray-400 font-normal">({children.length})</span>}
                  </span>
                </label>
              </div>

              {!isFlat && isExpanded && (
                <div className="flex flex-col ml-6 pl-2 border-l border-gray-200 mt-1 gap-1">
                  {children.map((child) => (
                    <label
                      key={child}
                      className="flex items-center gap-2 py-1 hover:bg-gray-50 rounded-md cursor-pointer px-1"
                    >
                      <input
                        type="checkbox"
                        checked={itemsSelected.includes(child)}
                        onChange={(e) =>
                          handleChildCheck(child, e.target.checked)
                        }
                        className="cursor-pointer"
                      />
                      <span className="text-xs text-gray-600 select-none">
                        {child}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        </div>
      )}
    </div>
  );
};

const IndustryFilter = ({ onChange, value, initialValue, searchMode, selectedCountry }) => {
  const propValue = value || initialValue;
  const showExclude = searchMode !== "companies";

  const displayGroups = INDUSTRY_GROUPS;

  const [roleFilter, setRoleFilter] = useState({
    include: propValue?.include || [],
    exclude: propValue?.exclude || [],
  });

  const notifyChange = (newFilter) => {
    if (!onChange) return;
    
    const includeLabels = {};
    newFilter.include.forEach(ind => { includeLabels[ind] = ind; });
    
    const excludeLabels = {};
    newFilter.exclude.forEach(ind => { excludeLabels[ind] = ind; });

    onChange({
      include: newFilter.include,
      exclude: newFilter.exclude,
      includeLabels,
      excludeLabels,
      includes: newFilter.include,
      excludes: newFilter.exclude,
      includesTitles: includeLabels,
      excludesTitles: excludeLabels,
    });
  };

  useEffect(() => {
    if (!propValue) {
      setRoleFilter({ include: [], exclude: [] });
      return;
    }
    const newInclude = propValue.include || [];
    const newExclude = propValue.exclude || [];
    setRoleFilter({ include: newInclude, exclude: newExclude });
  }, [JSON.stringify(propValue)]);

  const handleItemsChange = (type, newItems) => {
    const newFilter = {
      ...roleFilter,
      [type]: newItems,
    };
    setRoleFilter(newFilter);
    notifyChange(newFilter);
  };

  const handleRemove = (type, idToRemove) => {
    const newFilter = {
      ...roleFilter,
      [type]: roleFilter[type].filter((x) => String(x) !== String(idToRemove)),
    };
    setRoleFilter(newFilter);
    notifyChange(newFilter);
  };

  const renderTags = (type) => {
    const selectedItems = roleFilter[type];
    if (!selectedItems || selectedItems.length === 0) return null;

    const tags = [];
    let processedItems = new Set();
    
    // PASS 1: Identify full groups (All) or partial groups (> 3 items)
    // We do this first so mother industries absorb their children and mark them as processed.
    for (const [group, children] of Object.entries(displayGroups)) {
      const selectedChildren = children.filter((c) => selectedItems.includes(c));
      if (selectedChildren.length === 0) continue;

      if (selectedChildren.length === children.length) {
        tags.push(
          <FilterTag
            key={group}
            text={group + " (All)"}
            onRemove={() => {
              const newItems = selectedItems.filter((item) => !children.includes(item));
              handleItemsChange(type, newItems);
            }}
          />
        );
        selectedChildren.forEach((c) => processedItems.add(c));
      } else if (selectedChildren.length > 3) {
        tags.push(
          <FilterTag
            key={group}
            text={`${group} (${selectedChildren.length})`}
            onRemove={() => {
              const newItems = selectedItems.filter((item) => !children.includes(item));
              handleItemsChange(type, newItems);
            }}
          />
        );
        selectedChildren.forEach((c) => processedItems.add(c));
      }
    }

    // PASS 2: Render individual children that weren't caught by a mother industry
    // We check against `processedItems` to prevent cross-group duplication
    for (const [group, children] of Object.entries(displayGroups)) {
      const selectedChildren = children.filter((c) => selectedItems.includes(c));
      if (selectedChildren.length > 0 && selectedChildren.length <= 3) {
        selectedChildren.forEach((child) => {
          if (!processedItems.has(child)) {
            tags.push(
              <FilterTag
                key={child}
                text={child}
                onRemove={() => handleRemove(type, child)}
              />
            );
            processedItems.add(child);
          }
        });
      }
    }

    // PASS 3: Catch-all for any items that might not be in the current displayGroups mapping
    selectedItems.forEach((item) => {
      if (!processedItems.has(item)) {
        tags.push(
          <FilterTag
            key={item}
            text={item}
            onRemove={() => handleRemove(type, item)}
          />
        );
        processedItems.add(item);
      }
    });

    return tags;
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-[#222222]">Include</p>
        <GroupedCheckboxList
          placeholder="Search Industries..."
          itemsSelected={roleFilter.include}
          onChange={(newItems) => handleItemsChange("include", newItems)}
          groupsData={displayGroups}
          isFlat={false}
        />
        <div className="flex flex-wrap gap-2">
          {renderTags("include")}
        </div>
      </div>

      {showExclude && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-[#222222]">Exclude</p>
          <GroupedCheckboxList
            placeholder="Search Industries to Exclude..."
            itemsSelected={roleFilter.exclude}
            onChange={(newItems) => handleItemsChange("exclude", newItems)}
            groupsData={displayGroups}
            isFlat={false}
          />
          <div className="flex flex-wrap gap-2">
            {renderTags("exclude")}
          </div>
        </div>
      )}
    </div>
  );
};

export default IndustryFilter;
