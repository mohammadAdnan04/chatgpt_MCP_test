﻿﻿"use client";

import Modal from "@/components/shared/Modal";
import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/contexts/AuthContext";
import axios from "axios";
import Swal from "sweetalert2"; // Import SweetAlert2
import { useRouter } from "next/navigation";

const Dropdown = ({
  options = [],
  placeholder = "",
  className = "",
  value,
  onChange,
  ...props
}) => (
  <div className="relative w-full">
    <select
      className={`w-full input__field pr-10 ${className}`}
      style={{
        appearance: "none",
        WebkitAppearance: "none",
        MozAppearance: "none",
        background: "none",
        position: "relative",
        zIndex: 1,
      }}
      value={value}
      onChange={onChange}
      {...props}
    >
      {placeholder && (
        <option value="" disabled={!!value}>
          {placeholder}
        </option>
      )}
      {options.map((opt) =>
        typeof opt === "object" ? (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ) : (
          <option key={opt} value={opt}>
            {opt}
          </option>
        )
      )}
    </select>
    <span
      className="pointer-events-none absolute right-2 top-1/2 transform -translate-y-1/2 text-[#aaa]"
      style={{ zIndex: 2 }}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path
          d="M7 10l5 5 5-5"
          stroke="#aaa"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  </div>
);

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

