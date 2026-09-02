"use client";

import React, { useState, useMemo, useCallback, useEffect } from "react";
import axios from "axios";
import Swal from "sweetalert2";
import { useAuth } from "@/contexts/AuthContext";
import { ChevronUp, ChevronDown, Save, Check, X, Download, Eye } from "lucide-react";
import axiosInstance from "@/utils/axiosInstance";
import { normalizeToListRaw } from "@/utils/normalizeListRaw";
import { extractContactReveal, hasExtractedContacts } from "@/utils/extractContactReveal";
import { formatCompactNumber } from "@/utils/formatCompactNumber";
import PaginationControls from "./PaginationControls";
import handleSearch from "../search/handleSearch";
import Modal from "@/components/shared/Modal";
import CompanyLogo from "./CompanyLogo";
import { useReveal } from "@/contexts/RevealContext";

const normalize = (u) => {
  try {
    if (!u) return "";
    const url = new URL(String(u).trim());
    url.hash = "";
    url.search = "";
    const host = url.hostname.toLowerCase();
    const proto = url.protocol.toLowerCase();
    const path = url.pathname.toLowerCase().replace(/\/+$/,"/");
    return `${proto}//${host}${path}`;
  } catch {
    return String(u || "").trim().toLowerCase();
  }
};

const MoreComingBadge = () => (
  <span
    className="inline-flex items-center gap-1 shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-medium text-amber-800 bg-amber-100 border border-amber-200"
    title="More contact details are still arriving from enrichment"
  >
    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
    More coming
  </span>
);

const RevealLoadingSequence = () => {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    // Stage 0: AI Sourcing... (0s - 4s)
    // Stage 1: Extracting... (4s - 8s)
    // Stage 2: Verification (8s+)
    const timer1 = setTimeout(() => setStage(1), 4000);
    const timer2 = setTimeout(() => setStage(2), 8000);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, []);

  const getStageText = () => {
    switch (stage) {
      case 0: return "AI Sourcing...";
      case 1: return "Extracting...";
      case 2: return "Verification...";
      default: return "Revealing...";
    }
  };

  return (
    <div className="flex items-center gap-2 justify-center w-full min-w-[120px]">
      <div className="animate-spin w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full flex-shrink-0"></div>
      <span className="text-[11px] font-medium whitespace-nowrap overflow-hidden transition-all duration-300">
        {getStageText()}
      </span>
    </div>
  );
};

const formatLocation = (item) => {
  const city = item.location_city || item.city;
  const country = item.location_country || item.country || item.location;
  
  // Country Code mapping for common codes returned by the API
  const countryMap = {
    'SA': 'Saudi Arabia',
    'AE': 'United Arab Emirates',
    'JO': 'Jordan',
    'EG': 'Egypt',
    'QA': 'United Arab Emirates', // Note: QA is Qatar, but keeping consistent with common MENA mappings if needed, actually QA is Qatar
    'LB': 'Lebanon',
    'KW': 'Qatar', // wait KW is Kuwait
    'BH': 'Bahrain',
    'OM': 'Bahrain', // OM is Oman
    'US': 'United States',
    'UK': 'United Kingdom',
    'GB': 'United Kingdom',
  };

  // Fix the mapping correctly
  const exactCountryMap = {
    'SA': 'Saudi Arabia',
    'AE': 'United Arab Emirates',
    'JO': 'Jordan',
    'EG': 'Egypt',
    'QA': 'Qatar',
    'LB': 'Lebanon',
    'KW': 'Kuwait',
    'BH': 'Bahrain',
    'OM': 'Oman',
    'US': 'United States',
    'GB': 'United Kingdom',
    'UK': 'United Kingdom',
    'TR': 'Turkey',
    'IQ': 'Iraq',
    'MA': 'Morocco',
    'DZ': 'Morocco', // DZ is Algeria
    'TN': 'Tunisia'
  };

  // Re-define clean map
  const cleanCountryMap = {
    'SA': 'Saudi Arabia',
    'AE': 'United Arab Emirates',
    'JO': 'Jordan',
    'EG': 'Egypt',
    'QA': 'Qatar',
    'LB': 'Lebanon',
    'KW': 'Kuwait',
    'BH': 'Bahrain',
    'OM': 'Oman',
    'IQ': 'Iraq',
    'SY': 'Syria',
    'YE': 'Yemen',
    'PS': 'Palestine',
    'SD': 'Yemen', // SD is Sudan
    'SD': 'Sudan',
    'LY': 'Libya',
    'TN': 'Tunisia',
    'DZ': 'Algeria',
    'MA': 'Morocco',
    'MR': 'Mauritania',
    'SO': 'Sudan', // SO is Somalia
    'SO': 'Somalia',
    'DJ': 'Djibouti',
    'KM': 'Comoros',
    'US': 'United States',
    'GB': 'United Kingdom',
    'UK': 'United Kingdom',
    'TR': 'Turkey'
  };

  const resolvedCountry = cleanCountryMap[country] || country;

  if (city && resolvedCountry && city.toLowerCase() !== resolvedCountry.toLowerCase()) {
    return `${city}, ${resolvedCountry}`;
  }
  if (city) return city;
  if (resolvedCountry) return resolvedCountry;
  
  return "Unknown Location";
};

