'use client';
import React from 'react';
import axios from 'axios';
import AdminRoute from '@/components/AdminRoute';

const config = { apiUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000' };

export default function RevealsReportPage() {
  const [summaryRows, setSummaryRows] = React.useState([]);
  const [detailsRows, setDetailsRows] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  
  const [viewMode, setViewMode] = React.useState('summary'); // 'summary' | 'details' | 'search'
  const [selectedUser, setSelectedUser] = React.useState(null); // { userId, name, email, date }
  
  const [page, setPage] = React.useState(1);
  const [totalPages, setTotalPages] = React.useState(1);
  const [dateFilter, setDateFilter] = React.useState(new Date().toISOString().split('T')[0]); // Default to today

  const [searchInput, setSearchInput] = React.useState('');
  const [searchQuery, setSearchQuery] = React.useState('');

  const fetchSummary = async (p = 1, date = '') => {
    try {
      setLoading(true);
      setError('');
      const params = new URLSearchParams({ limit: 50, page: p });
      if (date) params.append('date', date);
      
      const res = await axios.get(`${config.apiUrl}/api/admin/reveals-report/summary?${params.toString()}`, { withCredentials: true });
      setSummaryRows(Array.isArray(res.data?.summary) ? res.data.summary : []);
      setTotalPages(res.data?.totalPages || 1);
      setPage(res.data?.page || p);
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to load reveals summary');
    } finally {
      setLoading(false);
    }
  };

  const fetchDetails = async (userId, date, p = 1, search = '') => {
    try {
      setLoading(true);
      setError('');
      const params = new URLSearchParams({ limit: 50, page: p });
      if (userId) params.append('userId', userId);
      if (date) params.append('date', date);
      if (search) params.append('search', search);
      
      const res = await axios.get(`${config.apiUrl}/api/admin/reveals-report?${params.toString()}`, { withCredentials: true });
      setDetailsRows(Array.isArray(res.data?.logs) ? res.data.logs : []);
      setTotalPages(res.data?.totalPages || 1);
      setPage(res.data?.page || p);
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to load reveals details');
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    if (viewMode === 'summary') {
      fetchSummary(page, dateFilter);
    } else if (viewMode === 'details' && selectedUser) {
      fetchDetails(selectedUser.userId, selectedUser.date, page, '');
    } else if (viewMode === 'search') {
      fetchDetails(null, dateFilter, page, searchQuery);
    }
  }, [page, dateFilter, viewMode, selectedUser, searchQuery]);

  const executeSearch = () => {
    if (!searchInput.trim()) {
      setSearchQuery('');
      setViewMode('summary');
      setPage(1);
      return;
    }
    setSearchQuery(searchInput.trim());
    setSelectedUser(null);
    setViewMode('search');
    setPage(1);
  };

  const clearFilters = () => {
    setDateFilter('');
    setSearchInput('');
    setSearchQuery('');
    setSelectedUser(null);
    setViewMode('summary');
    setPage(1);
  };

  const handleDateChange = (e) => {
    setDateFilter(e.target.value);
    setPage(1); // Reset to page 1 on filter change
    if (viewMode === 'details') {
      setViewMode('summary');
      setSelectedUser(null);
    }
  };

  const handleRowClick = (row) => {
    setSelectedUser({
      userId: row.userId,
      name: row.userName,
      email: row.userEmail,
      date: row.date
    });
    setPage(1);
    setViewMode('details');
  };

  const handleBackToSummary = () => {
    setSelectedUser(null);
    setPage(1);
    setViewMode('summary');
  };

  const handlePrevPage = () => {
    if (page > 1) setPage(page - 1);
  };

  const handleNextPage = () => {
    if (page < totalPages) setPage(page + 1);
  };

  return (
    <AdminRoute>
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="text-xl font-semibold">Daily Reveals Report</div>
          {viewMode === 'details' && (
            <button 
              onClick={handleBackToSummary}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium transition-colors"
            >
              &larr; Back to Summary
            </button>
          )}
        </div>
        
        {viewMode !== 'details' && (
          <div className="mb-4 flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Filter by Date</label>
              <input 
                type="date" 
                className="border border-gray-300 rounded px-3 py-1.5 text-sm"
                value={dateFilter}
                onChange={handleDateChange}
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Search by Public ID / URL</label>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  className="border border-gray-300 rounded px-3 py-1.5 text-sm w-64"
                  placeholder="Enter public ID..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && executeSearch()}
                />
                <button 
                  onClick={executeSearch}
                  className="px-4 py-1.5 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 transition-colors"
                >
                  Search
                </button>
              </div>
            </div>

            {(dateFilter || searchQuery) && (
              <div className="mb-1.5">
                <button 
                  onClick={clearFilters}
                  className="text-sm text-blue-600 hover:underline"
                >
                  Clear Filters
                </button>
              </div>
            )}
          </div>
        )}

        {viewMode === 'details' && selectedUser && (
          <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-100 flex justify-between items-center">
            <div>
              <h3 className="font-semibold text-blue-900">{selectedUser.name || 'Unknown User'}</h3>
              <p className="text-sm text-blue-700">{selectedUser.email || 'N/A'}</p>
            </div>
            <div className="text-right">
              <span className="text-xs text-blue-600 font-medium uppercase tracking-wider">Date</span>
              <p className="font-medium text-blue-900">{selectedUser.date}</p>
            </div>
          </div>
        )}

        {loading && (viewMode === 'summary' ? summaryRows.length === 0 : detailsRows.length === 0) ? (
          <div className="text-sm text-gray-600">Loading...</div>
        ) : error ? (
          <div className="text-sm text-red-600">{error}</div>
        ) : (
          <div className="overflow-x-auto bg-white rounded-lg border border-gray-200 shadow-sm">
            
            {/* SUMMARY TABLE */}
            {viewMode === 'summary' && (
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-gray-700 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold">Date</th>
                    <th className="text-left px-4 py-3 font-semibold">User Name</th>
                    <th className="text-left px-4 py-3 font-semibold">User Email</th>
                    <th className="text-left px-4 py-3 font-semibold text-center">Total Credits</th>
                    <th className="text-left px-4 py-3 font-semibold text-center">Extension</th>
                    <th className="text-left px-4 py-3 font-semibold text-center">Bulk</th>
                    <th className="text-left px-4 py-3 font-semibold text-center">Site</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {summaryRows.map((r, i) => (
                    <tr 
                      key={i} 
                      className="hover:bg-blue-50 transition-colors cursor-pointer group"
                      onClick={() => handleRowClick(r)}
                    >
                      <td className="px-4 py-4 whitespace-nowrap text-gray-600 font-medium">
                        {r.date}
                      </td>
                      <td className="px-4 py-4 font-semibold text-gray-800">{r.userName || 'Unknown'}</td>
                      <td className="px-4 py-4 text-gray-600">{r.userEmail || 'N/A'}</td>
                      <td className="px-4 py-4 text-center">
                        <span className="font-bold text-gray-900 bg-gray-100 px-2 py-1 rounded">{r.totalCredits}</span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className={`font-medium ${r.extensionCount > 0 ? 'text-purple-600' : 'text-gray-400'}`}>
                          {r.extensionCount}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className={`font-medium ${r.bulkCount > 0 ? 'text-blue-600' : 'text-gray-400'}`}>
                          {r.bulkCount}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className={`font-medium ${r.siteCount > 0 ? 'text-emerald-600' : 'text-gray-400'}`}>
                          {r.siteCount}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <span className="text-blue-600 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                          View Details &rarr;
                        </span>
                      </td>
                    </tr>
                  ))}
                  {summaryRows.length === 0 && (
                    <tr>
                      <td className="px-4 py-8 text-center text-gray-500" colSpan={8}>
                        No credit consumption found for the selected date.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}

            {/* DETAILS & SEARCH TABLE */}
            {(viewMode === 'details' || viewMode === 'search') && (
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-gray-700 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold">Time</th>
                    {viewMode === 'search' && (
                      <>
                        <th className="text-left px-4 py-3 font-semibold">User Name</th>
                        <th className="text-left px-4 py-3 font-semibold">User Email</th>
                      </>
                    )}
                    <th className="text-left px-4 py-3 font-semibold">Source</th>
                    <th className="text-left px-4 py-3 font-semibold">Description</th>
                    <th className="text-left px-4 py-3 font-semibold">Credits Deducted</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {detailsRows.map((r) => (
                    <tr key={r._id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                        {r.createdAt ? new Date(r.createdAt).toLocaleString() : ''}
                      </td>
                      {viewMode === 'search' && (
                        <>
                          <td className="px-4 py-3 font-medium text-gray-800">{r.user?.name || 'Unknown'}</td>
                          <td className="px-4 py-3 text-gray-600">{r.user?.email || 'N/A'}</td>
                        </>
                      )}
                      <td className="px-4 py-3">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                          r.source === 'Extension' ? 'bg-purple-100 text-purple-700' :
                          r.source === 'Bulk' ? 'bg-blue-100 text-blue-700' :
                          'bg-emerald-100 text-emerald-700'
                        }`}>
                          {r.source}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {r.description || 'N/A'}
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {r.amount}
                      </td>
                    </tr>
                  ))}
                  {detailsRows.length === 0 && (
                    <tr>
                      <td className="px-4 py-8 text-center text-gray-500" colSpan={viewMode === 'search' ? 6 : 4}>
                        No specific reveal logs found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
            
            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-t border-gray-200">
                <span className="text-sm text-gray-600">
                  Page {page} of {totalPages}
                </span>
                <div className="flex gap-2">
                  <button 
                    onClick={handlePrevPage} 
                    disabled={page === 1}
                    className="px-3 py-1.5 border border-gray-300 rounded text-sm bg-white disabled:opacity-50 hover:bg-gray-50"
                  >
                    Previous
                  </button>
                  <button 
                    onClick={handleNextPage} 
                    disabled={page === totalPages}
                    className="px-3 py-1.5 border border-gray-300 rounded text-sm bg-white disabled:opacity-50 hover:bg-gray-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </AdminRoute>
  );
}