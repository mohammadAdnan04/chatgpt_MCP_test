"use client";

import React, { useState, useEffect } from "react";
import FilterTag from "@/components/search/FilterTag";
import AutoSuggestInput from "@/components/search/AutoSuggestInput";
import { jobTitles } from "@/constants/jobTitles";

const JobTitleFilter = ({
  onChange,
  value,
  initialValue,
  expandJobTitlesValue,
  onChangeExpandJobTitles,
}) => {
  // Initialize state from props (value or initialValue)
  const propValue = value || initialValue;

  const expandEnabled = expandJobTitlesValue !== false;

  const [roleFilter, setRoleFilter] = useState({
    include: propValue?.include || [],
    exclude: propValue?.exclude || [],
  });

  const [selectedItemsMap, setSelectedItemsMap] = useState({
    include: propValue?.includeLabels || {},
    exclude: propValue?.excludeLabels || {},
  });

  // ---- helpers --------------------------------------------------------------

  const normalizeItem = (item) => {
    if (item !== null && typeof item !== "object") {
      return { id: item, title: String(item) };
    }
    const id =
      item?.id ??
      item?._id ??
      item?.value ??
      item?.uuid ??
      item?.key ??
      item?.code;

    const title =
      item?.title ??
      item?.name ??
      item?.label ??
      item?.text ??
      item?.displayName ??
      (id != null ? String(id) : "");

    return { id, title };
  };

  const fetchTitlesForIds = async (ids, type) => {
    if (!ids || ids.length === 0) return;
    try {
      // In the new static list approach, the ID is the Name
      const entries = ids.map((id) => ({ id, title: id }));
      setSelectedItemsMap((prev) => {
        const next = { ...prev[type] };
        for (const { id, title } of entries) next[String(id)] = title;
        return { ...prev, [type]: next };
      });
    } catch (e) {
      console.error("Error fetching titles for IDs:", e);
    }
  };

  // Build a payload using provided maps to avoid stale reads
  const notifyChange = (
    newFilter,
    includeLabelsOverride,
    excludeLabelsOverride
  ) => {
    if (!onChange) return;
    const includeLabels = includeLabelsOverride ?? selectedItemsMap.include;
    const excludeLabels = excludeLabelsOverride ?? selectedItemsMap.exclude;

    onChange({
      // preferred keys
      include: newFilter.include,
      exclude: newFilter.exclude,
      includeLabels,
      excludeLabels,
      // legacy aliases (keep for compatibility)
      includes: newFilter.include,
      excludes: newFilter.exclude,
      includesTitles: includeLabels,
      excludesTitles: excludeLabels,
    });
  };

  // ---- sync from props (merge, don’t wipe) ----------------------------------

  useEffect(() => {
    if (!propValue) {
        setRoleFilter({ include: [], exclude: [] });
        setSelectedItemsMap({ include: {}, exclude: {} });
        return;
      }

    const newInclude = propValue.include || [];
    const newExclude = propValue.exclude || [];

    setRoleFilter({ include: newInclude, exclude: newExclude });

    // merge labels when provided
    if (
      propValue.includeLabels &&
      Object.keys(propValue.includeLabels).length
    ) {
      setSelectedItemsMap((prev) => ({
        ...prev,
        include: { ...prev.include, ...propValue.includeLabels },
      }));
    } else {
      const missing = newInclude.filter(
        (id) => !selectedItemsMap.include[String(id)]
      );
      if (missing.length) fetchTitlesForIds(missing, "include");
    }

    if (
      propValue.excludeLabels &&
      Object.keys(propValue.excludeLabels).length
    ) {
      setSelectedItemsMap((prev) => ({
        ...prev,
        exclude: { ...prev.exclude, ...propValue.excludeLabels },
      }));
    } else {
      const missing = newExclude.filter(
        (id) => !selectedItemsMap.exclude[String(id)]
      );
      if (missing.length) fetchTitlesForIds(missing, "exclude");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(propValue)]);

  // ---- handlers -------------------------------------------------------------

  const handleSelect = (type) => (rawItem) => {
    const { id, title } = normalizeItem(rawItem);
    if (id == null) return;

    // Avoid duplicates
    if (roleFilter[type].some((x) => String(x) === String(id))) return;

    // 1) compute next roleFilter
    const newFilter = {
      ...roleFilter,
      [type]: [...roleFilter[type], id],
    };

    // 2) compute next labels map synchronously (no stale reads)
    const nextIncludeLabels =
      type === "include"
        ? {
            ...selectedItemsMap.include,
            [String(id)]: title || `Loading... (${id})`,
          }
        : { ...selectedItemsMap.include };
    const nextExcludeLabels =
      type === "exclude"
        ? {
            ...selectedItemsMap.exclude,
            [String(id)]: title || `Loading... (${id})`,
          }
        : { ...selectedItemsMap.exclude };

    // 3) update state
    setRoleFilter(newFilter);
    setSelectedItemsMap({
      include: nextIncludeLabels,
      exclude: nextExcludeLabels,
    });

    // 4) notify parent with the *computed* maps (no setTimeout needed)
    notifyChange(newFilter, nextIncludeLabels, nextExcludeLabels);

    // 5) if we only got an id, fetch the real title in background
    if (!title || title === String(id)) {
      fetchTitlesForIds([id], type);
    }
  };

  const handleRemove = (type) => (idToRemove) => {
    // 1) compute next roleFilter
    const newFilter = {
      ...roleFilter,
      [type]: roleFilter[type].filter(
        (id) => String(id) !== String(idToRemove)
      ),
    };

    // 2) compute next labels map synchronously
    const nextIncludeLabels = { ...selectedItemsMap.include };
    const nextExcludeLabels = { ...selectedItemsMap.exclude };
    if (type === "include") delete nextIncludeLabels[String(idToRemove)];
    else delete nextExcludeLabels[String(idToRemove)];

    // 3) update state
    setRoleFilter(newFilter);
    setSelectedItemsMap({
      include: nextIncludeLabels,
      exclude: nextExcludeLabels,
    });

    // 4) notify parent with computed maps
    notifyChange(newFilter, nextIncludeLabels, nextExcludeLabels);
  };

  // ---- render ---------------------------------------------------------------

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col">
          <span className="text-xs text-[#434343] font-medium">Expand job titles</span>
          <span className="text-[10px] text-[#6B7271]">
            When enabled, it will include similar job titles in the results.
          </span>
        </div>
        <button
          type="button"
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ${
            expandEnabled ? "bg-[#04145C]" : "bg-[#E5E6E6]"
          }`}
          onClick={() => {
            if (!onChangeExpandJobTitles) return;
            if (expandEnabled) onChangeExpandJobTitles(false);
            else onChangeExpandJobTitles(undefined);
          }}
          aria-pressed={expandEnabled}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform duration-200 ${
              expandEnabled ? "translate-x-5" : "translate-x-1"
            }`}
          />
        </button>
      </div>
      {/* Include Section */}
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-[#222222]">Include</p>
        <AutoSuggestInput
        placeholder="Search Job Title"
        staticSuggestions={jobTitles}
        onSelect={handleSelect("include")}
          selectedItems={roleFilter.include}
          allowCustomInput={true}
        />
        <div className="flex flex-wrap gap-2">
          {roleFilter.include.map((jobId) => {
            const label =
              selectedItemsMap.include[String(jobId)] || jobId;
            return (
              <FilterTag
                key={String(jobId)}
                text={label}
                onRemove={() => handleRemove("include")(jobId)}
              />
            );
          })}
        </div>
      </div>

      {/* Exclude Section */}
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-[#222222]">Exclude</p>
        <AutoSuggestInput
          placeholder="Choose Job Title to Exclude"
          staticSuggestions={jobTitles}
          onSelect={handleSelect("exclude")}
          selectedItems={roleFilter.exclude}
          allowCustomInput={true}
        />
        <div className="flex flex-wrap gap-2">
          {roleFilter.exclude.map((id) => {
            const label =
              selectedItemsMap.exclude[String(id)] || id;
            return (
              <FilterTag
                key={String(id)}
                text={label}
                onRemove={() => handleRemove("exclude")(id)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default JobTitleFilter;
