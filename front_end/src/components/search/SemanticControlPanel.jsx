"use client";

import React from "react";

const SemanticControlPanel = ({ enabled, threshold, onToggle, onThreshold }) => {
  return (
    <div className="flex items-center gap-4 px-4 py-3 border border-[#E5E6E6] rounded-xl bg-white">
      <div className="flex items-center gap-2">
        <input type="checkbox" checked={enabled} onChange={(e) => onToggle(e.target.checked)} />
        <span className="text-sm text-[#222]">AI Ranking</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm text-[#666]">Threshold</span>
        <input type="range" min={0.1} max={0.9} step={0.05} value={threshold} onChange={(e) => onThreshold(parseFloat(e.target.value))} />
        <span className="text-sm text-[#222]">{threshold}</span>
      </div>
    </div>
  );
};

export default SemanticControlPanel;

