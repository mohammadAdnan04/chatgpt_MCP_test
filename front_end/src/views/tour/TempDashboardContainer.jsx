"use client";

import React, { useState, useEffect } from "react";
import axios from "axios";
import TempSidebar from "./TempSidebar";
import ProtectedRoute from "@/components/ProtectedRoute";

// Helper function to get auth token from cookie
const getAuthToken = () => {
  if (typeof document !== "undefined") {
    return document.cookie.split("; ").reduce((r, v) => {
      const parts = v.split("=");
      return parts[0] === "auth-token" ? decodeURIComponent(parts[1]) : r;
    }, "");
  }
  return "";
};

const config = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000",
};

const TempDashboardContainer = ({ heading, children, activeRoute }) => {
  const [credits, setCredits] = useState(0);
  const [loadingCredits, setLoadingCredits] = useState(true);

  useEffect(() => {
    const fetchCredits = async () => {
      try {
        const token = getAuthToken();

        if (!token) {
          console.error("No authentication token found");
          setCredits(0);
          setLoadingCredits(false);
          return;
        }

        // console.log(
        //   "🔄 Fetching credits with token:",
        //   token.substring(0, 20) + "..."
        // );

        const response = await axios.get(
          `${config.apiUrl}/api/credits`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            withCredentials: true,
          }
        );

        // console.log("✅ Credits response:", response.data);

        if (response.data && response.data.balance !== undefined) {
          setCredits(response.data.balance);
        } else {
          console.error("Invalid response format for credits:", response.data);
          setCredits(0);
        }
      } catch (error) {
        console.error("❌ Failed to fetch credits:", error);

        if (error.response?.status === 401) {
          console.error("Authentication failed - invalid or expired token");
        } else if (error.response?.status === 403) {
          console.error("Access forbidden - check permissions");
        }

        setCredits(0);
      } finally {
        setLoadingCredits(false);
      }
    };

    fetchCredits();
  }, []);

  return (
    <ProtectedRoute>
      <div className="relative z-10 w-full h-screen flex gap-0">
        <TempSidebar activeRoute={activeRoute} />
        <div className="w-full h-full p-4 flex flex-col gap-5">
          <div className="flex items-center justify-between">
            <h1 className="text-[22px] font-bold text-[#222222]">{heading}</h1>
            <div
              className="w-fit p-[1px] rounded-xl"
              style={{
                background:
                  "linear-gradient(274deg, #5D17D5 -45.73%, #00D2FF 96.42%)",
              }}
            >
              <div className="px-2.5 py-1.5 flex items-center gap-1 rounded-xl bg-[#FBFBFC]">
                <img
                  src="/dashboard/search/gold.svg"
                  className="w-[18px] select-none"
                  draggable={false}
                  alt="Credits"
                />
                <p className="text-sm text-[#222222]">
                  50
                </p>
              </div>
            </div>
          </div>

          <div className="w-full h-[85dvh]">{children}</div>

          <div className="w-full flex flex-col md:flex-row items-start gap-5 mt-auto">
            <p className="text-xs font-semibold text-[#222222]">
              Copyright © 2026 Mawsool
            </p>
            <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
              <a href="https://mawsool.tech/privacy-policy" target="_blank" className="text-xs text-[#434343]">Privacy Policy</a>
              <a href="https://mawsool.tech/terms-of-service/" target="_blank" className="text-xs text-[#434343]">Term and conditions</a>
              {/* <p className="text-xs text-[#434343]">Contact</p> */}
              <a href="https://www.linkedin.com/company/mawsool-%D9%85%D9%88%D8%B5%D9%88%D9%84/" target="_blank" className="text-xs text-[#434343] flex items-center gap-0.5">
                <img
                  src="/icons/LinkedinLogo.svg"
                  className="select-none"
                  draggable={false}
                  alt="Linkedin"
                />
                Linkedin
              </a>
            </div>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
};

export default TempDashboardContainer;
