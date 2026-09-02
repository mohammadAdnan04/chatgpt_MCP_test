"use client";

import Modal from "@/components/shared/Modal";
import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
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
      const match = document.cookie.match(/(?:^|;\s*)auth-token=([^;]*)/);
      return match ? decodeURIComponent(match[1]) : "";
    }
    return "";
  };

const AIPrompt = ({ setAiSearchQuery, result, searchFilter, searchMode = "people", onStepChange, forceStep, isTour, tourStep, aiContext, isSearching, onSearchRequest }) => {
  const { credits, personalCredits, creditScope, user } = useAuth();
  const { toast } = useToast();
  const availableCredits = typeof credits === "number" ? (creditScope === "org" ? (credits + personalCredits) : credits) : 999999;
  const [leads, setLeads] = useState("");
  const [phone, setPhone] = useState("");
  const [listName, setListName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [maxPerCompanyEnabled, setMaxPerCompanyEnabled] = useState(false);
  const [maxPerCompany, setMaxPerCompany] = useState("1");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [apiResult, setApiResult] = useState(null);
  const [jobDetails, setJobDetails] = useState(null);
  
  // Pre-fill form if it's the tour or from aiContext
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
    } else if (aiContext?.originalPrompt) {
      setPrompt(aiContext.originalPrompt);
    }
  }, [isTour, searchMode, aiContext?.originalPrompt]);

  const [step, setStep] = useState(forceStep || 1); // 1 = Verify Filters & Count, 2 = Polling, 3 = Samples, 4 = Finalize
  const [jobId, setJobId] = useState(null);
  const [sampleLeads, setSampleLeads] = useState([]);
  const [pollingStatus, setPollingStatus] = useState("");
  const AI_SEARCH_API_BASE = process.env.NEXT_PUBLIC_AI_SEARCH_API || "http://localhost:4000";
  const AI_SEARCH_API = `${AI_SEARCH_API_BASE}/api/jobs`;
  
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
      const baseCredits = numLeads * 1;
      const requiresPhone = phone === "yes";
      const creditsRequiredPhone = requiresPhone ? numLeads * 20 : 0;
      const creditsRequiredEmail = requiresPhone ? numLeads * 5 : 0;
      totalCreditsRequired = baseCredits + creditsRequiredPhone + creditsRequiredEmail;
    }

    if (numLeads > 0 && totalCreditsRequired > 0 && availableCredits < totalCreditsRequired) {
      setError("You don’t have enough credits to proceed. Please <b><u><a href='/setting/planOverview'>upgrade your plan or buy extra credits</a></u></b> to continue.");
    } else {
      setError(""); // Clear error if credits are sufficient or no leads specified
    }
  }, [leads, phone, availableCredits, searchMode]);

  const handleStartAiSearch = async () => {
    if (isTour) return;
    setLoading(true);
    setError("");

    const numLeads = parseInt(leads) || 0;
    if (numLeads <= 0) {
      setError("Please enter a valid number of leads.");
      setLoading(false);
      return;
    }

    try {
      const response = await axios.post(AI_SEARCH_API, {
        userId: user?._id || user?.id, // Get actual user ID from AuthContext
        originalPrompt: prompt || aiContext?.originalPrompt || "AI Search",
        isSemanticNeeded: aiContext?.isSemanticNeeded || false,
        extractedFilters: searchFilter,
        semanticSentences: aiContext?.semanticSentences || [],
        requestedLeadCount: numLeads,
        authToken: getAuthToken(), // Pass the token so the background worker can use it
          searchMode: searchMode
        }, {
          withCredentials: true
        });

        setJobId(response.data.jobId);
      setStep(3); // Go to Polling step
      pollJobStatus(response.data.jobId);
    } catch (err) {
      setError("Failed to start AI Search job: " + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  };

  const pollJobStatus = async (id) => {
    try {
      const res = await axios.get(`${AI_SEARCH_API}/${id}`);
      const job = res.data;
      setPollingStatus(job.status);
      setJobDetails(job);

      if (job.status === 'PENDING_USER_APPROVAL') {
        setSampleLeads(job.sampleLeads || []);
        setStep(4); // Go to Samples step
      } else if (job.status === 'FAILED') {
        setError(job.errorMessage || "AI Search failed.");
        setStep(2);
      } else {
        // Poll again in 3 seconds
        setTimeout(() => pollJobStatus(id), 3000);
      }
    } catch (err) {
      setError("Error checking job status.");
      setStep(2);
    }
  };

  const handleSubmitFinal = async (e) => {
    e.preventDefault();
    if (isTour) return; 
    setLoading(true);
    setError("");
    setApiResult(null);

    const numLeads = parseInt(leads) || 0;
    let totalCreditsRequired = 0;
    const requiresPhone = phone === "yes";
    
    if (searchMode === "companies") {
      totalCreditsRequired = numLeads * 1;
    } else {
      const baseCredits = numLeads * 1;
      const creditsRequiredPhone = requiresPhone ? numLeads * 20 : 0;
      const creditsRequiredEmail = requiresPhone ? numLeads * 5 : 0;
      totalCreditsRequired = baseCredits + creditsRequiredPhone + creditsRequiredEmail;
    }

    if (numLeads > 0 && totalCreditsRequired > 0 && availableCredits < totalCreditsRequired) {
      setLoading(false);
      Swal.fire({
        icon: "warning",
        title: "Insufficient Credits",
        text: `You need ${totalCreditsRequired} credits to complete this request, but you only have ${availableCredits}.`,
        confirmButtonText: "Buy Credits",
        showCancelButton: true,
        cancelButtonText: "Cancel",
        customClass: {
          confirmButton: "swal-confirm-button",
          cancelButton: "swal-cancel-button",
        },
      }).then((result) => {
        if (result.isConfirmed) {
          router.push("/setting/planOverview");
        }
      });
      return;
    }

    try {
        // Tell AI Search service we approved the job, pass the approved companies explicitly
        const approvedCompanies = jobDetails?.evaluatedCompanies 
          ? jobDetails.evaluatedCompanies.filter(c => c.approved).map(c => c.name || c.domain)
          : [];

        await axios.post(`${AI_SEARCH_API}/${jobId}/approve`, {
          listName,
          revealInfo: requiresPhone,
          maxPerCompany: maxPerCompanyEnabled ? parseInt(maxPerCompany) || null : null,
          approvedCompanies: approvedCompanies // Explicitly pass the approved companies!
        }, {
          withCredentials: true
        });

      setAiSearchQuery(false); 
      toast.success("List is being generated in the background");
      Swal.fire({
        imageUrl: "/icons/notFoundSearch.gif", 
        imageHeight: 150,
        title: "",
        text: `Thank you for submitting your ${searchMode === "companies" ? "company search" : "lead"}. Your list is being generated in the background.\nOnce it is ready, the status will automatically change to Active on the List page.`,
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
      setError("Failed to approve job.");
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
    // In AI Mode, base cost is 1 credit per lead
    const baseCreditsDisplay = numLeadsDisplay * 1;
    // Plus 5 for email, 20 for phone if revealed
    const requiresPhoneDisplay = phone === "yes";
    const creditsRequiredPhoneDisplay = requiresPhoneDisplay ? numLeadsDisplay * 20 : 0;
    const creditsRequiredEmailDisplay = requiresPhoneDisplay ? numLeadsDisplay * 5 : 0; // Assuming "Reveal" reveals both
    totalCreditsRequiredDisplay = baseCreditsDisplay + creditsRequiredPhoneDisplay + creditsRequiredEmailDisplay;
  }

  // Helper to format currently active filters for display
  const renderActiveFilters = () => {
    const hasFilters = searchFilter && Object.keys(searchFilter).length > 0;
    const hasSemantic = aiContext && aiContext.isSemanticNeeded && aiContext.semanticSentences && aiContext.semanticSentences.length > 0;

    if (!hasFilters && !hasSemantic) {
      return <div className="text-gray-400 italic text-sm py-2">No filters applied.</div>;
    }

    const filterElements = [];

    if (hasFilters) {
      Object.entries(searchFilter).forEach(([key, value]) => {
        // Handle empty arrays/strings
        if (!value || (Array.isArray(value) && value.length === 0)) return;
        
        // Format the key to be more readable
        const formattedKey = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        
        let displayValue = "";
        if (Array.isArray(value)) {
          displayValue = value.join(', ');
        } else if (typeof value === 'object') {
          // Handle include/exclude or min/max objects
          const parts = [];
          if (value.include && (!Array.isArray(value.include) || value.include.length > 0)) {
            parts.push(`Include: ${Array.isArray(value.include) ? value.include.join(', ') : value.include}`);
          }
          if (value.exclude && (!Array.isArray(value.exclude) || value.exclude.length > 0)) {
            parts.push(`Exclude: ${Array.isArray(value.exclude) ? value.exclude.join(', ') : value.exclude}`);
          }
          if (value.min !== undefined || value.max !== undefined) {
            if (value.min !== undefined && value.min !== null) parts.push(`Min: ${value.min}`);
            if (value.max !== undefined && value.max !== null) parts.push(`Max: ${value.max}`);
          }
          displayValue = parts.join(' | ');
          if (!displayValue) return;
        } else {
          displayValue = String(value);
        }

        filterElements.push(
          <div 
            key={key} 
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-[#E6F8FF] text-[#04145C] border border-[#00D2FF] shadow-[0_0_8px_rgba(0,210,255,0.3)] whitespace-nowrap overflow-hidden max-w-full"
          >
            <span className="font-bold opacity-80">{formattedKey}:</span>
            <span className="truncate">{displayValue}</span>
          </div>
        );
      });
    }

    if (hasSemantic) {
      filterElements.push(
        <div 
          key="semantic" 
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-[#F3E8FF] text-[#4C1D95] border border-[#A78BFA] shadow-[0_0_8px_rgba(167,139,250,0.3)] whitespace-normal max-w-full"
        >
          <span className="font-bold opacity-80 shrink-0">Semantic Search:</span>
          <span className="">{aiContext.semanticSentences.join(' ')}</span>
        </div>
      );
    }

    return filterElements.length > 0 ? filterElements : <div className="text-gray-400 italic text-sm py-2">No filters applied.</div>;
  };

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
            onClick={() => {
              setStep(2);
              if (onSearchRequest) onSearchRequest();
            }} // Move to form and trigger search
          >
            Next <span className="text-lg leading-none">→</span>
          </button>
        </div>
      </div>
    </>
  );

  // Step 2 is now the form
  
  const FormUI = (
    <>
      {/* Semi-transparent backdrop */}
      {!isTour && backdropContainer ? (
        <div className="absolute inset-0 bg-black/40 z-[998] pointer-events-auto rounded-[16px]" />
      ) : !isTour ? (
        <div className="fixed inset-y-0 right-0 left-[350px] md:left-[430px] bg-black/40 z-[998] pointer-events-auto transition-all duration-300" />
      ) : null}
      
      {/* Form modal */}
      <div className={`ai-prompt-form-modal fixed top-1/2 transform -translate-y-1/2 z-[9999] bg-white p-6 rounded-2xl shadow-2xl border-2 border-[#00D2FF] w-[500px] max-h-[90vh] overflow-y-auto custom-scrollbar ${!isTour && backdropContainer ? 'left-1/2 -translate-x-1/2 relative mx-auto shadow-[0_0_50px_rgba(0,0,0,0.5)]' : 'left-[calc(50%+215px)] -translate-x-1/2'} ${isTour ? 'pointer-events-none' : ''}`} style={!isTour && backdropContainer ? { position: 'absolute' } : {}}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-[#04145C]">Configure AI Search</h3>
          <button 
            onClick={() => {
              if (onStepChange) onStepChange(0);
              setAiSearchQuery(false);
            }}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="bg-[#E6F8EB] border border-[#34D399] p-3.5 rounded-xl mb-5 shadow-sm text-left flex items-start gap-3">
          <svg className="w-5 h-5 text-[#059669] shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="flex-1">
            <p className="text-[14px] leading-relaxed text-[#065F46] font-medium">
              Review the extracted filters. You can close this and change your prompt to update the results.
            </p>
            {isSearching ? (
              <div className="mt-3 p-3 bg-white/60 rounded-lg border border-[#34D399]/30 flex items-center justify-center gap-3">
                <svg className="animate-spin h-5 w-5 text-[#00D2FF]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span className="text-sm font-semibold text-[#04145C]">Calculating potential leads...</span>
              </div>
            ) : (
              <div className="mt-3 p-3 bg-white/60 rounded-lg border border-[#34D399]/30">
                <div className="font-bold text-[#04145C] flex items-center gap-2">
                  <svg className="w-4 h-4 text-[#00D2FF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  Total potential leads found: {result?.total !== undefined ? result.total : (result?.paging?.total_count || 0)}
              </div>
            </div>
            )}
          </div>
        </div>
        
        <div className="bg-[#F8F9FA] p-4 rounded-xl mb-6 text-xs text-gray-500 max-h-[150px] overflow-y-auto custom-scrollbar border border-gray-200">
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

        <form className="flex flex-col items-start w-full gap-4">
          <div className="w-full flex gap-4">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-[#04145C] mb-1.5">Number of leads</label>
              <input
                type="number"
                min="1"
                placeholder="e.g. 50"
                className="input__field w-full border border-gray-200 rounded-lg p-2.5 text-sm focus:border-[#00D2FF] focus:ring-1 focus:ring-[#00D2FF] outline-none transition-all"
                value={leads}
                onChange={(e) => setLeads(e.target.value)}
                required
              />
            </div>
            {searchMode !== "companies" && (
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1.5 h-[18px]">
                  <input
                    type="checkbox"
                    id="limitPerCompany"
                    checked={maxPerCompanyEnabled}
                    onChange={(e) => setMaxPerCompanyEnabled(e.target.checked)}
                    className="w-3.5 h-3.5 cursor-pointer accent-[#00D2FF]"
                  />
                  <label htmlFor="limitPerCompany" className="block text-xs font-semibold text-[#04145C] cursor-pointer">
                    Limit leads per company
                  </label>
                </div>
                <input
                  type="number"
                  min="1"
                  placeholder="e.g. 2"
                  className={`input__field w-full border rounded-lg p-2.5 text-sm transition-all outline-none ${
                    maxPerCompanyEnabled 
                      ? 'border-gray-200 focus:border-[#00D2FF] focus:ring-1 focus:ring-[#00D2FF]' 
                      : 'border-gray-100 bg-gray-50 text-gray-400 cursor-not-allowed'
                  }`}
                  value={maxPerCompanyEnabled ? maxPerCompany : ""}
                  onChange={(e) => setMaxPerCompany(e.target.value)}
                  disabled={!maxPerCompanyEnabled}
                />
              </div>
            )}
          </div>

          {error && (
            <div className="w-full bg-red-50 text-red-600 p-3 rounded-lg text-sm border border-red-200" dangerouslySetInnerHTML={{ __html: error }} />
          )}

          <div className="flex justify-end gap-3 w-full mt-4">
            <button
              type="button"
              className="bg-gray-200 text-gray-700 px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-300 transition-colors"
              onClick={() => {
                if (onStepChange) onStepChange(0);
                setAiSearchQuery(false);
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={loading || !leads}
              className="bg-[#00D2FF] text-[#04145C] px-6 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 hover:bg-[#00C4E6] transition-colors disabled:opacity-50"
              onClick={handleStartAiSearch}
            >
              {loading ? "Starting..." : "Approve"}
            </button>
          </div>
        </form>
      </div>
    </>
  );

  const PollingUI = (
    <>
      <div className="fixed inset-0 bg-black/40 z-[998] pointer-events-auto transition-all duration-300" />
      <div className={`ai-prompt-form-modal fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-[9999] bg-white p-8 rounded-2xl shadow-2xl border-2 border-[#00D2FF] w-[400px] text-center`}>
        <div className="w-16 h-16 border-4 border-[#00D2FF] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <h3 className="text-xl font-bold text-[#04145C] mb-2">Processing AI Search</h3>
        <p className="text-gray-500 text-sm">
          {pollingStatus === 'VECTOR_SEARCHING' && "Running semantic vector search on company profiles..."}
          {pollingStatus === 'DEEPSEEK_SCORING' && "DeepSeek is evaluating the best matches..."}
          {pollingStatus === 'CLASSIFYING' && "Classifying your prompt..."}
          {!['VECTOR_SEARCHING', 'DEEPSEEK_SCORING', 'CLASSIFYING'].includes(pollingStatus) && "Please wait while we prepare your samples..."}
        </p>

        {/* Developer Debug Panel */}
        {jobDetails && (
          <div className="mt-6 bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-xs overflow-y-auto max-h-60 text-left flex flex-col gap-2">
            <div className="font-bold text-white border-b border-gray-700 pb-1 mb-1">Developer Debug Logs:</div>
            
            <div><span className="text-blue-400">Semantic Mode:</span> {jobDetails.isSemanticNeeded ? "ON" : "OFF"}</div>
            
            {jobDetails.isSemanticNeeded && jobDetails.semanticSentences?.length > 0 && (
              <div><span className="text-blue-400">Semantic Sentences:</span>
                <ul className="list-disc pl-4 text-[10px]">
                  {jobDetails.semanticSentences.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </div>
            )}
            
            <div><span className="text-blue-400">Extracted Filters:</span> 
              <pre className="whitespace-pre-wrap text-[10px] mt-1 bg-gray-800 p-2 rounded">{JSON.stringify(jobDetails.extractedFilters, null, 2)}</pre>
            </div>

            {jobDetails.initialFilterResultsCount !== undefined && (
              <div><span className="text-blue-400">Initial Filter Results Count:</span> {jobDetails.initialFilterResultsCount} leads found</div>
            )}

            {jobDetails.extractedCompaniesCount !== undefined && (
              <div><span className="text-blue-400">Unique Companies Extracted:</span> {jobDetails.extractedCompaniesCount} companies</div>
            )}

            {jobDetails.vectorSearchCompaniesCount !== undefined && (
              <div><span className="text-blue-400">Vector Search Companies Found:</span> {jobDetails.vectorSearchCompaniesCount} companies</div>
            )}

            {jobDetails.evaluatedCompanies?.length > 0 && (
              <div className="mt-2">
                <span className="text-blue-400">DeepSeek Evaluations Summary:</span>
                <div className="text-[10px] text-gray-300 mb-2">
                  Total Evaluated: {jobDetails.evaluatedCompanies.length} | 
                  Approved: <span className="text-green-400">{jobDetails.evaluatedCompanies.filter(c => c.approved).length}</span> | 
                  Rejected: <span className="text-red-400">{jobDetails.evaluatedCompanies.filter(c => !c.approved).length}</span>
                </div>
                <div className="flex flex-col gap-2 mt-1">
                  {jobDetails.evaluatedCompanies.map((c, i) => (
                    <div key={i} className={`p-2 rounded text-[10px] ${c.approved ? 'bg-gray-800 border-l-2 border-green-500' : 'bg-gray-800 border-l-2 border-red-500'}`}>
                      <div><span className="text-gray-400">Company:</span> {c.name} ({c.domain})</div>
                      <div><span className="text-gray-400">Vector Score:</span> {c.vectorScore}</div>
                      <div><span className="text-gray-400">Approved:</span> <span className={c.approved ? "text-green-400" : "text-red-400"}>{c.approved ? "Yes" : "No"}</span></div>
                      <div><span className="text-gray-400">Reason:</span> {c.reason}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );

  const SamplesUI = (
    <>
      <div className="fixed inset-0 bg-black/40 z-[998] pointer-events-auto transition-all duration-300" />
      <div className={`ai-prompt-form-modal fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-[9999] bg-white p-6 rounded-2xl shadow-2xl border-2 border-[#00D2FF] w-[800px] max-h-[90vh] overflow-y-auto custom-scrollbar`}>
        <h3 className="text-xl font-bold text-[#04145C] mb-2">Review 10 Sample Leads</h3>
        <p className="text-gray-500 text-sm mb-6">If these leads match your criteria, click Approve to finalize your list and deduct credits.</p>
        
        <div className="grid grid-cols-2 gap-4 mb-6">
          {sampleLeads.map((lead, idx) => (
            <div key={idx} className="border border-gray-200 rounded-lg p-3 text-sm">
              <div className="font-bold text-[#04145C]">{lead.first_name} {lead.last_name}</div>
              <div className="text-gray-600">{lead.job_title}</div>
              <div className="text-xs text-gray-400 mt-1">{lead.company_name || lead.current_company_domain}</div>
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-3 w-full mt-4">
          <button
            type="button"
            className="bg-gray-200 text-gray-700 px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-300 transition-colors"
            onClick={() => {
              if (onStepChange) onStepChange(0);
              setAiSearchQuery(false);
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            className="bg-[#00D2FF] text-[#04145C] px-6 py-2.5 rounded-xl text-sm font-bold hover:bg-[#00C4E6] transition-colors"
            onClick={() => setStep(5)}
          >
            Approve Samples
          </button>
        </div>

        {/* Developer Debug Panel on Samples Page */}
        {jobDetails && (
          <div className="mt-8 bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-xs text-left flex flex-col gap-2">
            <div className="font-bold text-white border-b border-gray-700 pb-1 mb-1">Developer Debug Logs:</div>
            
            <div><span className="text-blue-400">Semantic Mode:</span> {jobDetails.isSemanticNeeded ? "ON" : "OFF"}</div>
            
            {jobDetails.isSemanticNeeded && jobDetails.semanticSentences?.length > 0 && (
              <div><span className="text-blue-400">Semantic Sentences:</span>
                <ul className="list-disc pl-4 text-[10px]">
                  {jobDetails.semanticSentences.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </div>
            )}
            
            <div><span className="text-blue-400">Extracted Filters:</span> 
              <pre className="whitespace-pre-wrap text-[10px] mt-1 bg-gray-800 p-2 rounded">{JSON.stringify(jobDetails.extractedFilters, null, 2)}</pre>
            </div>

            {jobDetails.initialFilterResultsCount !== undefined && (
              <div><span className="text-blue-400">Initial Filter Results Count:</span> {jobDetails.initialFilterResultsCount} leads found</div>
            )}

            {jobDetails.extractedCompaniesCount !== undefined && (
              <div><span className="text-blue-400">Unique Companies Extracted:</span> {jobDetails.extractedCompaniesCount} companies</div>
            )}

            {jobDetails.vectorSearchCompaniesCount !== undefined && (
              <div><span className="text-blue-400">Vector Search Companies Found:</span> {jobDetails.vectorSearchCompaniesCount} companies</div>
            )}

            {jobDetails.evaluatedCompanies?.length > 0 && (
              <div className="mt-2">
                <span className="text-blue-400">DeepSeek Evaluations Summary:</span>
                <div className="text-[10px] text-gray-300 mb-2">
                  Total Evaluated: {jobDetails.evaluatedCompanies.length} | 
                  Approved: <span className="text-green-400">{jobDetails.evaluatedCompanies.filter(c => c.approved).length}</span> | 
                  Rejected: <span className="text-red-400">{jobDetails.evaluatedCompanies.filter(c => !c.approved).length}</span>
                </div>
                <div className="flex flex-col gap-2 mt-1">
                  {jobDetails.evaluatedCompanies.map((c, i) => (
                    <div key={i} className={`p-2 rounded text-[10px] ${c.approved ? 'bg-gray-800 border-l-2 border-green-500' : 'bg-gray-800 border-l-2 border-red-500'}`}>
                      <div><span className="text-gray-400">Company:</span> {c.name} ({c.domain})</div>
                      <div><span className="text-gray-400">Vector Score:</span> {c.vectorScore}</div>
                      <div><span className="text-gray-400">Approved:</span> <span className={c.approved ? "text-green-400" : "text-red-400"}>{c.approved ? "Yes" : "No"}</span></div>
                      <div><span className="text-gray-400">Reason:</span> {c.reason}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );

  const FinalizeUI = (
    <>
      <div className="fixed inset-0 bg-black/40 z-[998] pointer-events-auto transition-all duration-300" />
      <div className={`ai-prompt-form-modal fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-[9999] bg-white p-6 rounded-2xl shadow-2xl border-2 border-[#00D2FF] w-[500px]`}>
        <h3 className="text-lg font-semibold text-[#04145C] mb-4">Finalize List Details</h3>
        <form className="flex flex-col items-start w-full gap-4" onSubmit={handleSubmitFinal}>
            <input
              type="text"
              placeholder="List Name"
              className="input__field w-full border border-gray-200 rounded-lg p-2.5 text-sm focus:border-[#00D2FF] focus:ring-1 focus:ring-[#00D2FF] outline-none transition-all"
              value={listName}
              onChange={(e) => setListName(e.target.value)}
              required
            />
            {searchMode === "people" && (
              <div className="w-full">
                <label className="block text-xs font-semibold text-[#04145C] mb-1.5">Reveal Phone & Email?</label>
                <Dropdown
                  options={[
                    { label: "Yes", value: "yes" },
                    { label: "No", value: "no" },
                  ]}
                  placeholder="Reveal Phone & Email"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                />
              </div>
            )}

            {/* Credits Preview */}
            <div className="w-full bg-[#F0F7FF] p-3 rounded-lg border border-[#D0E3FF] flex justify-between items-center text-sm">
              <span className="text-[#04145C] font-medium">Credits Required:</span>
              <span className={`font-bold ${availableCredits < totalCreditsRequiredDisplay ? 'text-red-500' : 'text-[#00D2FF]'}`}>
                {totalCreditsRequiredDisplay}
              </span>
            </div>

            <div className="flex justify-end gap-3 w-full mt-4">
              <button
                type="button"
                className="bg-gray-200 text-gray-700 px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-300 transition-colors"
                onClick={() => setStep(4)}
              >
                Back
              </button>
              <button
                type="submit"
                disabled={loading}
                className="bg-[#00D2FF] text-[#04145C] px-6 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 hover:bg-[#00C4E6] transition-colors disabled:opacity-50"
              >
                {loading ? "Fulfilling..." : "Generate List"}
              </button>
            </div>
        </form>
      </div>
    </>
  );

  return (
    <>
      {step === 1 && (portalTarget ? createPortal(VerifyUI, portalTarget) : VerifyUI)}
      {step === 2 && (portalTarget ? createPortal(FormUI, portalTarget) : FormUI)}
      {step === 3 && (portalTarget ? createPortal(PollingUI, portalTarget) : PollingUI)}
      {step === 4 && (portalTarget ? createPortal(SamplesUI, portalTarget) : SamplesUI)}
      {step === 5 && (portalTarget ? createPortal(FinalizeUI, portalTarget) : FinalizeUI)}
    </>
  );
};

export default AIPrompt;
