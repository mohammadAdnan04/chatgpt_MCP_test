"use client";

import React from "react";
import { usePathname } from "next/navigation";
import SidebarLink from "./SidebarLink";

const Sidebar = ({ isSidebarOpen }) => {
  const pathname = usePathname();

  const sidebarItems = [
    { name: "Profile", icon: "/icons/Profile.svg", href: "/setting" },
    { name: "Users", icon: "/icons/users.svg", href: "/setting/users" },
    {
      name: "Plan Overview",
      icon: "/icons/Plan.svg",
      href: "/setting/planOverview",
    },
    { name: "Billing", icon: "/icons/Billing.svg", href: "/setting/billing" },
  ];

  return (
    <div
      className={`min-w-[260px] flex flex-col gap-1.5 transition-all duration-300 ease-in-out overflow-hidden`}
    >
      <div className="min-w-[260px] flex flex-col gap-1.5">
        {sidebarItems.map((item) => (
          <SidebarLink
            key={item.name}
            item={item}
            isActive={pathname === item.href}
          />
        ))}
      </div>
    </div>
  );
};

export default Sidebar;
