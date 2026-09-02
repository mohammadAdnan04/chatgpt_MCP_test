import Link from "next/link";
import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";

const TourCard = ({
  prev,
  next,
  className,
  title,
  description,
  currentStep,
  totalSteps,
}) => {
  const [style, setStyle] = useState({ zIndex: 100000, opacity: 0 }); // start hidden until positioned
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
  const target = document.querySelector("." + className);
  const tourCard = document.querySelector(".tour-card"); 

  if (target && tourCard) {
    const rect = target.getBoundingClientRect();
    const cardRect = tourCard.getBoundingClientRect();
    
    let newStyle = { zIndex: 100000, opacity: 1 };
    
    // console.log(rect);
    if(className =='allfilterwap-main'){
      newStyle = {
        ...newStyle,
        position: "absolute",
        left: rect.right + 12 + "px", 
        top: rect.top + "px",
      };
    }else if(className =='submitbtn-ai'){
      newStyle = {
        ...newStyle,
        position: "absolute",
        left: rect.left - cardRect.width - 12 + "px", 
        top: rect.bottom - cardRect.height + "px", 
      };
    }else if(className =='LoadingState'){
      newStyle = {
        ...newStyle,
        position: "absolute",
        left: rect.left - cardRect.width - 12 + "px", 
        top: rect.top + "px", 
      };
    }else if(className =='Lists_list'){
      newStyle = {
        ...newStyle,
         position: "absolute",
        left: rect.right + 12 + "px", 
        top: rect.bottom  + "px", 
      };
    }else if(className =='inputlinkdingProfileUrls'){
      newStyle = {
        ...newStyle,
        position: "absolute",
        left: rect.left + "px", 
        top: rect.bottom + 12  + "px", 
      };
    }else if(className =='dataEnrichmentTable'){
      newStyle = {
        ...newStyle,
        position: "absolute",
        left: rect.left + "px", 
        top: rect.top - cardRect.height -12  + "px", 
      };
    }else{
      newStyle = {
        ...newStyle,
        position: "absolute",
        left: rect.right + 12 + "px", 
        top: rect.bottom - cardRect.height + "px", 
      };
    }
    
    setStyle(newStyle);
  }
}, [className, currentStep]);

  const element = (
    <div
      className="tour-card p-2.5 w-full max-w-[275px] rounded-[8px] bg-white flex items-center flex-col gap-4 shadow-xl"
      style={style}
    >
      <div className="flex items-center justify-between w-full">
        <span className="text-[#434343] text-xs px-2 py-1 bg-[#C7F5FF] border border-[#00D2FF] rounded-full">
          Tour
        </span>
        <Link href={"/search"} className="text-[#04145C] text-xs cursor-pointer">
          Skip Tour
        </Link>
      </div>
      <img 
        src="/dashboard/tour/tourRobot.png" 
        width={80}
        height={103}
      />
      <div className="flex items-start flex-col gap-2.5">
        <h3 className="text-sm text-[#222222] leading-[125%]">{title}</h3>
        <p className="text-xs leading-[130%] text-[#434343]">{description}</p>
      </div>

      <div className="flex items-center justify-between w-full">
        <button
          onClick={prev}
          disabled={currentStep === 1}
          className="cursor-pointer text-[#434343] transition-all hover:opacity-90 bg-transparent border border-[#434343] px-2.5 py-2 rounded-xl text-sm leading-[125%]"
        >
          Back
        </button>
        <button
          onClick={next}
          className="cursor-pointer border border-[#04145C] text-[#FFF] transition-all hover:opacity-90 bg-[#04145C] px-2.5 py-2 rounded-xl text-sm leading-[125%]"
        >
          {currentStep == totalSteps ? "Finish" : "Next"}
        </button>
      </div>
    </div>
  );

  return mounted && typeof document !== "undefined" ? createPortal(element, document.body) : element;
};

export default TourCard;
