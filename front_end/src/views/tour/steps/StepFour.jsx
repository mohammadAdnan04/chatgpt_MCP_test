import React, { useEffect, useState } from "react";

const StepFour = () => {
  const [style, setStyle] = useState({});
    useEffect(() => {
      const target = document.querySelector(".submitAiQuery-btn");
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
    <div className="w-[320px] h-[56px] border-4 border-[#C7F5FF] flex items-center justify-center gap-4 self-stretch rounded-xl bg-button px-2.5 cursor-pointer"
     style={style}
    >
      <div className="flex items-center gap-1">
        <img
          src="/icons/magicAI.svg"
          className="select-none"
          draggable="false"
          alt=""
        />
        <p className="text-sm font-medium text-white">Submit AI Query -bulk data request-</p>
      </div>
    </div>
  );
};

export default StepFour;
