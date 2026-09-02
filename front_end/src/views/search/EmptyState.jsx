import React from "react";
const EmptyState = () => {
  return (
    <div className="w-full h-full p-4 flex items-center justify-center rounded-2xl border border-[#E5E6E6] bg-[#FBFBFC]">
      <div className="max-w-[310px] flex flex-col items-center text-center gap-4">
        <img
          src="/icons/search.svg"
          className="select-none"
          draggable={false}
          alt=""
        />
        <p className="text-lg font-medium text-[#434343]">
          Use the filter panel to apply filters and start your people search.
        </p>
      </div>
    </div>
  );
};

export default EmptyState;
