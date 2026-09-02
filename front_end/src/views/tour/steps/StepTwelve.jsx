import React, { useEffect, useState } from "react";

const StepTwelve = () => {
  const [style, setStyle] = useState({});
  useEffect(() => {
    const target = document.querySelector(".dataEnrichmentTable");
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
        zIndex: 9999,
      });
    }
  }, []);

  return <div style={style}></div>;
};

export default StepTwelve;
