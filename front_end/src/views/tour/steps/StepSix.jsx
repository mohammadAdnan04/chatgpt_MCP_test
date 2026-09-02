import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";

const StepSix = () => {
  const [style, setStyle] = useState({});
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const target = document.querySelector(".ai-prompt-form-modal");
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
  }, []);

  const element = <div style={style}></div>;
  return mounted && typeof document !== "undefined" ? createPortal(element, document.body) : element;
};

export default StepSix;
