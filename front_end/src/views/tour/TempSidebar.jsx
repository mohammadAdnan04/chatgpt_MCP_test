"use client";
import ExtentionCard from "@/components/shared/ExtentionCard";
import React from "react";

const TempSidebar = ({ activeRoute }) => {
  const menuItems = [
    {
      name: "Home",
      icon: "/sidebar/Home.svg",
      isDefault: true,
      route: "/",
      routeName: "home",
    },
    {
      name: "Search",
      icon: "/sidebar/Search.svg",
      route: "/search",
      routeName: "search",
    },
    {
      name: "Lists",
      icon: "/sidebar/Lists.svg",
      route: "/lists",
      routeName: "lists",
    },
    {
      name: "Setting",
      icon: "/sidebar/Setting.svg",
      route: "/setting",
      routeName: "setting",
    },
    {
      name: "Data Enrichment",
      icon: "/sidebar/DataEnrichment.svg",
      route: "/dataEnrichment",
      routeName: "dataEnrichment",
    },
    ...(process.env.NEXT_PUBLIC_HIDE_AI_MODE === "true" ? [] : [
      {
        name: "Automation",
        icon: "/sidebar/automation.svg",
        route: "/automation",
        routeName: "automation",
      }
    ]),
  ];

  const isItemActive = (item) => {
    return activeRoute === item.routeName;
  };

  return (
    <>
      <div className="max-w-[200px] w-full h-screen px-3 py-6 flex flex-col gap-5 justify-between bg-[#E2FAFF]">
        <div className="w-full flex flex-col gap-5">
          <img
            src="/basic/logo.png"
            className="w-[145px] select-none"
            draggable="false"
            alt="Logo"
          />
          <div className="flex flex-col gap-2">
            {menuItems.map((item) => (
              <div
                key={item.name}
                className={`${item.name}_list w-full p-2.5 flex items-center gap-1 rounded-full cursor-pointer transition-colors duration-200 ${
                  isItemActive(item) ? "bg-[#00D2FF]" : ""
                }`}
              >
                <img
                  src={item.icon}
                  className="w-5 select-none"
                  draggable="false"
                  alt={item.name}
                />
                <p
                  className={`!text-sm !font-medium text-[#434343] ${
                    isItemActive(item) ? "!text-[#222]" : ""
                  }`}
                >
                  {item.name}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="w-full flex flex-col gap-5">
          <ExtentionCard />

          {/* User Profile Section */}
          <div className="flex items-center gap-2">
            <img
              src="https://ui-avatars.com/api/?name=User"
              className="w-[34px] h-[34px] rounded-full select-none object-cover"
              draggable="false"
              alt="User avatar"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[#222222] truncate">
                User
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default TempSidebar;
