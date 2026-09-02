import { useEffect, useState } from "react";
import StepOne from "./StepOne";
import TourCard from "../TourCard";
import StepTwo from "./StepTwo";
import StepThree from "./StepThree";
import StepFour from "./StepFour";
import StepFive from "./StepFive";
import StepSix from "./StepSix";
import StepSeven from "./StepSeven";
import StepEight from "./StepEight";
import StepNine from "./StepNine";
import StepEleven from "./StepEleven";
import StepTen from "./StepTen";
import StepTwelve from "./StepTwelve";

const Steps = ({ stepCount, prev, next, tourSteps }) => {
  const currentStepData = tourSteps[stepCount - 1];

  // Position mappings for TourCard based on step
  const getCardPosition = (step) => {
    const positions = {
      1: "download-mawsool-extension",
      2: "allfilterwap-main",
      3: "searchbtn-submit",
      4: "submitAiQuery-btn",
      5: "ai-prompt-verify-modal",
      6: "ai-prompt-form-modal",
      7: "submitbtn-ai",
      8: "LoadingState",
      9: "Lists_list",
      10: "Enrichment_list",
      11: "inputlinkdingProfileUrls",
      12: "dataEnrichmentTable",
    };
    return positions[step] || "left-[200px] bottom-[80px]";
  };

  const tourClassName = getCardPosition(stepCount);

  // Step components mapping
  const stepComponents = {
    1: <StepOne />,
    2: <StepTwo />,
    3: <StepThree />,
    4: <StepFour />,
    5: <StepFive />,
    6: <StepSix />,
    7: <StepSeven />,
    8: <StepEight />,
    9: <StepNine />,
    10: <StepTen />,
    11: <StepEleven />,
    12: <StepTwelve />,
  };

  return (
    <>
      <TourCard
        prev={prev}
        next={next}
        className={tourClassName}
        title={currentStepData.title}
        description={currentStepData.description}
        currentStep={stepCount}
        totalSteps={tourSteps.length}
      />
      {stepComponents[stepCount]}
    </>
  );
};

export default Steps;
