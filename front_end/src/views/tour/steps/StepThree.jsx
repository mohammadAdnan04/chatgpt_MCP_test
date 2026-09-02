import { Search01Icon } from "hugeicons-react";
import React, { useEffect, useState } from "react";


const StepThree = () => {
  const [style, setStyle] = useState({});
  useEffect(() => {
    const target = document.querySelector(".searchbtn-submit");
    if (target) {
      const rect = target.getBoundingClientRect();
      setStyle({
        position: "absolute",
        left: rect.left + "px",
        top: rect.top + "px",
      });
    }
  }, []);
  return (
    <>
      <div
        className={`w-[320px] h-[56px] border-4 border-[#C7F5FF] flex items-center justify-center gap-4 self-stretch rounded-xl px-2.5 py-2 transition-all duration-200 bg-[#04145C]`}
        style={style}
      >
        <div className="flex items-center gap-1">
          <Search01Icon size={16} color={"#FFFFFF"} />
          <p className={`text-sm font-medium text-white`}>Search Filter</p>
        </div>
      </div>
    </>
  );
};

export default StepThree;
