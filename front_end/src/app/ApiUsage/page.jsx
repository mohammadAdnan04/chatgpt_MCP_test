"use client";

import { useState, useEffect } from "react";
import AdminRoute from "@/components/AdminRoute";
import DashboardContainer from "@/components/dashboardLayoutContainer";
import axiosInstance from "@/utils/axiosInstance";

export default function ApiUsagePage() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [error, setError] = useState(null);

  const fetchStats = async (selectedDate) => {
    setLoading(true);
    setError(null);
    try {
      const response = await axiosInstance.get(`/admin/api-usage?date=${selectedDate}`);
      setStats(response.data);
    } catch (err) {
      console.error("Failed to fetch API usage stats", err);
      setError("Failed to fetch stats.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats(date);
  }, [date]);

  return (
    <AdminRoute>
      <DashboardContainer>
        <div className="p-6 text-white max-w-6xl mx-auto">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-semibold">ContactOut API Usage</h1>
            <input 
              type="date" 
              value={date} 
              onChange={(e) => setDate(e.target.value)} 
              className="bg-[#1A1A1A] border border-[#333] text-white px-4 py-2 rounded-md focus:outline-none focus:border-[#00E5FF]"
            />
          </div>

          {loading ? (
            <div className="text-center py-10">Loading stats...</div>
          ) : error ? (
            <div className="text-red-500 bg-red-500/10 p-4 rounded-md border border-red-500/20">{error}</div>
          ) : stats ? (
            <div className="space-y-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-[#1A1A1A] p-6 rounded-lg border border-[#333]">
                  <p className="text-gray-400 text-sm mb-1">Total Requests (Combined)</p>
                  <p className="text-3xl font-bold text-[#00E5FF]">{stats.totalCombined}</p>
                </div>
                <div className="bg-[#1A1A1A] p-6 rounded-lg border border-[#333]">
                  <p className="text-gray-400 text-sm mb-1">People Search Requests</p>
                  <p className="text-3xl font-bold text-white">{stats.totalPeopleSearch}</p>
                </div>
                <div className="bg-[#1A1A1A] p-6 rounded-lg border border-[#333]">
                  <p className="text-gray-400 text-sm mb-1">Company Search Requests</p>
                  <p className="text-3xl font-bold text-white">{stats.totalCompanySearch}</p>
                </div>
              </div>

              {/* Details Table */}
              <div className="bg-[#1A1A1A] rounded-lg border border-[#333] overflow-hidden">
                <div className="p-4 border-b border-[#333]">
                  <h2 className="text-lg font-medium">Usage by API Key / User</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-[#111] text-gray-400 border-b border-[#333]">
                      <tr>
                        <th className="px-6 py-4 font-medium">Source / User</th>
                        <th className="px-6 py-4 font-medium">API Key</th>
                        <th className="px-6 py-4 font-medium">Service</th>
                        <th className="px-6 py-4 font-medium text-right">Successful Requests</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#333]">
                      {stats.details.length === 0 ? (
                        <tr>
                          <td colSpan="4" className="px-6 py-8 text-center text-gray-500">
                            No ContactOut API usage recorded for this date.
                          </td>
                        </tr>
                      ) : (
                        stats.details.map((detail, idx) => (
                          <tr key={idx} className="hover:bg-[#222] transition-colors">
                            <td className="px-6 py-4 font-medium text-white">{detail.sourceName}</td>
                            <td className="px-6 py-4 text-gray-400 font-mono text-xs">{detail.sourceKey}</td>
                            <td className="px-6 py-4 text-gray-300">
                              {detail.service === 'ContactOut_People_Search' ? (
                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
                                  People Search
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-500/10 text-purple-400 border border-purple-500/20">
                                  Company Search
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-right font-semibold text-[#00E5FF]">
                              {detail.successCount}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </DashboardContainer>
    </AdminRoute>
  );
}
