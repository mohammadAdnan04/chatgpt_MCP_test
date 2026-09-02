"use client";

import React, { useEffect, useState } from "react";
import FilterTag from "@/components/search/FilterTag";
import CustomDropdown from "@/components/search/CustomDropdown";

// Static options
const suggestionsList = [
  { id: "2020-2025", title: "2020-2025" },
  { id: "2010-2020", title: "2010-2020" },
  { id: "2000-2010", title: "2000-2010" },
  { id: "1990-2000", title: "1990-2000" },
  { id: "0-1990", title: "Before 1990" },
];

// Build a quick lookup map for ids -> titles
const TITLE_BY_ID = suggestionsList.reduce((acc, x) => {
  acc[String(x.id)] = x.title;
  return acc;
}, {});

const CompanyFoundedYearFilter = ({ onChange, value, initialValue }) => {
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
      includes: ids, // Added includes for compatibility with FilterPanel
      includeLabels: labels,
    });
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
      <CustomDropdown
        title="Choose Founded Year Range"
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

export default CompanyFoundedYearFilter;
