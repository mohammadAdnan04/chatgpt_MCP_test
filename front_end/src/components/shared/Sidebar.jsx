"use client";
import React, { useState, useEffect, useMemo, useRef, useLayoutEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import axios from "axios";
import Link from "next/link";

const config = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000",
};

const Sidebar = () => {
  const router = useRouter();
  const pathname = usePathname();
  const { user, logout } = useAuth();

  const [activeItem, setActiveItem] = useState("Home");
  const [collapsed, setCollapsed] = useState(true);
  const collapseTimeoutRef = useRef(null);

  useLayoutEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.style.setProperty(
        "--sidebar-offset",
        collapsed ? "64px" : "200px"
      );
    }
  }, [collapsed]);

  const expandSidebar = () => {
    if (collapseTimeoutRef.current) {
      clearTimeout(collapseTimeoutRef.current);
      collapseTimeoutRef.current = null;
    }
    setCollapsed(false);
  };

  const scheduleCollapse = () => {
    if (collapseTimeoutRef.current) clearTimeout(collapseTimeoutRef.current);
    collapseTimeoutRef.current = setTimeout(() => {
      setCollapsed(true);
      collapseTimeoutRef.current = null;
    }, 250);
  };
  const [userProfile, setUserProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);

  const menuItems = [
    // { name: "Home", icon: "/sidebar/Home.svg", route: "/", roles: ["", "user"] },
    { name: "Search", icon: "/sidebar/Search.svg", route: "/search", roles: ["", "user"] },
    { name: "Lists", icon: "/sidebar/Lists.svg", route: "/lists", roles: ["", "user"] },
    { name: "Setting", icon: "/sidebar/Setting.svg", route: "/setting", roles: ["", "user"] },
    { name: "Data Enrichment", icon: "/sidebar/DataEnrichment.svg", route: "/dataEnrichment", roles: ["", "user"] },
    ...(process.env.NEXT_PUBLIC_HIDE_AI_MODE === "true" ? [] : [
      { name: "Automation", icon: "/sidebar/automation.svg", route: "https://ai.mawsool.tech/", roles: ["", "user"] }
    ]),
    ...(process.env.NEXT_PUBLIC_HIDE_AI_MODE === "true" || process.env.NEXT_PUBLIC_HIDE_BULK_SAVE === "true" ? [] : [
      { name: "Integrations", icon: "/sidebar/integration.png", route: "/integrations", roles: ["", "user"] }
    ]),

    // Admin-only pages
    { name: "User Management", icon: "/sidebar/user.svg", route: "/userManagement", roles: ["admin"] },
    { name: "List Management", icon: "/sidebar/list.svg", route: "/ListManagement", roles: ["admin"] },
    { name: "Bulk Reveal Reports", icon: "/sidebar/list.svg", route: "/BulkRevealReports", roles: ["admin"] },
    { name: "Daily Reveals Report", icon: "/sidebar/list.svg", route: "/revealsReport", roles: ["admin"] },
    { name: "Data Subject Req..", icon: "/sidebar/DataSubjectRequest.svg", route: "/DataSubjectRequest", roles: ["admin"] },
  ];

  // Fetch user profile on component mount
  useEffect(() => {
    fetchUserProfile();
  }, []);

  const fetchUserProfile = async () => {
    try {
      setProfileLoading(true);
      const token = getCookie("auth-token");
      if (!token) {
        setProfileLoading(false);
        return;
      }

      const response = await axios.get(
        `${config.apiUrl}/api/user/profile`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          withCredentials: true,
        }
      );

      if (response.data?.profile) {
        setUserProfile(response.data.profile);
      }
    } catch (error) {
      console.error("Failed to fetch user profile:", error);
      // Fallback to auth context if API fails
      if (user) {
        setUserProfile({
          name: user.name || "User",
          email: user.email || "",
          avatar:
            user.avatar ||
            `https://ui-avatars.com/api/?name=${encodeURIComponent(
              user.name || "User"
            )}`,
          role: user.role || "user",
        });
      }
    } finally {
      setProfileLoading(false);
    }
  };

  // Helper function to get cookie
  const getCookie = (name) => {
    if (typeof document !== "undefined") {
      return document.cookie.split("; ").reduce((r, v) => {
        const parts = v.split("=");
        return parts[0] === name ? decodeURIComponent(parts[1]) : r;
      }, "");
    }
    return "";
  };

  // Resolve role from profile or auth context; default to "user"
  const role = useMemo(() => {
    const r =
      userProfile?.role ||
      user?.role ||
      (userProfile?.isAdmin ? "admin" : null) ||
      (user?.isAdmin ? "admin" : null) ||
      "user";
    return String(r).toLowerCase();
  }, [userProfile, user]);

  // Only show items the current role is allowed to see
  const visibleMenuItems = useMemo(() => {
    return menuItems.filter((item) => item.roles.includes(role));
  }, [menuItems, role]);

  useEffect(() => {
    const currentItem = menuItems.find((item) => item.route === pathname);
    if (currentItem) setActiveItem(currentItem.name);
  }, [pathname]);

  // Optional: hard guard if a user manually hits an admin route
  useEffect(() => {
    if (profileLoading) return;
    const current = menuItems.find((item) => item.route === pathname);
    if (current && !current.roles.includes(role)) {
      router.replace("/");
    }
  }, [pathname, role, profileLoading]);

  const handleItemClick = (item) => {
    setActiveItem(item.name);
    const isExternal = /^https?:\/\//.test(String(item.route || ""));
    if (item.name === "Automation" || isExternal) {
      if (typeof window !== "undefined") {
        window.open(item.route, "_blank", "noopener,noreferrer");
      }
    } else {
      router.push(item.route);
    }
  };

  const isItemActive = (item) => pathname === item.route;

  const displayName = userProfile?.name || user?.name || "User";
  const displayAvatar =
    userProfile?.avatar ||
    user?.avatar ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}`;

  const roleBadgeClass =
    role === "admin"
      ? "bg-red-100 text-red-700"
      : "bg-emerald-100 text-emerald-700";

  const handleLogoClick = () => {
    if (role === "admin") {
      // router.push("/"); 
    } else {
      router.push("/search"); 
    }
  };
  return (
    <>
      {/* Hover strip to stabilize hover behavior */}
      <div
        className="fixed left-0 top-0 h-screen w-[12px] z-40"
        onMouseEnter={expandSidebar}
        onMouseLeave={scheduleCollapse}
      />
      <div
        className={`fixed h-screen w-full max-w-[200px] ${collapsed ? "px-1" : "px-3"} py-6 flex flex-col justify-between gap-5 bg-[#E2FAFF] transition-[left] duration-200`}
        onMouseEnter={expandSidebar}
        onMouseLeave={scheduleCollapse}
        style={{
          left: "calc(0px - (200px - var(--sidebar-offset)))",
          willChange: "left",
          backfaceVisibility: "hidden",
          WebkitBackfaceVisibility: "hidden",
          WebkitTransform: "translateZ(0)",
        }}
      >
        <div className={`flex w-full flex-col gap-5 ${collapsed ? "items-end" : ""}`}>
          <img
            src={collapsed ? "/basic/icon128.png" : "/basic/logo.png"}
            className={`select-none cursor-pointer ${collapsed ? "w-12 h-12" : "w-[145px]"}`}
            draggable="false"
            alt="Logo"
            onClick={handleLogoClick}
          />

          <div className="flex flex-col gap-2">
            {visibleMenuItems.map((item) => (
              <div
                key={item.name}
                className={`group ${item.name}_list w-full cursor-pointer rounded-full ${collapsed ? "p-2 pr-2" : "p-2.5"} flex items-center ${collapsed ? "justify-end gap-0" : "gap-1"}
                  transition-all duration-300 ease-in-out
                  ${isItemActive(item) ? "bg-[#00D2FF]" : "hover:bg-[#00D2FF]/10"}`}
                onClick={() => handleItemClick(item)}
                title={
                  item.roles.length === 1 && item.roles[0] === "admin"
                    ? "Admin only"
                    : undefined
                }
              >
                <img
                  src={item.icon}
                  className="w-6 h-6 select-none transition-transform duration-300 ease-in-out group-hover:scale-110"
                  draggable="false"
                  alt={item.name}
                />
                {!collapsed && (
                  <p
                    className={`!text-sm !font-medium text-[#434343] transition-transform duration-300 ease-in-out group-hover:text-[#000] ${
                      isItemActive(item) ? "!text-[#222]" : ""
                    }`}
                  >
                    {item.name}
                  </p>
                )}
              </div>

            ))}
          </div>
        </div>

        <div className="flex w-full flex-col gap-5">
          {!collapsed && (
            <div className="download-mawsool-extension relative h-[220px] w-full overflow-hidden rounded-2xl bg-gradient-to-br from-[#5D17D5] to-[#00D2FF] p-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white">
                <img
                  src="/sidebar/sidebarCardIcon.svg"
                  className="select-none"
                  draggable="false"
                  alt="Extension icon"
                />
              </div>
              <div className="mt-10 flex flex-col gap-5">
                <p className="text-xs text-white">
                  Download Mawsool Chrome Extension
                </p>
                <Link
                  href="https://chromewebstore.google.com/detail/mawsool-contact-finder/oaihjiilhpmmnflhnjhjfdpcoahikbkh"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-fit cursor-pointer rounded-xl bg-[#04145C] px-2.5 py-2 text-xs font-medium text-white transition-colors duration-200 hover:bg-[#052074]"
                >
                  Download
                </Link>
              </div>
              <img
                src="/sidebar/symbol.svg"
                className="absolute right-0 top-0 select-none"
                draggable="false"
                alt="Background symbol"
              />
            </div>
          )}

          {/* User Profile Section */}
          <div className="group flex items-center gap-2">
            {profileLoading ? (
              <div className="flex items-center gap-2">
                <div className="h-[34px] w-[34px] animate-pulse rounded-full bg-gray-200"></div>
                {!collapsed && <div className="h-4 w-20 animate-pulse rounded bg-gray-200"></div>}
              </div>
            ) : (
              <>
                <img
                  src={displayAvatar}
                  className="h-[34px] w-[34px] select-none rounded-full object-cover"
                  draggable="false"
                  alt="User avatar"
                  onError={(e) => {
                    e.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(
                      displayName
                    )}`;
                  }}
                />
                {!collapsed && (
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[#222222]">
                      {displayName}
                    </p>
                    <span
                      className={`mt-0.5 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${roleBadgeClass}`}
                    >
                      {role === "admin" ? "Admin" : "User"}
                    </span>
                  </div>
                )}

                {/* Logout button - appears on hover */}
                {!collapsed && (
                  <button
                    onClick={logout}
                    className="cursor-pointer rounded p-1 opacity-0 transition-opacity duration-200 hover:bg-red-100 group-hover:opacity-100"
                    title="Logout"
                  >
                    <svg
                      className="h-4 w-4 text-red-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                      />
                    </svg>
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default Sidebar;
