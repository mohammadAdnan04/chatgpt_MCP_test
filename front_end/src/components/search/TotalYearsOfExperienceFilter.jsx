"use client";

import React, { useEffect, useMemo, useState } from "react";
import FilterTag from "@/components/search/FilterTag";
import CustomDropdown from "@/components/search/CustomDropdown";

// Static options
const suggestionsList = [
  { id: "Less than 1 year", title: "Less than 1 year" },
  { id: "1 to 2 years", title: "1 to 2 years" },
  { id: "3 to 5 years", title: "3 to 5 years" },
  { id: "6 to 10 years", title: "6 to 10 years" },
  { id: "More than 10 years", title: "More than 10 years" },
];

// id -> title map
const TITLE_BY_ID = suggestionsList.reduce((acc, x) => {
  acc[String(x.id)] = x.title;
  return acc;
}, {});

const TotalYearsOfExperienceFilter = ({ onChange, value, initialValue }) => {
  // Prefer controlled `value`, else `initialValue`
  const propValue = value || initialValue;

  // Keep IDs as strings
  const [selectedIds, setSelectedIds] = useState(
    (propValue?.selectedIds || propValue?.include || []).map((x) => String(x))
  );
  const [labelsMap, setLabelsMap] = useState({
    ...(propValue?.labelsMap || propValue?.includeLabels || {}),
  });

  // ----- helpers -----
  const notifyChange = (ids, labelsOverride) => {
    const labels = labelsOverride ?? labelsMap;
    onChange?.({
      selectedIds: ids,
      labelsMap: labels,
      // aliases to match your other filters
      include: ids,
      includeLabels: labels,
      includes: ids,
      includesTitles: labels,
    });
  };

  const backfillLabels = (ids) => {
    const next = { ...labelsMap };
    let changed = false;
    ids.forEach((id) => {
      const k = String(id);
      if (!next[k]) {
        next[k] = TITLE_BY_ID[k] || k;
        changed = true;
      }
    });
    if (changed) setLabelsMap(next);
    return changed ? next : labelsMap;
  };

  // ----- sync from props (merge, don’t wipe) -----
  useEffect(() => {
    if (!propValue) {
        setSelectedIds([]);
        setLabelsMap({});
        return;
      }

    const nextIds = (propValue.selectedIds || propValue.include || []).map(
      String
    );
    setSelectedIds(nextIds);

    if (propValue.labelsMap && Object.keys(propValue.labelsMap).length) {
      setLabelsMap((prev) => ({ ...prev, ...propValue.labelsMap }));
    } else {
      backfillLabels(nextIds);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(propValue)]);

  // ----- handlers -----
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

    const nextLabels = { ...labelsMap };
    delete nextLabels[id]; // optional tidy-up

    setSelectedIds(newIds);
    setLabelsMap(nextLabels);
    notifyChange(newIds, nextLabels);
  };

  // Optional: hide already-selected options
  const availableOptions = useMemo(
    () => suggestionsList.filter((o) => !selectedIds.includes(String(o.id))),
    [selectedIds]
  );

  // ----- render -----
  return (
    <div className="flex flex-col gap-4">
      {/* <select
        className="input__field !bg-transparent w-full"
        onChange={handleSelect}
        defaultValue=""
      >
        <option value="" disabled>
          Choose total years of experience
        </option>
        {availableOptions.map((item) => (
          <option key={item.id} value={item.id}>
            {item.title}
          </option>
        ))}
      </select> */}
      <CustomDropdown
        title="Choose total years of experience"
        suggestionsList={availableOptions}
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

export default TotalYearsOfExperienceFilter;
