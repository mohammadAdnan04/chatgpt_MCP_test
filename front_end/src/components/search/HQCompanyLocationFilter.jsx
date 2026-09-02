"use client";

import React, { useEffect, useState } from "react";
import FilterTag from "@/components/search/FilterTag";
import AutoSuggestInput from "@/components/search/AutoSuggestInput";

const HQCompanyLocationFilter = ({ onChange, value, initialValue, searchMode }) => {
  // Prefer controlled `value`, else `initialValue`
  const propValue = value || initialValue;
  // Per instruction: Disable exclude for HQ Location filter
  const showExclude = false;

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
    // Accept raw id or object-like shapes
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
    newFilter,
    includeLabelsOverride,
    excludeLabelsOverride
  ) => {
    if (!onChange) return;
    const includeLabels = includeLabelsOverride ?? labelsMap.include;
    const excludeLabels = excludeLabelsOverride ?? labelsMap.exclude;

    onChange({
      include: newFilter.include,
      exclude: newFilter.exclude,
      includeLabels,
      excludeLabels,
      // aliases to mirror your other filters
      includes: newFilter.include,
      excludes: newFilter.exclude,
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
    if (!rawItem) return; // ignore clears from AutoSuggestInput
    const { id, title } = normalizeItem(rawItem);
    if (id == null) return;

    const idStr = String(id);
    if (roleFilter[type].some((x) => String(x) === idStr)) return; // dedupe

    // 1) compute next filter
    const newFilter = {
      ...roleFilter,
      [type]: [...roleFilter[type], idStr],
    };

    // 2) compute next labels (sync)
    const nextIncludeLabels =
      type === "include"
        ? { ...labelsMap.include, [idStr]: title || idStr }
        : { ...labelsMap.include };

    const nextExcludeLabels =
      type === "exclude"
        ? { ...labelsMap.exclude, [idStr]: title || idStr }
        : { ...labelsMap.exclude };

    // 3) update local state
    setRoleFilter(newFilter);
    setLabelsMap({ include: nextIncludeLabels, exclude: nextExcludeLabels });

    // 4) notify parent with the same snapshot (prevents “add then vanish”)
    notifyChange(newFilter, nextIncludeLabels, nextExcludeLabels);
  };

  const handleRemove = (type) => (idToRemove) => {
    const idStr = String(idToRemove);

    const newFilter = {
      ...roleFilter,
      [type]: roleFilter[type].filter((x) => String(x) !== idStr),
    };

    const nextIncludeLabels = { ...labelsMap.include };
    const nextExcludeLabels = { ...labelsMap.exclude };
    if (type === "include") delete nextIncludeLabels[idStr];
    else delete nextExcludeLabels[idStr];

    setRoleFilter(newFilter);
    setLabelsMap({ include: nextIncludeLabels, exclude: nextExcludeLabels });

    notifyChange(newFilter, nextIncludeLabels, nextExcludeLabels);
  };

  // Use the standard relative path. axiosInstance will prepend the correct baseURL.
  // This avoids hardcoding the URL in the component logic.
  const API_ENDPOINT = "/search-ids/countries";

  return (
    <div className="flex flex-col gap-4">
      {/* Include */}
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-[#222222]">Include</p>
        <AutoSuggestInput
          placeholder="Choose Location"
          apiUrl={API_ENDPOINT}
          accountId="oUYAc-QUQTmxK3_yq9iL4Q"
          onSelect={handleSelect("include")}
          responseSuggestions={(res) => res?.data?.data} // expects array of {id,title}
          selectedItems={roleFilter.include} // IDs array (like your JobTitleFilter)
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
      {showExclude && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-[#222222]">Exclude</p>
          <AutoSuggestInput
            placeholder="Choose Location to Exclude"
            apiUrl={API_ENDPOINT}
            accountId="oUYAc-QUQTmxK3_yq9iL4Q"
            onSelect={handleSelect("exclude")}
            responseSuggestions={(res) => res?.data?.data}
            selectedItems={roleFilter.exclude}
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
      )}
    </div>
  );
};

export default HQCompanyLocationFilter;
