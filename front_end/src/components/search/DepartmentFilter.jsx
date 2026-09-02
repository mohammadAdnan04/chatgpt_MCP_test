"use client";

import React, { useEffect, useState, useMemo } from "react";
import FilterTag from "@/components/search/FilterTag";
import CustomDropdown from "@/components/search/CustomDropdown";

const JOB_FUNCTIONS = [
  "Operations",
  "Business Development",
  "Sales",
  "Education",
  "Engineering",
  "Healthcare Services",
  "Information Technology",
  "Administrative",
  "Arts and Design",
  "Customer Success and Support",
  "Finance",
  "Community and Social Services",
  "Media and Communication",
  "Accounting",
  "Marketing",
  "Human Resources",
  "Research",
  "Program and Project Management",
  "Legal",
  "Military and Protective Services",
  "Consulting",
  "Entrepreneurship",
  "Real Estate",
  "Quality Assurance",
  "Purchasing",
  "Product Management",
  "Leadership"
];

const DepartmentFilter = ({ onChange, value, initialValue }) => {
  // Prefer controlled `value`, else `initialValue`
  const propValue = value || initialValue;

  const [roleFilter, setRoleFilter] = useState({
    include: propValue?.include || [],
    exclude: propValue?.exclude || [],
  });

  const [labelsMap, setLabelsMap] = useState({
    include: propValue?.includeLabels || {},
    exclude: propValue?.excludeLabels || {},
  });

  // Use static list directly
  const suggestionsList = useMemo(() => JOB_FUNCTIONS.map(f => ({ id: f, title: f })), []);

  // Create TITLE_BY_ID map dynamically from suggestions
  const TITLE_BY_ID = useMemo(() => {
    return suggestionsList.reduce((acc, x) => {
      acc[String(x.id)] = x.title;
      return acc;
    }, {});
  }, [suggestionsList]);

  // ---- helpers --------------------------------------------------------------

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
      // aliases to match your other filters
      includes: newFilter.include,
      excludes: newFilter.exclude,
      includesTitles: includeLabels,
      excludesTitles: excludeLabels,
    });
  };

  const backfillLabels = (ids, type) => {
    const next = { ...labelsMap[type] };
    let changed = false;
    ids.forEach((id) => {
      const key = String(id);
      if (!next[key]) {
        next[key] = TITLE_BY_ID[key] || String(key);
        changed = true;
      }
    });
    if (changed) {
      setLabelsMap((prev) => ({ ...prev, [type]: next }));
    }
  };

  // ---- sync from props (merge, don’t wipe) ----------------------------------
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
    } else {
      backfillLabels(newInclude, "include");
    }

    if (
      propValue.excludeLabels &&
      Object.keys(propValue.excludeLabels).length
    ) {
      setLabelsMap((prev) => ({
        ...prev,
        exclude: { ...prev.exclude, ...propValue.excludeLabels },
      }));
    } else {
      backfillLabels(newExclude, "exclude");
    }
  }, [JSON.stringify(propValue), TITLE_BY_ID]);

  const handleSelect = (type, item) => {
    const id = item.id || item;
    if (!id) return;
    if (roleFilter[type].includes(id)) return;

    const newFilter = {
      ...roleFilter,
      [type]: [...roleFilter[type], id],
    };

    const nextIncludeLabels =
      type === "include"
        ? { ...labelsMap.include, [id]: TITLE_BY_ID[id] || id }
        : { ...labelsMap.include };

    const nextExcludeLabels =
      type === "exclude"
        ? { ...labelsMap.exclude, [id]: TITLE_BY_ID[id] || id }
        : { ...labelsMap.exclude };

    setRoleFilter(newFilter);
    setLabelsMap({ include: nextIncludeLabels, exclude: nextExcludeLabels });
    notifyChange(newFilter, nextIncludeLabels, nextExcludeLabels);
  };

  const handleRemove = (type) => (idToRemove) => {
    const id = String(idToRemove);

    const newFilter = {
      ...roleFilter,
      [type]: roleFilter[type].filter((x) => String(x) !== id),
    };

    const nextIncludeLabels = { ...labelsMap.include };
    const nextExcludeLabels = { ...labelsMap.exclude };
    if (type === "include") delete nextIncludeLabels[id];
    else delete nextExcludeLabels[id];

    setRoleFilter(newFilter);
    setLabelsMap({ include: nextIncludeLabels, exclude: nextExcludeLabels });

    notifyChange(newFilter, nextIncludeLabels, nextExcludeLabels);
  };

  // ---- derived (optional: hide already-chosen options) ----------------------
  const includeOptions = useMemo(
    () => suggestionsList.filter((opt) => !roleFilter.include.includes(opt.id)),
    [suggestionsList, roleFilter.include]
  );
  const excludeOptions = useMemo(
    () => suggestionsList.filter((opt) => !roleFilter.exclude.includes(opt.id)),
    [suggestionsList, roleFilter.exclude]
  );

  // ---- render ---------------------------------------------------------------

  return (
    <div className="flex flex-col gap-4">
      {/* Include */}
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-[#222222]">Include</p>
        <CustomDropdown
          title="Choose Department"
          suggestionsList={includeOptions}
          onChange={(item) => handleSelect("include", item)}
        />
        <div className="flex flex-wrap gap-2">
          {roleFilter.include.map((id) => (
            <FilterTag
              key={id}
              text={
                labelsMap.include[String(id)] ||
                TITLE_BY_ID[String(id)] ||
                String(id)
              }
              onRemove={() => handleRemove("include")(id)}
            />
          ))}
        </div>
      </div>

      {/* Exclude section hidden as per API limitations */}
    </div>
  );
};

export default DepartmentFilter;