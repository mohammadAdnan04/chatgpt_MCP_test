"use client";

import React, { useEffect, useState } from "react";
import FilterTag from "@/components/search/FilterTag";
import AutoSuggestInput from "@/components/search/AutoSuggestInput";

import { jobTitles } from "@/constants/jobTitles";

const PastRoleFilter = ({
  onChange,
  value,
  initialValue,
  expandJobTitlesValue,
  onChangeExpandJobTitles,
}) => {
  // Prefer fully controlled `value`, else `initialValue`
  const propValue = value || initialValue;

  const expandEnabled = expandJobTitlesValue !== false;

  const [roleFilter, setRoleFilter] = useState({
    include: propValue?.include || [],
    exclude: propValue?.exclude || [],
  });

  const [labelsMap, setLabelsMap] = useState({
    include: propValue?.includeLabels || {},
    exclude: propValue?.excludeLabels || {},
  });

  // ---------- helpers ----------
  const normalizeItem = (item) => {
    // accept raw id or object-like shapes
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

  const notifyChange = (
    nextFilter,
    includeLabelsOverride,
    excludeLabelsOverride
  ) => {
    const includeLabels = includeLabelsOverride ?? labelsMap.include;
    const excludeLabels = excludeLabelsOverride ?? labelsMap.exclude;

    onChange?.({
      include: nextFilter.include,
      exclude: nextFilter.exclude,
      includeLabels,
      excludeLabels,
      // aliases for consistency with your other filters
      includes: nextFilter.include,
      excludes: nextFilter.exclude,
      includesTitles: includeLabels,
      excludesTitles: excludeLabels,
    });
  };

  // ---------- sync from props (merge, don’t wipe) ----------
  useEffect(() => {
    if (!propValue) {
        setRoleFilter({ include: [], exclude: [] });
        setLabelsMap({ include: {}, exclude: {} });
        return;
      }

    const newInclude = (propValue.include || []).map(String);
    const newExclude = (propValue.exclude || []).map(String);
    setRoleFilter({ include: newInclude, exclude: newExclude });

    if (
      propValue.includeLabels &&
      Object.keys(propValue.includeLabels).length
    ) {
      setLabelsMap((prev) => ({
        ...prev,
        include: { ...prev.include, ...propValue.includeLabels },
      }));
    }
    if (
      propValue.excludeLabels &&
      Object.keys(propValue.excludeLabels).length
    ) {
      setLabelsMap((prev) => ({
        ...prev,
        exclude: { ...prev.exclude, ...propValue.excludeLabels },
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(propValue)]);

  // ---------- handlers ----------
  const handleSelect = (type) => (rawItem) => {
    if (!rawItem) return; // ignore clears from autosuggest
    const { id, title } = normalizeItem(rawItem);
    if (id == null) return;

    const idStr = String(id);
    if (roleFilter[type].some((x) => String(x) === idStr)) return; // dedupe

    // 1) compute next filter
    const nextFilter = {
      ...roleFilter,
      [type]: [...roleFilter[type], idStr],
    };

    // 2) compute next labels synchronously
    const nextIncludeLabels =
      type === "include"
        ? { ...labelsMap.include, [idStr]: title || idStr }
        : { ...labelsMap.include };

    const nextExcludeLabels =
      type === "exclude"
        ? { ...labelsMap.exclude, [idStr]: title || idStr }
        : { ...labelsMap.exclude };

    // 3) update local state
    setRoleFilter(nextFilter);
    setLabelsMap({ include: nextIncludeLabels, exclude: nextExcludeLabels });

    // 4) notify parent with the same snapshot (prevents “add → wipe”)
    notifyChange(nextFilter, nextIncludeLabels, nextExcludeLabels);
  };

  const handleRemove = (type) => (idToRemove) => {
    const idStr = String(idToRemove);

    const nextFilter = {
      ...roleFilter,
      [type]: roleFilter[type].filter((x) => String(x) !== idStr),
    };

    const nextIncludeLabels = { ...labelsMap.include };
    const nextExcludeLabels = { ...labelsMap.exclude };
    if (type === "include") delete nextIncludeLabels[idStr];
    else delete nextExcludeLabels[idStr];

    setRoleFilter(nextFilter);
    setLabelsMap({ include: nextIncludeLabels, exclude: nextExcludeLabels });

    notifyChange(nextFilter, nextIncludeLabels, nextExcludeLabels);
  };

  // ---------- render ----------
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
      {/* Include */}
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-[#222222]">Include</p>
        <AutoSuggestInput
          placeholder="Choose past role"
          staticSuggestions={jobTitles} // Use static list like JobTitleFilter
          onSelect={handleSelect("include")}
          selectedItems={roleFilter.include} // IDs array
          allowCustomInput={true} // Allow free text
        />
        <div className="flex flex-wrap gap-2">
          {roleFilter.include.map((id) => {
            const key = String(id);
            const label = labelsMap.include[key] ?? key;
            return (
              <FilterTag
                key={key}
                text={label}
                onRemove={() => handleRemove("include")(key)}
              />
            );
          })}
        </div>
      </div>

      {/* Exclude */}
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-[#222222]">Exclude</p>
        <AutoSuggestInput
          placeholder="Choose past role to Exclude"
          staticSuggestions={jobTitles} // Use static list like JobTitleFilter
          onSelect={handleSelect("exclude")}
          selectedItems={roleFilter.exclude}
          allowCustomInput={true} // Allow free text
        />
        <div className="flex flex-wrap gap-2">
          {roleFilter.exclude.map((id) => {
            const key = String(id);
            const label = labelsMap.exclude[key] ?? key;
            return (
              <FilterTag
                key={key}
                text={label}
                onRemove={() => handleRemove("exclude")(key)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default PastRoleFilter;
