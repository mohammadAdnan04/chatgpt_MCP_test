"use client";

import React, { useEffect, useState } from "react";
import FilterTag from "@/components/search/FilterTag";
import AutoSuggestInput from "@/components/search/AutoSuggestInput";

const UniversityFilter = ({ onChange, value, initialValue }) => {
  // Prefer fully controlled `value`, else `initialValue`
  const propValue = value || initialValue;

  const [roleFilter, setRoleFilter] = useState({
    include: propValue?.include || [],
    exclude: propValue?.exclude || [],
  });

  const [labelsMap, setLabelsMap] = useState({
    include: propValue?.includeLabels || {},
    exclude: propValue?.excludeLabels || {},
  });

  // ----- helpers -------------------------------------------------------------

  const normalizeItem = (item) => {
    // Accept raw id or various shapes from your autosuggest
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
      // aliases to match your other filters
      includes: nextFilter.include,
      excludes: nextFilter.exclude,
      includesTitles: includeLabels,
      excludesTitles: excludeLabels,
    });
  };

  // ----- sync from props (merge, don’t wipe) ---------------------------------
  useEffect(() => {
    if (!propValue) {
        setRoleFilter({ include: [], exclude: [] });
        setLabelsMap({ include: {}, exclude: {} });
        return;
      }

    const newInclude = (propValue.include || []).map(String);
    const newExclude = (propValue.exclude || []).map(String);
    setRoleFilter({ include: newInclude, exclude: newExclude });

    // Merge provided labels; otherwise keep existing (or let select-time fill them)
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

  // ----- handlers ------------------------------------------------------------

  const handleSelect = (type) => (rawItem) => {
    if (!rawItem) return; // ignore clears from AutoSuggestInput
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

  // ----- render --------------------------------------------------------------

  return (
    <div className="flex flex-col gap-4">
      {/* Include */}
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-[#222222]">Include</p>
        <AutoSuggestInput
          placeholder="Choose University"
          apiUrl="https://menasearch.mawsool.tech/search/education/suggest"
          queryParam="q"
          accountId="oUYAc-QUQTmxK3_yq9iL4Q"
          onSelect={handleSelect("include")}
          responseSuggestions={(res) => {
            // The API returns an array directly: [{ name: "...", student_count: ... }]
            const list = Array.isArray(res) ? res : (res?.data || []);
            return list.map((item) => ({
              id: item.name,
              title: item.name,
              student_count: item.student_count
            }));
          }}
          selectedItems={roleFilter.include} // IDs array
          allowCustomInput={true} // Allow free text input
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

      {/* Exclude section hidden as per API limitations for 'educations' parameter */}
    </div>
  );
};

export default UniversityFilter;
