"use client"

import React from "react";


const FilterTag = ({ text, onRemove }) => {
  return (
    <div className="flex items-center gap-1 rounded-md border border-[#434343] bg-[#F5F5F5] px-1.5 py-1">
      <p className="text-[#434343] text-xs">{text}</p>
      <img
        src="/icons/cross.svg"
        className="w-3 h-3 cursor-pointer"
        alt="remove"
        onClick={onRemove}
      />
    </div>
  );
};


export default FilterTag;