"use client";

import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from './AuthContext';

// Temporary local config to avoid import issues
const config = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000"
};

const ToastContext = createContext(null);

export const useToast = () => useContext(ToastContext);

export const ToastProvider = ({ children }) => {
  const [activeJobs, setActiveJobs] = useState({});
  const auth = useAuth(); // Safely access auth state if available

  // Poll for active list sync/reveal jobs globally
  useEffect(() => {
    // Stop polling and clear jobs if user is explicitly not authenticated
    if (auth && auth.isAuthenticated === false) {
      setActiveJobs({});
      return;
    }

    let pollInterval;
    
    const fetchActiveJobs = async () => {
      try {
        const response = await axios.get(`${config.apiUrl}/api/list`, {
          headers: { "Content-Type": "application/json" },
          withCredentials: true,
        });
        
        if (Array.isArray(response.data)) {
          const newActiveJobs = {};
          response.data.forEach(list => {
            if (list.revealStatus === 'running' || list.isSyncing) {
              newActiveJobs[list._id] = {
                name: list.name,
                type: list.revealStatus === 'running' ? `Revealing ${list.revealProgress?.type || 'data'}` : 'Syncing',
                current: list.revealProgress?.current || 0,
                total: list.revealProgress?.total || 0,
                isSyncing: list.isSyncing
              };
            }
          });
          setActiveJobs(newActiveJobs);
        }
      } catch (err) {
        // If we get an unauthorized error (user signed out), clear the active jobs
        if (err.response && (err.response.status === 401 || err.response.status === 403)) {
          setActiveJobs({});
        }
        // Silent fail for other background polling errors
      }
    };

    // Initial fetch
    fetchActiveJobs();

    // Poll every 5 seconds
    pollInterval = setInterval(fetchActiveJobs, 5000);

    return () => {
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [auth?.isAuthenticated]);

  return (
    <ToastContext.Provider value={{ activeJobs }}>
      {children}
      
      {/* Render Toasts */}
      {Object.keys(activeJobs).length > 0 && (
        <div className="fixed top-24 right-4 z-50 flex flex-col gap-2">
          {Object.entries(activeJobs).map(([listId, job]) => (
            <div 
              key={listId} 
              className="bg-white border border-[#E5E6E6] rounded-xl shadow-lg p-4 min-w-[300px] animate-slide-in-right"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-blue-600"></div>
                  <span className="text-sm font-medium text-gray-900">{job.name}</span>
                </div>
              </div>
              <div className="text-xs text-gray-500 mb-2">{job.type}...</div>
              
              {!job.isSyncing && job.total > 0 && (
                <div className="w-full">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-medium text-blue-600">{job.current} / {job.total}</span>
                    <span className="text-gray-500">{Math.round((job.current / job.total) * 100)}%</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-1.5">
                    <div 
                      className="bg-blue-600 h-1.5 rounded-full transition-all duration-500" 
                      style={{ width: `${Math.max(5, (job.current / job.total) * 100)}%` }}
                    ></div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
};
