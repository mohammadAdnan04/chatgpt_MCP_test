"use client";
import React from "react";

export default function Dropdown({ 
  options = [], 
  value = "", 
  onChange, 
  placeholder = "Select option" 
}) {
  return (
    <select
      className="w-full border border-gray-300 rounded-lg px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {/* <option value="" disabled>
        {placeholder}
      </option> */}
      {options.map((opt, index) => (
        <option key={index} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
