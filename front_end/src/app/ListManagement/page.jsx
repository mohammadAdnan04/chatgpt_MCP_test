"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import AdminRoute from "@/components/AdminRoute"; // Assuming this is a valid component
import DashboardContainer from "@/components/dashboardLayoutContainer";

const config = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000",
};

// --- Helper Icons (can be moved to a separate file or kept here) ---

// Bell Icon Component
const BellIcon = ({ className = "h-6 w-6 text-gray-600" }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M18 8C18 6.4087 17.3679 4.88258 16.2426 3.75736C15.1174 2.63214 13.5913 2 12 2C10.4087 2 8.88258 2.63214 7.75736 3.75736C6.63214 4.88258 6 6.4087 6 8C6 15 3 17 3 17H21C21 17 18 15 18 8Z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M13.73 21C13.5542 21.3031 13.2193 21.5 12.862 21.5H11.138C10.7807 21.5 10.4458 21.3031 10.27 21"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

// Sort Icon Component
const SortIcon = ({ className = "h-3 w-3 inline ml-1 text-gray-400" }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M8 10L12 6L16 10"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M16 14L12 18L8 14"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

// Refresh/Status Icon Component (matching the image's status button icon)
const RefreshIcon = ({ className = "h-3 w-3" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8.0001 14.4001C7.12543 14.4001 6.29876 14.2321 5.5201 13.8961C4.74143 13.5601 4.06143 13.1014 3.4801 12.5201C2.89876 11.9388 2.4401 11.2588 2.1041 10.4801C1.7681 9.70143 1.6001 8.87476 1.6001 8.0001C1.6001 7.11476 1.76799 6.28543 2.10376 5.5121C2.43943 4.73876 2.89771 4.06143 3.4786 3.4801C4.05949 2.89876 4.73893 2.4401 5.51693 2.1041C6.29504 1.7681 7.12104 1.6001 7.99493 1.6001C8.17615 1.6001 8.32232 1.65565 8.43343 1.76676C8.54454 1.87788 8.6001 2.0196 8.6001 2.19193C8.6001 2.36426 8.54454 2.50871 8.43343 2.62526C8.32232 2.74182 8.17788 2.8001 8.0001 2.8001C6.55932 2.8001 5.33243 3.30288 4.31943 4.30843C3.30654 5.31399 2.8001 6.54176 2.8001 7.99176C2.8001 9.44176 3.30654 10.6723 4.31943 11.6834C5.33243 12.6945 6.55932 13.2001 8.0001 13.2001C9.45565 13.2001 10.6862 12.6937 11.6918 11.6808C12.6973 10.6678 13.2001 9.44088 13.2001 8.0001C13.2001 7.82232 13.2584 7.67788 13.3749 7.56676C13.4915 7.45565 13.6359 7.4001 13.8083 7.4001C13.9806 7.4001 14.1223 7.45565 14.2334 7.56676C14.3445 7.67788 14.4001 7.82404 14.4001 8.00526C14.4001 8.87915 14.2321 9.70515 13.8961 10.4833C13.5601 11.2613 13.1014 11.9407 12.5201 12.5216C11.9388 13.1025 11.2614 13.5608 10.4881 13.8964C9.71476 14.2322 8.88543 14.4001 8.0001 14.4001Z" fill="currentColor"></path></svg>
);

// --- Main Component ---
export default function AdminQueriesListPage() {
  const [queries, setQueries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const router = useRouter();
  const [openMenuId, setOpenMenuId] = useState(null);
  const menuRef = useRef(null);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(12); // Default to match image

  // Helper function to format dates like "10 hours ago"
  function relativeTime(dateString) {
    if (!dateString) return "";
    const date = new Date(dateString);
    // Check if date is valid
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
    // Fetch all queries for the main list view
    const fetchAllQueries = async () => {
      try {
        setLoading(true);
        // Use the correct API endpoint for fetching all queries
        const res = await fetch(`${config.apiUrl}/api/admin/pending-queries`, {
          credentials: "include", // Important for authentication
        });

        if (!res.ok) {
          // Attempt to get more info from error response if available
          const errorData = await res
            .json()
            .catch(() => ({ message: res.statusText }));
          throw new Error(
            errorData.message ||
              `Failed to fetch queries (Status: ${res.status})`
          );
        }

        const data = await res.json();
        setQueries(data);
      } catch (err) {
        console.error("Fetch error:", err); // Log to console for debugging
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchAllQueries();
  }, []); // Empty dependency array means this runs only once on mount

  // Pagination Logic
  const totalPages = Math.ceil(queries.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentQueries = queries.slice(startIndex, endIndex);

  const handlePageChange = (page) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  const handleViewQuery = (queryId) => {
    router.push(`/ListManagement/${queryId}`);
  };

  // Status component rendering, matching the image's "In Progress" look
  const getStatusComponent = (status) => {
    const isCompleted = status?.toLowerCase() === "completed"; // Assuming 'completed' is another status
    const isInProgress = status?.toLowerCase() === "in progress"; // Explicitly check for "In Progress"

    const baseClasses =
      "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold";
    let colorClasses = "";
    let text = "In Progress"; // Default text

    if (isCompleted) {
      colorClasses = "bg-green-600 text-white";
      text = "Completed";
    } else if (isInProgress) {
      colorClasses = "bg-blue-700 text-white"; // Blue color for "In Progress" as per image
      text = "In Progress";
    } else {
      // Default for any other status, e.g., pending, processing, etc.
      colorClasses = "rounded-md bg-[#04145C] text-white";
      text = status || "Unknown";
    }

    return (
      <span className={`${baseClasses} ${colorClasses}`}>
        {/* Use the RefreshIcon for status indicators as seen in the image */}
        <RefreshIcon className="h-3 w-3" />
        {text}
      </span>
    );
  };

  // Generate page numbers without duplication
  const getPageNumbers = () => {
    const pageNumbers = [];
    const maxPagesToShow = 3;
    let startPage = Math.max(1, currentPage - Math.floor(maxPagesToShow / 2));
    let endPage = Math.min(totalPages, startPage + maxPagesToShow - 1);

    // Adjust startPage if endPage is less than maxPagesToShow
    if (endPage - startPage + 1 < maxPagesToShow) {
      startPage = Math.max(1, endPage - maxPagesToShow + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
      pageNumbers.push(i);
    }

    // If totalPages > maxPagesToShow, add ellipsis and last page if necessary
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

  // Loading and Error States
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
            onClick={() => window.location.reload()} // Simple refresh on error
            className="mt-4 rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
          >
            Retry
          </button>
        </div>
      </AdminRoute>
    );

  return (
    <DashboardContainer heading="List Management">
      <AdminRoute>
        {/* Main container with dotted border */}
        <div className="min-h-screen bg-gray-50 font-sans text-gray-800">
          <div className="relative rounded-xl bg-white p-4 shadow-lg md:p-6">
        

            {/* Main Content Area - Table */}
            <main className="overflow-hidden rounded-lg">
              <div className="overflow-x-auto h-[80vh] ">
                <table className="w-full border-collapse">
                  {/* Table Header */}
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400 md:px-6 md:py-4">
                        User Name <SortIcon />
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400 md:px-6 md:py-4">
                        List Name <SortIcon />
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400 md:px-6 md:py-4">
                        List Type <SortIcon />
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400 md:px-6 md:py-4">
                        Total User <SortIcon />
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400 md:px-6 md:py-4">
                        Status <SortIcon />
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400 md:px-6 md:py-4">
                        Created On <SortIcon />
                      </th>
                    </tr>
                  </thead>

                  {/* Table Body */}
                  <tbody className="divide-y divide-gray-200">
                    {currentQueries.length > 0 ? (
                      currentQueries.map((query) => (
                        <tr
                          key={query.queryId}
                          onClick={() => {
                                      handleViewQuery(query.queryId);
                                    }}
                          className="cursor-pointer group transition-colors hover:bg-gray-50"
                        >
                          <td className="whitespace-nowrap px-4 py-2 text-sm font-medium text-gray-800 md:px-6 md:py-2">
                            {query.userName}
                          </td>
                          <td className="whitespace-nowrap px-4 py-2 text-sm text-gray-600 md:px-6 md:py-2">
                            {query.listName}
                          </td>
                          <td className="whitespace-nowrap px-4 py-2 text-sm text-gray-600 md:px-6 md:py-2">
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                                ["company", "companies"].includes(String(query.listType || "").toLowerCase())
                                  ? "bg-purple-100 text-purple-700"
                                  : "bg-blue-100 text-blue-700"
                              }`}
                            >
                              {["company", "companies"].includes(String(query.listType || "").toLowerCase()) ? "Companies" : "People"}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-2 text-sm text-gray-600 md:px-6 md:py-2">
                            {query.totalUsers}
                          </td>
                          <td className="whitespace-nowrap px-4 py-2 text-sm md:px-6 md:py-2">
                            {getStatusComponent(query.status)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-2 text-sm text-gray-600 md:px-6 md:py-2">
                            {relativeTime(query.createdAt)}
                          </td>
                          
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td
                          colSpan="6"
                          className="py-10 text-center text-sm text-gray-500"
                        >
                          No lists found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </main>

            {/* Footer with Pagination */}
            <footer className="mt-px flex flex-col items-center justify-between gap-4 border-t border-gray-200 bg-white p-4 text-sm text-gray-600 md:flex-row md:p-6">
              <div className="flex items-center gap-2">
                Showing
                <select
                  className="rounded-md border border-gray-300 bg-gray-50 px-2 py-1 text-sm text-gray-700 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  value={itemsPerPage}
                  onChange={(e) => {
                    setItemsPerPage(Number(e.target.value));
                    setCurrentPage(1); // Reset to first page when items per page changes
                  }}
                >
                  <option value="12">12</option>
                  <option value="24">24</option>
                  <option value="50">50</option>
                </select>
                out of {queries.length}
              </div>

              <div className="flex items-center gap-1">
                {/* Previous Button */}
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="flex h-8 w-8 items-center justify-center rounded border border-gray-300 bg-white text-gray-500 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  &lt;
                </button>

                {/* Page Numbers */}
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
                      key={page} // Unique key for each page number
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

                {/* Next Button */}
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
