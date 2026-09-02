"use client";

import React, { useEffect, useState } from "react";
import FilterTag from "@/components/search/FilterTag";

// Static Dropdown Options
const suggestionsList = [
  { id: "yes", title: "Yes", value: true },
  { id: "no", title: "No", value: false },
];

const JobChangeFilter = ({ onChange, value }) => {
  const [selectedValue, setSelectedValue] = useState("");

  // Sync internal state with prop value
  useEffect(() => {
    if (value === true) setSelectedValue("yes");
    else if (value === false) setSelectedValue("no");
    else setSelectedValue("");
  }, [value]);

  const handleSelect = (e) => {
    const val = e.target.value;
    setSelectedValue(val);
    
    if (val === "yes") onChange(true);
    else if (val === "no") onChange(false);
    else onChange(null);
  };

  const handleRemove = () => {
    setSelectedValue("");
    onChange(null);
  };

  const displayValue = selectedValue === "yes" ? "Yes" : selectedValue === "no" ? "No" : "";

  return (
    <div className="flex flex-col gap-4">
      {!selectedValue && (
        <select
          className="input__field !bg-transparent w-full"
          onChange={handleSelect}
          value=""
        >
          <option value="" disabled>
            Changed jobs in past 90 days?
          </option>
          {suggestionsList.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title}
            </option>
          ))}
        </select>
      )}

      {selectedValue && (
        <FilterTag text={displayValue} onRemove={handleRemove} />
      )}
    </div>
  );
};

export default JobChangeFilter;
