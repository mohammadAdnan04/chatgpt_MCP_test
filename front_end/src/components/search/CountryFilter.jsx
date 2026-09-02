"use client";

import React, { useEffect, useState } from "react";
import FilterTag from "@/components/search/FilterTag";
import AutoSuggestInput from "@/components/search/AutoSuggestInput";

const CountryFilter = ({ onChange, value, initialValue, searchMode }) => {
  // Prefer fully controlled `value`, else fall back to `initialValue`
  const propValue = value || initialValue;
  // Per instruction: Disable exclude for country filter in both searches (or just hide it)
  // User said "in the people search ... we dont want those filters to have exculdes too"
  // This implies exclude is now hidden for EVERYONE for Country.
  const showExclude = false;

  const [roleFilter, setRoleFilter] = useState({
    include: propValue?.include || [],
    exclude: propValue?.exclude || [],
  });

  const [selectedItemsMap, setSelectedItemsMap] = useState({
    include: propValue?.includeLabels || {},
    exclude: propValue?.excludeLabels || {},
  });

  // ---------- helpers ----------

  const normalizeItem = (item) => {
    // Accept raw id or object-ish shapes
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
    const includeLabels = includeLabelsOverride ?? selectedItemsMap.include;
    const excludeLabels = excludeLabelsOverride ?? selectedItemsMap.exclude;

    onChange({
      // primary keys
      include: newFilter.include,
      exclude: newFilter.exclude,
      includeLabels,
      excludeLabels,
      // legacy/alias keys (to mirror your JobTitleFilter payload)
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
        setSelectedItemsMap({ include: {}, exclude: {} });
        return;
      }

    const newInclude = propValue.include || [];
    const newExclude = propValue.exclude || [];
    setRoleFilter({ include: newInclude, exclude: newExclude });

    // Merge any provided labels; otherwise keep existing ones
    if (
      propValue.includeLabels &&
      Object.keys(propValue.includeLabels).length
    ) {
      setSelectedItemsMap((prev) => ({
        ...prev,
        include: { ...prev.include, ...propValue.includeLabels },
      }));
    }

    if (
      propValue.excludeLabels &&
      Object.keys(propValue.excludeLabels).length
    ) {
      setSelectedItemsMap((prev) => ({
        ...prev,
        exclude: { ...prev.exclude, ...propValue.excludeLabels },
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(propValue)]);

  // ---------- handlers ----------

  const handleSelect = (type) => (rawItem) => {
    const { id, title } = normalizeItem(rawItem);
    if (id == null) return;

    // Avoid duplicates (string-compare)
    if (roleFilter[type].some((x) => String(x) === String(id))) return;

    // 1) compute next filter
    const newFilter = {
      ...roleFilter,
      [type]: [...roleFilter[type], id],
    };

    // 2) compute next label maps synchronously
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

    // 3) update local state
    setRoleFilter(newFilter);
    setSelectedItemsMap({
      include: nextIncludeLabels,
      exclude: nextExcludeLabels,
    });

    // 4) notify parent with the computed payload (prevents “add then wipe”)
    notifyChange(newFilter, nextIncludeLabels, nextExcludeLabels);
  };

  const handleRemove = (type) => (idToRemove) => {
    const newFilter = {
      ...roleFilter,
      [type]: roleFilter[type].filter((x) => String(x) !== String(idToRemove)),
    };

    const nextIncludeLabels = { ...selectedItemsMap.include };
    const nextExcludeLabels = { ...selectedItemsMap.exclude };
    if (type === "include") delete nextIncludeLabels[String(idToRemove)];
    else delete nextExcludeLabels[String(idToRemove)];

    setRoleFilter(newFilter);
    setSelectedItemsMap({
      include: nextIncludeLabels,
      exclude: nextExcludeLabels,
    });

    notifyChange(newFilter, nextIncludeLabels, nextExcludeLabels);
  };

  // ---------- render ----------

  // Use the standard relative path. axiosInstance will prepend the correct baseURL.
  // This avoids hardcoding the URL in the component logic.
  const API_ENDPOINT = "/search-ids/countries";

  return (
    <div className="flex flex-col gap-4">
      {/* Include */}
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-[#222222]">Include</p>
        <AutoSuggestInput
          placeholder="Choose Country"
          apiUrl={API_ENDPOINT}
          accountId="oUYAc-QUQTmxK3_yq9iL4Q"
          onSelect={handleSelect("include")}
          responseSuggestions={(res) => res?.data?.data} // expects array of {id,title}
          selectedItems={roleFilter.include} // IDs array (like your JobTitleFilter)
        />
        <div className="flex flex-wrap gap-2">
          {roleFilter.include.map((id) => {
            const label = selectedItemsMap.include[String(id)] || String(id);
            return (
              <FilterTag
                key={String(id)}
                text={label}
                onRemove={() => handleRemove("include")(id)}
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
            placeholder="Choose Country to Exclude"
            apiUrl={API_ENDPOINT}
            accountId="oUYAc-QUQTmxK3_yq9iL4Q"
            onSelect={handleSelect("exclude")}
            responseSuggestions={(res) => res?.data?.data}
            selectedItems={roleFilter.exclude}
          />
          <div className="flex flex-wrap gap-2">
            {roleFilter.exclude.map((id) => {
              const label = selectedItemsMap.exclude[String(id)] || String(id);
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
      )}
    </div>
  );
};

export default CountryFilter;
