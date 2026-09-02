"use client";

import React from "react";

const ExpandJobTitlesFilter = ({ value, onChange }) => {
  const isEnabled = value !== false;

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex flex-col">
        <span className="text-xs text-[#434343] font-medium">Expand job titles</span>
        <span className="text-[10px] text-[#6B7271]">
          When enabled, it will include similar job titles in the results.
        </span>
      </div>
      <button
        type="button"
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ${
          isEnabled ? "bg-[#04145C]" : "bg-[#E5E6E6]"
        }`}
        onClick={() => {
          if (!onChange) return;
          if (isEnabled) onChange(false);
          else onChange(undefined);
        }}
        aria-pressed={isEnabled}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform duration-200 ${
            isEnabled ? "translate-x-5" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
};

export default ExpandJobTitlesFilter;

