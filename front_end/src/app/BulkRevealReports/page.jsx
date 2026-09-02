'use client';
import React from 'react';
import axios from 'axios';
import Link from 'next/link';
import AdminRoute from '@/components/AdminRoute';

const config = { apiUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000' };

export default function BulkRevealReportsPage() {
  const [rows, setRows] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const res = await axios.get(`${config.apiUrl}/api/admin/bulk-reveal-reports?limit=50&page=1`, { withCredentials: true });
        if (!mounted) return;
        setRows(Array.isArray(res.data?.reports) ? res.data.reports : []);
      } catch (e) {
        if (!mounted) return;
        setError(e?.response?.data?.message || e?.message || 'Failed to load reports');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  return (
    <AdminRoute>
      <div className="p-6">
        <div className="text-xl font-semibold mb-4">Bulk Reveal Reports</div>
        {loading ? (
          <div className="text-sm text-gray-600">Loading...</div>
        ) : error ? (
          <div className="text-sm text-red-600">{error}</div>
        ) : (
          <div className="overflow-x-auto bg-white rounded-lg border border-gray-200">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-700">
                <tr>
                  <th className="text-left px-4 py-3">Job ID</th>
                  <th className="text-left px-4 py-3">User Email</th>
                  <th className="text-left px-4 py-3">List</th>
                  <th className="text-left px-4 py-3">Type</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3">Total Cost</th>
                  <th className="text-left px-4 py-3">Created</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.jobId} className="border-t border-gray-100">
                    <td className="px-4 py-3">
                      <Link href={`/BulkRevealReports/${encodeURIComponent(r.jobId)}`} className="text-blue-600 hover:underline">
                        {r.jobId}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{r.userEmail || ''}</td>
                    <td className="px-4 py-3">{String(r.listId || '')}</td>
                    <td className="px-4 py-3">{r.revealType}</td>
                    <td className="px-4 py-3">{r.status}</td>
                    <td className="px-4 py-3">{r.totalCost}</td>
                    <td className="px-4 py-3">{r.createdAt ? new Date(r.createdAt).toLocaleString() : ''}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td className="px-4 py-6 text-gray-600" colSpan={7}>No reports found</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminRoute>
  );
}

