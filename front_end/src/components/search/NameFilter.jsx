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
    <div className="relative w-full">
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

const NameFilter = ({
  firstNameValue,
  lastNameValue,
  exactMatchEnabled,
  onChangeFirstName,
  onChangeLastName,
  onChangeExactMatch,
}) => {
  const propFirst = (typeof firstNameValue === "string" && firstNameValue) || "";
  const propLast = (typeof lastNameValue === "string" && lastNameValue) || "";

  const [selectedFirst, setSelectedFirst] = useState(propFirst);
  const [selectedLast, setSelectedLast] = useState(propLast);

  useEffect(() => {
    setSelectedFirst(propFirst || "");
  }, [propFirst]);

  useEffect(() => {
    setSelectedLast(propLast || "");
  }, [propLast]);

  const notifyChangeFirst = (next) => {
    onChangeFirstName?.(next || "");
  };

  const notifyChangeLast = (next) => {
    onChangeLastName?.(next || "");
  };

  const handleSelectFirst = (val) => {
    const next = String(val || "").trim();
    if (!next || next === selectedFirst) return;
    setSelectedFirst(next);
    notifyChangeFirst(next);
  };

  const handleSelectLast = (val) => {
    const next = String(val || "").trim();
    if (!next || next === selectedLast) return;
    setSelectedLast(next);
    notifyChangeLast(next);
  };

  const handleRemoveFirst = () => {
    setSelectedFirst("");
    notifyChangeFirst("");
  };

  const handleRemoveLast = () => {
    setSelectedLast("");
    notifyChangeLast("");
  };

  const selectedFirstItems = selectedFirst ? [selectedFirst] : [];
  const selectedLastItems = selectedLast ? [selectedLast] : [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col">
          <span className="text-xs text-[#434343] font-medium">Exact Match</span>
          <span className="text-[10px] text-[#6B7271]">
            When enabled, requires an exact match for first/last name.
          </span>
        </div>
        <button
          type="button"
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ${
            exactMatchEnabled ? "bg-[#04145C]" : "bg-[#E5E6E6]"
          }`}
          onClick={() => {
            if (!onChangeExactMatch) return;
            if (exactMatchEnabled) onChangeExactMatch(false);
            else onChangeExactMatch(true); // true means strict matching
          }}
          aria-pressed={exactMatchEnabled}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform duration-200 ${
              exactMatchEnabled ? "translate-x-5" : "translate-x-1"
            }`}
          />
        </button>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          <AutoSuggestInput
            placeholder="Enter First Name"
            onSelect={handleSelectFirst}
            selectedItems={selectedFirstItems}
          />
          <div className="flex flex-wrap gap-2">
            {selectedFirst && (
              <FilterTag key={`first-${selectedFirst}`} text={`First: ${selectedFirst}`} onRemove={handleRemoveFirst} />
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <AutoSuggestInput
            placeholder="Enter Last Name"
            onSelect={handleSelectLast}
            selectedItems={selectedLastItems}
          />
          <div className="flex flex-wrap gap-2">
            {selectedLast && (
              <FilterTag key={`last-${selectedLast}`} text={`Last: ${selectedLast}`} onRemove={handleRemoveLast} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default NameFilter;