"use client";

import React, { useEffect, useState, useMemo } from "react";
import FilterTag from "@/components/search/FilterTag";
import CustomDropdown from "@/components/search/CustomDropdown";

const SENIORITY_LEVELS = [
  "Owner / Founder",
  "CXO",
  "Partner",
  "VP",
  "Head",
  "Director",
  "Manager",
  "Senior",
  "Entry",
  "Intern"
];

const SeniorityLevelFilter = ({ onChange, value, initialValue }) => {
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
  const suggestionsList = useMemo(() => SENIORITY_LEVELS.map(s => ({ id: s, title: s })), []);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(propValue), TITLE_BY_ID]);

  // ---- handlers -------------------------------------------------------------

  // const handleSelect = (type) => (e) => {
  //   const id = String(e.target.value || "");
  //   if (!id) return;

  //   if (roleFilter[type].some((x) => String(x) === id)) {
  //     e.target.value = "";
  //     return;
  //   }

  //   // 1) compute next filter
  //   const newFilter = {
  //     ...roleFilter,
  //     [type]: [...roleFilter[type], id],
  //   };

  //   // 2) compute next labels
  //   const nextIncludeLabels =
  //     type === "include"
  //       ? {
  //           ...labelsMap.include,
  //           [id]: labelsMap.include[id] || TITLE_BY_ID[id] || id,
  //         }
  //       : { ...labelsMap.include };

  //   const nextExcludeLabels =
  //     type === "exclude"
  //       ? {
  //           ...labelsMap.exclude,
  //           [id]: labelsMap.exclude[id] || TITLE_BY_ID[id] || id,
  //         }
  //       : { ...labelsMap.exclude };

  //   // 3) update state
  //   setRoleFilter(newFilter);
  //   setLabelsMap({ include: nextIncludeLabels, exclude: nextExcludeLabels });

  //   // 4) notify parent with computed snapshot (prevents flicker)
  //   notifyChange(newFilter, nextIncludeLabels, nextExcludeLabels);

  //   // reset dropdown
  //   e.target.value = "";
  // };
  const handleSelect = (type, item) => {
    const id = item.id || item;
    if (!id) return;
    const normId = String(id);
    if (roleFilter[type].includes(normId)) return;

    const newFilter = {
      ...roleFilter,
      [type]: [...roleFilter[type], normId],
    };

    const nextIncludeLabels =
      type === "include"
        ? { ...labelsMap.include, [normId]: TITLE_BY_ID[normId] || normId }
        : { ...labelsMap.include };

    const nextExcludeLabels =
      type === "exclude"
        ? { ...labelsMap.exclude, [normId]: TITLE_BY_ID[normId] || normId }
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
          title="Choose Seniority"
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

export default SeniorityLevelFilter;
