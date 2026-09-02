"use client";

import React, { useEffect, useState } from "react";
import FilterTag from "@/components/search/FilterTag";
import CustomDropdown from "@/components/search/CustomDropdown";

// Static options
const suggestionsList = [
  { id: "1-10", title: "1-10" },
  { id: "11-50", title: "11-50" },
  { id: "51-200", title: "51-200" },
  { id: "201-500", title: "201-500" },
  { id: "501-1000", title: "501-1000" },
  { id: "1001-5000", title: "1001-5000" },
  { id: "5001-10000", title: "5001-10000" },
  { id: "10,001+", title: "10,001+" },
];

// Build a quick lookup map for ids -> titles
const TITLE_BY_ID = suggestionsList.reduce((acc, x) => {
  acc[String(x.id)] = x.title;
  return acc;
}, {});

const NoOfEmployees = ({ onChange, value, initialValue }) => {
  // Initialize from props (prefer controlled `value`, else `initialValue`)
  const propValue = value || initialValue;

  const [selectedIds, setSelectedIds] = useState(
    (propValue?.selectedIds || propValue?.include || []).map((x) => String(x))
  );

  const [labelsMap, setLabelsMap] = useState({
    ...(propValue?.labelsMap || propValue?.includeLabels || {}),
  });

  // ---- helpers --------------------------------------------------------------

  const notifyChange = (ids, labelsOverride) => {
    const labels = labelsOverride ?? labelsMap;
    onChange?.({
      selectedIds: ids,
      labelsMap: labels,
      // legacy aliases to mirror your other component’s payload
      include: ids,
      includeLabels: labels,
      includes: ids,
      includesTitles: labels,
    });
  };

  const ensureLabelsFor = (ids) => {
    // Backfill any missing labels from static list
    const next = { ...labelsMap };
    let changed = false;
    ids.forEach((id) => {
      const key = String(id);
      if (!next[key]) {
        next[key] = TITLE_BY_ID[key] || String(id);
        changed = true;
      }
    });
    if (changed) setLabelsMap(next);
    return changed ? next : labelsMap;
  };

  // ---- sync from props (merge, don’t wipe) ----------------------------------

    useEffect(() => {
      if (!propValue) {
        setSelectedIds([]);
        setLabelsMap({});
        return;
      }

      const nextIds = (propValue.selectedIds || propValue.include || []).map((x) =>
      String(x)
    );
    setSelectedIds(nextIds);

    // Merge provided labels or backfill from static list
    if (propValue.labelsMap && Object.keys(propValue.labelsMap).length) {
      setLabelsMap((prev) => ({ ...prev, ...propValue.labelsMap }));
    } else {
      const missing = nextIds.filter((id) => !labelsMap[String(id)]);
      if (missing.length) {
        const next = { ...labelsMap };
        missing.forEach((id) => {
          next[String(id)] = TITLE_BY_ID[String(id)] || String(id);
        });
        setLabelsMap(next);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(propValue)]);

  // ---- handlers -------------------------------------------------------------

  // const handleSelect = (e) => {
  //   const id = String(e.target.value || "");
  //   if (!id) return;
  //   if (selectedIds.includes(id)) {
  //     e.target.value = "";
  //     return;
  //   }

  //   const newIds = [...selectedIds, id];
  //   const nextLabels = {
  //     ...labelsMap,
  //     [id]: labelsMap[id] || TITLE_BY_ID[id] || id,
  //   };

  //   setSelectedIds(newIds);
  //   setLabelsMap(nextLabels);
  //   notifyChange(newIds, nextLabels);

  //   // reset dropdown
  //   e.target.value = "";
  // };
  const handleSelect = (item) => {
    const id = String(item.id || "");
    if (!id) return;
    if (selectedIds.includes(id)) {
      return;
    }

    const newIds = [...selectedIds, id];
    const nextLabels = {
      ...labelsMap,
      [id]: labelsMap[id] || item.title || TITLE_BY_ID[id] || id,
    };

    setSelectedIds(newIds);
    setLabelsMap(nextLabels);
    notifyChange(newIds, nextLabels);
  };

  const handleRemove = (idToRemove) => {
    const id = String(idToRemove);
    const newIds = selectedIds.filter((x) => x !== id);

    // keep labels around (helps if parent rehydrates), or delete if you prefer:
    const nextLabels = { ...labelsMap };
    delete nextLabels[id];

    setSelectedIds(newIds);
    setLabelsMap(nextLabels);
    notifyChange(newIds, nextLabels);
  };

  // ---- render ---------------------------------------------------------------

  return (
    <div className="flex flex-col gap-4">
      {/* <select
        className="input__field !bg-transparent w-full filter-dropdown"
        onChange={handleSelect}
        defaultValue=""
      >
        <option value="" disabled>
          Choose # of Employees
        </option>
        {suggestionsList.map((item) => (
          <option key={item.id} value={item.id}>
            {item.title}
          </option>
        ))}
      </select> */}
      <CustomDropdown
        title="Choose # of Employees"
        suggestionsList={suggestionsList}
        onChange={handleSelect}
      />

      <div className="flex flex-wrap gap-2">
        {selectedIds.map((id) => (
          <FilterTag
            key={id}
            text={labelsMap[id] || TITLE_BY_ID[id] || id}
            onRemove={() => handleRemove(id)}
          />
        ))}
      </div>
    </div>
  );
};

export default NoOfEmployees;
