"use client";

import React, { useEffect, useState } from "react";
import axios from "axios";
import Swal from "sweetalert2";

const config = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000",
};

export default function IntegrationsPage() {
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pipedriveConnected, setPipedriveConnected] = useState(false);
  const [pipedriveLoading, setPipedriveLoading] = useState(true);

  useEffect(() => {
    checkSalesforceStatus();
    checkPipedriveStatus();
    const params = new URLSearchParams(window.location.search);
    const pd = params.get("pipedrive");
    if (pd === "connected") {
      Swal.fire({
        icon: "success",
        title: "Connected",
        text: "Connected to Pipedrive successfully",
        timer: 2000,
        showConfirmButton: false,
      });
      window.history.replaceState({}, "", "/integrations");
    } else if (pd === "error") {
      Swal.fire({
        icon: "error",
        title: "Pipedrive connection failed",
        text: "Could not complete Pipedrive authorization.",
      });
      window.history.replaceState({}, "", "/integrations");
    }
  }, []);

  const checkSalesforceStatus = async () => {
    try {
      const response = await axios.get(`${config.apiUrl}/api/salesforce/status`, {
        withCredentials: true,
      });
      setIsConnected(response.data.isConnected);
    } catch (error) {
      console.error("Error checking Salesforce status:", error);
    } finally {
      setLoading(false);
    }
  };

  const checkPipedriveStatus = async () => {
    try {
      const response = await axios.get(`${config.apiUrl}/api/pipedrive/status`, {
        withCredentials: true,
      });
      setPipedriveConnected(response.data.isConnected);
    } catch (error) {
      console.error("Error checking Pipedrive status:", error);
    } finally {
      setPipedriveLoading(false);
    }
  };

  const handleConnect = () => {
    // Redirect user to the backend connect route which starts OAuth flow
    window.location.href = `${config.apiUrl}/api/salesforce/connect`;
  };

  const handleDisconnect = async () => {
    try {
      setLoading(true);
      await axios.post(
        `${config.apiUrl}/api/salesforce/disconnect`,
        {},
        { withCredentials: true }
      );
      setIsConnected(false);
      Swal.fire({
        icon: "success",
        title: "Disconnected",
        text: "Disconnected from Salesforce successfully",
        timer: 2000,
        showConfirmButton: false,
      });
    } catch (error) {
      console.error("Error disconnecting:", error);
      Swal.fire({
        icon: "error",
        title: "Error",
        text: "Failed to disconnect from Salesforce",
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePipedriveConnect = () => {
    window.location.href = `${config.apiUrl}/api/pipedrive/connect`;
  };

  const handlePipedriveDisconnect = async () => {
    try {
      setPipedriveLoading(true);
      await axios.post(
        `${config.apiUrl}/api/pipedrive/disconnect`,
        {},
        { withCredentials: true }
      );
      setPipedriveConnected(false);
      Swal.fire({
        icon: "success",
        title: "Disconnected",
        text: "Disconnected from Pipedrive successfully",
        timer: 2000,
        showConfirmButton: false,
      });
    } catch (error) {
      console.error("Error disconnecting Pipedrive:", error);
      Swal.fire({
        icon: "error",
        title: "Error",
        text: "Failed to disconnect from Pipedrive",
      });
    } finally {
      setPipedriveLoading(false);
    }
  };

  return (
    <div className="p-8 w-full max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-8 text-gray-800">Integrations</h1>
      
      <div className="space-y-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 bg-blue-50 rounded-xl flex items-center justify-center">
            {/* Salesforce Logo SVG */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 256 256"
              className="w-10 h-10 text-[#00A1E0]"
              fill="currentColor"
            >
              <path d="M168.1,89.5c-3.1-23.7-25-41.5-49.8-38.4c-17.7,2.2-32.5,15.1-37.1,32.4c-1.3,0-2.5-0.1-3.8-0.1
              c-15.6,0-28.2,12.6-28.2,28.2c0,3.1,0.5,6.1,1.5,8.9C36,122.9,25.6,135,25.6,149.2c0,16.5,13.4,29.9,29.9,29.9h121.3
              c20.3,0,36.7-16.4,36.7-36.7C213.6,118.8,193.3,100,168.1,89.5z"/>
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-800">Salesforce</h2>
            <p className="text-gray-500 mt-1">
              Sync your Mawsool leads directly to your Salesforce CRM.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {loading ? (
            <div className="w-24 h-10 bg-gray-200 animate-pulse rounded-lg"></div>
          ) : isConnected ? (
            <>
              <span className="px-3 py-1 bg-green-100 text-green-700 font-medium rounded-full text-sm">
                Connected
              </span>
              <button
                onClick={handleDisconnect}
                className="px-4 py-2 border border-red-200 text-red-600 hover:bg-red-50 rounded-lg transition-colors font-medium"
              >
                Disconnect
              </button>
            </>
          ) : (
            <button
              onClick={handleConnect}
              className="px-6 py-2 bg-[#00A1E0] hover:bg-[#0089bf] text-white rounded-lg transition-colors font-medium"
            >
              Connect
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 bg-green-50 rounded-xl flex items-center justify-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              className="w-10 h-10 text-[#017737]"
              fill="currentColor"
            >
              <path d="M12 2C6.48 2 2 6.04 2 11.02c0 2.9 1.5 5.48 3.82 7.14v3.34c0 .4.44.65.78.44l3.16-1.9c.72.16 1.47.24 2.24.24 5.52 0 10-4.04 10-9.02S17.52 2 12 2zm-1.1 12.3L8.3 11.7l1.06-1.06 1.54 1.54 3.74-3.74L15.7 9.5l-4.8 4.8z"/>
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-800">Pipedrive</h2>
            <p className="text-gray-500 mt-1">
              Push selected Mawsool leads as persons and organizations in Pipedrive.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {pipedriveLoading ? (
            <div className="w-24 h-10 bg-gray-200 animate-pulse rounded-lg"></div>
          ) : pipedriveConnected ? (
            <>
              <span className="px-3 py-1 bg-green-100 text-green-700 font-medium rounded-full text-sm">
                Connected
              </span>
              <button
                onClick={handlePipedriveDisconnect}
                className="px-4 py-2 border border-red-200 text-red-600 hover:bg-red-50 rounded-lg transition-colors font-medium"
              >
                Disconnect
              </button>
            </>
          ) : (
            <button
              onClick={handlePipedriveConnect}
              className="px-6 py-2 bg-[#017737] hover:bg-[#015c2b] text-white rounded-lg transition-colors font-medium"
            >
              Connect
            </button>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
