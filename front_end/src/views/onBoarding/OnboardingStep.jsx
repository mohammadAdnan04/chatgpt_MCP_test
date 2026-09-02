import React from "react";

const ArrowRight01Icon = ({ size = 20 }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="17"
    viewBox="0 0 16 17"
    fill="none"
  >
    <path
      d="M4.79984 14.702L3.6665 13.5686L8.93317 8.30198L3.6665 3.03531L4.79984 1.90198L11.1998 8.30198L4.79984 14.702Z"
      fill="white"
    />
  </svg>
);

const OnboardingStep = ({
  title,
  description,
  progress,
  isAnimating = false,
  onContinue,
  logo = "/basic/logo.png",
  continueText = "Continue",
  showLogo = true,
  className = "",
}) => {
  return (
    <div className={`flex flex-col items-center w-full h-full justify-center ${className} z-10 relative`}>
      <div className="flex flex-col items-start gap-6 md:gap-10 w-full max-w-[90%] md:max-w-[490px]">
        {showLogo && (
          <div
            className={`transition-all duration-500 ease-out ${
              isAnimating
                ? "opacity-0 scale-95"
                : "opacity-100 scale-100"
            }`}
          >
            <img src={logo} alt="logo" className="h-[20px] md:h-[26px]" />
          </div>
        )}
        <div className="overflow-hidden w-full">
          <h2
            className={`text-[28px] md:text-[40px] font-semibold leading-[120%] text-[#222] transition-all duration-500 ease-out ${
              isAnimating
                ? "opacity-0 scale-95"
                : "opacity-100 scale-100"
            }`}
          >
            {title}
          </h2>
        </div>
        <div className="overflow-hidden w-full">
          <p
            className={`text-[16px] md:text-[20px] leading-[150%] text-[#434343] transition-all duration-500 ease-out delay-100 ${
              isAnimating
                ? "opacity-0 scale-95"
                : "opacity-100 scale-100"
            }`}
          >
            {description}
          </p>
        </div>
        <div
          className={`flex items-center gap-4 md:gap-[27px] w-full transition-all duration-500 ease-out delay-200 ${
            isAnimating
              ? "opacity-0 translate-y-4"
              : "opacity-100 translate-y-0"
          }`}
        >
          <div className="flex-1 h-3 rounded-full overflow-hidden bg-[#EBEBEB]">
            <div
              className="bg-[#04145C] h-full transition-all duration-700 ease-out"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
          <button
            onClick={onContinue}
            className={`flex items-center justify-center cursor-pointer gap-1 bg-[#04145C] text-white px-4 py-2.5 rounded-xl text-sm font-medium leading-[125%] transition-all duration-300 hover:bg-[#03123a] active:scale-95 shrink-0 min-w-fit shadow-md z-50`}
            style={{ pointerEvents: 'auto' }}
          >
            {continueText}
            <ArrowRight01Icon size={20} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default OnboardingStep; 