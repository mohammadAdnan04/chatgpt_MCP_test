import React from "react";

const ExtentionCard = ({className}) => {
  return (
    <div className={`download-mawsool-extension w-full h-[220px] p-4 flex flex-col justify-between rounded-2xl bg-gradient-to-br from-[#5D17D5] to-[#00D2FF] relative overflow-hidden ${className}`}>
      <div className="w-8 h-8 flex items-center justify-center bg-white rounded-lg">
        <img
          src="/sidebar/sidebarCardIcon.svg"
          className="select-none"
          draggable="false"
          alt="Extension icon"
        />
      </div>
      <div className="flex flex-col gap-5">
        <p className="text-xs text-white">Download Mawsool Chrome Extension</p>
        <div className="w-fit px-2.5 py-2 text-xs font-medium text-white bg-[#04145C] rounded-xl cursor-pointer hover:bg-[#052074] transition-colors duration-200">
          Download
        </div>
      </div>
      <img
        src="/sidebar/symbol.svg"
        className="absolute top-0 right-0 select-none"
        draggable="false"
        alt="Background symbol"
      />
    </div>
  );
};

export default ExtentionCard;
