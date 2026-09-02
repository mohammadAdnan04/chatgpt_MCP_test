import React from "react";
import Steps from "./steps/Steps";

const TourOverlay = ({ children, step, tourSteps, onPrev, onNext }) => {
  return (
    <>
      {children}
      <div className="fixed inset-0 bg-[#000000]/40 z-50">
        <Steps
          stepCount={step}
          prev={onPrev}
          next={onNext}
          tourSteps={tourSteps}
        />
      </div>
    </>
  );
};

export default TourOverlay;
