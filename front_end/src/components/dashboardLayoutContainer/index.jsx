"use client";

import React from "react";
import DashboardLayout from "../dashboardLayout";
import { useAuth } from "@/contexts/AuthContext";

const DashboardContainer = ({ heading, children, actions = null }) => {
  const { credits, personalCredits, poolCredits, memberCreditLimit, memberCreditsUsed, creditScope, memberCount, loading, user } = useAuth();
  return (
    <DashboardLayout>
      <div className="flex flex-col min-h-screen w-full bg-[#FBFBFC]">
        <div className="flex-1 p-4 flex flex-col gap-5" style={{ marginLeft: 'var(--sidebar-offset, 64px)' }}>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <h1 className="text-[22px] font-bold text-[#222222]">{heading}</h1>
              {actions}
            </div>
            
            <div className="flex items-center gap-3">
              {/* Personal Credits Box */}
              {user?.role === "user" && (
                <div
                  className="w-fit p-[1px] rounded-xl"
                  style={{
                    background: "linear-gradient(274deg, #5D17D5 -45.73%, #00D2FF 96.42%)",
                  }}
                  title="Your Personal Credits"
                >
                  <div className="px-2.5 py-1.5 flex items-center gap-1 rounded-xl bg-[#FBFBFC]">
                    <img
                      src="/dashboard/search/gold.svg"
                      className="w-[18px] select-none"
                      draggable={false}
                      alt="Personal Credits"
                    />
                    <p className="text-sm text-[#222222]">
                      {loading ? "..." : (creditScope === "org" ? personalCredits : credits)}
                    </p>
                  </div>
                </div>
              )}

              {/* Organization Pool Credits Box (Always show if they belong to an org) */}
              {user?.role === "user" && creditScope === "org" && user.orgId && (
                <div
                  className="w-fit p-[1px] rounded-xl"
                  style={{
                    background: "linear-gradient(274deg, #10B981 -45.73%, #3B82F6 96.42%)",
                  }}
                  title={memberCreditLimit !== null ? `Your credit allocation from the team pool` : "Your Team's Shared Credit Pool"}
                >
                  <div className="px-2.5 py-1.5 flex items-center gap-1 rounded-xl bg-[#FBFBFC]">
                    <img
                      src="/dashboard/search/gold.svg"
                      className="w-[18px] select-none"
                      draggable={false}
                      alt="Team Credits"
                    />
                    <p className="text-sm font-semibold text-[#10B981]">
                      {loading ? "..." : (
                        memberCreditLimit !== null
                          ? `Team: ${memberCreditsUsed ?? 0} / ${memberCreditLimit} used`
                          : `Team: ${poolCredits}`
                      )}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex-1 w-full overflow-hidden">{children}</div>

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
    </DashboardLayout>
  );
};

export default DashboardContainer;
