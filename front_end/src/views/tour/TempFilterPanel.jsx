import React, { useState } from "react";
// All your component imports remain the same
import JobTitleFilter from "@/components/search/JobTitleFilter";
import IndustryFilter from "@/components/search/IndustryFilter";
import NoOfEmployees from "@/components/search/NoOfEmployees";
import CountryFilter from "@/components/search/CountryFilter";
import SeniorityLevelFilter from "@/components/search/SeniorityLevelFilter";
import HQCompanyLocationFilter from "@/components/search/HQCompanyLocationFilter";
import BehavioralKeywordTargetingFilter from "@/components/search/BehavioralKeywordTargetingFilter";
import YearsInCurrentPositionFilter from "@/components/search/YearsInCurrentPositionFilter";
import YearsInCurrentCompanyFilter from "@/components/search/YearsInCurrentCompanyFilter";
import TotalYearsOfExperienceFilter from "@/components/search/TotalYearsOfExperienceFilter";
import UniversityFilter from "@/components/search/UniversityFilter";
import ExCompanyFilter from "@/components/search/ExCompanyFilter";
import JobChangeFilter from "@/components/search/JobChangeFilter";
import PastRoleFilter from "@/components/search/PastRoleFilter";
import LanguagesFilter from "@/components/search/LanguagesFilter";
import { Search01Icon } from "hugeicons-react";

// --- Helper Components ---

const FilterItem = ({ icon, title, isExpanded, onToggle, children }) => (
  <div className="w-full p-2.5 flex flex-col gap-3.5 rounded-xl border border-[#E5E6E6] bg-[#FBFBFC]">
    <div
      className="w-full flex items-center gap-3.5 cursor-pointer"
      onClick={onToggle}
    >
      <div className="flex min-w-[30px] h-[30px] p-1.5 justify-center items-center rounded-full bg-[#DEF9FF]">
        <img src={icon} className="select-none" draggable="false" alt="" />
      </div>
      <p className="w-full text-sm text-[#222222] capitalize min-w-fit text-nowrap">
        {title}
      </p>
      <img
        src="/icons/Icon2.svg"
        className={`select-none transition-transform duration-200 ${
          isExpanded ? "rotate-180" : ""
        }`}
        draggable="false"
        alt=""
      />
    </div>
    {isExpanded && (
      <div className="transition-all duration-200 ease-in-out">{children}</div>
    )}
  </div>
);

const FilterSection = ({ title, children }) => (
  <div className="flex flex-col gap-4">
    {title && <p className="text-[#222222]">{title}</p>}
    <div className="flex flex-col gap-1.5">{children}</div>
  </div>
);

const SearchButton = ({ onClick, disabled = false }) => (
  <div
    className={`w-full h-[48px] flex items-center justify-center gap-4 self-stretch rounded-xl px-2.5 py-2 transition-all duration-200 ${
      disabled
        ? "bg-[#cfcfcf] cursor-not-allowed"
        : "bg-[#04145C] cursor-pointer hover:bg-[#03124A]"
    }`}
    onClick={disabled ? undefined : onClick}
  >
    <div className="flex items-center gap-1">
      <Search01Icon size={16} color={disabled ? "#999" : "#FFFFFF"} />
      <p
        className={`text-sm font-medium ${
          disabled ? "text-[#999]" : "text-white"
        }`}
      >
        Search Filter
      </p>
    </div>
  </div>
);

const SubmitAIQuery = ({ onClick }) => (
  <div
    className="w-full h-[48px] flex items-center justify-center gap-4 self-stretch rounded-xl bg-button px-2.5 cursor-pointer"
    onClick={onClick}
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

// --- Main FilterPanel Component ---

const TempFilterPanel = ({ className,style }) => {
  // Use a single state object to manage the expanded state of all filter items
  const [expandedItems, setExpandedItems] = useState({});
  // console.log(style);
  const filterConfigs = [
    {
      items: [
        {
          icon: "/icons/Icon1.svg",
          title: "Job Title",
          Component: JobTitleFilter,
        },
        {
          icon: "/icons/Industry.svg",
          title: "Industry",
          Component: IndustryFilter,
        },
        {
          icon: "/icons/Employees.svg",
          title: "# of Employees",
          Component: NoOfEmployees,
        },
        {
          icon: "/icons/Country.svg",
          title: "Country",
          Component: CountryFilter,
        },
        {
          icon: "/icons/SeniorityLevel.svg",
          title: "Seniority Level",
          Component: SeniorityLevelFilter,
        },
        {
          icon: "/icons/Company.svg",
          title: "HQ Company Location",
          Component: HQCompanyLocationFilter,
        },
      ],
    },
    {
      title: "Advanced Filters",
      items: [
        {
          icon: "/icons/Keyword.svg",
          title: "Behavioral Keyword Targeting",
          Component: BehavioralKeywordTargetingFilter,
          key: "behavioral_keywords",
          isObject: false,
        },
        {
          icon: "/icons/Job.svg",
          title: "Job change",
          Component: JobChangeFilter,
        },
        {
          icon: "/icons/currentposition.svg",
          title: "years in current position",
          Component: YearsInCurrentPositionFilter,
        },
        {
          icon: "/icons/currentcompany.svg",
          title: "years in current company",
          Component: YearsInCurrentCompanyFilter,
        },
        {
          icon: "/icons/experience.svg",
          title: "total years of experience",
          Component: TotalYearsOfExperienceFilter,
        },
        {
          icon: "/icons/university.svg",
          title: "university",
          Component: UniversityFilter,
        },
        {
          icon: "/icons/university.svg",
          title: "ex company",
          Component: ExCompanyFilter,
        },
        {
          icon: "/icons/Job.svg",
          title: "past role",
          Component: PastRoleFilter,
        },
        {
          icon: "/icons/languages.svg",
          title: "languages",
          Component: LanguagesFilter,
        },
      ],
    },
  ];

  // Function to handle toggling the expanded state of a filter item
  const handleToggle = (key) => {
    setExpandedItems((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  return (
    <div
      className={`${className} allfilterwap min-w-[320px] h-full flex flex-col gap-4  overflow-y-auto`}
      style={style}
    >
      {filterConfigs.map((section) => (
        <FilterSection key={section.title || "main-filters"} title={section.title}>
          {section.items.map((item) => {
            const { icon, title, Component } = item;
            const uniqueKey = `${section.title || 'main'}-${title}`;

            return (
              <FilterItem
                key={uniqueKey}
                icon={icon}
                title={title}
                isExpanded={!!expandedItems[uniqueKey]}
                onToggle={() => handleToggle(uniqueKey)}
              >
                <Component />
              </FilterItem>
            );
          })}
        </FilterSection>
      ))}
    </div>
  );
};

export default TempFilterPanel;