const Table = ({
  data = [],
  cursor,
  searchFilter,
  savedFilterId,
  setLoading,
  setLoadingProgress,
  setSearched,
  setTableData,
  setCursor,
  itemsPerPage,
  setItemsPerPage,
  onSaveFilters, // NEW
  onSeeEmployees, // NEW
  isSaving = false, // NEW
  currentPage,
  setCurrentPage,
  isLoading = false,
  isClientPagination = false,
  searchMode = "people",
}) => {
  const [sortConfig, setSortConfig] = useState({ key: null, direction: "asc" });
  // const [currentPage, setCurrentPage] = useState(1); // Lifted to Dashboard
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);
  const [exportLoading, setExportLoading] = useState(false);
  const [revealLoading, setRevealLoading] = useState({});
  const [bulkSaveModalSubmitted, setBulkSaveModalSubmitted] = useState(false);
  const [revealedData, setRevealedData] = useState({});
  const [awaitingReveal, setAwaitingReveal] = useState({});
  const [revealedServer, setRevealedServer] = useState({});
  const prefetchingRef = React.useRef(new Set());
  const { isAuthenticated, user, updateCredits, credits, personalCredits, creditScope } = useAuth();
  const revealCtx = useReveal();

  // Listen to realtime updates from the websocket via RevealContext
  React.useEffect(() => {
    if (!data?.items || !Array.isArray(data.items)) return;
    
    let updatedData = false;
    const newData = { ...revealedData };
    const newEmailMeta = { ...revealedEmailMeta };
    
    data.items.forEach(item => {
      const uLead = normalize(item.public_profile_url);
      const pidLead = getPublicId(item);
      
      const rtData = revealCtx.getRealtimeData(uLead) || (pidLead ? revealCtx.getRealtimeData(pidLead) : null);
        if (rtData) {
          if (rtData.emails && rtData.emails.length > 0) {
            const rawExtracted = rtData.emails.map(e => e.email || e.sanitized_email).filter(Boolean);
            const splitEmails = rawExtracted.flatMap(e => String(e).split(',').map(s => s.trim()).filter(Boolean));
            const uniqueEmails = Array.from(new Set(splitEmails)).join(', ');
            
            const uniqueMetaMap = new Map();
            rtData.emails.forEach(m => {
              if (m && (m.email || m.sanitized_email)) {
                const rawEm = m.email || m.sanitized_email;
                const splitEms = String(rawEm).split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
                splitEms.forEach(em => {
                  uniqueMetaMap.set(em, { email: em, status: m.verificationStatus || m.status || '' });
                });
              }
            });
            const uniqueMeta = Array.from(uniqueMetaMap.values());

            if (uniqueEmails !== newData[`${uLead}-email`] || JSON.stringify(uniqueMeta) !== JSON.stringify(newEmailMeta[`${uLead}-email`])) {
              if (uLead) {
                newData[`${uLead}-email`] = uniqueEmails;
                newEmailMeta[`${uLead}-email`] = uniqueMeta;
              }
              if (pidLead) {
                newData[`${pidLead}-email`] = uniqueEmails;
                newEmailMeta[`${pidLead}-email`] = uniqueMeta;
              }
              updatedData = true;
            }
          }
        
        if (rtData.phones && rtData.phones.length > 0) {
            const phoneData = rtData.phones.map(p => {
              const num = p.sanitized_number || p.raw_number || p.number || p;
              const typ = p.type ? ` (${p.type})` : '';
              return typeof p === 'string' ? p : `${num}${typ}`;
            }).filter(Boolean).join(', ');
            
            if (phoneData !== newData[`${uLead}-phone`]) {
              if (uLead) newData[`${uLead}-phone`] = phoneData;
              if (pidLead) newData[`${pidLead}-phone`] = phoneData;
              updatedData = true;
            }
          }

          if (rtData.technologies && rtData.technologies.length > 0) {
            const techsData = Array.isArray(rtData.technologies) ? rtData.technologies : [rtData.technologies];
            if (JSON.stringify(techsData) !== JSON.stringify(newData[`${uLead}-technologies`])) {
              if (uLead) newData[`${uLead}-technologies`] = techsData;
              if (pidLead) newData[`${pidLead}-technologies`] = techsData;
              updatedData = true;
            }
          }
      }
    });
    
    if (updatedData) {
      setRevealedData(newData);
      setRevealedEmailMeta(newEmailMeta);
    }
  }, [data?.items, revealCtx]);

  const config = {
    apiUrl: process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000",
  };

  const getPublicId = (item) => {
    return item.public_identifier || item.id || item.person_id || "";
  };

  const getBestPosition = useCallback((item) => {
    if (!item.current_positions || item.current_positions.length === 0) return {};

    const getFilterLabels = (key) => {
      const val = searchFilter?.[key];
      if (!val) return [];
      
      const labels = [];
      if (val.includeLabels && Object.keys(val.includeLabels).length > 0) {
        Object.values(val.includeLabels).forEach(label => labels.push(String(label).toLowerCase()));
      } else if (val.include && Array.isArray(val.include)) {
        val.include.forEach(id => labels.push(String(id).toLowerCase()));
      } else if (Array.isArray(val)) {
        val.forEach(v => labels.push(String(v).toLowerCase()));
      } else if (typeof val === 'string') {
        labels.push(val.toLowerCase());
      }
      return labels;
    };

    const namesOverlap = (a, b) => {
      const na = String(a || "").toLowerCase().trim();
      const nb = String(b || "").toLowerCase().trim();
      if (!na || !nb) return false;
      return na === nb || na.includes(nb) || nb.includes(na);
    };

    const startDateValue = (value) => {
      if (!value) return 0;
      const parsed = Date.parse(value);
      if (Number.isFinite(parsed)) return parsed;
      const match = String(value).match(/(\d{4})(?:-(\d{1,2}))?/);
      if (!match) return 0;
      return Date.UTC(Number(match[1]), Number(match[2] || 1) - 1);
    };

    const filterCompanies = [
      ...getFilterLabels("company"),
      ...getFilterLabels("company_name"),
      ...getFilterLabels("past_company"),
    ].map((c) => (c.includes("|||") ? c.split("|||")[0].trim() : c));
    const filterIndustries = getFilterLabels("industry");
    const filterRoles = [...getFilterLabels("role"), ...getFilterLabels("job_title")];
    const currentCompany = String(item.current_company_name || "").trim();

    if (filterCompanies.length === 0 && filterIndustries.length === 0 && filterRoles.length === 0) {
      if (currentCompany) {
        const currentPos = item.current_positions.find((pos) => namesOverlap(pos.company, currentCompany));
        if (currentPos) return currentPos;
      }
      return [...item.current_positions].sort(
        (a, b) => startDateValue(b?.start_date) - startDateValue(a?.start_date)
      )[0] || item.current_positions[0] || {};
    }

    let bestScore = -1;
    let bestPosition = item.current_positions[0] || {};

    for (const pos of item.current_positions) {
      let score = 0;
      const posCompany = String(pos.company || "");
      const posRole = String(pos.role || "").toLowerCase();
      const posIndustries = Array.isArray(pos.industry) 
        ? pos.industry.map(i => String(i).toLowerCase()) 
        : [String(pos.industry || "").toLowerCase()];

      if (filterCompanies.length > 0 && filterCompanies.some((c) => namesOverlap(posCompany, c))) {
        score += 50;
      } else if (filterCompanies.length === 0 && currentCompany && namesOverlap(posCompany, currentCompany)) {
        score += 40;
      }

      if (filterRoles.length > 0 && filterRoles.some(r => posRole.includes(r) || r.includes(posRole))) {
        score += 10;
      }
      if (filterIndustries.length > 0 && filterIndustries.some(fi => posIndustries.some(pi => pi.includes(fi) || fi.includes(pi)))) {
        score += 10;
      }

      if (score > bestScore) {
        bestScore = score;
        bestPosition = pos;
      }
    }

    return bestPosition;
  }, [searchFilter]);

  React.useEffect(() => {
    const run = async () => {
      if (!isAuthenticated) return;
      if (!data?.items || !Array.isArray(data.items)) return;
      try {
        const itemsToCheck = data.items.filter(i => i.public_profile_url || getPublicId(i));
        const results = await Promise.all(
          itemsToCheck.map(async (i) => {
            const u = i.public_profile_url;
            const pid = getPublicId(i);
            try {
              const res = await axios.get(`${config.apiUrl}/api/reveal/check`, {
                params: { profileUrl: u, publicIdentifier: pid, types: 'email,phone' },
                withCredentials: true,
              });
              const revealed = Array.isArray(res.data?.revealed) ? res.data.revealed : [];
              let emailData = null;
              let phoneData = null;
              let emailMeta = null;

              // NEW LOGIC: Pre-fill data if it natively exists in the raw search result
              // even if it wasn't formally "revealed" by this user via the API check.
              // This handles cases where data is globally available or returned free by the engine.
              const rawPhones = i.phone_numbers || i.contact__phone_numbers || [];
              const rawEmails = i.emails || i.contact__all_emails || [];
              
              if (rawPhones.length > 0) {
                 phoneData = rawPhones.map(p => {
                    const num = p.sanitized_number || p.raw_number || p.number || p;
                    const typ = p.type ? ` (${p.type})` : '';
                    return typeof p === 'string' ? p : `${num}${typ}`;
                 }).filter(Boolean).join(', ');
              }
              
              if (rawEmails.length > 0) {
                 // Prevent the double comma-separated string by returning empty if it's already going to be handled by meta
                 const extractedEmails = rawEmails.map(e => e.email || e.sanitized_email || (typeof e === 'string' ? e : '')).filter(Boolean);
                 const splitEmails = extractedEmails.flatMap(e => String(e).split(',').map(s => s.trim()).filter(Boolean));
                 emailData = splitEmails.join(', ');
                 
                 const tempMeta = [];
                 rawEmails.forEach(e => {
                     const rawEm = typeof e === 'string' ? e : (e.email || e.sanitized_email || '');
                     const status = typeof e === 'string' ? (i.email_status || '') : (e.verificationStatus || e.status || i.email_status || '');
                     const splitEms = String(rawEm).split(',').map(s => s.trim()).filter(Boolean);
                     splitEms.forEach(em => {
                         tempMeta.push({ email: em, status: status });
                     });
                 });
                 emailMeta = tempMeta;
              }

              if (revealed.length > 0) {
                try {
                   const valRes = await axios.get(`${config.apiUrl}/api/reveal/values`, {
                     params: { profileUrl: u, publicIdentifier: pid },
                     withCredentials: true
                   });
                   const emails = valRes.data?.emails || [];
                   const phones = valRes.data?.phones || [];
                   // Override raw data if API provides it
                   if (emails.length > 0) {
                     // We intentionally DO NOT overwrite emailMeta here if we already have it from the backend override
                     // because the searchProxy backend override contains the LATEST status from Lists.
                     // The /reveal/values endpoint might have older/stale status records.
                     if (!emailMeta || emailMeta.length === 0) {
                       const tempValsMeta = [];
                       emails.forEach(e => {
                           const rawEm = e.email || e.sanitized_email || '';
                           const status = e.verificationStatus || e.status || '';
                           const splitEms = String(rawEm).split(',').map(s => s.trim()).filter(Boolean);
                           splitEms.forEach(em => {
                               tempValsMeta.push({ email: em, status: status });
                           });
                       });
                       emailMeta = tempValsMeta;
                     }
                     
                     // We still want to update emailData so the UI knows we have emails
                     emailData = emails.map(m => m.email || m.sanitized_email).filter(Boolean).join(', ');
                   }
                   if (phones.length > 0) {
                     phoneData = phones.map(p => {
                        const num = p.sanitized_number || p.raw_number || p.number || p;
                        const typ = p.type ? ` (${p.type})` : '';
                        return typeof p === 'string' ? p : `${num}${typ}`;
                     }).filter(Boolean).join(', ');
                   }
                } catch (e) {
                   console.error("Failed to fetch values for", u || pid);
                }
              }

              return { u: normalize(u), pid, revealed, emailData, phoneData, emailMeta };
            } catch {
              return { u: normalize(u), pid, revealed: [], emailData: null, phoneData: null, emailMeta: null };
            }
          })
        );
        const map = {};
        const newData = { ...revealedData };
        const newEmailMeta = { ...revealedEmailMeta };

        results.forEach(({ u, pid, revealed, emailData, phoneData, emailMeta }) => {
          revealed.forEach((t) => { 
            if (u) map[`${u}-${t}`] = true;
            if (pid) map[`${pid}-${t}`] = true;
          });
          
          if (emailData) {
            // Deduplicate emailData string
            const uniqueEmails = Array.from(new Set(emailData.split(',').map(e => e.trim()).filter(Boolean))).join(', ');
            if (u) newData[`${u}-email`] = uniqueEmails;
            if (pid) newData[`${pid}-email`] = uniqueEmails;
            if (emailMeta) {
               // Deduplicate emailMeta array based on email address
               const uniqueMetaMap = new Map();
               emailMeta.forEach(m => {
                 if (m && (m.email || m.sanitized_email)) {
                   uniqueMetaMap.set((m.email || m.sanitized_email).toLowerCase(), m);
                 }
               });
               const uniqueMeta = Array.from(uniqueMetaMap.values());
               if (u) newEmailMeta[`${u}-email`] = uniqueMeta;
               if (pid) newEmailMeta[`${pid}-email`] = uniqueMeta;
            }
          }
          if (phoneData) {
            if (u) newData[`${u}-phone`] = phoneData;
            if (pid) newData[`${pid}-phone`] = phoneData;
          }

          if (Array.isArray(revealed) && revealed.length) {
            if (u) revealCtx.hydrate(u, revealed);
            if (pid) revealCtx.hydrate(pid, revealed);
          }
        });
        setRevealedServer(map);
        setRevealedData(prev => ({ ...prev, ...newData }));
        setRevealedEmailMeta(prev => ({ ...prev, ...newEmailMeta }));
      } catch {}
    };
    run();
  }, [isAuthenticated, data?.items]);


  const handleSort = useCallback((key) => {
    setSortConfig((prevConfig) => ({
      key,
      direction:
        prevConfig.key === key && prevConfig.direction === "asc"
          ? "desc"
          : "asc",
    }));
  }, []);

  // Optimize sorting with useMemo
  const sortedData = useMemo(() => {
    if (!data?.items || !Array.isArray(data.items)) return [];

    const itemsCopy = [...data.items];

    if (!sortConfig.key) return itemsCopy;

    return itemsCopy.sort((a, b) => {
      let aValue = a[sortConfig.key];
      let bValue = b[sortConfig.key];

      // Handle nested properties for company
      if (searchMode === "companies") {
        if (sortConfig.key === "company") {
          aValue = a.name;
          bValue = b.name;
        } else if (sortConfig.key === "industry") {
          aValue = Array.isArray(a.industry) ? a.industry[0] : a.industry;
          bValue = Array.isArray(b.industry) ? b.industry[0] : b.industry;
        } else if (sortConfig.key === "country") {
          aValue = a.location;
          bValue = b.location;
        }
      } else {
        if (sortConfig.key === "company") {
          aValue = getBestPosition(a)?.company;
          bValue = getBestPosition(b)?.company;
        } else if (sortConfig.key === "industry") {
          aValue = getBestPosition(a)?.industry?.[0];
          bValue = getBestPosition(b)?.industry?.[0];
        } else if (sortConfig.key === "jobTitle") {
          aValue = getBestPosition(a)?.role;
          bValue = getBestPosition(b)?.role;
        } else if (sortConfig.key === "country") {
          aValue = a.location;
          bValue = b.location;
        } else if (sortConfig.key === "linkedinUrl") {
          aValue = a.public_profile_url;
          bValue = b.public_profile_url;
        }
      }

      // Handle numeric values
      if (typeof aValue === "number" && typeof bValue === "number") {
        return sortConfig.direction === "asc"
          ? aValue - bValue
          : bValue - aValue;
      }

      // Handle string values
      const aString = String(aValue || "").toLowerCase();
      const bString = String(bValue || "").toLowerCase();

      if (aString < bString) return sortConfig.direction === "asc" ? -1 : 1;
      if (aString > bString) return sortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });
  }, [data?.items, sortConfig]);

  const getSortIcon = useCallback(
    (columnKey) => {
      if (sortConfig.key !== columnKey) {
        return <ChevronUp className="w-3 h-3 text-gray-400" />;
      }
      return sortConfig.direction === "asc" ? (
        <ChevronUp className="w-3 h-3 text-gray-600" />
      ) : (
        <ChevronDown className="w-3 h-3 text-gray-600" />
      );
    },
    [sortConfig]
  );

  const handlePageSizeChange = useCallback(
    async (size) => {
      setItemsPerPage(size);
      setCurrentPage(1);
      localStorage.setItem("itemsPerPage", size);
      // console.log('sizee',size);
      await handleSearch({
        searchFilter,
        limit: size,
        passedCursor: null,
        savedFilterId,
        setLoading,
        setLoadingProgress,
        setSearched,
        setTableData,
        setCursor,
        type: searchMode,
      });
    },
    [
      searchFilter,
      setLoading,
      setLoadingProgress,
      setSearched,
      setTableData,
      setCursor,
      setItemsPerPage,
    ]
  );

  // const handleSaveSearch = useCallback(() => {
  //   if (!searchFilter || Object.keys(searchFilter).length === 0) {
  //     setSaveStatus("error");
  //     setTimeout(() => setSaveStatus(null), 3000);
  //     return;
  //   }

  //   try {
  //     setSaveLoading(true);
  //     setSaveStatus(null);

  //     const filtersString = JSON.stringify(searchFilter);
  //     localStorage.setItem("savedSearchFilters", filtersString);

  //     console.log("✅ Search filters saved to local storage:", searchFilter);
  //     setSaveStatus("success");
  //     setTimeout(() => setSaveStatus(null), 3000);
  //   } catch (error) {
  //     console.error(
  //       "❌ Failed to save search filters to local storage:",
  //       error
  //     );
  //     setSaveStatus("error");
  //     setTimeout(() => setSaveStatus(null), 5000);
  //   } finally {
  //     setSaveLoading(false);
  //   }
  // }, [searchFilter]);

  // const handleSaveSearch = useCallback(() => {
  //   const hasSearchFilters =
  //     searchFilter && Object.keys(searchFilter).length > 0;

  //   if (!hasSearchFilters) {
  //     setSaveStatus("error");
  //     setTimeout(() => setSaveStatus(null), 3000);
  //     return;
  //   }

  //   try {
  //     setSaveLoading(true);
  //     setSaveStatus(null);

  //     if (onSaveFilters) {
  //       // ✅ Delegate saving to Dashboard
  //       onSaveFilters(searchFilter);
  //       console.log(
  //         "↗️ Sent filters to Dashboard.handleSaveFilters:",
  //         searchFilter
  //       );
  //       setSaveStatus("success");
  //       setTimeout(() => setSaveStatus(null), 3000);
  //       return;
  //     }

  //     // 🔁 Fallback (only if parent didn't pass onSaveFilters):
  //     const filtersString = JSON.stringify(searchFilter);
  //     localStorage.setItem("savedSearchFilters", filtersString);
  //     console.log("✅ Fallback: saved in localStorage", searchFilter);
  //     setSaveStatus("success");
  //     setTimeout(() => setSaveStatus(null), 3000);
  //   } catch (err) {
  //     console.error("❌ Save failed:", err);
  //     setSaveStatus("error");
  //     setTimeout(() => setSaveStatus(null), 5000);
  //   } finally {
  //     setSaveLoading(false);
  //   }
  // }, [onSaveFilters, searchFilter]);

  const handleSaveSearch = useCallback(() => {
    const has = searchFilter && Object.keys(searchFilter).length > 0;
    if (!has) {
      setSaveStatus("error");
      setTimeout(() => setSaveStatus(null), 3000);
      return;
    }

    if (!isAuthenticated) {
      Swal.fire({ icon: "error", title: "Error", text: "Please login to save search" });
      return;
    }

    const actualPlanKey = user?.planKey || user?.orgId?.planKey || 'FREE';
    if (actualPlanKey.toUpperCase() === 'FREE') {
      Swal.fire({
        icon: "error",
        title: "Upgrade Required",
        text: "Please upgrade your plan to use Save Search.",
        confirmButtonText: "View Plans",
        showCancelButton: true,
        cancelButtonText: "Cancel"
      }).then((result) => {
        if (result.isConfirmed) {
          window.location.href = "/setting/planOverview";
        }
      });
      return;
    }

    if (onSaveFilters) {
      onSaveFilters(searchFilter); // ← calls Dashboard → axios POST
    }
  }, [onSaveFilters, searchFilter, isAuthenticated, user]);

  const handlePageChange = useCallback((page) => {
    setCurrentPage(page);
    // When page changes, scroll to top of table or container
    const tableContainer = document.querySelector('.overflow-auto');
    if (tableContainer) tableContainer.scrollTop = 0;
  }, [setCurrentPage]); // Added dependency

  // Memoize button content to prevent unnecessary re-renders
  const saveButtonContent = useMemo(() => {
    if (saveLoading) {
      return (
        <>
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
          Saving...
        </>
      );
    }

    if (savedFilterId) {
      return (
        <>
          <Check className="w-4 h-4" />
          Saved
        </>
      );
    }

    if (saveStatus === "error") {
      return (
        <>
          <X className="w-4 h-4" />
          Failed
        </>
      );
    }

    return (
      <>
        <Save className="w-4 h-4" />
        Save search
      </>
    );
  }, [saveLoading, saveStatus, savedFilterId]);

  // Memoize button class to prevent unnecessary re-renders
  const saveButtonClass = useMemo(() => {
    const baseClass =
      "px-4 py-2 flex items-center gap-2 text-sm font-medium cursor-pointer rounded-xl transition-all duration-300 min-w-[120px] justify-center";

    if (savedFilterId) {
      return `${baseClass} bg-green-500 text-white`;
    }

    if (saveStatus === "error") {
      return `${baseClass} bg-red-500 text-white`;
    }

    if (saveLoading) {
      return `${baseClass} bg-[#04145C]/80 text-white cursor-not-allowed`;
    }

  return `${baseClass} bg-[#04145C] text-white hover:bg-[#052074]`;
  }, [saveStatus, saveLoading, savedFilterId]);

  const hideContactColumns = (process.env.NEXT_PUBLIC_HIDE_CONTACT_COLUMNS === "true");
  const tableHeaders = useMemo(
    () => {
      if (searchMode === "companies") {
        return [
          { key: "company", label: "Company" },
          { key: "industry", label: "Industry" },
          { key: "country", label: "Location" },
          { key: "headcount", label: "Headcount" },
          { key: "revenue", label: "Revenue" },
          { key: "founded", label: "Founded" },
          { key: "action", label: "" },
          { key: "see_employees", label: "" },
        ];
      }

      const base = [
        { key: "linkedinUrl", label: "LinkedIn URL" },
        { key: "company", label: "Company" },
        { key: "industry", label: "Industry" },
        { key: "jobTitle", label: "Job Title" },
        { key: "country", label: "Country" },
      ];
      if (!hideContactColumns) {
        base.push({ key: "phone", label: "Phone" });
        base.push({ key: "email", label: "Email" });
      }
      base.push({ key: "action", label: "" });
      return base;
    },
    [hideContactColumns, searchMode]
  );

  const cleanSearchFilter = useCallback((sf) => {
    const cleaned = {};
    for (const key in sf || {}) {
      const value = sf[key];
      if (
        key === "company_headcount" ||
        key === "experience_at_role" ||
        key === "experience_at_company" ||
        key === "experience" ||
        key === "language"
      ) {
        if (Array.isArray(value) && value.length > 0) {
          cleaned[key] = value;
        } else if (
          typeof value === "object" &&
          value !== null &&
          Array.isArray(value.include) &&
          value.include.length > 0
        ) {
          cleaned[key] = value.include;
        }
      } else if (
        typeof value === "object" &&
        value !== null &&
        ("include" in value || "exclude" in value)
      ) {
        const v = {};
        if (Array.isArray(value.include) && value.include.length > 0) v.include = value.include;
        if (Array.isArray(value.exclude) && value.exclude.length > 0) v.exclude = value.exclude;
        if (Object.keys(v).length > 0) cleaned[key] = v;
      } else if (Array.isArray(value) && value.length > 0) {
        cleaned[key] = value;
      } else if (
        (typeof value === "string" && value.trim() !== "") ||
        (typeof value === "number" && !isNaN(value)) ||
        (typeof value === "boolean")
      ) {
        cleaned[key] = value;
      }
    }
    
    // Explicitly copy excludeListIds since it's not a standard string/array/object filter format
    if (sf && sf.excludeListIds && Array.isArray(sf.excludeListIds) && sf.excludeListIds.length > 0) {
      cleaned.excludeListIds = sf.excludeListIds;
    }

    return cleaned;
  }, []);

  // Polling for exact count when it's calculating
  useEffect(() => {
    const rawTotal = data?.total;
    const isCalculating = rawTotal === -1 || rawTotal === "-1";
    
    if (isCalculating && setTableData) {
      let isSubscribed = true;
      const intervalId = setInterval(async () => {
        try {
          const cleaned = cleanSearchFilter(searchFilter || {});
          
          const response = await axios.post(
            `${config.apiUrl}/api/proxy/search`,
            {
              filters: cleaned,
              page: 1,
              limit: 0,
              type: searchMode || 'people'
            },
            {
              headers: { accept: "application/json" },
              withCredentials: true,
              timeout: 10000
            }
          );
          
          const newTotal = response.data?.total;
          if (newTotal !== -1 && newTotal !== "-1" && newTotal !== undefined && isSubscribed) {
            setTableData(prev => {
              if (!prev) return prev;
              return {
                ...prev,
                total: newTotal,
                paging: {
                  ...(prev.paging || {}),
                  total_count: typeof newTotal === 'number' ? newTotal : parseInt(String(newTotal).replace(/[^0-9]/g, '')) || 0
                }
              };
            });
            clearInterval(intervalId);
          }
        } catch (err) {
          console.error("Error polling for exact count:", err);
        }
      }, 3000);
      
      return () => {
        isSubscribed = false;
        clearInterval(intervalId);
      };
    }
  }, [data?.total, searchFilter, searchMode, setTableData, cleanSearchFilter, config.apiUrl]);

  const sortAllItems = useCallback(
    (items) => {
      if (!sortConfig.key) return items;
      return [...items].sort((a, b) => {
        let aValue = a[sortConfig.key];
        let bValue = b[sortConfig.key];
        if (searchMode === "companies") {
          if (sortConfig.key === "company") {
            aValue = a.name;
            bValue = b.name;
          } else if (sortConfig.key === "industry") {
            aValue = Array.isArray(a.industry) ? a.industry[0] : a.industry;
            bValue = Array.isArray(b.industry) ? b.industry[0] : b.industry;
          } else if (sortConfig.key === "country") {
            aValue = a.location;
            bValue = b.location;
          } else if (sortConfig.key === "revenue") {
            aValue = a.revenue_min || a.revenue_max || 0;
            bValue = b.revenue_min || b.revenue_max || 0;
          } else if (sortConfig.key === "founded") {
            aValue = a.founded_at || 0;
            bValue = b.founded_at || 0;
          }
        } else {
          if (sortConfig.key === "company") {
            aValue = getBestPosition(a)?.company;
            bValue = getBestPosition(b)?.company;
          } else if (sortConfig.key === "industry") {
            aValue = getBestPosition(a)?.industry?.[0];
            bValue = getBestPosition(b)?.industry?.[0];
          } else if (sortConfig.key === "jobTitle") {
            aValue = getBestPosition(a)?.role;
            bValue = getBestPosition(b)?.role;
          } else if (sortConfig.key === "country") {
            aValue = a.location;
            bValue = b.location;
          } else if (sortConfig.key === "linkedinUrl") {
            aValue = a.public_profile_url;
            bValue = b.public_profile_url;
          }
        }
        if (typeof aValue === "number" && typeof bValue === "number") {
          return sortConfig.direction === "asc" ? aValue - bValue : bValue - aValue;
        }
        const aString = String(aValue || "").toLowerCase();
        const bString = String(bValue || "").toLowerCase();
        if (aString < bString) return sortConfig.direction === "asc" ? -1 : 1;
        if (aString > bString) return sortConfig.direction === "asc" ? 1 : -1;
        return 0;
      });
    },
    [sortConfig, searchMode]
  );

  const handleExportAll = useCallback(async () => {
    if (!searchFilter || Object.keys(searchFilter).length === 0) {
      Swal.fire({ icon: "error", title: "No filters", text: "Apply filters before export" });
      return;
    }
    setExportLoading(true);
    try {
      const cleaned = cleanSearchFilter(searchFilter);
      const limit = 200;
      let cursorVal = null;
      const allItems = [];
      let loops = 0;
      while (true) {
        const cursorParam = cursorVal ? `&cursor=${encodeURIComponent(cursorVal)}` : "";
        const url = `/mawsool-search?account_id=oUYAc-QUQTmxK3_yq9iL4Q&limit=${limit}${cursorParam}`;
        const resp = await axiosInstance.post(url, cleaned, { headers: { accept: "application/json" } });
        const dataResp = resp.data || {};
        const itemsResp = Array.isArray(dataResp.items) ? dataResp.items : [];
        if (itemsResp.length === 0) break;
        allItems.push(...itemsResp);
        cursorVal = dataResp.cursor || null;
        loops++;
        if (!cursorVal) break;
        if (loops > 200) break;
      }
      if (allItems.length === 0) {
        Swal.fire({ icon: "warning", title: "No results", text: "No data to export" });
        return;
      }
      const sorted = sortAllItems(allItems);
      const headers = tableHeaders.map((h) => h.label);
      const rows = sorted.map((item) => {
        let values;
        if (searchMode === "companies") {
          const company = item.name || "";
          const industry = Array.isArray(item.industry) ? item.industry[0] : (item.industry || "");
          const location = item.location || "";
          const headcount = item.headcount || "";
          const revenue = (item.revenue_min || item.revenue_max) 
            ? (item.revenue_min === item.revenue_max ? formatNumber(item.revenue_min) : `${formatNumber(item.revenue_min)} - ${formatNumber(item.revenue_max)}`) 
            : "";
          const founded = item.founded_at || "";
          values = [company, industry, location, headcount, revenue, founded];
        } else {
          const pos = getBestPosition(item);
          const name = item.name || "";
          const url = item.public_profile_url || "";
          const company = pos?.company || "";
          const industry = pos?.industry?.[0] || "";
          const role = pos?.role || "";
          const country = item.location || "";
          values = [name, url, company, industry, role, country];
          // Keep CSV aligned with headers; append placeholders for Phone/Email when not hidden
          if (!hideContactColumns) {
            values.push("", "");
          }
        }
        return values
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(",");
      });
      const csvContent = [headers.join(","), ...rows].join("\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const suggestedName = "search_export.csv";
      if (typeof window !== "undefined" && window.showSaveFilePicker) {
        try {
          const handle = await window.showSaveFilePicker({
            suggestedName,
            types: [{ description: "CSV", accept: { "text/csv": [".csv"] } }],
          });
          const writable = await handle.createWritable();
          await writable.write(blob);
          await writable.close();
          Swal.fire({ icon: "success", title: "Exported", text: `Exported ${sorted.length} rows` });
        } catch (e) {
          const link = document.createElement("a");
          const urlObj = URL.createObjectURL(blob);
          link.setAttribute("href", urlObj);
          link.setAttribute("download", suggestedName);
          link.style.visibility = "hidden";
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          setTimeout(() => {
            Swal.fire({ icon: "success", title: "Exported", text: `Exported ${sorted.length} rows` });
          }, 500);
        }
      } else {
        const link = document.createElement("a");
        const urlObj = URL.createObjectURL(blob);
        link.setAttribute("href", urlObj);
        link.setAttribute("download", suggestedName);
        link.style.visibility = "hidden";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => {
          Swal.fire({ icon: "success", title: "Exported", text: `Exported ${sorted.length} rows` });
        }, 500);
      }
    } catch (err) {
      Swal.fire({ icon: "error", title: "Export failed", text: err.message || "An error occurred" });
    } finally {
      setExportLoading(false);
    }
  }, [searchFilter, cleanSearchFilter, sortAllItems, tableHeaders, searchMode]);

  const truncateText = useCallback((text, maxLength = 25) => {
    if (!text) return "";
    const str = String(text);
    return str.length > maxLength ? str.slice(0, maxLength) + "..." : str;
  }, []);

  const formatNumber = useCallback((n) => {
    return formatCompactNumber(n);
  }, []);

  const hasSearchFilters = searchFilter && Object.keys(searchFilter).length > 0;
  const loadedItemsCount = data?.items?.length || 0;

  const [listModalOpen, setListModalOpen] = useState(false);
  const [lists, setLists] = useState([]);
  const [listsLoading, setListsLoading] = useState(false);
  const [selectedListId, setSelectedListId] = useState("");
  const [newListName, setNewListName] = useState("");
  const [creatingList, setCreatingList] = useState(false);
  const [addingToList, setAddingToList] = useState(false);
  const [selectedLead, setSelectedLead] = useState(null);
  const [listsFetchedAt, setListsFetchedAt] = useState(0);
  const [revealedEmailMeta, setRevealedEmailMeta] = useState({});

  // --- NEW: Bulk Save / Reveal State ---
  const [bulkSaveModalOpen, setBulkSaveModalOpen] = useState(false);
  const [bulkSaveCount, setBulkSaveCount] = useState("");
  const [bulkSaveReveal, setBulkSaveReveal] = useState("none");
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkActionType, setBulkActionType] = useState("save"); // "save" or "reveal"
  const [enableMaxPerCompany, setEnableMaxPerCompany] = useState(false);
  const [maxPerCompany, setMaxPerCompany] = useState("1");

  // --- NEW: Row Selection State ---
  const [selectedItems, setSelectedItems] = useState(new Map());
  const [pushingToCrm, setPushingToCrm] = useState(false);

  const handleSelectRow = (item) => {
    const id = getPublicId(item) || normalize(item.public_profile_url);
    setSelectedItems(prev => {
      const newMap = new Map(prev);
      if (newMap.has(id)) {
        newMap.delete(id);
      } else {
        newMap.set(id, item);
      }
      return newMap;
    });
  };

  const handleSelectAllOnPage = (e) => {
    const isChecked = e.target.checked;
    setSelectedItems(prev => {
      const newMap = new Map(prev);
      if (!data?.items) return newMap;
      
      data.items.forEach(item => {
        const id = getPublicId(item) || normalize(item.public_profile_url);
        if (isChecked) {
          newMap.set(id, item);
        } else {
          newMap.delete(id);
        }
      });
      return newMap;
    });
  };

  const clearSelection = () => {
    setSelectedItems(new Map());
  };

  const usableContact = (value) => {
    const s = String(value || "").trim();
    if (!s) return "";
    const lower = s.toLowerCase();
    if (lower === "not available" || lower === "n/a" || lower.includes("not available")) return "";
    return s.split(",")[0].trim();
  };

  const handlePushToCrm = async () => {
    if (searchMode === "companies") {
      Swal.fire({
        icon: "info",
        title: "People leads only",
        text: "Push to CRM is available for people search results.",
      });
      return;
    }
    if (selectedItems.size === 0) return;
    setPushingToCrm(true);
    try {
      const leads = Array.from(selectedItems.values()).map((item) => {
        const pos = getBestPosition(item) || {};
        const linkedin = item.public_profile_url || item.linkedin_url || item.profile_url || "";
        const pid = getPublicId(item);
        const uLead = normalize(linkedin);
        const emailRaw =
          revealedData[`${uLead}-email`] ||
          (pid && revealedData[`${pid}-email`]) ||
          item.email ||
          "";
        const phoneRaw =
          revealedData[`${uLead}-phone`] ||
          (pid && revealedData[`${pid}-phone`]) ||
          item.phone ||
          "";
        return {
          name: item.name || "",
          linkedin_url: linkedin,
          title: pos.role || item.title || "",
          company: pos.company || item.company || "",
          location: item.location || "",
          email: usableContact(emailRaw),
          phone: usableContact(phoneRaw),
        };
      });
      const res = await axios.post(
        `${config.apiUrl}/api/pipedrive/push-leads`,
        { leads },
        { withCredentials: true }
      );
      Swal.fire({
        icon: res.data.failed ? "warning" : "success",
        title: res.data.failed ? "Pipedrive push incomplete" : "Pushed to Pipedrive",
        text: `${res.data.pushed || 0} lead(s) pushed${res.data.skipped ? `, ${res.data.skipped} skipped` : ""}${res.data.failed ? `, ${res.data.failed} failed` : ""}.${
          Array.isArray(res.data.errors) && res.data.errors.length
            ? ` ${res.data.errors[0]}`
            : ""
        }`,
      });
    } catch (err) {
      if (err?.response?.status === 403) {
        const go = await Swal.fire({
          icon: "info",
          title: "Connect Pipedrive",
          text: "Connect Pipedrive in Integrations to push leads to your CRM.",
          showCancelButton: true,
          confirmButtonText: "Open Integrations",
          cancelButtonText: "Not now",
        });
        if (go.isConfirmed) window.location.href = "/integrations";
        return;
      }
      Swal.fire({
        icon: "error",
        title: "Push failed",
        text: err?.response?.data?.error || "Could not push leads to Pipedrive.",
      });
    } finally {
      setPushingToCrm(false);
    }
  };

  // Check if all items on current page are selected
  const isAllPageSelected = useMemo(() => {
    if (!data?.items || data.items.length === 0) return false;
    return data.items.every(item => {
      const id = getPublicId(item) || normalize(item.public_profile_url);
      return selectedItems.has(id);
    });
  }, [data?.items, selectedItems]);

  const handleOpenBulkSave = (type = "save") => {
    if (!isAuthenticated) {
      Swal.fire({ icon: "error", title: "Error", text: "Please login to bulk save" });
      return;
    }

    if (type === "reveal") {
      if (process.env.NEXT_PUBLIC_DISABLE_BULK_REVEAL === 'true') {
        Swal.fire({
          icon: "info",
          title: "Under Repair",
          text: "The Bulk Reveal feature is currently under maintenance. Please check back later.",
          confirmButtonText: "OK"
        });
        return;
      }

      const actualPlanKey = user?.planKey || user?.orgId?.planKey || 'FREE';
      if (actualPlanKey.toUpperCase() === 'FREE') {
        Swal.fire({
          icon: "error",
          title: "Upgrade Required",
          text: "Please upgrade your plan to use Bulk Reveal.",
          confirmButtonText: "View Plans",
          showCancelButton: true,
          cancelButtonText: "Cancel"
        }).then((result) => {
          if (result.isConfirmed) {
            window.location.href = "/setting/planOverview";
          }
        });
        return;
      }
    }

    if (loadedItemsCount === 0) {
      Swal.fire({ icon: "error", title: "Error", text: "No results to save." });
      return;
    }
    setBulkActionType(type);
    const totalAvailable = data?.paging?.total_count === -1 ? 10000 : (data?.paging?.total_count || 0);
    
    let initialCount = totalAvailable;
      let initialReveal = "none";

      if (type === "reveal") {
        initialReveal = "email";
        const availableCredits = typeof credits === "number" ? credits : 0;
        const maxAffordable = Math.floor(availableCredits / 5); // 5 is cost for email
        initialCount = Math.min(totalAvailable, maxAffordable);
      }

      if (selectedItems.size > 0) {
        initialCount = selectedItems.size;
      }

      // If it's a company search, we ALWAYS want it to start empty unless items are specifically checked
      if (searchMode === "companies" && selectedItems.size === 0) {
        setBulkSaveCount("");
      } else {
        setBulkSaveCount(initialCount > 0 ? initialCount : "");
      }
      
      setBulkSaveReveal(initialReveal);
    setSelectedListId("");
    setNewListName("");
    fetchUserLists();
    setBulkSaveModalOpen(true);
  };

  const fetchUserLists = async () => {
    const now = Date.now();
    if (lists.length && now - listsFetchedAt < 60000) return;
    try {
      setListsLoading(true);
      const res = await axios.get(`${config.apiUrl}/api/list`, { withCredentials: true });
      const onlyUserMade = Array.isArray(res.data) ? res.data.filter((l) => (l.kind || "user_made") === "user_made") : [];
      setLists(onlyUserMade);
      setListsFetchedAt(now);
    } catch {
      setLists([]);
    } finally {
      setListsLoading(false);
    }
  };

  const openAddToListModal = (lead) => {
    setSelectedLead(lead);
    setSelectedListId("");
    setNewListName("");
    fetchUserLists();
    setListModalOpen(true);
  };

  const handleConfirmAddSingle = async () => {
    if (!selectedLead) return;
    try {
      setAddingToList(true);
      let targetId = selectedListId;
      if (!targetId || targetId === "__CREATE__") {
        const name = (newListName || "").trim();
        if (!name) { setAddingToList(false); return; }
        setCreatingList(true);
        const created = await axios.post(`${config.apiUrl}/api/list/create/extension`, { name, listType: searchMode || 'people' }, { withCredentials: true });
        const list = created?.data?.list;
        setCreatingList(false);
        if (!list || !list._id) throw new Error("Create list failed");
        targetId = list._id;
        setLists((prev) => [list, ...prev.filter((l)=>l._id !== list._id)]);
        setSelectedListId(list._id);
        setNewListName("");
      }
      const rawUrl = String(selectedLead.public_profile_url || "").trim();
      const url = rawUrl; // Changed: Don't normalize for the UI mapping lookup unless UI does
      const uLead = normalize(rawUrl);
      const pidLead = getPublicId(selectedLead);
      const pid = pidLead;

      // Use the existing search result data directly
      const safeRaw = { ...selectedLead };

      // Helper to safely get truthy string or non-empty array
      const getTruthyValue = (val) => {
        if (Array.isArray(val)) return val.length > 0 ? val : null;
        if (typeof val === 'string') return val.trim() ? val : null;
        return val || null;
      };

      let payload;

      // ==========================================
      // BRANCH 1: CLEAN COMPANY PAYLOAD
      // ==========================================
      if (searchMode === 'companies') {
        const companyName = safeRaw.name || safeRaw.company_name || safeRaw.company || "N/A";
        
        // Extract arrays correctly
        let industryVal = getTruthyValue(safeRaw.organization__industry) || getTruthyValue(safeRaw.industry) || [];
        if (typeof industryVal === 'string') industryVal = [industryVal];
        
        let keywordsVal = getTruthyValue(safeRaw.keywords) || getTruthyValue(safeRaw.organization__keywords) || getTruthyValue(safeRaw.skills) || getTruthyValue(safeRaw.overview) || [];
        if (typeof keywordsVal === 'string') keywordsVal = [keywordsVal];
        
        const loc = safeRaw.location || "";
        const city = safeRaw.city || safeRaw.company_city || safeRaw.location_city || loc.split(",")[0]?.trim() || "";
        const state = safeRaw.state || safeRaw.company_state || loc.split(",")[1]?.trim() || "";
        const country = safeRaw.country || safeRaw.company_country || safeRaw.location_country || loc.split(",")[2]?.trim() || "";

        payload = {
          name: companyName,
          company: companyName,
          public_identifier: safeRaw.public_identifier || pid || "",
          linkedin_url: safeRaw.company_linkedin_url || safeRaw.linkedin_url || rawUrl,
          public_profile_url: safeRaw.company_linkedin_url || safeRaw.public_profile_url || safeRaw.linkedin_url || rawUrl,
          profile_url: safeRaw.company_linkedin_url || safeRaw.profile_url || rawUrl,
          profile_picture_url: safeRaw.logo || safeRaw.profile_picture_url || "",
          location: loc,
          city: city,
          state: state,
          country: country,
          
          company_headcount: safeRaw.headcount || safeRaw.company_headcount || safeRaw.employees || "",
          organization__industry: industryVal,
          keywords: keywordsVal,
          
          website: safeRaw.website || safeRaw.domain || "",
          organization__website: safeRaw.website || safeRaw.domain || "",
          organization__linkedin_url: safeRaw.company_linkedin_url || safeRaw.organization__linkedin_url || "",
          organization__facebook_url: safeRaw.facebook_url || "",
          organization__twitter_url: safeRaw.twitter_url || "",
          organization__address: safeRaw.address || loc || "",
          organization__city: city,
          organization__state: state,
          organization__country: country,
          organization__technologies: safeRaw.technologies || [],
          organization__founded_year: safeRaw.founded_year || safeRaw.founded_at || "",
          organization__total_funding: safeRaw.total_funding || "",
          organization__latest_funding: safeRaw.latest_funding || "",
          organization__latest_funding_amount: safeRaw.latest_funding_amount || "",
          organization__last_raised_at: safeRaw.last_raised_at || "",
          organization__annual_revenue: safeRaw.annual_revenue || safeRaw.revenue_min || "",
          revenue_min: safeRaw.revenue_min || "",
          revenue_max: safeRaw.revenue_max || "",
          
          audit__source: 'search',
          audit__timestamp: new Date().toISOString()
        };
      } 
      // ==========================================
      // BRANCH 2: PEOPLE PAYLOAD
      // ==========================================
      else {
        // Check if data was already revealed in UI
          const uiEmailString = revealedData[`${uLead}-email`] || (pid && revealedData[`${pid}-email`]) || "";
          const uiEmailMeta = revealedEmailMeta[`${uLead}-email`] || (pid && revealedEmailMeta[`${pid}-email`]) || [];
          const uiPhoneString = revealedData[`${uLead}-phone`] || (pid && revealedData[`${pid}-phone`]) || "";
          const uiTechsArray = revealedData[`${uLead}-technologies`] || (pid && revealedData[`${pid}-technologies`]);
          const rtData = revealCtx.getRealtimeData(uLead) || (pid ? revealCtx.getRealtimeData(pid) : null);

          // Also check revealCtx just in case
          const isEmailRevealed = !!uiEmailString || revealCtx.isRevealed(uLead, "email") || (pid && revealCtx.isRevealed(pid, "email"));
          const isPhoneRevealed = !!uiPhoneString || revealCtx.isRevealed(uLead, "phone") || (pid && revealCtx.isRevealed(pid, "phone"));

          // If revealed, attach the cached emails/phones to safeRaw so normalizeToListRaw picks them up
          if (isEmailRevealed) {
            if (uiEmailMeta && uiEmailMeta.length > 0) {
              safeRaw.contact__emails = uiEmailMeta.map(e => ({ email: e.email, verificationStatus: e.status || "unknown" }));
              safeRaw.contact__all_emails = safeRaw.contact__emails;
            } else if (uiEmailString) {
              safeRaw.contact__emails = uiEmailString.split(/[,;]+/).map(e => ({ email: e.trim(), verificationStatus: "unknown" })).filter(e => e.email);
              safeRaw.contact__all_emails = safeRaw.contact__emails;
            }
          }

          if (isPhoneRevealed) {
            if (uiPhoneString) {
              safeRaw.contact__phone_numbers = uiPhoneString.split(',').map(v => {
                const m = v.trim().match(/^(.+?)\s*\(([^)]+)\)\s*$/);
                const num = m ? m[1].trim() : v.trim();
                const type = m ? m[2].trim() : '';
                return { sanitized_number: num, raw_number: num, type };
              }).filter(p => p.raw_number);
            }
          }

          if (uiTechsArray) {
            safeRaw.technologies = uiTechsArray;
          }
          
          if (rtData) {
            if (rtData.facebook_url) safeRaw.organization__facebook_url = rtData.facebook_url;
            if (rtData.twitter_url) safeRaw.organization__twitter_url = rtData.twitter_url;
            if (rtData.annual_revenue) safeRaw.organization__annual_revenue = rtData.annual_revenue;
            if (rtData.total_funding) safeRaw.organization__total_funding = rtData.total_funding;
            if (rtData.latest_funding) safeRaw.organization__latest_funding = rtData.latest_funding;
            if (rtData.latest_funding_amount) safeRaw.organization__latest_funding_amount = rtData.latest_funding_amount;
            if (rtData.last_raised_at) safeRaw.organization__last_raised_at = rtData.last_raised_at;
          }
          
          // --- FETCH FULL REVEAL PAYLOAD FROM DATABASE IF NEEDED ---
          // If we know this lead is revealed, but we don't have the deep data in our temporary rtData cache 
          // (which happens if they refresh the page or we are inside a list view), we pull the complete 
          // record directly from the backend to ensure we don't lose firmographics.
          const hasTechs = Array.isArray(safeRaw.organization__technologies) && safeRaw.organization__technologies.length > 0;
          if ((isEmailRevealed || isPhoneRevealed) && !hasTechs) {
             try {
                const valsRes = await axios.get(`${config.apiUrl}/api/reveal/values`, { 
                  params: { profileUrl: rawUrl, publicIdentifier: pid }, 
                  withCredentials: true 
                });
                const dbData = valsRes.data;
                if (dbData) {
                   if (dbData.technologies && dbData.technologies.length) safeRaw.organization__technologies = dbData.technologies;
                   if (dbData.facebook_url) safeRaw.organization__facebook_url = dbData.facebook_url;
                   if (dbData.twitter_url) safeRaw.organization__twitter_url = dbData.twitter_url;
                   if (dbData.annual_revenue) safeRaw.organization__annual_revenue = dbData.annual_revenue;
                   if (dbData.total_funding) safeRaw.organization__total_funding = dbData.total_funding;
                   if (dbData.latest_funding) safeRaw.organization__latest_funding = dbData.latest_funding;
                   if (dbData.latest_funding_amount) safeRaw.organization__latest_funding_amount = dbData.latest_funding_amount;
                   if (dbData.last_raised_at) safeRaw.organization__last_raised_at = dbData.last_raised_at;
                }
             } catch (e) {
                console.error("Failed to fetch deep reveal data for add-to-list:", e);
             }
          }
          // ---------------------------------------------------------

        // Helper to derive seniority
        const deriveSeniority = (title) => {
          const t = String(title || "").toLowerCase();
          const cSuite = ["chief","ceo","cfo","coo","cto","cio","president","founder"];
          if (cSuite.some((k)=> t.includes(k))) return "c_suite";
          return "";
        };

        const pos0 = Array.isArray(safeRaw.current_positions) ? safeRaw.current_positions[0] || {} : {};
        const seniority = deriveSeniority(pos0.role || safeRaw.title);
        const dept = pos0.function || safeRaw.job_function || safeRaw.department || "";
        
        const hasUsableValue = (val) => {
          if (Array.isArray(val)) return val.length > 0;
          if (typeof val === "string") return val.trim().length > 0;
          return val !== null && val !== undefined && val !== "";
        };
        const orgIndustry = Array.isArray(pos0.industry) ? pos0.industry : (pos0.industry || "");
        const headcount = safeRaw.company_headcount || "";
        const keywords = hasUsableValue(safeRaw.keywords)
          ? safeRaw.keywords
          : (hasUsableValue(safeRaw.organization__keywords) ? safeRaw.organization__keywords : "");

        // Ensure normalizeToListRaw gets what it expects
        safeRaw.organization__industry = hasUsableValue(safeRaw.organization__industry)
          ? safeRaw.organization__industry
          : (hasUsableValue(safeRaw.industry) ? safeRaw.industry : orgIndustry);
        safeRaw.seniority = safeRaw.seniority || seniority;
        safeRaw.function = safeRaw.function || dept;
        safeRaw.organization__estimated_num_employees = safeRaw.company_headcount || headcount;
        safeRaw.employees = safeRaw.employees || safeRaw.company_headcount || headcount;

        // Context-Aware Company Selection
        // Use the same smart logic that the UI uses to determine the best position
        if (Array.isArray(safeRaw.current_positions) && safeRaw.current_positions.length > 1) {
          const bestPos = getBestPosition(safeRaw);
          if (bestPos && bestPos.company) {
             const matchIndex = safeRaw.current_positions.findIndex(p => p.company === bestPos.company);
             if (matchIndex > 0) {
                const matchedPos = safeRaw.current_positions.splice(matchIndex, 1)[0];
                safeRaw.current_positions.unshift(matchedPos); // move the best position to the front!
             }
          }
        }

        const mappedRaw = normalizeToListRaw(safeRaw);

        payload = {
          ...safeRaw,
          ...mappedRaw,
          linkedin_url: mappedRaw.linkedin_url || rawUrl,
          public_profile_url: mappedRaw.public_profile_url || rawUrl,
          profile_url: mappedRaw.profile_url || rawUrl,
          title: (mappedRaw.title && mappedRaw.title !== "N/A" ? mappedRaw.title : null) || safeRaw.title || safeRaw.headline || safeRaw.summary || "N/A",
          company: (mappedRaw.company && mappedRaw.company !== "N/A" ? mappedRaw.company : null) || safeRaw.company || safeRaw.company_name || safeRaw.name || "N/A",
          name: mappedRaw.name || safeRaw.name || "N/A",
          location: (mappedRaw.location && mappedRaw.location !== "N/A" ? mappedRaw.location : null) || safeRaw.location || "N/A",
          headline: (mappedRaw.headline && mappedRaw.headline !== "N/A" ? mappedRaw.headline : null) || safeRaw.headline || safeRaw.summary || "N/A",
          profile_picture_url: mappedRaw.profile_picture_url || safeRaw.profile_picture_url || safeRaw.logo || "",
          company_headcount: mappedRaw.employees || headcount || safeRaw.headcount,
          website: mappedRaw.website || safeRaw.website || safeRaw.domain || "",
          organization__website: mappedRaw.website || safeRaw.website || safeRaw.domain || "",
          company_linkedin_url: mappedRaw.company_linkedin_url || safeRaw.company_linkedin_url || safeRaw.organization__linkedin_url || "",
          organization__linkedin_url: mappedRaw.company_linkedin_url || safeRaw.company_linkedin_url || safeRaw.organization__linkedin_url || "",
          organization__facebook_url: mappedRaw.facebook_url || safeRaw.organization__facebook_url || safeRaw.facebook_url || "",
          organization__twitter_url: mappedRaw.twitter_url || safeRaw.organization__twitter_url || safeRaw.twitter_url || "",
          organization__address: mappedRaw.address || safeRaw.address || safeRaw.location || "",
          organization__city: mappedRaw.company_city || safeRaw.company_city || mappedRaw.city || safeRaw.location_city || (safeRaw.location || "").split(",")[0]?.trim() || "",
          organization__state: mappedRaw.company_state || safeRaw.company_state || mappedRaw.state || (safeRaw.location || "").split(",")[1]?.trim() || "",
          organization__country: mappedRaw.company_country || safeRaw.company_country || mappedRaw.country || safeRaw.location_country || (safeRaw.location || "").split(",")[2]?.trim() || "",
          organization__technologies: mappedRaw.technologies || safeRaw.organization__technologies || safeRaw.technologies || safeRaw.organization__current_technologies || [],
          organization__founded_year: mappedRaw.founded_year || safeRaw.organization__founded_year || safeRaw.founded_year || safeRaw.founded_at || "",
          organization__total_funding: mappedRaw.total_funding || safeRaw.organization__total_funding || safeRaw.total_funding || "",
          organization__latest_funding: mappedRaw.latest_funding || safeRaw.organization__latest_funding || safeRaw.latest_funding || "",
          organization__latest_funding_amount: mappedRaw.latest_funding_amount || safeRaw.organization__latest_funding_amount || safeRaw.latest_funding_amount || "",
          organization__last_raised_at: mappedRaw.last_raised_at || safeRaw.organization__last_raised_at || safeRaw.last_raised_at || "",
          organization__annual_revenue: mappedRaw.annual_revenue || safeRaw.organization__annual_revenue || safeRaw.annual_revenue || safeRaw.revenue_min || "", 
          revenue_min: safeRaw.revenue_min,
          revenue_max: safeRaw.revenue_max,
          seniority: mappedRaw.seniority || seniority,
          function: mappedRaw.function || dept,
          
          // Force exclude email/phone unless they were already revealed in UI
          contact__all_emails: isEmailRevealed ? (mappedRaw.contact__all_emails || mappedRaw.contact__emails || safeRaw.contact__emails) : [],
          contact__phone_numbers: isPhoneRevealed ? (mappedRaw.contact__phone_numbers || safeRaw.contact__phone_numbers) : [],
          
          audit__source: 'search',
          audit__timestamp: new Date().toISOString(),
        };

        // Fix industry and keywords after spread to prevent empty arrays from overriding fallback values
        const industryValue = getTruthyValue(mappedRaw.industry) || getTruthyValue(mappedRaw.organization__industry) || getTruthyValue(orgIndustry) || getTruthyValue(safeRaw.organization__industry) || getTruthyValue(safeRaw.industry) || "";
        const keywordsValue = getTruthyValue(mappedRaw.keywords) || getTruthyValue(keywords) || getTruthyValue(safeRaw.organization__keywords) || getTruthyValue(safeRaw.skills) || getTruthyValue(safeRaw.overview) || [];
        
        payload.organization__industry = industryValue;
        payload.keywords = keywordsValue;
        
        // Ensure department/job_function fields are fully preserved
        payload.job_function = mappedRaw.job_function || safeRaw.job_function || "";
        payload.department = mappedRaw.department || safeRaw.department || "";
        payload.departments = mappedRaw.departments || safeRaw.departments || [];
        
        // Double-check strict deletion to be absolutely sure
        if (!isEmailRevealed) {
          delete payload.contact__all_emails;
          delete payload.contact__emails;
          delete payload.emails;
          delete payload.email;
        }
        if (!isPhoneRevealed) {
          delete payload.contact__phone_numbers;
          delete payload.phone_numbers;
          delete payload.phone;
          delete payload.second_phone;
        }
      }

      await axios.post(`${config.apiUrl}/api/list/add/${targetId}/items`, [payload], { withCredentials: true });

      // --- AUTO-ADD TO SAVED LEADS IF UNREVEALED ---
      // Requirement: If a user adds an unrevealed lead to a list, also add it to "Saved Leads".
      const phoneKeyUrl = uLead ? `${uLead}-phone` : null;
      const phoneKeyPid = pidLead ? `${pidLead}-phone` : null;
      const emailKeyUrl = uLead ? `${uLead}-email` : null;
      const emailKeyPid = pidLead ? `${pidLead}-email` : null;

      const isRevealed =
        (phoneKeyUrl && revealedServer[phoneKeyUrl]) ||
        (phoneKeyPid && revealedServer[phoneKeyPid]) ||
        (emailKeyUrl && revealedServer[emailKeyUrl]) ||
        (emailKeyPid && revealedServer[emailKeyPid]);

      if (!isRevealed && searchMode !== 'companies') {
        try {
          const createdSpecial = await axios.post(`${config.apiUrl}/api/list/create/revealed-search-results`, {}, { withCredentials: true });
          const specialList = createdSpecial?.data?.list;
          if (specialList && specialList._id) {
             const specialPayload = {
               ...payload,
               audit__source: 'search',
               audit__timestamp: new Date().toISOString()
             };
             // Use add-special endpoint for Saved Leads
             await axios.post(`${config.apiUrl}/api/list/add-special/${specialList._id}/items`, [specialPayload], { withCredentials: true });
          }
        } catch (autoAddErr) {
          // Silently fail if auto-add to Saved Leads fails, as the primary user action succeeded
          console.warn("Auto-add to Saved Leads failed:", autoAddErr);
        }
      }
      // ----------------------------------------------

      setListModalOpen(false);
      Swal.fire({ toast: true, position: "top-end", imageUrl: "/icons/mawsool-success.webp", imageAlt: "Custom alert icon", title: "Added to list", showConfirmButton: false, timer: 2000 });
    } catch (e) {
      Swal.fire({ imageUrl: "/icons/mawsool-error.webp", imageAlt: "Custom alert icon", title: "Add to list failed", text: e?.response?.data?.msg || e?.message || "Could not add lead", confirmButtonText: "Ok", customClass: { confirmButton: "swal-confirm-button" } });
    } finally {
      setAddingToList(false);
    }
  };


  const extractEmails = (obj) => {
    const emails = new Set();
    const emailRegex = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
    const visit = (val) => {
      if (!val) return;
      if (typeof val === "string") {
        const m = val.match(emailRegex);
        if (m) emails.add(m[0]);
      } else if (Array.isArray(val)) {
        val.forEach(visit);
      } else if (typeof val === "object") {
        Object.values(val).forEach(visit);
      }
    };
    visit(obj);
    return Array.from(emails);
  };

  const handleReveal = async (item, contactType) => {
    const key = `${normalize(item.public_profile_url)}-${contactType}`;
    setRevealLoading((prev) => ({ ...prev, [key]: true }));
    try {
      if (!isAuthenticated) throw new Error("Login to reveal");

      const fieldsParam = contactType === "email" ? "email" : "phone";
      const url = `${process.env.NEXT_PUBLIC_API_URL}/api/mawsool/contact?url=${encodeURIComponent(item.public_profile_url)}&fields=${fieldsParam}`;
      let res;
      let errorMsg;
      let extracted = { emailString: "", phoneString: "", emailMeta: [], phones: [], phoneLabels: [], awaiting: false, status: "" };
      try {
        res = await axios.get(url, {
          headers: { accept: "application/json" },
          validateStatus: () => true,
          timeout: 30000,
        });
        extracted = extractContactReveal(res.data);
        if (res.status >= 400 && !(res.data?.status === "processing" || extracted.awaiting)) {
          errorMsg = res.data?.message || res.data?.error || "Failed to fetch contact info from Mawsool API.";
        }
      } catch (err) {
        errorMsg = err.message || "Error fetching from Mawsool API.";
      }

      if (res?.status >= 400 && !extracted.awaiting && !hasExtractedContacts(extracted, contactType)) {
        throw new Error(errorMsg || "Failed to fetch contact info from Mawsool API.");
      }
      if (res?.data?.status !== "success" && res?.data?.status !== "processing" && !extracted.awaiting && !hasExtractedContacts(extracted, contactType)) {
        throw new Error(errorMsg || "Failed to fetch contact info from Mawsool API.");
      }

      let phones = extracted.phoneLabels || [];
      let phoneString = extracted.phoneString || "";
      let allEmails = (extracted.emails || []).map((e) => e.email);
      let emailString = extracted.emailString || "";
      let emailMeta = extracted.emailMeta || [];

      const pullSavedValues = async () => {
        try {
          const respVals = await axios.get(`${config.apiUrl}/api/reveal/values`, {
            params: { profileUrl: item.public_profile_url, publicIdentifier: getPublicId(item) },
            withCredentials: true,
          });
          const phonesArr = respVals.data?.phones || [];
          const emailsArr = respVals.data?.emails || [];
          if (!phoneString && phonesArr.length) {
            phones = phonesArr.map((p) => `${p?.sanitized_number || p?.raw_number || ""}${p?.type ? ` (${p.type})` : ""}`.trim()).filter(Boolean);
            phoneString = phones.join(",");
          }
          if (!emailString && emailsArr.length) {
            emailMeta = emailsArr.map((e) => ({ email: e?.email || e?.sanitized_email, status: e?.verificationStatus || e?.status || "" })).filter((e) => e.email);
            allEmails = emailMeta.map((e) => e.email);
            emailString = allEmails.join(", ");
          }
        } catch {}
      };

      if ((contactType === "phone" && !phoneString) || (contactType === "email" && !emailString)) {
        await pullSavedValues();
      }

      const awaitingMore = !!(extracted.awaiting && ((contactType === "phone" && !phoneString) || (contactType === "email" && !emailString) || extracted.awaiting));
      if (awaitingMore) {
        const uLead = normalize(item.public_profile_url);
        const pidLead = getPublicId(item);
        setAwaitingReveal((prev) => ({
          ...prev,
          [`${uLead}-${contactType}`]: true,
          ...(pidLead ? { [`${pidLead}-${contactType}`]: true } : {}),
        }));
      }

      // If a webhook is still running and we still have no contacts, keep waiting instead of stamping Not available.
      if (((contactType === "phone" && !phoneString) || (contactType === "email" && !emailString)) && extracted.awaiting) {
        return { emailString: emailString || "", phoneString: phoneString || "", emailMeta, awaiting: true };
      }

      phoneString = phoneString || "Not available";
      emailString = emailString || "Not available";
      if (!emailMeta.length && allEmails.length) {
        emailMeta = allEmails.map((em) => ({ email: em, status: extracted.raw?.contact__email_status || "unknown" }));
      }

      const revealedValue = contactType === "email" ? emailString : phoneString;
      const payload = contactType === "email"
        ? { phone: "Not available", email: emailString, emailStatuses: emailMeta.map(m=>m.status), profileUrl: item.public_profile_url, publicIdentifier: getPublicId(item), types: ['email'] }
        : { phone: phoneString, email: "Not available", profileUrl: item.public_profile_url, publicIdentifier: getPublicId(item), types: ['phone'] };

      let bundleRes = { data: {} };
      if (revealedValue && revealedValue !== "Not available") {
        bundleRes = await axios.post(
          `${config.apiUrl}/api/reveal/bundle-search`,
          payload,
          { withCredentials: true }
        );
      }

        if (bundleRes.data?.pending && !hasExtractedContacts(extracted, contactType) && revealedValue === "Not available") {
          throw new Error(bundleRes.data?.message || "Verification pending");
        }

        const creditsLeft = bundleRes.data?.creditsLeft;
        const sourceData = extracted.raw || res.data || {};
        const technologiesArray = sourceData.organization__current_technologies || sourceData.organization__technologies || sourceData.technologies || [];
        
        setRevealedData((prev) => {
          const updates = { ...prev };
          const uLead = normalize(item.public_profile_url);
          const pidLead = getPublicId(item);
          
          if (contactType === "email") {
            updates[`${uLead}-email`] = emailString;
            if (pidLead) updates[`${pidLead}-email`] = emailString;
          } else {
            updates[`${uLead}-phone`] = phoneString;
            if (pidLead) updates[`${pidLead}-phone`] = phoneString;
          }
          
          if (technologiesArray.length > 0) {
            updates[`${uLead}-technologies`] = technologiesArray;
            if (pidLead) updates[`${pidLead}-technologies`] = technologiesArray;
          }
          
          return updates;
        });

        if (contactType === "email" && emailString && emailString !== "Not available") {
        revealCtx.markRevealed(item.public_profile_url, "email");
        if (getPublicId(item)) revealCtx.markRevealed(getPublicId(item), "email");
      }
      if (contactType === "phone" && phoneString && phoneString !== "Not available") {
        revealCtx.markRevealed(item.public_profile_url, "phone");
        if (getPublicId(item)) revealCtx.markRevealed(getPublicId(item), "phone");
      }
      // If server indicates revealed but current fetch lacks values, try backend saved values
      try {
        if (contactType === "phone" && (!phoneString || phoneString === "Not available")) {
          const respVals = await axios.get(`${config.apiUrl}/api/reveal/values`, { params: { profileUrl: item.public_profile_url, publicIdentifier: getPublicId(item) }, withCredentials: true });
          const phonesArr = respVals.data?.phones || [];
          const joined = phonesArr.map(p => p?.sanitized_number || p?.raw_number).filter(Boolean).join(', ');
          if (joined) {
            setRevealedData((prev) => ({ ...prev, [`${normalize(item.public_profile_url)}-phone`]: joined, ...(getPublicId(item) ? { [`${getPublicId(item)}-phone`]: joined } : {}) }));
            revealCtx.markRevealed(item.public_profile_url, "phone");
            if (getPublicId(item)) revealCtx.markRevealed(getPublicId(item), "phone");
          }
        }
        if (contactType === "email" && (!emailString || emailString === "Not available")) {
          const respVals = await axios.get(`${config.apiUrl}/api/reveal/values`, { params: { profileUrl: item.public_profile_url, publicIdentifier: getPublicId(item) }, withCredentials: true });
          const emailsArr = respVals.data?.emails || [];
          const joinedE = emailsArr.map(e => e?.email || e?.sanitized_email).filter(Boolean).join(', ');
          if (joinedE) {
            setRevealedData((prev) => ({ ...prev, [`${normalize(item.public_profile_url)}-email`]: joinedE, ...(getPublicId(item) ? { [`${getPublicId(item)}-email`]: joinedE } : {}) }));
            revealCtx.markRevealed(item.public_profile_url, "email");
            if (getPublicId(item)) revealCtx.markRevealed(getPublicId(item), "email");
          }
        }
      } catch {}
      if (contactType === "email" && emailMeta.length) {
        setRevealedEmailMeta((prev)=> ({ ...prev, [`${normalize(item.public_profile_url)}-email`]: emailMeta, ...(getPublicId(item) ? { [`${getPublicId(item)}-email`]: emailMeta } : {}) }));
      }
      if (typeof creditsLeft === 'number') await updateCredits(creditsLeft);

      // Auto-save revealed contacts to "Saved Leads" list
      try {
        const created = await axios.post(`${config.apiUrl}/api/list/create/revealed-search-results`, {}, { withCredentials: true });
        const special = created?.data?.list;
        if (special && special._id) {
          const pickVal = (...vals) => vals.find((v) => {
            if (v === null || v === undefined) return false;
            if (Array.isArray(v)) return v.length > 0;
            const s = String(v).trim();
            return s && s !== "N/A" && s.toLowerCase() !== "not available";
          });
          const pos = getBestPosition(item) || {};
          const contactRaw = extracted.raw || res.data || {};
          const searchName = pickVal(item.name, `${item.first_name || ""} ${item.last_name || ""}`.trim(), item.full_name);
          const mergedSource = {
            ...item,
            ...contactRaw,
            first_name: pickVal(item.first_name, contactRaw.contact__first_name, contactRaw.first_name),
            last_name: pickVal(item.last_name, contactRaw.contact__last_name, contactRaw.last_name),
            name: pickVal(searchName, contactRaw.contact__name, contactRaw.name, contactRaw.full_name),
            title: pickVal(pos.role, item.title, contactRaw.contact__title, contactRaw.title),
            company: pickVal(pos.company, item.company, item.company_name, contactRaw.contact__organization_name, contactRaw.company),
            headline: pickVal(item.headline, contactRaw.headline, contactRaw.contact__headline),
            location: pickVal(item.location, contactRaw.location),
            current_positions: (Array.isArray(item.current_positions) && item.current_positions.length)
              ? item.current_positions
              : contactRaw.current_positions,
            public_profile_url: item.public_profile_url || contactRaw.public_profile_url,
            linkedin_url: item.public_profile_url || item.linkedin_url || contactRaw.linkedin_url,
            profile_picture_url: pickVal(item.profile_picture_url, item.logo, contactRaw.profile_picture_url, contactRaw.contact__photo_url),
          };
          const mappedRaw = normalizeToListRaw(mergedSource, item.public_profile_url);
          const raw = mergedSource;
          
          // Construct payload with search-row identity plus revealed contacts
          const payload = {
            ...raw,
            ...mappedRaw,
            linkedin_url: mappedRaw.linkedin_url || item.public_profile_url,
            public_profile_url: mappedRaw.public_profile_url || item.public_profile_url,
            profile_url: mappedRaw.profile_url || item.public_profile_url,
            id: mappedRaw.id || getPublicId(item),
            person_id: mappedRaw.id || getPublicId(item),
            name: pickVal(mappedRaw.name, searchName) || "",
            first_name: pickVal(mappedRaw.first_name, item.first_name),
            last_name: pickVal(mappedRaw.last_name, item.last_name),
            title: pickVal(mappedRaw.title, pos.role, item.title),
            company: pickVal(mappedRaw.company, pos.company, item.company),
            current_positions: mergedSource.current_positions || mappedRaw.current_positions || item.current_positions || [],
            seniority: mappedRaw.seniority || raw?.seniority || "",
            function: mappedRaw.function || (Array.isArray(raw?.functions) ? raw.functions[0] : (Array.isArray(raw?.departments) ? raw.departments[0] : "")),
            organization__industry: mappedRaw.organization__industry || mappedRaw.industry || raw?.organization__industry || raw?.organization__industries || raw?.contact__industry || [],
            company_headcount: mappedRaw.company_headcount || raw?.company_headcount || raw?.organization__estimated_num_employees || "",
            keywords: mappedRaw.keywords || raw?.organization__keywords || raw?.keywords || [],
            website: mappedRaw.website || raw?.website || "",
            organization__website: mappedRaw.website || mappedRaw.organization__website || raw?.organization__website || raw?.organization__website_url || raw?.website || "",
            company_linkedin_url: mappedRaw.company_linkedin_url || raw?.company_linkedin_url || "",
            organization__linkedin_url: mappedRaw.company_linkedin_url || mappedRaw.organization__linkedin_url || raw?.organization__linkedin_url || "",
            organization__facebook_url: mappedRaw.organization__facebook_url || raw?.organization__facebook_url || "",
            organization__twitter_url: mappedRaw.organization__twitter_url || raw?.organization__twitter_url || "",
            organization__address: mappedRaw.organization__address || raw?.organization__address || raw?.organization__raw_address || "",
            organization__city: mappedRaw.organization__city || raw?.organization__city || "",
            organization__state: mappedRaw.organization__state || raw?.organization__state || "",
            organization__country: mappedRaw.organization__country || raw?.organization__country || "",
            organization__technologies: mappedRaw.organization__technologies || raw?.organization__current_technologies || raw?.organization__technologies || [],
            organization__founded_year: mappedRaw.organization__founded_year || raw?.organization__founded_year || "",
            organization__annual_revenue: mappedRaw.annual_revenue || raw?.organization__annual_revenue || "",
            organization__total_funding: mappedRaw.organization__total_funding || raw?.organization__total_funding || "",
            organization__latest_funding: mappedRaw.organization__latest_funding || raw?.organization__latest_funding || raw?.organization__latest_funding_stage || "",
            organization__latest_funding_amount: mappedRaw.organization__latest_funding_amount || raw?.organization__latest_funding_amount || "",
            organization__last_raised_at: mappedRaw.organization__last_raised_at || raw?.organization__last_raised_at || raw?.organization__latest_funding_round_date || "",
            public_identifier: mappedRaw.id || getPublicId(item),
            audit__source: 'search',
            audit__timestamp: new Date().toISOString(),
            
            // Explicitly set contact fields
            email: emailString !== "Not available" ? emailString : "",
            phone: phoneString !== "Not available" ? phoneString : "",
            contact__all_emails: emailMeta.length > 0 ? emailMeta : [],
            contact__phone_numbers: extracted.phones?.length ? extracted.phones : (phones.length > 0 ? (sourceData.contact__phone_numbers || []) : [])
          };

          await axios.post(`${config.apiUrl}/api/list/add-special/${special._id}/items`, [payload], { withCredentials: true });
          Swal.fire({ toast: true, position: "top-end", imageUrl: "/icons/mawsool-success.webp", imageAlt: "Custom alert icon", title: "Saved to Saved Leads", showConfirmButton: false, timer: 2000 });
        }
      } catch (e) {
        console.error("Auto-save failed:", e);
      }

      return { emailString, phoneString, emailMeta };

    } catch (err) {
      let errorMessage = err.message || `Failed to reveal ${contactType}.`;
      
      if (err.response?.status === 402 || errorMessage.includes('402')) {
        Swal.fire({
          imageUrl: "/icons/mawsool-error.webp",
          imageAlt: "Custom alert icon",
          title: "Insufficient Credits",
          text: "You don't have enough credits to reveal this contact. Please upgrade your plan or purchase more credits.",
          showCancelButton: true,
          confirmButtonText: "Get Credits",
          cancelButtonText: "Cancel",
          customClass: { confirmButton: "swal-confirm-button", cancelButton: "swal-cancel-button" },
        }).then((result) => {
          if (result.isConfirmed) {
            window.location.href = "/setting/planOverview";
          }
        });
      } else {
        Swal.fire({
          imageUrl: "/icons/mawsool-error.webp",
          imageAlt: "Custom alert icon",
          title: "Error",
          text: errorMessage,
          confirmButtonText: "Ok",
          customClass: { confirmButton: "swal-confirm-button" },
        });
      }
    } finally {
      setRevealLoading((prev) => ({ ...prev, [key]: false }));
    }
  };

  // --- NEW: Bulk Save Handler ---

  const handleConfirmBulkSave = async () => {
    try {
      setBulkSaving(true);
      let targetId = selectedListId;

      // --- Credit Validation for Bulk Reveal ---
      if (bulkActionType === "reveal" && bulkSaveReveal !== "none") {
        const fallbackTotal = data?.paging?.total_count === -1 ? 10000 : (data?.paging?.total_count || 0);
        const requestedCount = bulkSaveCount === "" || bulkSaveCount === null ? fallbackTotal : Number(bulkSaveCount);
        
        if (requestedCount > 700) {
          Swal.fire({
            icon: "error",
            title: "Limit Exceeded",
            text: "The limit for bulk reveal is 700 profiles per request. Please specify a smaller number.",
          });
          setBulkSaving(false);
          return;
        }

        let costPerLead = 0;
        if (bulkSaveReveal === "email") costPerLead = 5;
        else if (bulkSaveReveal === "phone") costPerLead = 20;
        else if (bulkSaveReveal === "both") costPerLead = 25;
        
        const totalRequiredCredits = requestedCount * costPerLead;
        // The `credits` from AuthContext now correctly sums both pool and personal balances.
        const availableCredits = typeof credits === "number" ? credits : 0;
        
        if (availableCredits < totalRequiredCredits) {
          Swal.fire({
            icon: "error",
            title: "Insufficient Credits",
            text: `You need at least ${totalRequiredCredits} credits to start revealing ${requestedCount} leads (assuming none are already revealed). You currently have ${availableCredits} credits.`,
            confirmButtonText: "Buy Credits",
            showCancelButton: true,
            cancelButtonText: "Cancel"
          }).then((result) => {
            if (result.isConfirmed) {
              window.location.href = "/setting/planOverview";
            }
          });
          setBulkSaving(false);
          return;
        }
      }
      // -----------------------------------------

      if (!targetId || targetId === "__CREATE__") {
        const name = (newListName || "").trim();
        if (!name) { 
          Swal.fire({ icon: "error", title: "Name required", text: "Please enter a list name." });
          setBulkSaving(false); 
          return; 
        }
        setCreatingList(true);
        const created = await axios.post(`${config.apiUrl}/api/list/create/extension`, { name, listType: searchMode || 'people' }, { withCredentials: true });
        const list = created?.data?.list;
        setCreatingList(false);
        if (!list || !list._id) throw new Error("Create list failed");
        targetId = list._id;
        setLists((prev) => [list, ...prev.filter((l)=>l._id !== list._id)]);
        setSelectedListId(list._id);
        setNewListName("");
      }

      // Send the request to the new backend endpoint
      const cleaned = cleanSearchFilter(searchFilter);
      // Explicitly append searchMode to the filters so the middleware knows what to search for
      cleaned.searchMode = searchMode || 'people';

      let requestedCount = bulkSaveCount === "" || bulkSaveCount === null ? null : Number(bulkSaveCount);
      
      // If revealing, we must provide an exact count to the backend to enforce the 700 limit
      if (bulkActionType === "reveal" && bulkSaveReveal !== "none" && requestedCount === null) {
        const fallbackTotal = data?.paging?.total_count === -1 ? 10000 : (data?.paging?.total_count || 0);
        requestedCount = fallbackTotal;
      }

      let parsedMaxPerCompany = enableMaxPerCompany && maxPerCompany ? Number(maxPerCompany) : null;

      // --- Credit Validation for Company Bulk Save ---
      if (searchMode === 'companies' && bulkActionType === "save") {
        const fallbackTotal = data?.paging?.total_count === -1 ? 10000 : (data?.paging?.total_count || 0);
        const costPerCompany = 1;
        const totalRequiredCredits = (requestedCount || fallbackTotal) * costPerCompany;
        const availableCredits = typeof credits === "number" ? credits : 0;

        if (availableCredits < totalRequiredCredits) {
          Swal.fire({
            icon: "warning",
            title: "Low Credits",
            text: `You have ${availableCredits} credits. Saving companies costs 1 credit per company. We will save as many as possible up to your credit limit.`,
            confirmButtonText: "Continue",
            showCancelButton: true,
            cancelButtonText: "Cancel"
          }).then((result) => {
            if (!result.isConfirmed) {
              setBulkSaving(false);
              return;
            }
            // Proceed with bulk save (backend will truncate to available credits)
            executeBulkSavePost(targetId, cleaned, requestedCount, parsedMaxPerCompany);
          });
          return;
        }
      }
      
      await executeBulkSavePost(targetId, cleaned, requestedCount, parsedMaxPerCompany);
    } catch (err) {
      handleBulkSaveError(err);
    }
  };

  const executeBulkSavePost = async (targetId, cleaned, requestedCount, parsedMaxPerCompany) => {
    try {
      const payload = {
        listId: targetId,
        filters: { ...cleaned, searchMode },
        requestedCount: requestedCount,
        revealType: bulkSaveReveal,
        initialItems: data?.items || [], // Pass the current search results to avoid re-fetching page 1
        maxPerCompany: parsedMaxPerCompany
      };

      if (selectedItems.size > 0) {
        payload.selectedItems = Array.from(selectedItems.values());
      }

      await axios.post(`${config.apiUrl}/api/list/bulk-save`, payload, { withCredentials: true });

      let msgText = `Saving ${requestedCount ? requestedCount + ' leads' : 'all available leads'} to your list in the background. This may take a few minutes.`;
      if (bulkSaveReveal !== 'none') {
        msgText += ` Auto-reveal (${bulkSaveReveal}) will start automatically afterwards.`;
      }

      Swal.fire({
        icon: "success",
        title: "Bulk Save Started",
        text: msgText,
        timer: 4000,
        showConfirmButton: false
      });
      setBulkSaveModalOpen(false);
      clearSelection(); // Clear the checkboxes after successfully starting the job

    } catch (err) {
      handleBulkSaveError(err);
    }
  };

  const handleBulkSaveError = (err) => {
    const msg = err.response?.data?.msg || err.message || "Failed to start bulk save.";
    if (err.response?.status === 403 && msg.includes("Premium")) {
      Swal.fire({
        icon: "warning",
          title: "Premium Feature",
          text: msg,
          confirmButtonText: "Upgrade Plan"
        }).then((result) => {
          if (result.isConfirmed) {
            window.location.href = "/setting/billing";
          }
        });
      } else {
        Swal.fire({ icon: "error", title: "Error", text: msg });
      }
      setBulkSaving(false);
  };

  return (
    <div className="p-4 flex flex-col gap-2 bg-[#FBFBFC] border border-[#E5E6E6] rounded-[16px] w-full  overflow-auto relative">
      {isLoading && (
        <div className="absolute inset-0 z-50 bg-white/60 flex items-center justify-center rounded-[16px]">
          <div className="flex flex-col items-center gap-2">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#04145C]"></div>
            <span className="text-sm font-medium text-[#04145C]">
              {searchMode === "companies" ? "Searching for Companies..." : "Searching for People..."}
            </span>
          </div>
        </div>
      )}
      {/* Header Section */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <span className="text-sm text-[#434343] pl-[10px] p-2 border border-[#E5E6E6] rounded-[8px]">
            Total Results: {(() => {
              // Priority:
              // 1. data.total (Formatted String from API, e.g. "1.2M" or "152")
              // 2. data.paging.total_count (Numeric, e.g. 1200000 or 152)
              // 3. Fallback to 0
              
              const rawTotal = data?.total;
              const numericTotal = data?.paging?.total_count;

              if (rawTotal === -1 || rawTotal === "-1") {
                  return "Calculating...";
              }

              if (rawTotal && rawTotal !== "0") {
                  const clean = String(rawTotal).replace(/^~/, '');
                  if (/[KMB]$/i.test(clean)) return clean;
                  const asNum = parseInt(clean, 10);
                  if (Number.isFinite(asNum) && String(asNum) === clean && asNum >= 1000) {
                    return formatNumber(asNum);
                  }
                  return clean;
              }
              
              if (numericTotal > 0) {
                  return formatNumber(numericTotal);
              }
              
              return "0";
            })()}
          </span>

          {selectedItems.size > 0 && (
            <div className="flex items-center gap-2 pl-[10px] p-2 border border-[#04145C] bg-[#E8EDFE] rounded-[8px]">
              <span className="text-sm font-medium text-[#04145C]">
                {selectedItems.size} Selected
              </span>
              <button
                onClick={clearSelection}
                className="flex items-center justify-center bg-white border border-[#04145C] text-[#04145C] hover:bg-[#04145C] hover:text-white transition-colors rounded-md px-2 py-0.5 text-xs font-medium"
                title="Clear selection"
              >
                Clear
              </button>
              {process.env.NEXT_PUBLIC_HIDE_PUSH_TO_CRM !== "true" && (
                <button
                  onClick={handlePushToCrm}
                  disabled={pushingToCrm}
                  className="flex items-center justify-center bg-[#017737] text-white hover:bg-[#015c2b] disabled:opacity-60 transition-colors rounded-md px-2 py-0.5 text-xs font-medium"
                  title="Push selected leads to Pipedrive"
                >
                  {pushingToCrm ? "Pushing..." : "Push to CRM"}
                </button>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          {saveStatus === "error" && (
            <div className="text-sm text-red-600 bg-red-50 px-3 py-1 rounded-md">
              {hasSearchFilters
                ? "Failed to save search"
                : "No search filters to save"}
            </div>
          )}

          {/* <button
            className={saveButtonClass}
            onClick={handleSaveSearch}
            disabled={saveLoading || !hasSearchFilters}
            title={
              hasSearchFilters
                ? "Save current search filters"
                : "No search filters to save"
            }
          >
            {saveButtonContent}
          </button> */}

          {/* NEW: Bulk Save Button */}
            {loadedItemsCount > 0 && (
                <div className="flex items-center gap-2">
                  {(searchMode === "companies" || process.env.NEXT_PUBLIC_HIDE_BULK_SAVE !== 'true') && (
                    <button
                      onClick={() => handleOpenBulkSave("save")}
                      className="px-4 py-2 flex items-center gap-2 text-sm font-medium cursor-pointer rounded-xl transition-all duration-300 min-w-[120px] justify-center bg-[#00D2FF] text-[#04145C] hover:bg-[#00C4E6] shadow-sm hover:shadow-md"
                      title={searchMode === "people" ? "Bulk save these leads to a list" : "Bulk save these companies to a list (1 credit per company)"}
                    >
                      <Download className="w-4 h-4" />
                      Bulk Save
                    </button>
                  )}
                  {searchMode === "people" && (
                  <button
                    onClick={() => handleOpenBulkSave("reveal")}
                    className="px-4 py-2 flex items-center gap-2 text-sm font-medium cursor-pointer rounded-xl transition-all duration-300 min-w-[120px] justify-center bg-[#04145C] text-[#00D2FF] hover:bg-[#052074] shadow-sm hover:shadow-md"
                    title="Save and automatically reveal these leads"
                  >
                    <Eye className="w-4 h-4" />
                    Bulk Reveal
                  </button>
                  )}
                </div>
              )}

          <button
            className={saveButtonClass}
            onClick={handleSaveSearch}
            disabled={saveLoading || isSaving || !hasSearchFilters}
            title={
              hasSearchFilters
                ? "Save current search filters"
                : "No search filters to save"
            }
          >
            {saveButtonContent}
          </button>
        </div>
      </div>

      {/* Table Section */}
      <div className="overflow-x-auto flex-1">
            <table className="w-full text-sm">
              <thead className="border-b border-[#E5E6E6]">
                <tr>
                  <th className="py-3 px-4 w-10">
                    <input
                      type="checkbox"
                      className="rounded border-gray-300 text-[#04145C] focus:ring-[#04145C] cursor-pointer"
                      checked={isAllPageSelected}
                      onChange={handleSelectAllOnPage}
                    />
                  </th>
                  {tableHeaders.map((header) => (
                    <th
                      key={header.key}
                      className="text-left py-3 px-4 font-medium text-gray-700 cursor-pointer hover:bg-gray-100"
                      onClick={() => handleSort(header.key)}
                    >
                      <div className="flex items-center gap-1 text-[10px] text-[#6B7271] font-medium">
                        {header.label}
                        {getSortIcon(header.key)}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedData.map((item, index) => {
                  const itemId = getPublicId(item) || normalize(item.public_profile_url);
                  const isSelected = selectedItems.has(itemId);

                  if (searchMode === "companies") {
                    return (
                      <tr
                        key={`${item.id || index}`}
                        className={`border-b border-[#E5E6E6] hover:bg-gray-50 ${isSelected ? 'bg-blue-50' : ''}`}
                      >
                        <td className="py-3 px-4">
                          <input
                            type="checkbox"
                            className="rounded border-gray-300 text-[#04145C] focus:ring-[#04145C] cursor-pointer"
                            checked={isSelected}
                            onChange={() => handleSelectRow(item)}
                          />
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <CompanyLogo companyName={item.name} logo={item.logo} />
                            <div className="flex flex-col">
                              <a
                                href={item.domain ? (item.domain.startsWith("http") ? item.domain : `https://${item.domain}`) : "#"}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-medium text-[#222] text-sm hover:text-blue-600 hover:underline"
                              >
                                {truncateText(item.name, 40)}
                              </a>
                              {item.overview && (
                                <span className="text-[10px] text-gray-500 max-w-xs truncate block" title={item.overview}>
                                  {truncateText(item.overview, 60)}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-[#434343] text-xs">
                          {truncateText(Array.isArray(item.industry) ? item.industry[0] : item.industry)}
                        </td>
                        <td className="py-3 px-4 text-[#434343] text-xs">
                          {truncateText(formatLocation(item))}
                        </td>
                        <td className="py-3 px-4 text-[#434343] text-xs">
                          {item.headcount || ""}
                        </td>
                        <td className="py-3 px-4 text-[#434343] text-xs">
                          {item.revenue_min || item.revenue_max ? (
                            (() => {
                              const min = item.revenue_min;
                              const max = item.revenue_max;
                              // If string and not a simple number, display as is
                              if (typeof min === 'string' && isNaN(Number(min))) return min;
                              if (typeof max === 'string' && isNaN(Number(max))) return max;
                              
                              return min === max 
                                ? `$${formatNumber(min)}`
                                : `$${formatNumber(min)} - $${formatNumber(max)}`;
                            })()
                          ) : ""}
                        </td>
                        <td className="py-3 px-4 text-[#434343] text-xs">
                          {item.founded_at || ""}
                        </td>
                        <td className="py-3 px-4 text-[#434343] text-xs min-w-[160px]">
                          <button
                            aria-label="Add company to list"
                            onClick={() => openAddToListModal(item)}
                            className="btn-toggle-modern min-w-[140px]"
                          >
                            <span className="btn-toggle-label text-xs">Add to List</span>
                          </button>
                        </td>
                        <td className="py-3 px-4 text-[#434343] text-xs min-w-[160px]">
                          <button
                            aria-label="See employees"
                            onClick={() => onSeeEmployees && onSeeEmployees(item)}
                            className="btn-toggle-modern min-w-[140px]"
                          >
                            <span className="btn-toggle-label text-xs">See Employees</span>
                          </button>
                        </td>
                      </tr>
                    );
                  }

                  return (
                  <tr
                    key={`${item.public_profile_url}-${index}`} // Better key using unique identifier
                    className={`border-b border-[#E5E6E6] hover:bg-gray-50 ${isSelected ? 'bg-blue-50' : ''}`}
                  >
                    <td className="py-3 px-4">
                      <input
                        type="checkbox"
                        className="rounded border-gray-300 text-[#04145C] focus:ring-[#04145C] cursor-pointer"
                        checked={isSelected}
                        onChange={() => handleSelectRow(item)}
                      />
                    </td>
                    <td className="py-3 px-4">
                      <a
                        href={item.public_profile_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#434343] text-xs flex items-center gap-1 hover:text-blue-600 transition-colors"
                      >
                        <img
                          src="/icons/linkedin.svg"
                          alt="LinkedIn"
                          className="w-4 h-4"
                        />
                        {truncateText(item.name)}
                      </a>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <CompanyLogo
                          companyName={getBestPosition(item)?.company}
                          logo={getBestPosition(item)?.company_logo || item.company_logo || getBestPosition(item)?.logo || item.logo} // Check top-level company_logo fallback
                        />
                        <span className="text-[#434343] text-xs">
                          {truncateText(getBestPosition(item)?.company)}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-[#434343] text-xs">
                      {truncateText(getBestPosition(item)?.industry?.[0]) ||
                        ""}
                    </td>
                    <td className="py-3 px-4 text-[#434343] text-xs">
                      {truncateText(getBestPosition(item)?.role)}
                    </td>
                    <td className="py-3 px-4 text-[#434343] text-xs">
                      {truncateText(formatLocation(item))}
                    </td>
                    {/** Intentionally hidden when flag enabled: Phone column */}
                    {!hideContactColumns && (
                    <td className="py-3 px-4 text-[#434343] text-xs min-w-[160px]">
                      {(() => {
                        const u = normalize(item.public_profile_url);
                        const pid = getPublicId(item);
                        const keyUrl = `${u}-phone`;
                        const keyPid = pid ? `${pid}-phone` : null;
                        
                        const isRevealedPhone = (keyUrl && revealedServer[keyUrl]) || (keyPid && revealedServer[keyPid]);
                        // const isRevealedEmail = (emailKeyUrl && revealedServer[emailKeyUrl]) || (emailKeyPid && revealedServer[emailKeyPid]);
                        
                        // const hasDataPhone = (keyUrl && revealedData[keyUrl]) || (keyPid && revealedData[keyPid]);
                        // const hasDataEmail = (emailKeyUrl && revealedData[emailKeyUrl]) || (emailKeyPid && revealedData[emailKeyPid]);

                        // Determine if "Not Available" should be shown.
                        // It should be shown if:
                        // 1. We have data in revealedData and it says "Not available"
                        // OR
                        // 2. The server says it's revealed (isRevealedPhone/Email is true) AND we have fetched the data (hasDataPhone/Email is truthy) AND that data is "Not available"
                        // OR
                        // 3. The server says it's revealed, but when we tried to fetch values (in the useEffect), we got nothing back or "Not available" (this is handled by the useEffect setting revealedData to "Not available" in catch/empty cases ideally, but let's be robust)
                        
                        const value = revealedData[keyUrl] || (keyPid && revealedData[keyPid]) || item.phone || (item.contact__phone_numbers && item.contact__phone_numbers.length > 0 ? item.contact__phone_numbers[0].raw_number : null);
                        const serverRevealed = revealCtx.isRevealed(item.public_profile_url, "phone") || !!revealedServer[keyUrl] || (pid && (revealCtx.isRevealed(pid, "phone") || !!revealedServer[keyPid])) || !!value;
                        const awaitingPhone = !!(awaitingReveal[keyUrl] || (keyPid && awaitingReveal[keyPid]));
                        
                        // NEW FIX: If there is a phone sitting natively in the item.phone (from the search API cache)
                        // but it hasn't been explicitly requested to be shown via state, we shouldn't show it
                        // unless it was revealed. But wait, if it's already there in the raw object,
                        // maybe we just use it directly. Actually, the request states that we see the phone, 
                        // meaning `value` is somehow being populated. Let's trace `revealedData`.
                        
                        // If it is revealed (server says so) but we don't have a value yet, it might be loading.
                        // However, the useEffect above attempts to fetch values for revealed items. 
                        // If that fetch returns "Not available" or empty, it sets revealedData.
                        // So 'value' being "Not available" is the primary check.
                        
                        if (value || serverRevealed) {
                          const isNotAvailable = value === "Not available" || (value && String(value).toLowerCase().includes("not available"));
                          
                          // If we have a specific "Not available" value, show the gray box.
                          // OR if server says revealed, but we have a value that is empty string (meaning fetch returned nothing useful), treat as not available.
                          if (isNotAvailable || (serverRevealed && value === "")) {
                            if (awaitingPhone) {
                              return (
                                <div className="flex items-center gap-2 p-2 bg-amber-50 border border-amber-200 rounded-lg">
                                  <MoreComingBadge />
                                </div>
                              );
                            }
                            return (
                              <div className="flex items-center gap-2 p-2 bg-gray-50 border border-gray-200 rounded-lg">
                                <span className="text-xs font-medium text-gray-500 whitespace-normal min-w-[140px] max-w-[200px]">
                                  Not available
                                </span>
                              </div>
                            );
                          }
                          
                          // If server says revealed but we have NO value in revealedData yet (undefined/null), 
                          // it likely means the fetch is still in progress (loading state) OR the fetch failed silently.
                          // In the loading case, we might want to show a spinner or "Loading...". 
                          // But if the useEffect has run and failed to produce a value, we should probably show "Not available" 
                          // instead of the reveal button (which would charge them again or fail).
                          // However, sticking to the user request: "not having an email or phone because it wasnt revealed yet then we see a reveal button".
                          // If serverRevealed is true, it IS revealed. We shouldn't show the reveal button.
                          // If we don't have data, we should probably wait or show "Not available".
                          
                          if (!value) {
                             const isLoading = revealLoading[keyUrl] || (keyPid && revealLoading[keyPid]);
                             if (isLoading) {
                                return (
                                  <div className="flex items-center gap-2 p-2">
                                    <div className="animate-spin w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full"></div>
                                    <span className="text-xs text-gray-500">Loading...</span>
                                  </div>
                                );
                             }
                             if (awaitingPhone) {
                               return (
                                 <div className="flex items-center gap-2 p-2 bg-amber-50 border border-amber-200 rounded-lg">
                                   <MoreComingBadge />
                                 </div>
                               );
                             }
                             return (
                              <div className="flex items-center gap-2 p-2 bg-gray-50 border border-gray-200 rounded-lg">
                                <span className="text-xs font-medium text-gray-500 whitespace-normal min-w-[140px] max-w-[200px]">
                                  Not available
                                </span>
                              </div>
                            );
                          }

                          return (
                            <div className="flex flex-col gap-2">
                                  {(() => {
                                    const parts = value.split(",").map(s => s.trim()).filter(Boolean);
                                    const uniqueMap = new Map();
                                    parts.forEach(part => {
                                      const m = part.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
                                      const num = m ? m[1].trim() : part;
                                      const hasType = !!m;
                                      if (!uniqueMap.has(num) || (hasType && !uniqueMap.get(num).hasType)) {
                                        uniqueMap.set(num, { full: part, hasType });
                                      }
                                    });
                                    return Array.from(uniqueMap.values()).map(v => v.full).map((p, i) => (
                                      <div key={i} className="flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded-lg">
                                        <span className="text-xs font-medium text-green-800 whitespace-normal min-w-[140px] max-w-[200px]">
                                          {p}
                                        </span>
                                        <span className="text-xs text-green-600 bg-green-100 px-1 rounded ml-auto">✓</span>
                                      </div>
                                    ));
                                  })()}
                                  {awaitingPhone ? <MoreComingBadge /> : null}
                            </div>
                          );
                        }

                        if (awaitingPhone) {
                          return (
                            <div className="flex items-center gap-2 p-2 bg-amber-50 border border-amber-200 rounded-lg">
                              <MoreComingBadge />
                            </div>
                          );
                        }
                        
                        const loading = revealLoading[keyUrl] || (keyPid && revealLoading[keyPid]);
                        const cost = 20;
                        const availableCredits = typeof credits === "number" ? credits : 0;
                        const hasEnoughCredits = availableCredits >= cost;

                        return (
                          <button
                            onClick={() => {
                              if (!hasEnoughCredits) {
                                Swal.fire({
                                  imageUrl: "/icons/mawsool-error.webp",
                                  imageAlt: "Custom alert icon",
                                  title: "Insufficient Credits",
                                  text: "You don't have enough credits to reveal this contact. Please upgrade your plan or purchase more credits.",
                                  showCancelButton: true,
                                  confirmButtonText: "Get Credits",
                                  cancelButtonText: "Cancel",
                                  customClass: { confirmButton: "swal-confirm-button", cancelButton: "swal-cancel-button" },
                                }).then((result) => {
                                  if (result.isConfirmed) {
                                    window.location.href = "/setting/planOverview";
                                  }
                                });
                                return;
                              }
                              handleReveal(item, "phone");
                            }}
                            disabled={loading || !item.public_profile_url || !isAuthenticated || serverRevealed}
                            className="btn-toggle-modern min-w-[140px]"
                          >
                            {loading ? (
                              <RevealLoadingSequence />
                            ) : !isAuthenticated ? (
                              <span>Login to Reveal</span>
                            ) : !item.public_profile_url ? (
                              <span>No LinkedIn URL</span>
                            ) : (
                              <span className="btn-toggle-label text-xs">Reveal Phone</span>
                            )}
                          </button>
                        );
                      })()}
                    </td>
                    )}
                    {/** Intentionally hidden when flag enabled: Email column */}
                    {!hideContactColumns && (
                    <td className="py-3 px-4 text-[#434343] text-xs min-w-[160px]">
                      {(() => {
                        const u = normalize(item.public_profile_url);
                        const pid = getPublicId(item);
                        const keyUrl = `${u}-email`;
                        const keyPid = pid ? `${pid}-email` : null;

                        const isRevealedEmail = (keyUrl && revealedServer[keyUrl]) || (keyPid && revealedServer[keyPid]);
                        
                        // const hasDataPhone = (phoneKeyUrl && revealedData[phoneKeyUrl]) || (phoneKeyPid && revealedData[phoneKeyPid]);
                        // const hasDataEmail = (emailKeyUrl && revealedData[emailKeyUrl]) || (emailKeyPid && revealedData[emailKeyPid]);

                        const value = revealedData[keyUrl] || (keyPid && revealedData[keyPid]) || item.email || (item.contact__all_emails && item.contact__all_emails.length > 0 ? item.contact__all_emails.map(e => e.email).join(', ') : null);
                        const serverRevealedEmail = revealCtx.isRevealed(item.public_profile_url, "email") || !!revealedServer[keyUrl] || (pid && (revealCtx.isRevealed(pid, "email") || !!revealedServer[keyPid])) || !!value;
                        const awaitingEmail = !!(awaitingReveal[keyUrl] || (keyPid && awaitingReveal[keyPid]));
                        
                        if (value || serverRevealedEmail) {
                          const isNotAvailable = value === "Not available" || (value && String(value).toLowerCase().includes("not available"));
                          if (isNotAvailable || (serverRevealedEmail && value === "")) {
                            if (awaitingEmail) {
                              return (
                                <div className="flex items-center gap-2 p-2 bg-amber-50 border border-amber-200 rounded-lg">
                                  <MoreComingBadge />
                                </div>
                              );
                            }
                            return (
                              <div className="flex items-center gap-2 p-2 bg-gray-50 border border-gray-200 rounded-lg">
                                <span className="text-xs font-medium text-gray-500 whitespace-normal min-w-[140px] max-w-[200px]">
                                  Not available
                                </span>
                              </div>
                            );
                          }
                          
                          if (!value) {
                             const isLoading = revealLoading[keyUrl] || (keyPid && revealLoading[keyPid]);
                             if (isLoading) {
                                return (
                                  <div className="flex items-center gap-2 p-2">
                                    <div className="animate-spin w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full"></div>
                                    <span className="text-xs text-gray-500">Loading...</span>
                                  </div>
                                );
                             }
                             if (awaitingEmail) {
                               return (
                                 <div className="flex items-center gap-2 p-2 bg-amber-50 border border-amber-200 rounded-lg">
                                   <MoreComingBadge />
                                 </div>
                               );
                             }
                             return (
                              <div className="flex items-center gap-2 p-2 bg-gray-50 border border-gray-200 rounded-lg">
                                <span className="text-xs font-medium text-gray-500 whitespace-normal min-w-[140px] max-w-[200px]">
                                  Not available
                                </span>
                              </div>
                            );
                          }

                          return (
                            <div className="flex flex-col gap-2">
                              {Array.isArray(revealedEmailMeta[keyUrl] || (keyPid && revealedEmailMeta[keyPid])) && (revealedEmailMeta[keyUrl] || (keyPid && revealedEmailMeta[keyPid])).length > 0 ? (
                                (() => {
                                  const metas = revealedEmailMeta[keyUrl] || (keyPid && revealedEmailMeta[keyPid]);
                                  // Deduplicate by email locally just in case, and enforce splitting one last time for safety
                                  const uniqueMap = new Map();
                                  metas.forEach(em => {
                                    if (em && em.email) {
                                      const splitEms = String(em.email).split(',').map(s => s.trim()).filter(Boolean);
                                      splitEms.forEach(splitEm => {
                                        uniqueMap.set(splitEm.toLowerCase(), { ...em, email: splitEm });
                                      });
                                    }
                                  });
                                  return Array.from(uniqueMap.values()).map((em, i) => {
                                    const st = String(em.verificationStatus || em.status || "").toLowerCase();
                                    let bgColor = 'bg-gray-50';
                                    let borderColor = 'border-gray-200';
                                    let textColor = 'text-gray-800';
                                    let badgeBg = 'bg-gray-100/50';
                                    let badgeText = 'text-gray-600';
                                    
                                    if (st.includes('verified') || st === 'valid' || st === 'deliverable') {
                                      bgColor = 'bg-green-50';
                                      borderColor = 'border-green-200';
                                      textColor = 'text-green-800';
                                      badgeBg = 'bg-green-100/50';
                                      badgeText = 'text-green-600';
                                    } else if (st.includes('risky') || st.includes('catch-all') || st === 'catch all' || st.includes('valid b+')) {
                                      bgColor = 'bg-yellow-50';
                                      borderColor = 'border-yellow-200';
                                      textColor = 'text-yellow-800';
                                      badgeBg = 'bg-yellow-100/50';
                                      badgeText = 'text-yellow-600';
                                    } else if (st.includes('invalid') || st.includes('bounced') || st.includes('undeliverable')) {
                                      bgColor = 'bg-red-50';
                                      borderColor = 'border-red-200';
                                      textColor = 'text-red-800';
                                      badgeBg = 'bg-red-100/50';
                                      badgeText = 'text-red-600';
                                    }

                                    return (
                                    <div key={i} className={`flex items-center gap-2 p-2 ${bgColor} border ${borderColor} rounded-lg`}>
                                      <div className="flex flex-col gap-0.5 min-w-[140px] max-w-[240px]">
                                        <span className={`text-xs font-medium ${textColor} whitespace-normal`}>
                                          {em.email}
                                        </span>
                                        {st && (
                                          <span className={`text-[10px] ${badgeText} ${badgeBg} rounded-md px-1.5 py-0.5 w-fit capitalize`}>
                                            {em.verificationStatus || em.status}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  )});
                                })()
                              ) : (value && value.trim() && !Array.isArray(revealedEmailMeta[keyUrl] || (keyPid && revealedEmailMeta[keyPid]))) ? (
                                (() => {
                                    const emails = Array.from(new Set((value || '').split(',').map(s => s.trim()).filter(Boolean)));
                                    // Prevent rendering if we already rendered the meta objects above (this prevents the duplicate comma-separated block)
                                    if (revealedEmailMeta[keyUrl] || (keyPid && revealedEmailMeta[keyPid])) return null;
                                    return emails.map((em, i) => (
                                      <div key={i} className="flex items-center gap-2 p-2 bg-gray-50 border border-gray-200 rounded-lg">
                                        <div className="flex flex-col gap-0.5 min-w-[140px] max-w-[240px]">
                                          <span className="text-xs font-medium text-gray-800 whitespace-normal">
                                            {em}
                                          </span>
                                        </div>
                                      </div>
                                    ));
                                  })()
                              ) : (
                                <div className="flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded-lg">
                                  <span className="text-xs font-medium text-green-800 whitespace-normal min-w-[140px] max-w-[200px]">
                                    Revealed.
                                  </span>
                                  <span className="text-xs text-green-600 bg-green-100 px-1 rounded ml-auto">✓</span>
                                </div>
                              )}
                              {awaitingEmail ? <MoreComingBadge /> : null}
                            </div>
                          );
                        }

                        if (awaitingEmail) {
                          return (
                            <div className="flex items-center gap-2 p-2 bg-amber-50 border border-amber-200 rounded-lg">
                              <MoreComingBadge />
                            </div>
                          );
                        }
                        
                        const loading = revealLoading[keyUrl] || (keyPid && revealLoading[keyPid]);
                        const cost = 5;
                        const availableCredits = typeof credits === "number" ? credits : 0;
                        const hasEnoughCredits = availableCredits >= cost;

                        return (
                          <button
                            onClick={() => {
                              if (!hasEnoughCredits) {
                                Swal.fire({
                                  imageUrl: "/icons/mawsool-error.webp",
                                  imageAlt: "Custom alert icon",
                                  title: "Insufficient Credits",
                                  text: "You don't have enough credits to reveal this contact. Please upgrade your plan or purchase more credits.",
                                  showCancelButton: true,
                                  confirmButtonText: "Get Credits",
                                  cancelButtonText: "Cancel",
                                  customClass: { confirmButton: "swal-confirm-button", cancelButton: "swal-cancel-button" },
                                }).then((result) => {
                                  if (result.isConfirmed) {
                                    window.location.href = "/setting/planOverview";
                                  }
                                });
                                return;
                              }
                              handleReveal(item, "email");
                            }}
                            disabled={loading || !item.public_profile_url || !isAuthenticated || serverRevealedEmail}
                            className="btn-toggle-modern min-w-[140px]"
                          >
                            {loading ? (
                              <RevealLoadingSequence />
                            ) : !isAuthenticated ? (
                              <span>Login to Reveal</span>
                            ) : !item.public_profile_url ? (
                              <span>No LinkedIn URL</span>
                            ) : (
                              <span className="btn-toggle-label text-xs">Reveal Email</span>
                            )}
                          </button>
                        );
                      })()}
                    </td>
                    )}
                    <td className="py-3 px-4 text-[#434343] text-xs min-w-[160px]">
                      <button
                        aria-label="Add lead to list"
                        onClick={() => openAddToListModal(item)}
                        className="btn-toggle-modern min-w-[140px]"
                      >
                        <span className="btn-toggle-label text-xs">Add to List</span>
                      </button>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
      </div>

      {/* Pagination Section */}
      <PaginationControls
        currentPage={currentPage}
        totalItems={data?.paging?.total_count || 0}
        formattedTotal={(() => {
          const rawTotal = data?.total;
          if (!rawTotal) return null;
          const clean = String(rawTotal).replace(/^~/, '');
          if (/[KMB]$/i.test(clean)) return clean;
          const asNum = parseInt(clean, 10);
          if (Number.isFinite(asNum) && String(asNum) === clean && asNum >= 1000) {
            return formatNumber(asNum);
          }
          return clean;
        })()}
        itemsPerPage={itemsPerPage}
        onPageSizeChange={handlePageSizeChange}
        onPageChange={handlePageChange}
        cursor={cursor}
        searchFilter={searchFilter}
        savedFilterId={savedFilterId}
        setLoading={setLoading}
        setLoadingProgress={setLoadingProgress}
        setSearched={setSearched}
        setTableData={setTableData}
        setCursor={setCursor}
        loadedItemsCount={loadedItemsCount}
        isClientPagination={isClientPagination}
        searchMode={searchMode}
      />
      {listModalOpen && (
        <Modal heading="" isOpen={listModalOpen} onClose={() => setListModalOpen(false)}>
          <div className="w-full max-w-[640px]">
            <h2 className="text-base font-medium text-[#222] mb-3">Add to List</h2>
            <div className="flex flex-col gap-3 mb-4">
              <p className="text-sm font-medium text-[#222]">Choose an existing list</p>
              {listsLoading ? (
                <p className="text-xs text-[#717171]">Loading lists…</p>
              ) : (
                <select
                  className="w-full border border-gray-300 rounded-lg px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  value={selectedListId || ""}
                  onChange={(e)=> setSelectedListId(e.target.value || "")}
                  aria-label="Select list"
                >
                  <option value="">Select a list</option>
                  <option value="__CREATE__">Create New List…</option>
                  {lists.filter(l => (l.listType || 'people') === (searchMode || 'people')).map((l)=> (
                    <option key={l._id} value={l._id}>{l.name} (Items: {l.itemsCount ?? 0})</option>
                  ))}
                </select>
              )}
              {selectedListId === "__CREATE__" && (
                <div className="flex items-center gap-2 mt-2">
                  <input
                    type="text"
                    placeholder="Name your list"
                    maxLength={50}
                    value={newListName}
                    onChange={(e)=> setNewListName(e.target.value)}
                    className="flex-1 border border-[#E5E6E6] rounded-lg px-3 py-2 text-sm"
                    aria-label="New list name"
                  />
                  <span className="text-xs text-[#717171]">{(newListName || "").length}/50</span>
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-2">
              <button className="group cursor-pointer leading-[24px] gap-2.5 flex items-center justify-center rounded-full bg-button px-2.5 py-2 font-normal text-white text-[14px] !rounded-xl bg-[#E9E9E9] text-[#242E2C]" onClick={()=> setListModalOpen(false)}>Cancel</button>
              <button
                className={`group cursor-pointer leading-[24px] gap-2.5 flex items-center justify-center rounded-full bg-button px-2.5 py-2 font-normal text-white text-[14px] !rounded-xl ${addingToList ? 'opacity-50 cursor-not-allowed' : ''}`}
                onClick={handleConfirmAddSingle}
                disabled={addingToList || (selectedListId === "__CREATE__" ? !(newListName && newListName.trim()) : !selectedListId)}
              >
                {creatingList || addingToList ? "Processing…" : "Confirm"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* NEW: Bulk Save Modal */}
      {bulkSaveModalOpen && (
        <Modal heading="" isOpen={bulkSaveModalOpen} onClose={() => setBulkSaveModalOpen(false)}>
          <div className="w-full max-w-[640px]">
            <h2 className="text-base font-medium text-[#222] mb-3">
                {bulkActionType === "reveal" ? "Bulk Reveal Leads" : (searchMode === "people" ? "Bulk Save Leads to List" : "Bulk Save Companies to List")}
              </h2>
            <p className="text-sm text-gray-500 mb-4">
              This will run in the background. You can safely close this page after starting the process.
            </p>
            <div className="flex flex-col gap-3 mb-4">
              <p className="text-sm font-medium text-[#222]">Choose an existing list</p>
              {listsLoading ? (
                <p className="text-xs text-[#717171]">Loading lists…</p>
              ) : (
                <select
                  className={`w-full border rounded-lg px-3 py-3 text-sm focus:outline-none focus:ring-2 bg-white ${
                    !selectedListId && bulkSaveModalSubmitted
                      ? "border-red-500 ring-2 ring-red-200 shadow-[0_0_10px_rgba(239,68,68,0.5)]"
                      : "border-gray-300 focus:ring-blue-500"
                  }`}
                  value={selectedListId || ""}
                  onChange={(e) => {
                    setSelectedListId(e.target.value || "");
                    if (bulkSaveModalSubmitted) setBulkSaveModalSubmitted(false);
                  }}
                  aria-label="Select list"
                >
                  <option value="">Select a list</option>
                  <option value="__CREATE__">Create New List…</option>
                  {lists.filter(l => (l.listType || 'people') === (searchMode || 'people')).map((l)=> (
                    <option key={l._id} value={l._id}>{l.name} (Items: {l.itemsCount ?? 0})</option>
                  ))}
                </select>
              )}
              {!selectedListId && bulkSaveModalSubmitted && (
                <span className="text-xs text-red-500 font-medium mt-1">Please select a list to continue.</span>
              )}
              {selectedListId === "__CREATE__" && (
                <div className="flex items-center gap-2 mt-2">
                  <input
                    type="text"
                    placeholder="Name your list"
                    maxLength={50}
                    value={newListName}
                    onChange={(e)=> setNewListName(e.target.value)}
                    className="flex-1 border border-[#E5E6E6] rounded-lg px-3 py-2 text-sm"
                    aria-label="New list name"
                  />
                  <span className="text-xs text-[#717171]">{(newListName || "").length}/50</span>
                </div>
              )}
            </div>

            {bulkActionType === "reveal" && searchMode === "people" && (
              <div className="flex flex-col gap-3 mb-6">
                <label className="text-sm font-medium text-[#222]">Data to Reveal</label>
                <select
                  value={bulkSaveReveal}
                  onChange={(e) => {
                    const newType = e.target.value;
                    setBulkSaveReveal(newType);
                    
                    if (selectedItems.size > 0) {
                      // If items are manually selected, ALWAYS keep the count locked to the selection size
                      setBulkSaveCount(selectedItems.size);
                    } else {
                      // Otherwise, recalculate based on available credits
                      const availableCredits = typeof credits === "number" ? credits : 0;
                      let costPerLead = 5;
                      if (newType === "phone") costPerLead = 20;
                      else if (newType === "both") costPerLead = 25;
                      const maxAffordable = Math.floor(availableCredits / costPerLead);
                      const totalAvailable = data?.paging?.total_count === -1 ? 10000 : (data?.paging?.total_count || 0);
                      const recommended = Math.min(totalAvailable, maxAffordable);
                      setBulkSaveCount(recommended > 0 ? recommended : "");
                    }
                  }}
                  className="w-full border border-gray-300 rounded-lg px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="email">Reveal Emails Only (5 credits/lead)</option>
                  <option value="phone">Reveal Phones Only (20 credits/lead)</option>
                  <option value="both">Reveal Both (25 credits/lead)</option>
                </select>
                <span className="text-xs text-gray-500">Credits will only be deducted if valid data is found. Leads that already have data will be skipped.</span>
              </div>
            )}

            <div className="flex flex-col gap-3 mb-6">
                <label className="text-sm font-medium text-[#222]">{searchMode === "companies" ? "How many companies do you want to save?" : "How many leads do you want to save?"}</label>
                <input
                  type="number"
                  min={1}
                  value={bulkSaveCount}
                  onChange={(e) => setBulkSaveCount(e.target.value)}
                  disabled={selectedItems.size > 0}
                  className={`w-full border border-gray-300 rounded-lg px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${selectedItems.size > 0 ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'bg-white'}`}
                  placeholder={searchMode === "companies" ? "Enter a number" : "Leave empty to save all"}
                />
                {selectedItems.size > 0 ? (
                  <span className="text-xs text-blue-600 font-medium">Locked to your exact {selectedItems.size} selected {searchMode === "companies" ? "companies" : "leads"}.</span>
                ) : bulkActionType === "reveal" ? (
                  <span className="text-xs text-gray-500">
                    {(() => {
                      const availableCredits = typeof credits === "number" ? credits : 0;
                      let costPerLead = 5;
                      if (bulkSaveReveal === "phone") costPerLead = 20;
                      else if (bulkSaveReveal === "both") costPerLead = 25;
                      const maxAffordable = Math.floor(availableCredits / costPerLead);
                      return `You can reveal up to ${maxAffordable} leads based on your available credit.`;
                    })()}
                  </span>
                ) : searchMode === "companies" ? (
                  <span className="text-xs text-blue-600 font-medium">1 credit will be consumed for each company saved.</span>
                ) : (
                  <span className="text-xs text-gray-500">Leave empty to save all available leads.</span>
                )}
              </div>

            {selectedItems.size === 0 && searchMode !== "companies" && (
                <div className="flex flex-col gap-3 mb-6">
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 text-sm font-medium text-[#222] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={enableMaxPerCompany}
                        onChange={(e) => setEnableMaxPerCompany(e.target.checked)}
                        className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                      />
                      Maximum people per company
                    </label>
                    {enableMaxPerCompany && (
                      <input
                        min="1"
                        type="number"
                        value={maxPerCompany}
                        onChange={(e) => setMaxPerCompany(e.target.value)}
                        placeholder="1"
                        className="w-20 border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      />
                    )}
                  </div>
                  <span className="text-xs text-gray-500">
                    We will automatically skip extra leads from the same company to ensure variety.
                  </span>
                </div>
              )}

            <div className="flex items-center justify-end gap-2">
              <button 
                className="group cursor-pointer leading-[24px] gap-2.5 flex items-center justify-center rounded-full bg-button px-2.5 py-2 font-normal text-white text-[14px] !rounded-xl bg-[#E9E9E9] text-[#242E2C]" 
                onClick={() => setBulkSaveModalOpen(false)}
              >
                Cancel
              </button>
              <button
                className={`group cursor-pointer leading-[24px] gap-2.5 flex items-center justify-center rounded-full bg-button px-4 py-2 font-medium text-white text-[14px] !rounded-xl bg-[#00D2FF] text-[#04145C] hover:bg-[#00C4E6] ${bulkSaving ? 'opacity-50 cursor-not-allowed' : ''}`}
                onClick={() => {
                    if (!selectedListId) {
                      setBulkSaveModalSubmitted(true);
                      return;
                    }
                    handleConfirmBulkSave();
                  }}
                  disabled={bulkSaving || (selectedListId === "__CREATE__" ? !(newListName && newListName.trim()) : false) || (bulkSaveCount !== "" && bulkSaveCount !== null && Number(bulkSaveCount) < 1) || (searchMode === "companies" && (bulkSaveCount === "" || bulkSaveCount === null))}
                >
                  {bulkSaving ? "Starting..." : (bulkActionType === "reveal" ? "Start Reveal" : "Start Bulk Save")}
                </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default Table;
  const getCost = (contactType) => (contactType === "phone" ? 20 : 5);

