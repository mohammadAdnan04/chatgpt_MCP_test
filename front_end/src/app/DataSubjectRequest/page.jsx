"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import AdminRoute from "@/components/AdminRoute";
import DashboardContainer from "@/components/dashboardLayoutContainer";

const config = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000",
};


export default function DataSubjectRequest() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const router = useRouter();

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(18);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRequests, setTotalRequests] = useState(0);

  // Helper function to format dates
  function relativeTime(dateString) {
    if (!dateString) return "";
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "Invalid Date";

    const diffMs = Date.now() - date.getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins} min${mins > 1 ? "s" : ""} ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
    const days = Math.floor(hours / 24);
    return `${days} day${days > 1 ? "s" : ""} ago`;
  }

  useEffect(() => {
    const fetchRequests = async () => {
      try {
        setLoading(true);
        const res = await fetch(
          `${config.apiUrl}/api/do-not-sell-my-data?page=${currentPage}&limit=${itemsPerPage}`,
          {
            credentials: "include",
          }
        );

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({ message: res.statusText }));
          throw new Error(errorData.message || `Failed to fetch requests (Status: ${res.status})`);
        }
        
        const data = await res.json();
        setRequests(data.requests);
        setTotalPages(data.totalPages);
        setTotalRequests(data.totalRequests);
      } catch (err) {
        console.error("Fetch error:", err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchRequests();
  }, [currentPage, itemsPerPage]);

  const handlePageChange = (page) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  const getPageNumbers = () => {
    const pageNumbers = [];
    const maxPagesToShow = 3;
    let startPage = Math.max(1, currentPage - Math.floor(maxPagesToShow / 2));
    let endPage = Math.min(totalPages, startPage + maxPagesToShow - 1);

    if (endPage - startPage + 1 < maxPagesToShow) {
      startPage = Math.max(1, endPage - maxPagesToShow + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
      pageNumbers.push(i);
    }

    let displayItems = pageNumbers;
    if (totalPages > maxPagesToShow) {
      if (startPage > 1) {
        displayItems = [1, '...', ...pageNumbers];
      }
      if (endPage < totalPages) {
        displayItems = [...displayItems, '...', totalPages];
      }
    }

    return displayItems;
  };

  if (loading)
    return (
      <AdminRoute>
        <div className="flex h-screen items-center justify-center bg-gray-50 p-6 font-sans text-gray-800">
          <p>Loading...</p>
        </div>
      </AdminRoute>
    );

  if (error)
    return (
      <AdminRoute>
        <div className="flex h-screen flex-col items-center justify-center bg-gray-50 p-6 font-sans text-gray-800">
          <p className="text-red-500">Error: {error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
          >
            Retry
          </button>
        </div>
      </AdminRoute>
    );

  return (
    <DashboardContainer heading="Data Subject Requests">
      <AdminRoute>
        <div className="min-h-screen bg-gray-50 font-sans text-gray-800">
          <div className="relative rounded-xl bg-white p-4 shadow-lg md:p-6">
            <main className="overflow-hidden rounded-lg">
              <div className="overflow-x-auto h-[80vh]">
                <table className="w-full border-collapse">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400 md:px-6 md:py-4">
                        Name 
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400 md:px-6 md:py-4">
                        Email 
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400 md:px-6 md:py-4">
                        Country 
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400 md:px-6 md:py-4">
                        Request Type 
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400 md:px-6 md:py-4">
                        Job Title 
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400 md:px-6 md:py-4">
                        Company 
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400 md:px-6 md:py-4">
                        Mobile 
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400 md:px-6 md:py-4">
                        LinkedIn 
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400 md:px-6 md:py-4">
                        Created On 
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {requests.length > 0 ? (
                      requests.map((request) => (
                        <tr
                          key={request._id}
                          className="group transition-colors hover:bg-gray-50"
                        >
                          <td className="whitespace-nowrap px-4 py-2 text-sm font-medium text-gray-800 md:px-6 md:py-2">
                            {request.firstName} {request.lastName}
                          </td>
                          <td className="whitespace-nowrap px-4 py-2 text-sm text-gray-600 md:px-6 md:py-2">
                            {request.email}
                          </td>
                          <td className="whitespace-nowrap px-4 py-2 text-sm text-gray-600 md:px-6 md:py-2">
                            {request.country}
                          </td>
                          <td className="whitespace-nowrap px-4 py-2 text-sm text-gray-600 md:px-6 md:py-2">
                            {request.requestType}
                          </td>
                          <td className="whitespace-nowrap px-4 py-2 text-sm text-gray-600 md:px-6 md:py-2">
                            {request.jobTitle}
                          </td>
                          <td className="whitespace-nowrap px-4 py-2 text-sm text-gray-600 md:px-6 md:py-2">
                            {request.companyName}
                          </td>
                          <td className="whitespace-nowrap px-4 py-2 text-sm text-gray-600 md:px-6 md:py-2">
                            {request.mobile}
                          </td>
                          <td className="whitespace-nowrap px-4 py-2 text-sm text-gray-600 md:px-6 md:py-2">
                            {request.linkedin ? (
                              <a
                                href={request.linkedin}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:underline"
                              >
                                LinkedIn
                              </a>
                            ) : (
                              "-"
                            )}
                          </td>
                          <td className="whitespace-nowrap px-4 py-2 text-sm text-gray-600 md:px-6 md:py-2">
                            {relativeTime(request.createdAt)}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="9" className="py-10 text-center text-sm text-gray-500">
                          No requests found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </main>
            <footer className="mt-px flex flex-col items-center justify-between gap-4 border-t border-gray-200 bg-white p-4 text-sm text-gray-600 md:flex-row md:p-6">
              <div className="flex items-center gap-2">
                Showing
                <select
                  className="rounded-md border border-gray-300 bg-gray-50 px-2 py-1 text-sm text-gray-700 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  value={itemsPerPage}
                  onChange={(e) => {
                    setItemsPerPage(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                >
                  <option value="18">18</option>
                  <option value="34">34</option>
                  <option value="50">50</option>
                </select>
                out of {totalRequests}
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="flex h-8 w-8 items-center justify-center rounded border border-gray-300 bg-white text-gray-500 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  &lt;
                </button>
                {getPageNumbers().map((page, index) => {
                  if (page === '...') {
                    return (
                      <span key={`ellipsis-${index}`} className="mx-1 flex h-8 items-center text-gray-500">
                        ...
                      </span>
                    );
                  }
                  return (
                    <button
                      key={page}
                      onClick={() => handlePageChange(page)}
                      className={`flex h-8 w-8 items-center justify-center rounded border transition-colors ${
                        currentPage === page
                          ? "border-blue-600 bg-blue-600 text-white"
                          : "border-gray-300 bg-white text-gray-500 hover:bg-gray-100"
                      }`}
                    >
                      {page}
                    </button>
                  );
                })}
                <button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="flex h-8 w-8 items-center justify-center rounded border border-gray-300 bg-white text-gray-500 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  &gt;
                </button>
              </div>
            </footer>
          </div>
        </div>
      </AdminRoute>
    </DashboardContainer>
  );
}