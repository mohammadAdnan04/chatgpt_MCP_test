import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import TempFilterPanel from "../TempFilterPanel";

const StepFive = () => {
  const [style, setStyle] = useState({});
  const [panelStyle, setPanelStyle] = useState({});
  const [mounted, setMounted] = useState(false);
  
  useEffect(() => {
    setMounted(true);
    const target = document.querySelector(".ai-prompt-verify-modal");
    if (target) {
      const rect = target.getBoundingClientRect();
      setStyle({
        position: "absolute",
        left: rect.left + "px",
        top: rect.top + "px",
        width: rect.width + "px",
        height: rect.height + "px",
        border: "4px solid #C7F5FF",
        borderRadius: "16px",
        pointerEvents: "none",
        zIndex: 99999,
      });
    }

    const panelTarget = document.querySelector(".allfilterwap-main");
    if (panelTarget) {
      const rect = panelTarget.getBoundingClientRect();
      setPanelStyle({
        position: "absolute",
        left: rect.left + "px",
        top: rect.top + "px",
      });
    }
  }, []);
  
  const element = (
    <>
      <TempFilterPanel
        className={"w-[288px] rounded-xl !h-[74vh] bg-white border-4 border-[#C7F5FF]"}
        style={panelStyle}
      />
      {style.width && <div style={style}></div>}
    </>
  );

  return mounted && typeof document !== "undefined" ? createPortal(element, document.body) : element;
};

export default StepFive;
