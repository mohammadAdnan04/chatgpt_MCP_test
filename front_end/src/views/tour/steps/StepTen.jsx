import React from "react";

const StepTen = () => {
  return (
    <div
      className={`p-2.5 bg-[#DEF9FF] border-4 border-[#C7F5FF] flex items-center gap-1 rounded-full cursor-pointer transition-colors duration-200 w-[182px] fixed left-2 top-[265px]`}
    >
      <img
        src={"/sidebar/DataEnrichment.svg"}
        className="w-5 select-none"
        draggable="false"
      />
      <p className={`!text-sm !font-medium text-[#434343]`}>Data Enrichment</p>
    </div>
  );
};

export default StepTen;