const AIBulkPrompt = ({ setAiSearchQuery, result, searchFilter, searchMode = "people", onStepChange, forceStep, isTour, tourStep }) => {
  const { credits, personalCredits, creditScope } = useAuth();
  const availableCredits = typeof credits === "number" ? (creditScope === "org" ? (credits + personalCredits) : credits) : 999999;
  const [leads, setLeads] = useState("");
  const [phone, setPhone] = useState("");
  const [listName, setListName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [apiResult, setApiResult] = useState(null);
  
  // Pre-fill form if it's the tour
  useEffect(() => {
    if (isTour) {
      setPrompt(
        searchMode === "companies"
          ? '- "Return companies in the fintech sector" \n- "Add niche targeting variables beyond standard industries"'
          : '- "Return a maximum of 2 leads per company" \n- "Add niche targeting variables beyond standard industries"'
      );
      setListName("Example AI List");
      setLeads("10");
      setPhone("yes");
    }
  }, [isTour, searchMode]);

  const [step, setStep] = useState(forceStep || 1); // 1 = Form, 2 = Verify Filters
  
  // Update internal step if forceStep prop changes
  useEffect(() => {
    if (forceStep) {
      setStep(forceStep);
    }
  }, [forceStep]);

  
  // Notify parent component when step changes
  useEffect(() => {
    if (onStepChange) {
      onStepChange(step);
    }
  }, [step, onStepChange]);

  const router = useRouter();

  const config = {
    apiUrl: process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000",
  };

  // Calculate required credits and check sufficiency
  useEffect(() => {
    const numLeads = parseInt(leads) || 0;
    let totalCreditsRequired = 0;
    
    if (searchMode === "companies") {
      totalCreditsRequired = numLeads * 1;
    } else {
      const requiresPhone = phone === "yes";
      const creditsRequired = requiresPhone ? numLeads * 20 : 0;
      const creditsRequiredEmail = numLeads * 5;
      totalCreditsRequired = creditsRequired + creditsRequiredEmail;
    }

    if (numLeads > 0 && totalCreditsRequired > 0 && availableCredits < totalCreditsRequired) {
      setError("You don't have enough credits to proceed. Please <b><u><a href='/setting/planOverview'>upgrade your plan or buy extra credits</a></u></b> to continue.");
    } else {
      setError(""); // Clear error if credits are sufficient or no leads specified
    }
  }, [leads, phone, availableCredits, searchMode]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isTour) return; // Prevent submission during the tour
    setLoading(true);
    setError("");
    setApiResult(null);

    const numLeads = parseInt(leads) || 0;
    let totalCreditsRequired = 0;
    const requiresPhone = phone === "yes";
    
    if (searchMode === "companies") {
      totalCreditsRequired = numLeads * 1;
    } else {
      const creditsRequired = requiresPhone ? numLeads * 20 : 0;
      const creditsRequiredEmail = numLeads * 5;
      totalCreditsRequired = creditsRequired + creditsRequiredEmail;
    }

    // Validate credits before submission
    if (numLeads > 0 && totalCreditsRequired > 0 && availableCredits < totalCreditsRequired) {
      setError("You don't have enough credits to proceed. Please <b><u><a href='/setting/planOverview'>upgrade your plan or buy extra credits</a></u></b> to continue.");
      setLoading(false);
      return;
    }

    // Step 2 is now the form submission
    try {
      const response = await axios.post(
        `${config.apiUrl}/api/ai/submit`,
        {
          prompt: (prompt && prompt.trim()) ? prompt.trim() : "N/A",
          listName,
          numLeads: numLeads || undefined,
          includePhone: requiresPhone,
          searchFilter, // Note: This will be the latest searchFilter from props
          searchMode
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getAuthToken()}`,
          },
          withCredentials: true,
        }
      );

      // console.log("Γ£à AI prompt submitted successfully:", response.data);
      setApiResult(response.data);
      setAiSearchQuery(false); // Close modal on OK
      Swal.fire({
        imageUrl: "/icons/notFoundSearch.gif", 
        imageHeight: 150,
        title: "",
        text: `Thank you for submitting your ${searchMode === "companies" ? "company search" : "lead"}. We have received your request successfully.\nYour list will be ready within 48 hours.\nOnce it is ready, the status of your list will automatically change to Active on the List page.`,
        confirmButtonText: "Go to Lists",
        customClass: {
            confirmButton: "swal-confirm-button",
          },
      }).then((result) => {
        if (result.isConfirmed) {
            router.push("/lists");
        }
      });
    } catch (err) {
      // console.error("Γ¥î AI prompt submission error:", err);

      // Enhanced error handling
      if (err.response) {
        switch (err.response.status) {
          case 400:
            setError(err.response.data?.msg || "Bad request. Please check your input.");
            break;
          case 401:
            setError("Invalid or expired token. Please log in again.");
            break;
          case 403:
            setError("Authentication failed. Please log in again.");
            break;
          case 402:
            setError("Insufficient credits. Please upgrade your plan.");
            break;
          case 500:
            setError("Server error. Please try again later.");
            break;
          default:
            setError(`Server error: ${err.response.status}`);
        }
      } else if (err.request) {
        setError("No response from server. Please check your connection.");
      } else {
        setError("An unexpected error occurred. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  // Calculate total credits required for button disable logic
  const numLeadsDisplay = parseInt(leads) || 0;
  let totalCreditsRequiredDisplay = 0;
  
  if (searchMode === "companies") {
    totalCreditsRequiredDisplay = numLeadsDisplay * 1;
  } else {
    const requiresPhoneDisplay = phone === "yes";
    const creditsRequiredDisplay = requiresPhoneDisplay ? numLeadsDisplay * 20 : 0;
    const creditsRequiredEmailDisplay = numLeadsDisplay * 5;
    totalCreditsRequiredDisplay = creditsRequiredDisplay + creditsRequiredEmailDisplay;
  }

  // Helper to format currently active filters for display
  const renderActiveFilters = () => {
    if (!searchFilter || Object.keys(searchFilter).length === 0) {
      return <div className="text-gray-400 italic text-sm py-2">No filters applied.</div>;
    }

    return Object.entries(searchFilter).map(([key, value]) => {
      // Handle empty arrays/strings
      if (!value || (Array.isArray(value) && value.length === 0)) return null;
      
      // Format the key to be more readable
      const formattedKey = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      
      let displayValue = "";
      if (Array.isArray(value)) {
        displayValue = value.join(', ');
      } else if (typeof value === 'object') {
        // Handle include/exclude objects like { include: 'Software', exclude: 'Intern' }
        const parts = [];
        if (value.include && (!Array.isArray(value.include) || value.include.length > 0)) {
          parts.push(`Include: ${Array.isArray(value.include) ? value.include.join(', ') : value.include}`);
        }
        if (value.exclude && (!Array.isArray(value.exclude) || value.exclude.length > 0)) {
          parts.push(`Exclude: ${Array.isArray(value.exclude) ? value.exclude.join(', ') : value.exclude}`);
        }
        displayValue = parts.join(' | ');
        if (!displayValue) return null;
      } else {
        displayValue = String(value);
      }

      return (
        <div 
          key={key} 
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-[#E6F8FF] text-[#04145C] border border-[#00D2FF] shadow-[0_0_8px_rgba(0,210,255,0.3)] whitespace-nowrap overflow-hidden max-w-full"
        >
          <span className="font-bold opacity-80">{formattedKey}:</span>
          <span className="truncate">{displayValue}</span>
        </div>
      );
    });
  };

  if (step === 1) { // Step 1 is now Verify Filters
    const backdropContainer = typeof document !== 'undefined' ? document.getElementById('ai-prompt-backdrop-container') : null;
    const portalTarget = typeof document !== 'undefined' ? (isTour ? document.body : backdropContainer) : null;
    
    const VerifyUI = (
      <>
        {/* Semi-transparent backdrop that covers only the right side/table area to focus attention on the filter panel */}
        {!isTour && backdropContainer ? (
          /* Rendered via portal inside the table container, taking up exactly its width and height */
          <div className="absolute inset-0 bg-black/40 z-[998] pointer-events-auto rounded-[16px]" />
        ) : !isTour ? (
          /* Fallback if portal container isn't found */
          <div className="fixed inset-y-0 right-0 left-[350px] md:left-[430px] bg-black/40 z-[998] pointer-events-auto transition-all duration-300" />
        ) : null}
        
        {/* Verification modal - Centered inside the right-hand container */}
        <div className={`ai-prompt-verify-modal fixed top-1/2 transform -translate-y-1/2 z-[9999] bg-white p-6 rounded-2xl shadow-2xl border-2 border-[#00D2FF] w-[400px] ${!isTour && backdropContainer ? 'left-1/2 -translate-x-1/2 relative mx-auto shadow-[0_0_50px_rgba(0,0,0,0.5)]' : 'left-[calc(50%+215px)] -translate-x-1/2'} ${isTour ? 'pointer-events-none' : ''}`} style={!isTour && backdropContainer ? { position: 'absolute' } : {}}>
          <h3 className="text-xl font-bold text-[#04145C] mb-4 text-left">Verify Your Filters</h3>
          
          <div className="bg-[#E6F8EB] border border-[#34D399] p-3.5 rounded-xl mb-5 shadow-sm text-left flex items-start gap-3">
            <svg className="w-5 h-5 text-[#059669] shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-[14px] leading-relaxed text-[#065F46] font-medium">
              The AI will use your currently applied filters to generate leads. 
              <span className="block mt-1">You can edit them on the left panel right now.</span>
            </p>
          </div>
          
          <div className="bg-[#F8F9FA] p-4 rounded-xl mb-6 text-xs text-gray-500 max-h-[180px] overflow-y-auto custom-scrollbar border border-gray-200">
            <div className="font-semibold text-[#04145C] mb-3 text-sm flex items-center gap-2">
              <svg className="w-4 h-4 text-[#00D2FF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              Active Filters
            </div>
            <div className="flex flex-wrap gap-2">
              {renderActiveFilters()}
            </div>
          </div>
          <div className="flex justify-between gap-3">
            <button
              type="button"
              className="w-full bg-gray-200 text-gray-700 px-4 py-2 rounded-xl text-sm font-medium hover:bg-gray-300 transition-colors"
              onClick={() => {
                if (onStepChange) onStepChange(0); // Tell parent we are closing (step 0/null)
                setAiSearchQuery(false);
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="ai-prompt-next-btn w-full bg-[#00D2FF] text-[#04145C] px-4 py-2 rounded-xl text-sm font-medium flex items-center justify-center gap-2 hover:bg-[#00C4E6] transition-colors"
              onClick={() => setStep(2)} // Move to form
            >
              Next <span className="text-lg leading-none">&rarr;</span>
            </button>
          </div>
        </div>
      </>
    );

    return portalTarget ? createPortal(VerifyUI, portalTarget) : VerifyUI;
  }

  // Step 2 is now the form
  const backdropContainer = typeof document !== 'undefined' ? document.getElementById('ai-prompt-backdrop-container') : null;
  const portalTarget = typeof document !== 'undefined' ? (isTour ? document.body : backdropContainer) : null;
  
  const FormUI = (
    <>
      {/* Semi-transparent backdrop that covers only the right side/table area to focus attention on the filter panel */}
      {!isTour && backdropContainer ? (
        /* Rendered via portal inside the table container, taking up exactly its width and height */
        <div className="absolute inset-0 bg-black/40 z-[998] pointer-events-auto rounded-[16px]" />
      ) : !isTour ? (
        /* Fallback if portal container isn't found */
        <div className="fixed inset-y-0 right-0 left-[350px] md:left-[430px] bg-black/40 z-[998] pointer-events-auto transition-all duration-300" />
      ) : null}
      
      {/* Form modal - Centered inside the right-hand container with matching styling */}
      <div className={`ai-prompt-form-modal fixed top-1/2 transform -translate-y-1/2 z-[9999] bg-white p-6 rounded-2xl shadow-2xl border-2 border-[#00D2FF] w-[500px] max-h-[90vh] overflow-y-auto custom-scrollbar ${!isTour && backdropContainer ? 'left-1/2 -translate-x-1/2 relative mx-auto shadow-[0_0_50px_rgba(0,0,0,0.5)]' : 'left-[calc(50%+215px)] -translate-x-1/2'} ${isTour ? 'pointer-events-none' : ''}`} style={!isTour && backdropContainer ? { position: 'absolute' } : {}}>
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-lg font-semibold text-[#04145C]">Mawsool AI Prompt</h3>
          <button 
            onClick={() => {
              if (onStepChange) onStepChange(0); // Tell parent we are closing
              setAiSearchQuery(false);
            }}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <p className="text-sm text-gray-600 mb-4">
          {searchMode === "companies" 
            ? "Tell Our AI more about your target companies" 
            : "Tell Our AI more about your Ideal Customer Profile (ICP)"}
        </p>

        <form
          className="flex flex-col items-start w-full gap-4"
          onSubmit={handleSubmit}
        >
          <input
            type="text"
            placeholder="List Name"
            className="input__field w-full border border-gray-200 rounded-lg p-2.5 text-sm focus:border-[#00D2FF] focus:ring-1 focus:ring-[#00D2FF] outline-none transition-all"
            value={listName}
            onChange={(e) => setListName(e.target.value)}
            required
          />
          <textarea
            rows={6}
            className={`input__field w-full rounded-lg p-2.5 text-sm outline-none transition-all resize-none ${
              isTour && tourStep === 6 
                ? 'border-2 border-[#00D2FF] bg-[#F0FAFF] text-[#04145C] font-medium shadow-[0_0_20px_rgba(0,210,255,0.6)]' 
                : 'border border-gray-200 focus:border-[#00D2FF] focus:ring-1 focus:ring-[#00D2FF]'
            }`}
            placeholder={searchMode === "companies" 
              ? `Share more about your target companies so our AI Agent can personalize your experience.

- "Return companies in the fintech sector" 
- "Add niche targeting variables beyond standard industries"`
              : `Share more about your Ideal Customer Profile (ICP) so our AI Agent can personalize your experience.

- "Return a maximum of 2 leads per company" 
- "Add niche targeting variables beyond standard industries"`}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
          <input
            type="number"
            placeholder={searchMode === "companies" ? "Number of companies" : "Number of leads"}
            className="input__field w-full border border-gray-200 rounded-lg p-2.5 text-sm focus:border-[#00D2FF] focus:ring-1 focus:ring-[#00D2FF] outline-none transition-all"
            value={leads}
            onChange={(e) => setLeads(e.target.value)}
            required
            min="1" // Ensure at least 1 lead
          />
          {searchMode !== "companies" && (
            <div className="w-full">
              <Dropdown
                placeholder="Include Phone Numbers?"
                options={[
                  { value: "yes", label: "Yes" },
                  { value: "no", label: "No" },
                ]}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
          )}
          {/* Show payment/credit warning */}
          {error && (
            <div className="text-xs leading-[130%] p-3 rounded-xl text-[#04145C] bg-[#E6F8FF] border border-[#00D2FF] w-full"  dangerouslySetInnerHTML={{ __html: error }} />
          )}
          
          <div className="flex justify-between gap-3 mt-2 w-full">
            <button
              type="button"
              className="w-full bg-gray-200 text-gray-700 px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-300 transition-colors"
              onClick={() => setStep(1)} // Go back to Step 1
            >
              Back to Edit Filters
            </button>
            <button
              type="submit"
              className="submitbtn-ai w-full bg-[#00D2FF] text-[#04145C] px-4 py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2 hover:bg-[#00C4E6] transition-colors"
              disabled={loading || (numLeadsDisplay > 0 && totalCreditsRequiredDisplay > 0 && availableCredits < totalCreditsRequiredDisplay)} // Use calculated totalCreditsRequired
            >
              <img src="/basic/mawsoolBlackLogo.png" alt="" className="w-4 h-4" />
              {loading ? "Submitting..." : "Submit AI Query"}
            </button>
          </div>
        </form>
        
        <div className="mt-6 pt-4 border-t border-gray-100 text-center flex flex-col gap-2">
          {searchMode === "companies" && (
            <span className="text-xs text-blue-600 font-medium">
              Note: An AI query list of companies consumes 1 credit for each company returned by the AI.
            </span>
          )}
          <span className="text-xs text-gray-500 italic">
            Receive the most accurate results within 48 hours, outperforming any
            global competitor.
          </span>
        </div>
      </div>
    </>
  );

  return portalTarget ? createPortal(FormUI, portalTarget) : FormUI;
};

export default AIBulkPrompt;
