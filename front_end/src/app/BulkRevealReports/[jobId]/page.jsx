'use client';
import React from 'react';
import axios from 'axios';
import Link from 'next/link';
import AdminRoute from '@/components/AdminRoute';

const config = { apiUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000' };

export default function BulkRevealReportDetailsPage({ params }) {
  const resolvedParams = React.use(params);
  const jobId = resolvedParams?.jobId ? decodeURIComponent(resolvedParams.jobId) : '';
  const [report, setReport] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    if (!jobId) return;
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const res = await axios.get(`${config.apiUrl}/api/admin/bulk-reveal-reports/${encodeURIComponent(jobId)}`, { withCredentials: true });
        if (!mounted) return;
        setReport(res.data?.report || null);
      } catch (e) {
        if (!mounted) return;
        setError(e?.response?.data?.message || e?.message || 'Failed to load report');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [jobId]);

  return (
    <AdminRoute>
      <div className="p-6">
        <div className="mb-4">
          <Link href="/BulkRevealReports" className="text-blue-600 hover:underline text-sm">Back</Link>
        </div>
        <div className="text-xl font-semibold mb-4">Bulk Reveal Report</div>
        {loading ? (
          <div className="text-sm text-gray-600">Loading...</div>
        ) : error ? (
          <div className="text-sm text-red-600">{error}</div>
        ) : !report ? (
          <div className="text-sm text-gray-600">Not found</div>
        ) : (
          <>
            <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4 text-sm">
              <div><span className="font-medium">Job ID:</span> {report.jobId}</div>
              <div><span className="font-medium">List ID:</span> {String(report.listId || '')}</div>
              <div><span className="font-medium">User Email:</span> {report.userEmail || ''}</div>
              <div><span className="font-medium">Type:</span> {report.revealType}</div>
              <div><span className="font-medium">Status:</span> {report.status}</div>
              <div><span className="font-medium">Total Cost:</span> {report.totalCost}</div>
            </div>

            <div className="overflow-x-auto bg-white rounded-lg border border-gray-200">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-gray-700">
                  <tr>
                    <th className="text-left px-4 py-3">Name</th>
                    <th className="text-left px-4 py-3">LinkedIn</th>
                    <th className="text-left px-4 py-3">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {(report.items || []).map((it) => (
                    <tr key={it.leadKey} className="border-t border-gray-100">
                      <td className="px-4 py-3">{it.name || ''}</td>
                      <td className="px-4 py-3">
                        {it.linkedinUrl ? (
                          <a href={it.linkedinUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                            {it.linkedinUrl}
                          </a>
                        ) : (
                          ''
                        )}
                      </td>
                      <td className="px-4 py-3">{it.cost}</td>
                    </tr>
                  ))}
                  {(report.items || []).length === 0 && (
                    <tr>
                      <td className="px-4 py-6 text-gray-600" colSpan={3}>No lead rows stored for this job</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </AdminRoute>
  );
}

