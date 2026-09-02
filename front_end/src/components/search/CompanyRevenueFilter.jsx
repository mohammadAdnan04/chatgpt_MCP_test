"use client";

import React, { useEffect, useState } from "react";
import FilterTag from "@/components/search/FilterTag";
import CustomDropdown from "@/components/search/CustomDropdown";

// Static options
const suggestionsList = [
  { id: "0-1000000", title: "$0 - $1M" },
  { id: "1000000-10000000", title: "$1M - $10M" },
  { id: "10000000-50000000", title: "$10M - $50M" },
  { id: "50000000-100000000", title: "$50M - $100M" },
  { id: "100000000-500000000", title: "$100M - $500M" },
  { id: "500000000-1000000000", title: "$500M - $1B" },
  { id: "1000000000+", title: "$1B+" },
];

// Build a quick lookup map for ids -> titles
const TITLE_BY_ID = suggestionsList.reduce((acc, x) => {
  acc[String(x.id)] = x.title;
  return acc;
}, {});

const CompanyRevenueFilter = ({ onChange, value, initialValue }) => {
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
    
    // We only support ONE selection for Revenue range usually, 
    // but the API supports min/max so single range is best.
    // If the UI allows multiple, we must decide how to combine them.
    // For now, let's just pass the array.
    
    onChange?.({
        include: ids,
        includeLabels: labels,
        // Ensure this structure matches what FilterPanel expects for "isObject: true"
        // It seems FilterPanel might be expecting "include" directly or the object itself.
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
        title="Choose Revenue Range"
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

export default CompanyRevenueFilter;
