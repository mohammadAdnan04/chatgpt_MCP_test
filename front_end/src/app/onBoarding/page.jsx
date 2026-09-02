"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import OnboardingStep from "@/views/onBoarding/OnboardingStep";
import axios from "axios";
import { useAuth } from "@/contexts/AuthContext";

const config = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000",
};

const OnBoardingContent = () => {
  const [currentStep, setCurrentStep] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [imagesLoaded, setImagesLoaded] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { checkAuth } = useAuth();

  // Fire GTM sign_up_success event for new social signups
  useEffect(() => {
    if (searchParams.get("status") === "new") {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({
        'event': 'sign_up_success'
      });
      // Remove status=new from URL so it doesn't fire again on refresh
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete("status");
      window.history.replaceState({}, document.title, newUrl.pathname + newUrl.search);
    }
  }, [searchParams]);

  const steps = [
    {
      title: "Find the Right Leads Faster",
      description:
        "Use smart filters like job title, company size, location, and more to build a custom lead list that matches your exact needs.",
      image: "/user/onBoarding1.svg",
      imageWidth: 700,
      imageHeight: 1024,
      progress: 8,
      imageClassName: "onboarding-step-1-image h-[857px]",
    },
    {
      title: "Let AI Work for You",
      description: `Once you're happy with the search, submit an AI query with your prompt, lead count, and preferences. We'll handle the research and deliver qualified leads in 48 hours.`,
      image: "/user/onBoarding2.png",
      imageWidth: 654,
      imageHeight: 859,
      progress: 48,
      imageConatainerClassName: "",
      imageClassName: "onboarding-step-2-image min-w-[754px] object-contain",
    },
    {
      title: "Manage Your Lead Lists",
      description: `Monitor the status of your lead requests — from "in progress" to "delivered." Export your data anytime.`,
      image: "/user/onBoarding3.png",
      imageWidth: 740,
      imageHeight: 561,
      progress: 91,
      imageConatainerClassName: "bottom-[20%]",
      imageClassName: "onboarding-step-3-image max-h-[560px] object-center",
    },
  ];

  // Preload all images on component mount
  useEffect(() => {
    const preloadImages = async () => {
      const imagePromises = steps.map((step) => {
        return new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = resolve;
          img.onerror = reject;
          img.src = step.image;
        });
      });

      try {
        await Promise.all(imagePromises);
        setImagesLoaded(true);
      } catch (error) {
        console.error("Failed to preload some images:", error);
        // Still set to true to not block the UI
        setImagesLoaded(true);
      }
    };

    preloadImages();
  }, []);

  const handleContinue = async () => {
    if (currentStep < steps.length - 1) {
      setIsAnimating(true);
      setTimeout(() => {
        setCurrentStep(currentStep + 1);
        setIsAnimating(false);
      }, 300);
    } else {
      try {
        // Complete onboarding immediately to prevent session issues
        await axios.post(
          `${config.apiUrl}/api/auth/complete-onboarding`,
          {},
          { withCredentials: true }
        );
        // Update local context immediately so 'onboarded' becomes true
        await checkAuth();
      } catch (error) {
        console.error("Failed to complete onboarding:", error);
      }
      router.push("/tour");
    }
  };

  const currentStepData = steps[currentStep];

  return (
    <div className="p-4 md:p-8 flex flex-col-reverse md:flex-row items-center w-full min-h-screen md:h-screen overflow-hidden bg-gradient-to-b from-[#E2FAFF] to-white relative">
      {/* Hidden images for preloading - alternative approach */}
      <div className="hidden">
        {steps.map((step, index) => (
          <img
            key={index}
            src={step.image}
            alt=""
            loading="eager"
            decoding="async"
          />
        ))}
      </div>

      <div className="w-full md:w-1/2 flex items-center justify-center z-20 mt-8 md:mt-0">
        <OnboardingStep
          title={currentStepData.title}
          description={currentStepData.description}
          progress={currentStepData.progress}
          isAnimating={isAnimating}
          onContinue={handleContinue}
          continueText={currentStep < steps.length - 1 ? "Continue" : "Continue"}
        />
      </div>

      <div className="w-full md:w-[50%] h-[40vh] md:h-full relative flex items-center justify-center md:block">
         <div
            className={`transition-all duration-500 ease-out w-full h-full flex items-center justify-center md:absolute md:right-0 ${currentStepData.imageConatainerClassName} ${
              isAnimating
                ? "opacity-0 scale-105 translate-x-8"
                : "opacity-100 scale-100 translate-x-0"
            }`}
          >
            <img
              src={currentStepData.image}
              alt="onBoarding"
              draggable="false"
              className={`max-w-full max-h-full object-contain ${currentStepData.imageClassName?.replace('h-[857px]', 'h-auto max-h-[80vh]').replace('min-w-[754px]', 'w-auto max-w-full')}`}
              loading="eager"
              decoding="async"
            />
          </div>
      </div>
    </div>
  );
};

const OnBoarding = () => {
  return (
    <Suspense fallback={<div className="min-h-screen w-full bg-gradient-to-b from-[#E2FAFF] to-white flex items-center justify-center">Loading...</div>}>
      <OnBoardingContent />
    </Suspense>
  );
};

export default OnBoarding;