"use client";

import React, { useEffect, useMemo, useState } from "react";
import FilterTag from "@/components/search/FilterTag";
import CustomDropdown from "@/components/search/CustomDropdown";

// Static options
const suggestionsList = [
  { id: "en", title: "English" },
  { id: "es", title: "Spanish" },
  { id: "fr", title: "French" },
  { id: "de", title: "German" },
  { id: "it", title: "Italian" },
  { id: "pt", title: "Portuguese" },
  { id: "ru", title: "Russian" },
  { id: "zh", title: "Chinese" },
  { id: "ja", title: "Japanese" },
  { id: "ko", title: "Korean" },
  { id: "ar", title: "Arabic" },
  { id: "hi", title: "Hindi" },
  { id: "bn", title: "Bengali" },
  { id: "pa", title: "Punjabi" },
  { id: "jv", title: "Javanese" },
  { id: "te", title: "Telugu" },
  { id: "vi", title: "Vietnamese" },
  { id: "mr", title: "Marathi" },
  { id: "ta", title: "Tamil" },
  { id: "tr", title: "Turkish" },
  { id: "nl", title: "Dutch" },
  { id: "pl", title: "Polish" },
  { id: "sv", title: "Swedish" },
  { id: "fi", title: "Finnish" },
  { id: "da", title: "Danish" },
  { id: "no", title: "Norwegian" },
  { id: "el", title: "Greek" },
  { id: "he", title: "Hebrew" },
  { id: "id", title: "Indonesian" },
  { id: "ms", title: "Malay" },
  { id: "th", title: "Thai" },
];

// id -> title map
const TITLE_BY_ID = suggestionsList.reduce((acc, x) => {
  acc[String(x.id)] = x.title;
  return acc;
}, {});

const LanguagesFilter = ({ onChange, value, initialValue }) => {
  // Prefer controlled `value`, else `initialValue`
  const propValue = value || initialValue;

  // Keep IDs as strings
  const [selectedIds, setSelectedIds] = useState(
    (propValue?.selectedIds || propValue?.include || []).map((x) => String(x))
  );
  const [labelsMap, setLabelsMap] = useState({
    ...(propValue?.labelsMap || propValue?.includeLabels || {}),
  });

  // ---- helpers ----
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

  // ---- sync from props (merge, don’t wipe) ----
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

  // ---- handlers ----
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

  // ---- render ----
  return (
    <div className="flex flex-col gap-4">
      {/* <select
        className="input__field !bg-transparent w-full"
        onChange={handleSelect}
        defaultValue=""
      >
        <option value="" disabled>
          Choose language
        </option>
        {availableOptions.map((item) => (
          <option key={item.id} value={item.id}>
            {item.title}
          </option>
        ))}
      </select> */}
      <CustomDropdown
        title=" Choose language"
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

export default LanguagesFilter;
