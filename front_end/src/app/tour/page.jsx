"use client";

import TourOverlay from "@/views/tour/TourOverlay";
import TourDataEnrichment from "@/views/tour/tourPage/TourDataEnrichment";
import TourSearch from "@/views/tour/tourPage/TourSearch";
import { useRouter } from "next/navigation";
import React, { useState } from "react";
import axios from "axios";

const config = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000",
};

const Tour = () => {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);

  const tourSteps = [
    {
      id: 1,
      title: "Download the Mawsool Chrome Extension",
      description:
        "Get started by installing the Mawsool Chrome extension from the Chrome Web Store.",
    },
    {
      id: 2,
      title: "Apply Filters",
      description: "Use our smart filters to define your target audience — by country, job title, industry, and more.",
    },
    {
      id: 3,
      title: "Click Search",
      description: "Run your search across a database of over one billion B2B leads. You can search multiple times to explore different audience segments.",
    },
    {
      id: 4,
      title: "Submit AI Query",
      description: "Our AI Agent goes beyond simple searches — it runs multiple intelligent queries, performs double verification, and delivers real-time, up-to-the-moment leads. Every lead is rigorously checked for relevance and accuracy before it reaches you. ",
    },
    {
      id: 5,
      title: "Review Your Filters",
      description: "Make sure to review your filters! The AI Agent works best when your filters are precisely tuned to your target audience. Check them like a pro, then click Next to continue.",
    },
    {
      id: 6,
      title: "Write Your Prompt",
      description: "Describe your ideal lead list in natural language.",
    },
    {
      id: 7,
      title: "Click Submit",
      description: "Submit your prompt and let the Mawsool AI Agent do the work — scanning, verifying, and delivering high-quality leads tailored to your request.",
    },
    {
      id: 8,
      title: "Wait for Sourcing",
      description: "Mawsool agent will get to work sourcing leads that match your need.",
    },
    {
      id: 9,
      title: "View Lists",
      description: "Go to the Lists tab to check the status of your query and view results.",
    },
    {
      id: 10,
      title: "Use Data Enrichment",
      description: "Click on the Data Enrichment tool to enrich lead data instantly.",
    },
    {
      id: 11,
      title: "Paste LinkedIn URLs",
      description: "Drop in any LinkedIn profile URLs you want enriched.",
    },
    {
      id: 12,
      title: "Get Instant Results",
      description: "Receive enriched data in seconds — more accurate and deeper than any competitor.",
    },
  ];

  const handleNext = async () => {
    if (currentStep < tourSteps.length) {
      setCurrentStep(currentStep + 1);
    } else {
      // Tour complete - mark onboarding as complete
      try {
        await axios.post(
          `${config.apiUrl}/api/auth/complete-onboarding`,
          {},
          { withCredentials: true }
        );
      } catch (error) {
        console.error("Failed to complete onboarding:", error);
      }
      
      // console.log("Tour completed!");
      router.push("/search")
    }
  };

  const handlePrev = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  return (
    <TourOverlay
      step={currentStep}
      tourSteps={tourSteps}
      onPrev={handlePrev}
      onNext={handleNext}
    >
      {currentStep <= 10  ? <TourSearch step={currentStep} /> : <TourDataEnrichment />}
    </TourOverlay>
  );
};

export default Tour;
