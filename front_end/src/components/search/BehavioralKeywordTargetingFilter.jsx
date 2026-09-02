"use client";

import React, { useEffect, useState } from "react";
import FilterTag from "@/components/search/FilterTag";

/** Lightweight local autosuggest for free-text keywords */
const AutoSuggestInput = ({ placeholder, onSelect, selectedItems = [] }) => {
  const [input, setInput] = useState("");
  const [suggestions, setSuggestions] = useState([]);

  const handleChange = (e) => {
    const value = e.target.value;
    setInput(value);

    const v = value.trim();
    if (v.length > 0 && !selectedItems.includes(v)) {
      setSuggestions([v]);
    } else {
      setSuggestions([]);
    }
  };

  const handleSelect = (value) => {
    if (!selectedItems.includes(value)) {
      onSelect?.(value);
    }
    setInput("");
    setSuggestions([]);
  };

  return (
    <div className="relative">
      <input
        type="text"
        placeholder={placeholder}
        value={input}
        onChange={handleChange}
        className="input__field !bg-transparent w-full"
      />
      {suggestions.length > 0 && (
        <div className="autosuggestion absolute z-10 bg-white border rounded shadow w-full mt-1 max-h-60 overflow-y-auto">
          {suggestions.map((item, index) => (
            <div
              key={index}
              className="px-3 py-2 text-sm hover:bg-gray-100 cursor-pointer"
              onClick={() => handleSelect(item)}
            >
              {item}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const BehavioralKeywordTargetingFilter = ({
  onChange,
  value,
  initialValue,
}) => {
  // Extract array of strings from props
  const getArrayValue = (val) => {
    if (Array.isArray(val)) return val;
    if (typeof val === "string" && val.trim() !== "") return [val];
    return [];
  };

  const propValue = getArrayValue(value || initialValue);

  // Keep internal selection as an array of strings
  const [selected, setSelected] = useState(propValue);

  // Sync from props
  useEffect(() => {
    setSelected(getArrayValue(value || initialValue));
  }, [value, initialValue]);

  // Notify parent
  const notifyChange = (next) => {
    onChange?.(next.length > 0 ? next : "");
  };

  const handleSelect = (val) => {
    const nextItem = String(val || "").trim();
    if (!nextItem || selected.includes(nextItem)) return;

    const nextSelected = [...selected, nextItem];
    setSelected(nextSelected);
    notifyChange(nextSelected);
  };

  const handleRemove = (valToRemove) => {
    const nextSelected = selected.filter((item) => item !== valToRemove);
    setSelected(nextSelected);
    notifyChange(nextSelected);
  };

  return (
    <div className="flex flex-col gap-4">
      <AutoSuggestInput
        placeholder="Enter keywords"
        onSelect={handleSelect}
        selectedItems={selected}
      />

      <div className="flex flex-wrap gap-2">
        {selected.map((item) => (
          <FilterTag key={item} text={item} onRemove={() => handleRemove(item)} />
        ))}
      </div>
    </div>
  );
};

export default BehavioralKeywordTargetingFilter;
