"use client";

import React, { useEffect, useState } from "react";
import FilterTag from "@/components/search/FilterTag";
import AutoSuggestInput from "@/components/search/AutoSuggestInput";

const PastCompanyFilter = ({ onChange, value, initialValue }) => {
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
    // Accept raw id (string/number) or object-like shapes
    if (item !== null && typeof item !== "object") {
      return { id: item, title: String(item) };
    }
    const id =
      item?.id ??
      item?.domain ??
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
    if (!rawItem) return; // ignore clears from autosuggest
    let { id, title } = normalizeItem(rawItem);
    if (id == null) return;

    // If it's a custom input (doesn't contain |||) we format it so backend knows it's a custom name
    if (typeof id === 'string' && !id.includes('|||')) {
        let namePart = id;
        if (id.includes('.') && !id.includes(' ')) {
            namePart = id.split('.')[0];
            namePart = namePart.charAt(0).toUpperCase() + namePart.slice(1);
        }
        id = `${namePart}|||${id}`;
    }

    const idStr = String(id);
    if (roleFilter[type].some((x) => String(x) === idStr)) return; // dedupe

    // 1) compute next filter
    const nextFilter = {
      ...roleFilter,
      [type]: [...roleFilter[type], idStr],
    };

    // 2) compute next label maps synchronously
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
          placeholder="Choose Past Company"
          apiUrl={`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/proxy/companies/suggest`}
          queryParam="q"
          accountId="oUYAc-QUQTmxK3_yq9iL4Q"
          onSelect={handleSelect("include")}
          responseSuggestions={(res) => {
            return (res.data || []).map((item) => ({
              id: `${item.name}|||${item.domain || item.name}`, // Concatenate Name and Domain for Middleware parsing
              title: item.name,
              name: item.name,
              domain: item.domain,
              logo: item.logo,
            }));
          }}
          selectedItems={roleFilter.include}
          showLogo={true}
          allowCustomInput={true}
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
          placeholder="Choose Past Company to Exclude"
          apiUrl={`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/proxy/companies/suggest`}
          queryParam="q"
          accountId="oUYAc-QUQTmxK3_yq9iL4Q"
          onSelect={handleSelect("exclude")}
          responseSuggestions={(res) => {
            return (res.data || []).map((item) => ({
              id: `${item.name}|||${item.domain || item.name}`, // Concatenate Name and Domain for Middleware parsing
              title: item.name,
              name: item.name,
              domain: item.domain,
              logo: item.logo,
            }));
          }}
          selectedItems={roleFilter.exclude}
          showLogo={true}
          allowCustomInput={true}
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

export default PastCompanyFilter;
