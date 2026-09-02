'use client';

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import DashboardContainer from "@/components/dashboardLayoutContainer";
import { Download, Phone, Eye, Linkedin, Globe, Facebook, Twitter, Link, FileSpreadsheet, FileText } from "lucide-react";
import axios from "axios";
import Swal from "sweetalert2";
import { buildOrgCsv, orgHeaders, prepareOrgData, companiesHeaders, prepareCompaniesData } from "@/utils/exportOrgCsv";
import { buildAiQueryCsv } from "@/utils/exportAiQueryCsv";
import { useReveal } from "@/contexts/RevealContext";
import { normalizeToListRaw } from "@/utils/normalizeListRaw";
import { extractContactReveal, hasExtractedContacts } from "@/utils/extractContactReveal";
import { isLikelyCorporatePhoneNumber, isLikelyMobilePhoneNumber, normalizePhoneKey } from "@/utils/phoneType";
import * as XLSX from "xlsx";

const isAiPeopleListKind = (kind) => {
  const k = String(kind || "").toLowerCase();
  return k === "ai_query" || k === "ai_mode";
};

const numberInCorporateColumn = (item, value) => {
  const key = normalizePhoneKey(value);
  if (!key) return false;
  const raw = item?.raw || {};
  const orig = raw.__original || {};
  const chunks = [raw.corporate_phone, orig["Corporate Phone"], orig["corporate_phone"]];
  Object.keys(orig).forEach((k) => {
    if (/\b(corporate|office|hq|landline)\b/i.test(k)) chunks.push(orig[k]);
  });
  return chunks.some((v) =>
    String(v || "")
      .split(",")
      .some((p) => normalizePhoneKey(p) === key)
  );
};

const config = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000",
};

const extractEmailsDeep = (obj) => {
  const emails = new Set();
  const re = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
  const visit = (v) => {
    if (!v) return;
    if (typeof v === "string") {
      const m = v.match(re);
      if (m) emails.add(m[0]);
    } else if (Array.isArray(v)) {
      v.forEach(visit);
    } else if (typeof v === "object") {
      Object.values(v).forEach(visit);
    }
  };
  visit(obj);
  return Array.from(emails);
};

const emailStatusTone = (status) => {
  const s = String(status || "").toLowerCase().trim();
  const isUnverified = s.includes("unverified") || s === "unknown" || s === "n/a";
  if (!isUnverified && (s.includes("verified") || s === "valid" || s === "deliverable")) return "green";
  if (s.includes("risky") || s.includes("catch-all") || s === "catch all" || s.includes("valid b+")) return "yellow";
  if (isUnverified || s.includes("invalid") || s.includes("bounced") || s.includes("undeliverable")) return "red";
  return "gray";
};

const emailStatusBoxClass = {
  green: "border-green-200 bg-green-50",
  yellow: "border-yellow-200 bg-yellow-50",
  red: "border-red-200 bg-red-50",
  gray: "border-gray-200 bg-gray-50",
};

const emailStatusBarClass = {
  green: "bg-green-500",
  yellow: "bg-yellow-500",
  red: "bg-red-500",
  gray: "bg-gray-400",
};

const emailStatusBadgeClass = {
  green: "border-green-200 text-green-800 bg-green-100",
  yellow: "border-yellow-200 text-yellow-800 bg-yellow-100",
  red: "border-red-200 text-red-800 bg-red-100",
  gray: "border-gray-200 text-gray-700 bg-gray-100",
};

// Preferred column order
const preferredColumnOrder = [
  "First Name",
  "Last Name",
  "Title",
  "Company",
  "Email",
  "Email Status",
  "Phone",
  "Second Phone",
  "Industry",
  "Departments",
  "# Employees"
];

// Columns to hide
const hiddenColumns = ["Name"];

const MoreComingBadge = () => (
  <span
    className="inline-flex items-center gap-1 shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-medium text-amber-800 bg-amber-100 border border-amber-200"
    title="More contact details are still arriving from enrichment"
  >
    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
    More coming
  </span>
);

const isLeadAwaitingMore = (item) => item?.raw?.awaiting_webhook === true;

// Reveal Button Component (for Phone and Email)
const RevealButton = ({
  item,
  contactType,
  onReveal,
  isLoading,
  isRevealed,
  credits,
  revealedData,
  isAuthenticated,
}) => {
  const cost = contactType === "email" ? 5 : 20;
  const label = contactType === "email" ? "Email" : "Phone";
  const icon = <Phone className="text-[#434343]" size={14} />; // You might want a generic icon or specific one for email

  const hasEnoughCredits = credits !== null && credits >= cost;

  const profileUrl = item.raw.linkedin_url || item.raw.public_profile_url;

  const handleClick = async () => {
    if (!isAuthenticated) {
      return;
    }
    await onReveal(item._id, contactType, profileUrl);
  };

  const isRealEmailValue = (v) => {
    const s = String(v || "").trim().toLowerCase();
    return s && s !== "not available" && s !== "n/a" && s.includes("@");
  };
  const isRealPhoneValue = (v) => {
    const s = String(v || "").trim().toLowerCase();
    if (!s || s === "not available" || s === "n/a" || s.length <= 5) return false;
    if (isLikelyCorporatePhoneNumber(v)) return false;
    return true;
  };
  const realEmails = [
    revealedData,
    item.email,
    item.raw?.email,
    ...((Array.isArray(item.raw?.contact__all_emails) ? item.raw.contact__all_emails : []).map((e) => e?.email || e?.sanitized_email)),
    ...((Array.isArray(item.raw?.contact__emails) ? item.raw.contact__emails : []).map((e) => e?.email || e?.sanitized_email)),
  ].filter(isRealEmailValue);
  const realPhones = [
    revealedData,
    item.phone,
    item.raw?.phone,
    ...((Array.isArray(item.raw?.contact__phone_numbers) ? item.raw.contact__phone_numbers : []).map((p) => p?.sanitized_number || p?.raw_number || p?.number)),
  ].filter(isRealPhoneValue);

  const isEmailNA = contactType === "email" && realEmails.length === 0 && (
    String(revealedData).toLowerCase() === "not available" ||
    String(item.email).toLowerCase() === "not available" || 
    String(item.raw?.email).toLowerCase() === "not available" ||
    (Array.isArray(item.raw?.contact__all_emails) && item.raw.contact__all_emails.length > 0 && item.raw.contact__all_emails.every(e => String(e.email || e.sanitized_email).toLowerCase() === "not available"))
  );

  const isPhoneNA = contactType === "phone" && realPhones.length === 0 && (
    String(revealedData).toLowerCase() === "not available" ||
    String(item.phone).toLowerCase() === "not available" || 
    String(item.raw?.phone).toLowerCase() === "not available" ||
    (Array.isArray(item.raw?.contact__phone_numbers) && item.raw.contact__phone_numbers.length > 0 && item.raw.contact__phone_numbers.every(p => String(p.sanitized_number || p.raw_number).toLowerCase() === "not available"))
  );

  if (isEmailNA || isPhoneNA) {
    if (isLeadAwaitingMore(item)) {
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

  const hasStoredPersonalMobile = (contactType === "phone") && (
    isRealPhoneValue(item.mappedData?.phone) ||
    isRealPhoneValue(item.mappedData?.mobile_phone) ||
    isRealPhoneValue(item.mappedData?.second_phone) ||
    (Array.isArray(item.raw?.contact__phone_numbers) && item.raw.contact__phone_numbers.some((p) => isRealPhoneValue(p?.sanitized_number || p?.raw_number || p?.number) && !isLikelyCorporatePhoneNumber(`${p?.sanitized_number || p?.raw_number || ""} (${p?.type || ""})`)))
  );

  if (!isLoading && (isRevealed || hasStoredPersonalMobile || (contactType === "email" && (item.raw?.email || item.email || item.mappedData?.email)))) {
    if (contactType === "phone") {
        const contactInfo = revealedData && isRealPhoneValue(revealedData)
          ? revealedData
          : (realPhones.join(',') || item.mappedData?.phone || item.mappedData?.mobile_phone || item.mappedData?.second_phone || item.phone || item.raw?.phone || "");
        if (contactInfo && isRealPhoneValue(contactInfo)) {
        const phoneNumbers = contactInfo.split(',').map((number, index) => {
        const [num, type] = number.trim().split(' (');
        const typePart = type ? ` (${type.replace(')', '')})` : '';
        return (
            <span key={index}>
            {num}
            {typePart && (
                <span className="text-xs " style={{ fontSize: '10px' }}>
                {typePart}
                </span>
            )}
            {index < contactInfo.split(',').length - 1 && <br />}
            </span>
        );
        });
        return (
        <div className="flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded-lg ">
            <span className="text-xs font-medium text-green-800 whitespace-normal min-w-[140px] max-w-[200px]" title="Phone">
            {phoneNumbers}
            </span>
            {isLeadAwaitingMore(item) ? <MoreComingBadge /> : (isRevealed && <span className="text-xs text-green-600 bg-green-100 px-1 rounded ml-auto">✓</span>)}
        </div>
        );
        }
    } else {
        const contactInfo = revealedData && isRealEmailValue(revealedData)
          ? revealedData
          : (realEmails.join(', ') || item.raw?.email || item.email || "");
        if (!contactInfo) return null;
         return (
            <div className="flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded-lg ">
                <span className="text-xs font-medium text-green-800 whitespace-normal min-w-[140px] max-w-[200px]" title="Email">
                {contactInfo.split(',').map((email, i) => (
                     <span key={i} className="block">{email.trim()}</span>
                ))}
                </span>
                {isLeadAwaitingMore(item) ? <MoreComingBadge /> : (isRevealed && <span className="text-xs text-green-600 bg-green-100 px-1 rounded ml-auto">✓</span>)}
            </div>
        );
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={isLoading || !hasEnoughCredits || !isAuthenticated || !profileUrl}
      className={`px-3 py-2 border rounded-lg text-xs transition-colors flex items-center gap-2 min-w-[120px] justify-center ${
        isLoading
          ? "border-gray-300 text-gray-400 cursor-not-allowed bg-gray-50"
          : !isAuthenticated
          ? "border-gray-300 text-gray-500 cursor-not-allowed bg-gray-50"
          : !hasEnoughCredits
          ? "border-red-300 text-red-600 cursor-not-allowed bg-red-50"
          : !profileUrl
          ? "border-gray-300 text-gray-500 cursor-not-allowed bg-gray-50"
          : "border-[#434343] cursor-pointer text-blue-600 hover:bg-blue-50"
      }`}
    >
      {isLoading ? (
        <>
          <div className="animate-spin w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full"></div>
          <span>Revealing...</span>
        </>
      ) : !isAuthenticated ? (
        <span>Login to Reveal</span>
      ) : !hasEnoughCredits ? (
        <>
          <span className="text-red-600">💳</span>
          <span>Need {cost}</span>
        </>
      ) : !profileUrl ? (
        <span>Not available</span>
      ) : (
        <>
          {contactType === "phone" ? icon : null}
          <span className="text-[#434343]">Reveal {label}</span>
        </>
      )}
    </button>
  );
};

// Truncated Text with Modal Component
const TruncatedTextWithModal = ({ text, title }) => {
  if (!text) return null;
  const str = String(text);
  const shouldTruncate = str.length > 30;
  const truncated = shouldTruncate ? str.substring(0, 30) + "..." : str;

  const handleShow = () => {
    Swal.fire({
      title: title,
      text: str,
      confirmButtonText: "Close",
      width: '600px',
      customClass: {
        htmlContainer: 'text-left max-h-[60vh] overflow-y-auto break-words'
      }
    });
  };

  return (
    <div className="flex items-center gap-2 min-w-[150px]">
      <span className="truncate block max-w-[120px]" title={str}>{truncated}</span>
      {shouldTruncate && (
        <button 
          onClick={(e) => { e.stopPropagation(); handleShow(); }} 
          className="text-gray-500 hover:text-blue-600 p-1 rounded-full hover:bg-gray-100 transition-colors shrink-0"
          title="View full content"
        >
          <Eye size={14} />
        </button>
      )}
    </div>
  );
};

// List Item Row Component
const ListItemRow = ({
  item,
  onReveal,
  revealLoading,
  revealedContacts,
  revealedData,
  credits,
  isAuthenticated,
  dynamicHeaders,
  listKind,
  selectable,
  isSelected,
  onToggleSelect,
  rowIndex,
  isCompaniesList,
}) => {
  const currentPosition = item.raw.current_positions?.[0] || {};
  const revealCtx = useReveal();
  const isAiList = isAiPeopleListKind(listKind);
  const urlKey = item.raw.public_profile_url || item.raw.linkedin_url || "";
  const isPhoneRevealed = revealedContacts[item._id]?.includes("phone") || revealCtx.isRevealed(urlKey, "phone");
    const isEmailRevealed = revealedContacts[item._id]?.includes("email") || revealCtx.isRevealed(urlKey, "email");
    const phoneLoading = revealLoading[`${item._id}-phone`];
    const emailLoading = revealLoading[`${item._id}-email`];

    const RevealContext = useReveal();
    const rtData = RevealContext.getRealtimeData(item.raw?.public_profile_url || item.raw?.linkedin_url);

    const getRawField = (headerObj) => {
      const headerId = typeof headerObj === 'object' ? headerObj.id : headerObj;
      const headerLabel = typeof headerObj === 'object' ? headerObj.label : headerObj;

      if (headerId === "technologies" && rtData && rtData.technologies && (!Array.isArray(rtData.technologies) || rtData.technologies.length > 0)) {
        const techs = Array.isArray(rtData.technologies) ? rtData.technologies : [rtData.technologies];
        return techs.join("; ");
      }
      
      if (headerId === "email_status" && rtData && rtData.email_status) {
          return rtData.email_status;
      }

    // Handle URL columns specifically to return icons
    if (["linkedin_url", "company_linkedin_url"].includes(headerId)) {
        const url = item.mappedData?.[headerId] || getOrgFieldValue(headerLabel, item.raw) || "";
        if (!url) return "";
        return (
            <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 flex justify-center w-full" title={url}>
                <Linkedin size={16} />
            </a>
        );
    }
    if (headerId === "website") {
        const url = item.mappedData?.[headerId] || getOrgFieldValue(headerLabel, item.raw) || "";
        if (!url) return "";
        return (
            <a href={url.startsWith('http') ? url : `https://${url}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 flex justify-center w-full" title={url}>
                <Globe size={16} />
            </a>
        );
    }
    if (headerId === "facebook_url") {
        const url = item.mappedData?.[headerId] || getOrgFieldValue(headerLabel, item.raw) || "";
        if (!url) return "";
        return (
            <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 flex justify-center w-full" title={url}>
                <Facebook size={16} />
            </a>
        );
    }
    if (headerId === "twitter_url") {
        const url = item.mappedData?.[headerId] || getOrgFieldValue(headerLabel, item.raw) || "";
        if (!url) return "";
        return (
            <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 flex justify-center w-full" title={url}>
                <Twitter size={16} />
            </a>
        );
    }

    let val = item.mappedData?.[headerId] || "";
    if (isAiList && (headerId === "mobile_phone" || headerId === "second_phone" || headerId === "corporate_phone")) {
      return val;
    }
    if (!val) {
      val = getOrgFieldValue(headerLabel, item.raw) || "";
    }
    return val;
    };

    const emailsForDisplay = () => {
    const out = [];
    const seen = new Set();

    const addEmail = (email, status) => {
      const lower = String(email).trim().toLowerCase();
      if (!seen.has(lower) && lower !== "not available") {
        seen.add(lower);
        out.push({ email, status: status || "" });
      }
    };

    const arr = rtData?.emails || (Array.isArray(item.raw.contact__all_emails)
      ? item.raw.contact__all_emails
      : Array.isArray(item.raw.contact__emails)
      ? item.raw.contact__emails
      : null);

    if (arr) {
      arr.forEach((e) => {
        if (e && (e.email || e.sanitized_email)) {
          if (String(e.email || e.sanitized_email).toLowerCase() !== "not available") {
            addEmail(e.email || e.sanitized_email, e.verificationStatus || e.status || rtData?.email_status || item.raw.email_status);
          }
        }
      });
    }

    if (typeof (item.raw.email || item.email) === "string" && (item.raw.email || item.email).trim()) {
      const parts = (item.raw.email || item.email).split(/[;,]+/).map((s) => s.trim()).filter(Boolean);
      parts.forEach((em) => {
        if (em.toLowerCase() !== "not available") {
          addEmail(em, rtData?.email_status || item.raw.email_status || "");
        }
      });
    }

    // Include data from real-time reveal if available (immediate fallback)
    if (revealedData[`${item._id}-email`]) {
      const parts = revealedData[`${item._id}-email`].split(/[;,]+/).map((s) => s.trim()).filter(Boolean);
      parts.forEach((em) => {
        if (em.toLowerCase() !== "not available") {
          addEmail(em, rtData?.email_status || item.raw.email_status || "");
        }
      });
    }

    return out;
  };

  const phonesForDisplay = () => {
    const arr = Array.isArray(item.raw.contact__phone_numbers) ? item.raw.contact__phone_numbers : [];
    if (arr.length) {
      return arr.map((p) => {
        const num = p?.sanitized_number || p?.raw_number;
        return num && String(num).toLowerCase() !== "not available" ? { number: String(num).trim(), type: p?.type || "" } : null;
      }).filter(Boolean);
    }
    const out = [];
    const collectFromString = (s) => {
      if (!s) return;
      s.split(",").map((v) => v.trim()).filter(Boolean).forEach((v) => {
        const m = v.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
        const num = m ? m[1].trim() : v;
        const type = m ? m[2].trim() : "";
        if (num.toLowerCase() !== "not available" && !out.find((x) => x.number === num)) out.push({ number: num, type });
      });
    };
    
    if (isAiList) {
      collectFromString(item.raw.phone || item.phone);
      collectFromString(item.raw.second_phone);
    } else {
      collectFromString(item.mappedData?.phone);
    }
    // HQ / landlines never count as a revealed mobile — keep Reveal Phone visible
    return out.filter((p) => !isLikelyCorporatePhoneNumber(p.type ? `${p.number} (${p.type})` : p.number));
  };

  const zebraBg = rowIndex % 2 === 0 ? 'bg-[#FFFFFF]' : 'bg-[#F9FAFB]';
  return (
    <tr className={`border-b border-[#E5E6E6] ${zebraBg} hover:bg-gray-50 group`}>
      {selectable && (
        <td className="py-3 px-2 min-w-[40px]">
          <input type="checkbox" checked={!!isSelected} onChange={onToggleSelect} aria-label="Select lead" />
        </td>
      )}
      {dynamicHeaders.map((header, index) => (
        <td
          key={header.id}
          className={`py-3 px-2 text-xs text-[#434343] ${
            header.id === 'email' && !isAiList ? 'min-w-[720px] max-w-[1200px] whitespace-normal' : 'min-w-[120px] max-w-[200px] truncate'
          }`}
          title={
            header.id === "email"
              ? item.raw.email || ""
              : header.id === "phone"
              ? item.raw.phone || revealedData[`${item._id}-phone`] || ""
              : getRawField(header)
          }
        >
          {index === 0 && header.id === "first_name" ? (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-100 to-purple-100 flex items-center justify-center shrink-0">
                <span className="text-xs font-semibold text-gray-600">
                  {item.raw.name?.charAt(0)?.toUpperCase() || "?"}
                </span>
              </div>
              <span className="truncate">{getRawField(header)}</span>
              {isLeadAwaitingMore(item) && <MoreComingBadge />}
            </div>
          ) : header.id === "email" ? (
            !isAiList ? (
              <div className="flex flex-col gap-1">
                {emailsForDisplay().length ? (
                  <>
                  {emailsForDisplay().map((e, i) => (
                    <div
                      key={i}
                      className={`flex items-start gap-2 p-2 rounded-md border ${emailStatusBoxClass[emailStatusTone(e.status)]}`}
                    >
                      <div
                        className={`w-1 h-full rounded-sm absolute left-0 top-0 bottom-0 ${emailStatusBarClass[emailStatusTone(e.status)]}`}
                      />
                      <div className="flex flex-col gap-1 pl-2 w-full">
                        <span className="text-xs font-medium text-[#434343] break-all">{e.email}</span>
                        <span
                          className={`inline-flex items-center w-fit px-2 py-0.5 rounded-full text-[10px] border ${emailStatusBadgeClass[emailStatusTone(e.status)]}`}
                        >
                          {e.status || 'Unknown'}
                        </span>
                      </div>
                    </div>
                  ))}
                  {isLeadAwaitingMore(item) && (
                    <div className="pt-1">
                      <MoreComingBadge />
                    </div>
                  )}
                  </>
                ) : (
                  <RevealButton
                    item={item}
                    contactType="email"
                    onReveal={onReveal}
                    isLoading={emailLoading}
                    isRevealed={isEmailRevealed}
                    credits={credits}
                    revealedData={revealedData[`${item._id}-email`]}
                    isAuthenticated={isAuthenticated}
                  />
                )}
              </div>
            ) : (
              <span className="text-xs font-medium text-[#434343] truncate">
                {item.mappedData?.email || item.raw.email || ""}
              </span>
            )
          ) : header.id === "mobile_phone" ? (
            isAiList ? (
              (() => {
                const normalizePhoneVal = (v) => {
                  const s = String(v || "").trim();
                  return s && s.toLowerCase() !== "not available" && !s.includes("*") ? s : "";
                };

                const isShownPersonalMobile = (v) => {
                  const n = normalizePhoneVal(v);
                  return !!n && !isLikelyCorporatePhoneNumber(n) && !numberInCorporateColumn(item, n);
                };

                const s = normalizePhoneVal(item.mappedData?.mobile_phone);
                const hasValue = isShownPersonalMobile(s);
                if (hasValue) {
                  return <span className="text-xs font-medium text-[#434343] truncate">{s}</span>;
                }

                const hasAnyPhone =
                  phonesForDisplay().length > 0 ||
                  isShownPersonalMobile(item.mappedData?.second_phone) ||
                  isShownPersonalMobile(item.mappedData?.phone);

                if (hasAnyPhone) return "";

                return (
                  <RevealButton
                    {...{
                      item,
                      contactType: "phone",
                      onReveal,
                      isLoading: phoneLoading,
                      isRevealed: isPhoneRevealed,
                      credits,
                      revealedData: revealedData[`${item._id}-phone`],
                      isAuthenticated,
                    }}
                  />
                );
              })()
            ) : (
              getRawField(header)
            )
          ) : header.id === "phone" ? (
            !isAiList ? (
              phonesForDisplay().length ? (
                <div className="flex flex-col gap-1">
                  {phonesForDisplay().map((p, i) => (
                    <div key={i} className="flex items-center gap-1">
                      <span className="text-xs font-medium text-[#434343]">{p.number}</span>
                      {p.type && <span className="text-[10px] text-[#717171]">({p.type})</span>}
                    </div>
                  ))}
                  {isLeadAwaitingMore(item) && (
                    <div className="pt-1">
                      <MoreComingBadge />
                    </div>
                  )}
                </div>
              ) : (
                <RevealButton
                  {...{
                    item,
                    contactType: "phone",
                    onReveal,
                    isLoading: phoneLoading,
                    isRevealed: isPhoneRevealed,
                    credits,
                    revealedData: revealedData[`${item._id}-phone`],
                    isAuthenticated,
                  }}
                />
              )
            ) : (
              <span className="text-xs font-medium text-[#434343] truncate">{item.mappedData?.phone || ""}</span>
            )
          ) : header.id === "corporate_phone" ? (
            !isAiList ? (
              <div className="flex flex-col gap-1">
                {getRawField(header) && (
                  <span className="text-xs font-medium text-[#434343] truncate">{getRawField(header)}</span>
                )}
                {!dynamicHeaders.some(h => h.id === "phone" || h.id === "mobile_phone" || h.id === "second_phone") && (
                  <RevealButton
                    {...{
                      item,
                      contactType: "phone",
                      onReveal,
                      isLoading: phoneLoading,
                      isRevealed: isPhoneRevealed,
                      credits,
                      revealedData: revealedData[`${item._id}-phone`],
                      isAuthenticated,
                    }}
                  />
                )}
              </div>
            ) : (
              getRawField(header)
            )
          ) : header.id === "email_status" ? (
            <span className={`px-2 py-1 text-xs font-medium rounded-md border ${emailStatusBadgeClass[emailStatusTone(getRawField(header))]}`}>
              {getRawField(header) || "Unknown"}
            </span>
          ) : header.id === "keywords" || header.id === "technologies" ? (
            <TruncatedTextWithModal
              text={getRawField(header)}
              title={header.label}
            />
          ) : (
            getRawField(header)
          )}
        </td>
      ))}
    </tr>
  );
};

// Main List Details Component
const ListDetails = ({ params }) => {
  const { isAuthenticated, loading: authLoading, credits, updateCredits, user, personalCredits, creditScope } = useAuth();
  const revealCtx = useReveal();
  const [listData, setListData] = useState(null);
  const [listItems, setListItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exportLoading, setExportLoading] = useState(false);
  const [excelExportLoading, setExcelExportLoading] = useState(false);
  const [revealedContacts, setRevealedContacts] = useState({});
  const [revealLoading, setRevealLoading] = useState({});
  const [revealedData, setRevealedData] = useState({});
  const [sourceFilter, setSourceFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);
  
  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPagination(prev => ({ ...prev, currentPage: 1 }));
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const isSavedLeads = String(listData?.kind || '').toLowerCase() === 'revealed_search_results';
  const isAiQuery = String(listData?.kind || '').toLowerCase() === 'ai_query' || String(listData?.kind || '').toLowerCase() === 'ai_mode';
  const aiApprovedDomains = isAiQuery ? (listData?.aiQueryDetails?.searchFilter?.company_domain?.include || listData?.aiQueryDetails?.searchFilter?.company?.include || []) : [];

  const handleShowAiReport = () => {
    const stats = listData?.aiQueryDetails?.aiEvaluationStats;
    const evaluations = listData?.aiQueryDetails?.aiEvaluations || [];
    
    // Fallback if no stats exist
    if (!stats && evaluations.length === 0) {
      return handleShowApprovedCompanies();
    }

    const htmlContent = `
      <div class="text-left text-sm text-[#434343] max-h-[60vh] overflow-y-auto pr-2">
        <div class="grid grid-cols-3 gap-4 mb-6 text-center">
          <div class="bg-blue-50 p-3 rounded-lg border border-blue-100">
            <div class="text-2xl font-bold text-[#04145C]">${stats?.totalEvaluated || evaluations.length}</div>
            <div class="text-xs text-blue-800 font-medium">Evaluated</div>
          </div>
          <div class="bg-green-50 p-3 rounded-lg border border-green-100">
            <div class="text-2xl font-bold text-green-700">${stats?.totalApproved || evaluations.filter(e=>e.approved).length}</div>
            <div class="text-xs text-green-800 font-medium">Approved</div>
          </div>
          <div class="bg-red-50 p-3 rounded-lg border border-red-100">
            <div class="text-2xl font-bold text-red-700">${stats?.totalRejected || evaluations.filter(e=>!e.approved).length}</div>
            <div class="text-xs text-red-800 font-medium">Rejected</div>
          </div>
        </div>
        
        <div class="bg-gray-50 p-4 rounded-lg border border-gray-200 mb-6">
          <h4 class="font-bold text-[#04145C] mb-2 text-base">Why didn't I get all ${listData?.aiQueryDetails?.numLeads || ''} leads?</h4>
          <p class="text-gray-600 leading-relaxed text-xs">
            The AI background loop dynamically searches for companies matching your criteria and evaluates them. 
            Once it evaluates 100 companies, it reaches its safety limit and stops to prevent excessive processing time. 
            If the approved companies don't have enough matching employees to hit your target, the list simply returns all the leads it found so far!
          </p>
        </div>

        <h4 class="font-bold text-[#04145C] mb-3 text-base sticky top-0 bg-white py-2 border-b border-gray-100">Detailed AI Log</h4>
        <div class="space-y-3">
          ${evaluations.map(e => `
            <div class="p-3 rounded-lg border ${e.approved ? 'bg-green-50/50 border-green-200' : 'bg-red-50/50 border-red-200'}">
              <div class="flex items-center justify-between mb-1.5">
                <strong class="text-[#04145C]">${e.name || e.domain} <span class="text-xs text-gray-500 font-normal">(${e.domain})</span></strong>
                <span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${e.approved ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}">
                  ${e.approved ? 'Approved' : 'Rejected'}
                </span>
              </div>
              <p class="text-xs text-gray-600 leading-relaxed"><span class="font-semibold text-gray-700">AI Reason:</span> ${e.reason || 'No specific reason provided'}</p>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    Swal.fire({
      title: "AI Background Report",
      html: htmlContent,
      width: '700px',
      confirmButtonText: "Close",
      customClass: { confirmButton: "swal-confirm-button" }
    });
  };

  const handleShowApprovedCompanies = () => {
    // Try to find company names for the domains from the current list items
    const domainToName = {};
    (listItems || []).forEach(item => {
      const domain = item.raw?.current_company_domain || item.raw?.company_domain;
      const name = item.raw?.company || item.raw?.current_positions?.[0]?.company;
      if (domain && name && !domainToName[domain]) {
        domainToName[domain] = name;
      }
    });

    const htmlContent = `
      <div class="text-left text-sm text-[#434343] max-h-[50vh] overflow-y-auto pr-2">
        <p class="mb-4">These are the companies that were strictly approved by the AI (DeepSeek) based on your prompt.</p>
        <ul class="list-disc pl-5 space-y-2">
          ${aiApprovedDomains.map(domain => {
            const name = domainToName[domain];
            return `<li><strong>${name ? name : domain}</strong> <span class="text-xs text-gray-500">(${domain})</span></li>`;
          }).join('')}
        </ul>
      </div>
    `;

    Swal.fire({
      title: "AI Approved Companies",
      html: htmlContent,
      confirmButtonText: "Close",
      customClass: { confirmButton: "swal-confirm-button" }
    });
  };

  // Use listItems directly since filtering is now server-side
  const displayItems = listItems || [];

  const [pagination, setPagination] = useState({
    totalItems: 0,
    totalPages: 1,
    currentPage: 1,
    itemsPerPage: 20,
  });
  
  // Total items now come directly from server pagination
  const effectiveTotalItems = pagination.totalItems;
  const effectiveTotalPages = pagination.totalPages;

  const router = useRouter();

  let listId = null;
  if (params?.id) {
    listId = params.id;
  } else if (typeof window !== "undefined") {
    const lastPart = window.location.pathname.split("/").pop();
    if (lastPart && /^[a-fA-F0-9]{24}$/.test(lastPart)) {
      listId = lastPart;
    }
  }

  // Helper to robustly determine if this is a companies list based on listType or item data
  const isCompaniesListCheck = useMemo(() => {
    if (["company", "companies"].includes(String(listData?.listType || "").toLowerCase())) return true;
    if (String(listData?.listType || '').toLowerCase() === 'people') return false;
    
    // If listType isn't explicitly set, check the actual items
    if (listItems && listItems.length > 0) {
      const raw = listItems[0]?.raw || {};
      
      // If it has person-specific fields, it's a people list
      if (raw.first_name || raw.last_name || raw.title || raw.person_id || raw.email) {
        return false;
      }
      
      return (
        raw.company_headcount !== undefined ||
        (Array.isArray(raw.organization__industry) && raw.organization__industry.length > 0) ||
        (typeof raw.organization__industry === 'string' && raw.organization__industry.trim().length > 0) ||
        (Array.isArray(raw.organization__industries) && raw.organization__industries.length > 0) ||
        raw.company_name !== undefined
      );
    }
    return false;
  }, [listData?.listType, listItems]);

  // Use headers directly from the backend config
  const dynamicHeaders = useMemo(() => {
    let headers = listData?.headers || [];
    
    // For people lists, ensure we always have an Email and Phone column so users can reveal
    if (!isCompaniesListCheck && headers.length > 0) {
      const hasEmail = headers.some(h => h.id === 'email');
      const hasPhone = headers.some(h => h.id === 'phone' || h.id === 'mobile_phone');
      
      const newHeaders = [...headers];
      if (!hasEmail) {
        newHeaders.push({ id: 'email', label: 'Email' });
      }
      if (!hasPhone) {
        newHeaders.push({ id: 'phone', label: 'Phone' });
      }
      return newHeaders;
    }
    
    return headers;
  }, [listData?.headers, isCompaniesListCheck]);

  const makeAuthenticatedRequest = (url, options = {}) => {
    return axios({
      url: `${config.apiUrl}${url}`,
      withCredentials: true,
      headers: { "Content-Type": "application/json", ...options.headers },
      ...options,
    });
  };

  const fetchRevealedContacts = async () => {
    if (!listId || !isAuthenticated) return;
    try {
      const res = await makeAuthenticatedRequest(`/api/reveal/list/${listId}/revealed-contacts`);
      setRevealedContacts(res.data?.contacts || res.data || {});
    } catch (err) {
      console.error("Failed to fetch revealed contacts:", err);
    }
  };

  const buildTableCsv = (items, headers, kind) => {
    const q = (v) => {
      const s = v == null ? "" : String(v);
      const t = s.replace(/\r?\n/g, " ").replace(/"/g, '""');
      return `"${t}"`;
    };
    const normalize = (h) => {
      const m = {
        'Company': 'Company Name',
        'Linkedin Url': 'Person LinkedIn URL',
        'Phone': 'Mobile Phone',
        'Employees': '# Employees',
      };
      const key = String(h).trim();
      return m[key] || key;
    };
    const canonicalHeaders = headers.map(normalize);
    const headerLine = canonicalHeaders.map(q).join(',');
    const lines = items.map((it) => {
      const raw = it?.raw || {};
      const vals = canonicalHeaders.map((h) => (
        getOrgFieldValue(h, raw)
      ));
      return vals.map(q).join(',');
    });
    const csv = [headerLine, ...lines].join("\r\n");
    return new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  };

  const buildOriginalCsv = (items) => {
    const q = (v) => {
      const s = v == null ? "" : String(v);
      const t = s.replace(/\r?\n/g, " ").replace(/"/g, '""');
      return `"${t}"`;
    };
    let headers = [];
    const firstWithHeaders = items.find((it)=> Array.isArray(it?.raw?.__headers) && it.raw.__headers.length);
    if (firstWithHeaders) {
      headers = firstWithHeaders.raw.__headers.slice();
    } else {
      const seen = new Set();
      items.forEach((it)=>{
        const orig = it?.raw?.__original;
        if (orig && typeof orig === 'object') {
          Object.keys(orig).forEach((k)=> { if (!seen.has(k)) { seen.add(k); headers.push(k); } });
        }
      });
    }
    const headerLine = headers.map(q).join(',');
    const lines = items.map((it)=>{
      const orig = it?.raw?.__original || {};
      const row = headers.map((h)=> {
        const v = Object.prototype.hasOwnProperty.call(orig, h) ? orig[h] : '';
        return v == null ? '' : String(v);
      });
      return row.map(q).join(',');
    });
    const csv = [headerLine, ...lines].join("\r\n");
    return new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  };

  const buildExcelBlobFromRows = (headers, rows) => {
    // Convert headers and rows into a single array of arrays
    const data = [headers, ...rows];

    // Create a new workbook and worksheet
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(data);

    // Append the worksheet to the workbook
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");

    // Write the workbook to a buffer
    const excelBuffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });

    // Return the Blob with the correct MIME type for .xlsx files
    return new Blob([excelBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  };
  const computeOriginalHeaders = (items) => {
    const firstWithHeaders = items.find((it)=> Array.isArray(it?.raw?.__headers) && it.raw.__headers.length);
    if (firstWithHeaders) return firstWithHeaders.raw.__headers.slice();
    const firstWithOriginal = items.find((it)=> it?.raw?.__original && typeof it.raw.__original === 'object');
    if (firstWithOriginal) return Object.keys(firstWithOriginal.raw.__original);
    return [];
  };
  const buildExcelBlob = (items, kind) => {
    const isCompaniesList = isCompaniesListCheck;
    
    if (isCompaniesList) {
      const { headers: preparedHeaders, rows: preparedRows } = prepareCompaniesData(items);
      
      const extraColumns = new Set();
      const internalKeys = [
        'contact__emails', 'contact__phone_numbers', 'current_positions', 'organization', 
        'headers', 'original', 'queryId', 'listId', 'audit__source', '__v', '_id', 'status', 'createdAt', 'updatedAt',
        '__headers', '__original'
      ];
      
      const mappedKeys = new Set([
        'company', 'name', 'company_name', 'industry', 'organization__industry', 'organization__industries',
        'country', 'company_country', 'location_country', 'location',
        'headcount', 'company_headcount', 'employees',
        'revenue_min', 'revenue_max', 'annual_revenue', 'organization__annual_revenue',
        'founded_at', 'founded_year', 'organization__founded_year',
        'keywords', 'organization__keywords', 'skills', 'overview',
        'website', 'organization__website',
        'company_linkedin_url', 'organization__linkedin_url'
      ]);

      items.forEach(it => {
         Object.keys(it.raw || {}).forEach(k => {
             if (internalKeys.includes(k)) return;
             if (mappedKeys.has(k)) return; 
             extraColumns.add(k);
         });
      });
      
      const extraColsArray = Array.from(extraColumns).sort();
      const fullHeaders = [...preparedHeaders, ...extraColsArray];
      
      const fullRows = preparedRows.map((row, i) => {
          const item = items[i];
          const raw = item?.raw || {};
          const extraVals = extraColsArray.map(col => {
              let val = raw[col];
              if (val === null || val === undefined) return "";
              if (typeof val === 'object') {
                try { return JSON.stringify(val); } catch { return "[Object]"; }
              }
              return String(val);
          });
          return [...row, ...extraVals];
      });
      
      return buildExcelBlobFromRows(fullHeaders, fullRows);
    }

    // For ALL lists now, use dynamic export to ensure user uploads get full data back
    // The buildOrgCsv logic now handles dynamic columns.
    // We should replicate that here for Excel.
    
    // Use the same logic as buildOrgCsv to get headers and rows
    // buildOrgCsv is in exportOrgCsv.js, let's assume we can import a helper or replicate logic.
    // Actually, buildOrgCsv returns a Blob for CSV.
    // We need arrays for Excel.
    
    // Let's modify exportOrgCsv.js to export a 'getDynamicData' function 
    // OR we just implement dynamic logic here.
    
    // Replicating dynamic logic:
    const internalKeys = [
      'contact__emails', 'contact__phone_numbers', 'current_positions', 'organization', 
      'headers', 'original', 'queryId', 'listId', 'audit__source', '__v', '_id', 'listId', 'status', 'createdAt', 'updatedAt',
      '__original', '__headers' // Added __original and __headers to internalKeys to prevent export
    ];
    
    // Copy the mappedKeys logic from exportOrgCsv.js to avoid duplicates
    // Also include common variants that might appear in raw but are handled by standard mapping
    const mappedKeys = new Set([
       'first_name', 'last_name', 'name', 'title', 'role', 'company', 
       'email', 'email_status', 'email_2', 'email_2_status', 
       'personal_email', 'personal_email_status', 'personal_email_2', 'personal_email_2_status',
       'headline', 'seniority', 'departments', 'department', 'function',
       'phone', 'mobile_phone', 'second_phone', 'other_phone', 'corporate_phone',
       'company_headcount', 'employees', 'industry', 'keywords',
       'public_profile_url', 'linkedin_url', 'website',
       'company_linkedin_url', 'facebook_url', 'twitter_url',
       'location', 'company_address', 'company_city', 'company_state', 'company_country',
       'technologies', 'founded_year', 'annual_revenue', 'total_funding',
       'latest_funding', 'latest_funding_amount', 'last_raised_at',
       'business_email_1', 'business_email_1_status', 'business_email_2', 'business_email_2_status',
       'personal_email_1', 'personal_email_1_status',
       'organization__industry', 'organization__industries', 'organization__technologies',
       'organization__founded_year', 'organization__annual_revenue', 'organization__total_funding',
       'organization__latest_funding', 'organization__latest_funding_amount', 'organization__last_raised_at',
       'organization__linkedin_url', 'organization__facebook_url', 'organization__twitter_url',
       'organization__website', 'organization__address', 'organization__city', 'organization__state', 'organization__country',
       // Add potential raw keys that duplicate the above (casing/variants)
       'firstname', 'lastname', 'jobtitle', 'companyname', 'employeescount', 'foundedyear', 'annualrevenue', 'totalfunding', 'latestfunding',
       'linkedinurl', 'personlinkedinurl', 'companylinkedinurl', 'facebookurl', 'twitterurl',
       'city', 'state', 'country', 'address', 'companyaddress', 'companycity', 'companystate', 'companycountry',
       'digitalmarketingsystems', 'digital_marketing_systems',
       'technologies', 'keywords', 'industry', 'company_headcount', 'employees',
       'annual_revenue', 'total_funding', 'latest_funding', 'latest_funding_amount', 'last_raised_at',
       'founded_year', 'website', 'public_profile_url', 'location',
       'email_status', 'email_2', 'email_2_status', 'personal_email', 'personal_email_status',
       'phone', 'mobile_phone', 'second_phone', 'other_phone', 'corporate_phone'
    ]);

    const { headers: preparedHeaders, rows: preparedRows } = prepareOrgData(items);
    
    const extraColumns = new Set();
    items.forEach(it => {
       Object.keys(it.raw || {}).forEach(k => {
           if (internalKeys.includes(k)) return;
           // Check if key is already mapped (case-insensitive check for robustness)
           const lowerK = k.toLowerCase();
           if (mappedKeys.has(k) || mappedKeys.has(lowerK)) return; 
           
           // Also check if this key is already in the preparedHeaders (case-insensitive)
           // preparedHeaders usually has "Title Case" like "First Name", so we normalize both side
           // actually preparedHeaders are the Display Names. The data comes from the mapping logic.
           // The safest way is relying on mappedKeys + robust check.
           
           extraColumns.add(k);
       });
    });
    const extraColsArray = Array.from(extraColumns).sort();
    
    const fullHeaders = [...preparedHeaders, ...extraColsArray];
    
    const fullRows = preparedRows.map((row, i) => {
        const item = items[i];
        const raw = item?.raw || {};
        const extraVals = extraColsArray.map(col => {
            let val = raw[col];
            if (val === null || val === undefined) return "";
            if (typeof val === 'object') {
              try {
                return JSON.stringify(val);
              } catch {
                return "[Object]";
              }
            }
            return String(val);
        });
        return [...row, ...extraVals];
    });
    
    return buildExcelBlobFromRows(fullHeaders, fullRows);
  };

  const handleRevealContact = async (leadId, contactType, linkedinUrl) => {
    if ((contactType !== "phone" && contactType !== "email") || !linkedinUrl) return;

    const revealKey = `${leadId}-${contactType}`;
    setRevealLoading((prev) => ({ ...prev, [revealKey]: true }));
    try {
      let res;
      let errorMsg;
      const url = `${process.env.NEXT_PUBLIC_API_URL}/api/mawsool/contact?url=${encodeURIComponent(linkedinUrl)}&fields=${contactType === 'email' ? 'email' : 'phone'}`;
      let extracted = { emailString: "", phoneString: "", emailMeta: [], phones: [], phoneLabels: [], awaiting: false, raw: {} };

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

      if (res?.data?.status !== "success" && res?.data?.status !== "processing" && !extracted.awaiting && !hasExtractedContacts(extracted, contactType)) {
          throw new Error(errorMsg || "Failed to fetch contact info from Mawsool API.");
      }

      const phones = extracted.phoneLabels || [];
      const phoneNumberString = extracted.phoneString || (extracted.awaiting ? "" : "Not available");
      const allEmails = (extracted.emails || []).map((e) => e.email);
      const emailString = extracted.emailString || (extracted.awaiting ? "" : "Not available");
      const orderedStatuses = (extracted.emailMeta || []).map((m) => m.status || "unknown");
      if (extracted.awaiting && ((contactType === "email" && !extracted.emailString) || (contactType === "phone" && !extracted.phoneString))) {
        setListItems((prev) => prev.map((item) => {
          if (item._id !== leadId) return item;
          return {
            ...item,
            raw: { ...(item.raw || {}), awaiting_webhook: true }
          };
        }));
        return;
      }

      const rank = (s) => {
        const v = String(s || "").toLowerCase();
        if (v.includes('verified a+')) return 5;
        if (v.includes('verified') || v.includes('deliverable')) return 4;
        if (v.includes('valid')) return 3;
        if (v.includes('risky') || v.includes('catch-all') || v.includes('catch all')) return 2;
        if (v.includes('unverified')) return 1;
        return 0;
      };
      let bestStatus = "";
      orderedStatuses.forEach((st) => {
        if (rank(st) > rank(bestStatus)) bestStatus = st;
      });
      // Fallback: if bestStatus is still empty but we have values, pick the first non-empty one
      if (!bestStatus) {
          const firstNonEmpty = orderedStatuses.find(s => s && s !== 'unknown');
          if (firstNonEmpty) bestStatus = firstNonEmpty;
      }
      if (!bestStatus && res?.data?.contact__email_status) {
        bestStatus = res.data.contact__email_status;
      }

      const payload = contactType === "email"
        ? { leadId, email: emailString, types: ['email'], emailStatuses: orderedStatuses }
        : { leadId, phone: phoneNumberString, types: ['phone'] };

      const bundleRes = await makeAuthenticatedRequest("/api/reveal/bundle", {
        method: "POST",
        data: payload,
      });

      if (bundleRes.data?.pending && !hasExtractedContacts(extracted, contactType)) {
        Swal.fire({
          toast: true,
          position: "top-end",
          icon: "info",
          title: bundleRes.data?.message || "Verification pending",
          showConfirmButton: false,
          timer: 3000,
        });
        return;
      }

      const returnedPhone = bundleRes.data?.phone || (contactType === 'phone' ? phoneNumberString : "");
      const returnedEmail = bundleRes.data?.email || (contactType === 'email' ? (emailString !== "Not available" ? emailString : "") : "");
      const creditsLeft = bundleRes.data?.creditsLeft;

      // Compute merged arrays from current state and new reveal
      const currentItem = listItems.find((it)=> it._id === leadId);
      const existingEmailsArr = Array.isArray(currentItem?.raw?.contact__all_emails) ? currentItem.raw.contact__all_emails : [];
      const newEmailsArr = Array.isArray(extracted.emails) && extracted.emails.length
        ? extracted.emails.map((e) => ({ email: e.email, sanitized_email: e.email, verificationStatus: e.status, status: e.status }))
        : (Array.isArray(res.data?.contact__emails) ? res.data.contact__emails : []);
      const mergedEmails = [...existingEmailsArr];
      newEmailsArr.forEach((e)=>{
        const addr = e?.email || e?.sanitized_email;
        if (!addr) return;
        if (!mergedEmails.find((x)=> (x?.email||x?.sanitized_email) === addr)) {
          mergedEmails.push({
            email: addr,
            sanitized_email: e?.sanitized_email,
            verificationStatus: e?.verificationStatus || e?.status || bestStatus || currentItem?.raw?.email_status || "",
            status: e?.status
          });
        }
      });
      const existingPhonesArr = Array.isArray(currentItem?.raw?.contact__phone_numbers) ? currentItem.raw.contact__phone_numbers : [];
      const newPhonesArr = Array.isArray(extracted.phones) && extracted.phones.length
        ? extracted.phones
        : (Array.isArray(res.data?.contact__phone_numbers) ? res.data.contact__phone_numbers : []);
      const mergedPhones = [...existingPhonesArr];
      newPhonesArr.forEach((p)=>{
        const num = p?.sanitized_number || p?.raw_number;
        if (!num) return;
        if (!mergedPhones.find((x)=> (x?.sanitized_number||x?.raw_number) === num)) mergedPhones.push(p);
      });

      let updatedRaw = null;
      // Persist revealed contacts to the saved leads list in backend
        try {
          const saveListId = listData?._id;
          if (saveListId && currentItem) {
            const mappedRaw = normalizeToListRaw(extracted.raw || res.data, linkedinUrl);
            const payloadForSave = { ...currentItem.raw };

            // Backfill missing fields from the revealed data
            Object.keys(mappedRaw).forEach(key => {
              const currentVal = payloadForSave[key];
              const mappedVal = mappedRaw[key];
              
              // If current field is empty, "N/A", or an empty array, and mapped field has data, backfill it
              if (
                !currentVal || 
                currentVal === "N/A" || 
                (Array.isArray(currentVal) && currentVal.length === 0)
              ) {
                if (mappedVal && mappedVal !== "N/A" && (!Array.isArray(mappedVal) || mappedVal.length > 0)) {
                  payloadForSave[key] = mappedVal;
                }
              }
            });

            // Explicitly set the new contact values
            payloadForSave.contact__all_emails = contactType === 'email' ? mergedEmails : currentItem.raw.contact__all_emails;
            payloadForSave.contact__phone_numbers = contactType === 'phone' ? mergedPhones : currentItem.raw.contact__phone_numbers;
            payloadForSave.email = contactType === 'email' ? (returnedEmail || currentItem.raw.email || "") : currentItem.raw.email || "";
            payloadForSave.email_status = contactType === 'email' ? (bestStatus || currentItem.raw.email_status || "") : currentItem.raw.email_status || "";
            payloadForSave.phone = contactType === 'phone' ? (returnedPhone || currentItem.raw.phone || "") : currentItem.raw.phone || "";
            payloadForSave.public_profile_url = currentItem.raw.public_profile_url || currentItem.raw.linkedin_url || linkedinUrl || "";
            payloadForSave.linkedin_url = currentItem.raw.linkedin_url || currentItem.raw.public_profile_url || linkedinUrl || "";
            payloadForSave.public_identifier = currentItem.raw.public_identifier || mappedRaw.id || mappedRaw.public_identifier || "";

            updatedRaw = payloadForSave;

            const kind = String(listData?.kind || 'user_made').toLowerCase();
          const endpoint = kind === 'revealed_search_results' 
            ? `/api/list/add-special/${saveListId}/items`
            : `/api/list/add/${saveListId}/items`;

          await makeAuthenticatedRequest(endpoint, { method: 'POST', data: [payloadForSave] });
          Swal.fire({
            toast: true,
            position: "top-end",
            imageUrl: "/icons/mawsool-success.webp",
            imageAlt: "Success",
            title: "Lead Saved",
            text: "Contact revealed and saved to list.",
            showConfirmButton: false,
            timer: 3000
          });
        }
      } catch {}

      // Update UI state with merged arrays and returned contacts
      setListItems((prev) =>
        prev.map((item) => {
          if (item._id !== leadId) return item;
          
          const isFailedEmail = contactType === 'email' && (!returnedEmail || returnedEmail === "Not available");
          const isFailedPhone = contactType === 'phone' && (!returnedPhone || returnedPhone === "Not available");

          return {
            ...item,
            email: isFailedEmail ? "Not available" : (contactType === 'email' ? (returnedEmail || item.email) : item.email),
            phone: isFailedPhone ? "Not available" : (contactType === 'phone' ? (returnedPhone || item.phone) : item.phone),
            raw: updatedRaw || {
              ...item.raw,
              phone: isFailedPhone ? "Not available" : (contactType === 'phone' ? (returnedPhone || item.raw.phone) : item.raw.phone),
              email: isFailedEmail ? "Not available" : (contactType === 'email' ? (returnedEmail || item.raw.email) : item.raw.email),
              email_status: contactType === 'email' ? (bestStatus || item.raw.email_status || "N/A") : item.raw.email_status,
              contact__all_emails: contactType === 'email' ? (mergedEmails.length ? mergedEmails : [{ email: "Not available", status: "N/A", verificationStatus: "N/A" }]) : item.raw.contact__all_emails,
              contact__phone_numbers: contactType === 'phone' ? (mergedPhones.length ? mergedPhones : [{ raw_number: "Not available", sanitized_number: "Not available", type: "N/A" }]) : item.raw.contact__phone_numbers,
            }
          };
        })
      );

      setRevealedData((prev) => ({
        ...prev,
        ...(contactType === 'phone' ? { [revealKey]: returnedPhone } : {}),
        ...(contactType === 'email' ? { [`${leadId}-email`]: returnedEmail } : {})
      }));
      setRevealedContacts((prev) => ({
        ...prev,
        [leadId]: [...(prev[leadId] || []), contactType].filter(Boolean)
      }));

      if (typeof creditsLeft === 'number') {
        await updateCredits(creditsLeft);
      }
      try {
        const k = currentItem?.raw?.public_profile_url || currentItem?.raw?.linkedin_url || linkedinUrl || "";
        if (contactType === 'phone' && phoneNumberString && phoneNumberString !== 'Not available') {
          const keyUrl = k;
          const t = 'phone';
          revealCtx.markRevealed(keyUrl, t);
        }
        if (contactType === 'email' && emailString && emailString !== 'Not available') {
          const keyUrl = k;
          const t = 'email';
          revealCtx.markRevealed(keyUrl, t);
        }
      } catch {}
      await fetchRevealedContacts();

    } catch (err) {
      // If it fails, mark it as Not available so the user doesn't keep clicking
      setRevealedData((prev) => ({
        ...prev,
        ...(contactType === 'phone' ? { [revealKey]: "Not available" } : {}),
        ...(contactType === 'email' ? { [`${leadId}-email`]: "Not available" } : {})
      }));
      setRevealedContacts((prev) => ({
        ...prev,
        [leadId]: [...(prev[leadId] || []), contactType].filter(Boolean)
      }));

      Swal.fire({
        imageUrl: "/icons/mawsool-error.webp",
        imageAlt: "Custom alert icon",
        title: "Error",
        text: err.message || `Failed to reveal ${contactType}.`,
        confirmButtonText: "Ok",
        customClass: { confirmButton: "swal-confirm-button" },
      });
    } finally {
      setRevealLoading((prev) => ({ ...prev, [revealKey]: false }));
    }
  };

  const fetchListDetails = async (page = 1, search = "", source = "") => {
    if (!listId) {
      setError("List ID not found in URL.");
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError("");
      const res = await makeAuthenticatedRequest(`/api/list/${listId}?page=${page}&limit=${pagination.itemsPerPage}&search=${encodeURIComponent(search)}&source=${encodeURIComponent(source)}`);
      const { items, pagination: paginationData, ...listInfo } = res.data;
      setListData(listInfo);
      setListItems(items || []);
      setPagination((prev) => ({
        ...prev,
        totalItems: paginationData.totalItems || 0,
        totalPages: paginationData.totalPages || 1,
        currentPage: paginationData.currentPage || 1,
      }));
      // console.log("Fetched list details:", res.data);
    } catch (err) {
      console.error("Failed to fetch list details:", err);
      setError("Could not load list details.");
    } finally {
      setLoading(false);
    }
  };

  const fetchAllItems = async () => {
    const items = [];
    let page = 1;
    let pages = 1;
    const limit = 500;
    while (page <= pages) {
      const res = await makeAuthenticatedRequest(`/api/list/${listId}?page=${page}&limit=${limit}`);
      const { items: pageItems, pagination: p } = res.data;
      (pageItems || []).forEach((it)=> items.push(it));
      pages = p?.totalPages || 1;
      page += 1;
    }
    return items;
  };

  const handleBulkReveal = async () => {
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

    if (!listId) {
      Swal.fire({ icon: "error", title: "Error", text: "List ID is missing." });
      return;
    }
    
    const { value: revealType } = await Swal.fire({
      title: "Bulk Reveal Contacts",
      html: `
        <div class="text-left text-sm mb-4 text-[#434343]">
          <p class="mb-2">Select what data you want to reveal for this list. This will run in the background.</p>
          <select id="swal-reveal-type" class="w-full border border-gray-300 rounded-lg px-3 py-2 bg-white outline-none focus:border-[#04145C]">
            <option value="email">Emails Only (5 credits/lead)</option>
            <option value="phone">Phones Only (20 credits/lead)</option>
            <option value="both">Both Email & Phone (25 credits/lead)</option>
          </select>
          <p class="mt-2 text-xs text-gray-500">Note: Credits are only deducted if valid data is found. Leads that already have data will be skipped.</p>
        </div>
      `,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: "Start Reveal",
      cancelButtonText: "Cancel",
      customClass: { confirmButton: "swal-confirm-button", cancelButton: "swal-cancel-button" },
      preConfirm: () => {
        return document.getElementById('swal-reveal-type').value;
      }
    });

    if (revealType) {
      const costPerLead = revealType === "email" ? 5 : revealType === "phone" ? 20 : 25;
      const count = effectiveTotalItems;
      const totalRequiredCredits = count * costPerLead;
      // The `credits` from AuthContext now correctly sums both pool and personal balances.
      const availableCredits = typeof credits === "number" ? credits : 0;
      
      if (count > 700) {
        Swal.fire({
          icon: "error",
          title: "Limit Exceeded",
          text: "The limit for bulk reveal is 700 profiles per request. Please split your list into smaller lists.",
          confirmButtonText: "OK"
        });
        return;
      }

      if (availableCredits < totalRequiredCredits) {
        Swal.fire({
          icon: "error",
          title: "Insufficient Credits",
          text: `You need at least ${totalRequiredCredits} credits to start revealing ${count} leads (assuming none are already revealed). You currently have ${availableCredits} credits.`,
          confirmButtonText: "Buy Credits",
          showCancelButton: true,
          cancelButtonText: "Cancel"
        }).then((result) => {
          if (result.isConfirmed) {
            window.location.href = "/setting/planOverview";
          }
        });
        return;
      }

      try {
        const res = await makeAuthenticatedRequest(`/api/list/${listId}/bulk-reveal`, {
          method: 'POST',
          data: { revealType }
        });
        
        Swal.fire({
          icon: "success",
          title: "Bulk Reveal Started",
          text: "The background job has started. Check the progress in the list view.",
          timer: 4000,
          showConfirmButton: false
        });
        
        // Refresh list to show running status
        fetchListDetails(pagination.currentPage, searchQuery, sourceFilter);
      } catch (err) {
        let msg = err.response?.data?.msg || err.message || "Failed to start bulk reveal.";
        if (err.response?.status === 402 || msg.includes('credit')) {
          Swal.fire({
            icon: "warning",
            title: "Insufficient Credits",
            text: "You don't have enough credits to start a bulk reveal. Please upgrade or buy more.",
            showCancelButton: true,
            confirmButtonText: "Get Credits",
            customClass: { confirmButton: "swal-confirm-button" }
          }).then((res) => {
            if (res.isConfirmed) window.location.href = "/setting/planOverview";
          });
        } else {
          Swal.fire({ icon: "error", title: "Error", text: msg });
        }
      }
    }
  };

  const handleExport = async (format = 'csv') => {
    if (!listId) {
      Swal.fire({ icon: "error", title: "No List", text: "List ID not found." });
      return;
    }
    
    if (format === 'xlsx') setExcelExportLoading(true);
    else setExportLoading(true);

    try {
      let url = `/api/list/${listId}/export`;
      const queryParams = new URLSearchParams();
      queryParams.append('format', format);
      
      if (selectedIds.length > 0) {
        queryParams.append('selectedIds', selectedIds.join(','));
      } else {
        if (sourceFilter) queryParams.append('sourceFilter', sourceFilter);
        if (searchQuery) queryParams.append('searchQuery', searchQuery);
      }
      
      const fullUrl = `${url}?${queryParams.toString()}`;
      
      const res = await makeAuthenticatedRequest(fullUrl, {
        responseType: 'blob',
        timeout: 60000 // 60 seconds timeout for large exports
      });
      
      const mimeType = format === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'text/csv;charset=utf-8;';
      const ext = format === 'xlsx' ? '.xlsx' : '.csv';
      const blob = new Blob([res.data], { type: mimeType });
      const suggestedName = `${listData?.name || "exported_list"}${ext}`;

      if (typeof window !== "undefined" && window.showSaveFilePicker) {
        try {
          const types = format === 'xlsx' 
            ? [{ description: "Excel Workbook", accept: { "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"] } }]
            : [{ description: "CSV", accept: { "text/csv": [".csv"] } }];
          const handle = await window.showSaveFilePicker({ suggestedName, types });
          const writable = await handle.createWritable();
          await writable.write(blob);
          await writable.close();
          Swal.fire({ icon: "success", title: "Exported", text: `Export complete` });
        } catch (e) {
          if (e.name !== 'AbortError') {
             const link = document.createElement("a");
             const blobUrl = URL.createObjectURL(blob);
             link.setAttribute("href", blobUrl);
             link.setAttribute("download", suggestedName);
             link.style.visibility = "hidden";
             document.body.appendChild(link);
             link.click();
             document.body.removeChild(link);
             setTimeout(() => { Swal.fire({ icon: "success", title: "Exported", text: `Export complete` }); }, 500);
          }
        }
      } else {
        const link = document.createElement("a");
        const blobUrl = URL.createObjectURL(blob);
        link.setAttribute("href", blobUrl);
        link.setAttribute("download", suggestedName);
        link.style.visibility = "hidden";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => { Swal.fire({ icon: "success", title: "Exported", text: `Export complete` }); }, 500);
      }
    } catch (error) {
      console.error("Export Error:", error);
      Swal.fire({ icon: "error", title: "Error exporting list", text: "An error occurred while exporting the list." });
    } finally {
      if (format === 'xlsx') setExcelExportLoading(false);
      else setExportLoading(false);
    }
  };

  useEffect(() => {
    fetchListDetails(pagination.currentPage, debouncedSearch, sourceFilter);
  }, [listId, pagination.currentPage, debouncedSearch, sourceFilter]);

  // Auto-polling for background jobs (Bulk Reveal / Sync)
  useEffect(() => {
    let pollInterval;
    if (listData?.revealStatus === 'running' || listData?.isSyncing) {
      pollInterval = setInterval(() => {
        // Fetch silently (without resetting the whole loading state and UI)
        if (listId) {
          makeAuthenticatedRequest(`/api/list/${listId}?page=${pagination.currentPage}&limit=${pagination.itemsPerPage}&search=${encodeURIComponent(debouncedSearch)}&source=${encodeURIComponent(sourceFilter)}`)
            .then(res => {
              const { items, pagination: paginationData, ...listInfo } = res.data;
              setListData(listInfo);
              setListItems(items || []);
            })
            .catch(err => console.error("Silent polling failed", err));
        }
      }, 5000);
    }
    return () => {
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [listData?.revealStatus, listData?.isSyncing, listId, pagination.currentPage, debouncedSearch, sourceFilter]);

  useEffect(() => {
    if (isAuthenticated && listData?.revealStatus !== 'running') {
      fetchRevealedContacts();
    }
  }, [isAuthenticated, listId, listData?.revealStatus]);
  useEffect(() => {
    try {
      const rc = revealedContacts || {};
      (listItems || []).forEach((it) => {
        const types = rc[it._id] || [];
        const url = it?.raw?.public_profile_url || it?.raw?.linkedin_url || "";
        if (url && Array.isArray(types) && types.length) {
          revealCtx.hydrate(url, types);
        }
      });
    } catch {}
  }, [revealedContacts, listItems]);

  const handlePageChange = (newPage) => {
    const maxPages = effectiveTotalPages;
    if (newPage >= 1 && newPage <= maxPages) {
      setPagination((prev) => ({ ...prev, currentPage: newPage }));
    }
  };

  const toggleSelect = (id) => {
    setSelectedIds((prev)=> prev.includes(id) ? prev.filter((x)=> x !== id) : [...prev, id]);
  };
  const selectAllOnPage = (checked) => {
    if (!checked) {
      setSelectedIds((prev)=> prev.filter((id)=> !displayItems.some((it)=> it._id === id)));
    } else {
      const ids = displayItems.map((it)=> it._id);
      setSelectedIds((prev)=> Array.from(new Set([...prev, ...ids])));
    }
  };
  const usableContact = (value) => {
    const s = String(value || "").trim();
    if (!s) return "";
    const lower = s.toLowerCase();
    if (lower === "not available" || lower === "n/a" || lower.includes("not available")) return "";
    return s.split(",")[0].trim();
  };

  const handlePushToCrm = async () => {
    if (isCompaniesListCheck) {
      Swal.fire({
        icon: "info",
        title: "People leads only",
        text: "Push to CRM is available for people lists.",
      });
      return;
    }
    const selected = (listItems || []).filter((it) => selectedIds.includes(it._id));
    if (!selected.length) return;
    try {
      const leads = selected.map((it) => {
        const raw = it.raw || {};
        const pos = Array.isArray(raw.current_positions) ? raw.current_positions[0] || {} : {};
        const name =
          it.name ||
          raw.name ||
          [raw.first_name, raw.last_name].filter(Boolean).join(" ") ||
          "";
        return {
          name,
          linkedin_url: raw.linkedin_url || raw.public_profile_url || "",
          title: raw.title || pos.role || "",
          company: raw.company || pos.company || it.company || "",
          location: raw.location || it.location || "",
          email: usableContact(
            revealedData[`${it._id}-email`] || it.email || raw.email || it.mappedData?.email
          ),
          phone: usableContact(
            revealedData[`${it._id}-phone`] || it.phone || it.mappedData?.phone || raw.phone
          ),
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
    }
  };

  const handleDeleteSelected = async () => {
    if (isSavedLeads || !listId) return;
    const ids = selectedIds.slice();
    if (!ids.length) return;
    try {
      await makeAuthenticatedRequest(`/api/list/${listId}/items/delete`, { method: 'POST', data: { ids } });
      setListItems((prev)=> prev.filter((it)=> !ids.includes(it._id)));
      setSelectedIds([]);
      setPagination((prev)=> ({ ...prev, totalItems: Math.max(0, (prev.totalItems||0) - ids.length), totalPages: Math.max(1, Math.ceil(Math.max(0, (prev.totalItems||0) - ids.length) / prev.itemsPerPage)) }));
      Swal.fire({ toast: true, position: "top-end", imageUrl: "/icons/mawsool-success.webp", imageAlt: "Custom alert icon", title: "Deleted", showConfirmButton: false, timer: 1500 });
    } catch (e) {
      Swal.fire({ imageUrl: "/icons/mawsool-error.webp", imageAlt: "Custom alert icon", title: "Delete failed", text: e?.response?.data?.msg || e?.message || "Could not delete", confirmButtonText: "Ok", customClass: { confirmButton: "swal-confirm-button" } });
    }
  };

  // Generate pagination buttons
 const getPaginationButtons = () => {
  const { currentPage } = pagination;
  const totalPages = effectiveTotalPages;
  const buttons = [];
  const maxButtons = 7; // Total number of buttons to display (including ellipses)

  if (totalPages <= maxButtons) {
    // If total pages are less than or equal to maxButtons, show all
    for (let i = 1; i <= totalPages; i++) {
      buttons.push(i);
    }
  } else {
    // Always show the first page
    buttons.push(1);

    // Add ellipsis if current page is greater than 2
    if (currentPage > 2) {
      buttons.push("...");
    }

    // Calculate the range around the current page
    const startPage = Math.max(2, currentPage - 1); // Start at least 2 pages before current
    const endPage = Math.min(totalPages - 1, currentPage + 1); // End at least 2 pages after current

    // Add pages around the current page (minimum 3 pages including current)
    for (let i = startPage; i <= endPage; i++) {
      if (i > 1 && i < totalPages) { // Avoid duplicating 1 and totalPages
        buttons.push(i);
      }
    }

    // Add ellipsis if current page is less than totalPages - 1
    if (currentPage < totalPages - 1) {
      buttons.push("...");
    }

    // Always show the last page
    if (totalPages > 1) {
      buttons.push(totalPages);
    }

    // Ensure we have at least 5-7 buttons by adjusting the range if needed
    while (buttons.length < maxButtons && buttons.length > 3) {
      if (currentPage > 4 && !buttons.includes(currentPage - 2)) {
        buttons.splice(2, 0, currentPage - 2); // Insert before ellipsis
      } else if (currentPage < totalPages - 3 && !buttons.includes(currentPage + 2)) {
        buttons.splice(buttons.length - 1, 0, currentPage + 2); // Insert before last page
      } else {
        break;
      }
    }
  }

  return buttons;
};

  if (authLoading || (loading && !listData)) {
    return (
      <DashboardContainer heading="List Details">
        <div className="w-full h-full flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        </div>
      </DashboardContainer>
    );
  }

  if (error) {
    return (
      <DashboardContainer heading="List Details">
        <div className="w-full h-full flex items-center justify-center text-center">
          <div>
            <h3 className="text-lg font-medium text-red-600">Error</h3>
            <p className="text-gray-500 mb-4">{error}</p>
            <button onClick={() => fetchListDetails(pagination.currentPage)} className="px-4 py-2 text-xs bg-blue-600 text-white rounded-lg">
              Try Again
            </button>
          </div>
        </div>
      </DashboardContainer>
    );
  }

  return (
    <DashboardContainer heading={listData?.name || "List Details"}>
      <div className="w-full h-full flex flex-col rounded-2xl border border-[#E5E6E6] bg-[#FBFBFC] overflow-hidden">
        <div className="p-4 flex flex-col gap-4 bg-[#FBFBFC] border border-[#E5E6E6] rounded-[16px] w-full h-full relative">
          {listData?.revealStatus === 'running' && (
            <div className="bg-blue-50 border border-blue-200 text-blue-800 rounded-lg p-3 flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-3">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                <span className="text-sm font-medium">
                  Bulk Reveal ({listData.revealProgress?.type || 'data'}) is running in the background...
                </span>
              </div>
              <span className="text-xs font-bold bg-blue-100 px-3 py-1 rounded-full">
                {listData.revealProgress?.current || 0} / {listData.revealProgress?.total || 0} Leads
              </span>
            </div>
          )}
          <div className="flex justify-between items-center flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <span className="text-xs text-[#434343] p-2 border border-[#E5E6E6] rounded-[8px]">
                Total: {pagination.totalItems}
              </span>
              {isAiQuery && process.env.NEXT_PUBLIC_HIDE_AI_MODE !== 'true' && (
                <button
                  onClick={handleShowAiReport}
                  className="cursor-pointer flex items-center gap-2 px-3 py-1.5 text-[#04145C] border border-[#04145C] rounded-lg text-xs font-medium hover:bg-blue-50 transition-colors"
                >
                  <FileText size={14} />
                  View AI Report
                </button>
              )}
            </div>
            <div className="flex items-center gap-3">
              {String(listData?.kind||"").toLowerCase()==='revealed_search_results' && (
                <select
                  value={sourceFilter}
                  onChange={(e)=> { setSourceFilter(e.target.value); setPagination((prev)=> ({ ...prev, currentPage: 1 })); setSelectedIds([]); }}
                  className="text-xs border border-[#E5E6E6] rounded-[8px] px-2 py-1 text-[#434343] bg-[#FBFBFC]"
                >
                  <option value="">All Sources</option>
                  <option value="search">Search</option>
                  <option value="enrichment">Enrichment</option>
                  <option value="extension">Extension</option>
                </select>
              )}
              <input
                type="text"
                value={searchQuery}
                onChange={(e)=> { setSearchQuery(e.target.value); setPagination((prev)=> ({ ...prev, currentPage: 1 })); setSelectedIds([]); }}
                placeholder="Search name or company"
                className="text-xs border border-[#E5E6E6] rounded-[8px] px-3 py-2 text-[#434343] bg-[#FBFBFC] w-[300px]"
                aria-label="Search leads"
              />
              {!isSavedLeads && (
                <button
                  onClick={handleDeleteSelected}
                  disabled={!selectedIds.length}
                  className="cursor-pointer flex items-center gap-2 px-4 py-2 text-white rounded-xl bg-[#B00020] text-sm font-medium transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#c5162b]"
                >
                  Delete
                </button>
              )}
                {process.env.NEXT_PUBLIC_HIDE_PUSH_TO_CRM !== "true" && (
                <button
                  onClick={handlePushToCrm}
                  disabled={!selectedIds.length}
                  className="cursor-pointer flex items-center gap-2 px-4 py-2 text-white rounded-xl bg-[#017737] text-sm font-medium transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#015c2b]"
                >
                  Push to CRM
                </button>
                )}
                <button
                  onClick={handleBulkReveal}
                  className="cursor-pointer flex items-center gap-2 px-4 py-2 text-white rounded-xl bg-[#00D2FF] text-[#04145C] text-sm font-medium transition-colors duration-200 hover:bg-[#00C4E6]"
                >
                  <Eye size={16} />
                  Bulk Reveal
                </button>
              <button
                onClick={() => handleExport('csv')}
                disabled={exportLoading || excelExportLoading}
                className="cursor-pointer flex items-center gap-2 px-4 py-2 text-white rounded-xl bg-[#04145C] text-sm font-medium transition-colors duration-200 hover:bg-[#052074]"
              >
                <Download size={16} />
                {exportLoading ? "Exporting..." : "Export CSV"}
              </button>
              <button
                onClick={() => handleExport('xlsx')}
                disabled={excelExportLoading || exportLoading}
                className="cursor-pointer flex items-center gap-2 px-4 py-2 text-white rounded-xl bg-[#0B7D24] text-sm font-medium transition-colors duration-200 hover:bg-[#0e9230]"
              >
                <FileSpreadsheet size={16} />
                {excelExportLoading ? "Exporting..." : "Export Excel"}
              </button>
            </div>
          </div>

          {listItems.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <img className="mb-4 h-40" src="/icons/notFoundSearch.gif" alt="No lists found" />
              <h3 className="text-lg font-medium text-gray-900 mt-4">No results found</h3>
            </div>
          ) : (
            <>
              <div className={`relative table-container overflow-x-auto overflow-y-auto max-h-[600px] transition-opacity duration-200 ${loading ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
              {loading && (
                <div className="absolute inset-0 z-50 flex items-center justify-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                </div>
              )}
              <table className="w-full text-xs min-w-[800px] responsive-table">
                <thead className="border-b border-[#E5E6E6] sticky top-0 bg-[#FBFBFC] z-10">
                  <tr>
                    <th className="text-left py-3 px-2 font-medium text-[10px] text-[#6B7271] min-w-[40px]">
                      <input type="checkbox" onChange={(e)=> selectAllOnPage(e.target.checked)} aria-label="Select all" />
                    </th>
                    {dynamicHeaders.map((header) => (
                      <th
                        key={header.id}
                        className={`text-left py-3 px-2 font-medium text-[10px] text-[#6B7271] ${
                          header.id === 'email' && !isAiQuery
                            ? 'min-w-[720px]'
                            : 'min-w-[120px]'
                        }`}
                      >
                        {header.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayItems.map((item, idx) => (
                    <ListItemRow
                      key={item._id}
                      item={item}
                      onReveal={handleRevealContact}
                      revealLoading={revealLoading}
                      revealedContacts={revealedContacts}
                      revealedData={revealedData}
                      credits={credits}
                      isAuthenticated={isAuthenticated}
                      dynamicHeaders={dynamicHeaders}
                      listKind={listData?.kind}
                      selectable={true}
                      isSelected={selectedIds.includes(item._id)}
                      onToggleSelect={()=> toggleSelect(item._id)}
                      rowIndex={idx}
                      isCompaniesList={isCompaniesListCheck}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            {/* Pagination Controls */}
            {pagination.totalPages > 1 && (
              <div className="flex justify-between items-center p-4 border-t border-[#E5E6E6]">
                <div className="text-xs text-gray-600">
                  {searchQuery ? (
                    <>Showing 1 to {displayItems.length} of {pagination.totalItems} items</>
                  ) : isSavedLeads && sourceFilter ? (
                    <>Showing 1 to {displayItems.length} of {pagination.totalItems} items</>
                  ) : (
                    <>Showing {(pagination.currentPage - 1) * pagination.itemsPerPage + 1} to{" "}
                    {Math.min(pagination.currentPage * pagination.itemsPerPage, pagination.totalItems)} of{" "}
                    {pagination.totalItems} items</>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handlePageChange(pagination.currentPage - 1)}
                    disabled={pagination.currentPage === 1}
                    className="cursor-pointer px-3 py-1 text-xs border border-[#E5E6E6] rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <div className="flex gap-1">
                    {getPaginationButtons().map((page, index) => (
                      <button
                        key={index}
                        onClick={() => typeof page === "number" && handlePageChange(page)}
                        disabled={page === "..." || page === pagination.currentPage}
                        className={`px-3 py-1 text-xs border rounded-lg ${
                          page === "..." 
                            ? "border-[#E5E6E6] text-gray-600 cursor-default"
                            : page === pagination.currentPage
                            ? "bg-[#04145C] text-white transition-colors duration-200 hover:bg-[#052074]"
                            : "border-[#E5E6E6] text-gray-600 cursor-pointer"
                        }`}
                      >
                        {page}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => handlePageChange(pagination.currentPage + 1)}
                    disabled={pagination.currentPage === effectiveTotalPages}
                    className="cursor-pointer px-3 py-1 text-xs border border-[#E5E6E6] rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
            </>
          )}
        </div>
      </div>
    </DashboardContainer>
  );
};

export default ListDetails;
const canonNum = (n) => String(n||"").replace(/[^+\d]/g, "");
const parseTypedPhoneStrings = (s) => {
  const out = [];
  if (!s) return out;
  s.split(',').map((v)=> v.trim()).filter(Boolean).forEach((v)=>{
    const m = v.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
    const num = m ? m[1].trim() : v;
    const type = m ? m[2].trim().toLowerCase() : "";
    out.push({ num, type });
  });
  return out;
};
const pickPhonesPlain = (raw) => {
  const arr = Array.isArray(raw.contact__phone_numbers) ? raw.contact__phone_numbers : [];
  let out = arr.map((p)=> ({ num: p?.sanitized_number || p?.raw_number || "", type: (p?.type || "").toLowerCase() }))
    .filter((x)=> x.num);
  out = out.concat(parseTypedPhoneStrings(raw.phone));
  out = out.concat(parseTypedPhoneStrings(raw.second_phone));
  out = out.concat(parseTypedPhoneStrings(raw.corporate_phone).map((x) => ({ ...x, type: x.type || "corporate" })));
  const dedup = [];
  out.forEach((x)=> { const c = canonNum(x.num); if (c && !dedup.find((y)=> canonNum(y.num) === c)) dedup.push(x); });
  const hq = dedup.find((x)=> ["work_hq","work_phone","hq","office","corporate"].includes(x.type) || isLikelyCorporatePhoneNumber(x.num))?.num || "";
  const mobile = dedup.find((x)=>
    canonNum(x.num) !== canonNum(hq) &&
    !["work_hq","work_phone","hq","office","corporate"].includes(x.type) &&
    (x.type === "mobile" || isLikelyMobilePhoneNumber(x.num)) &&
    !isLikelyCorporatePhoneNumber(x.num)
  )?.num || "";
  const others = dedup.filter((x)=> canonNum(x.num) !== canonNum(mobile) && canonNum(x.num) !== canonNum(hq)).map((x)=> x.num);
  const second = others[0] || "";
  return { mobile, second, hq, others };
};
const pickEmailsPlain = (raw) => {
  const src = Array.isArray(raw.contact__all_emails) ? raw.contact__all_emails : (Array.isArray(raw.contact__emails) ? raw.contact__emails : []);
  const list = [];
  src.forEach((e)=>{ const addr = e?.email || e?.sanitized_email; if (!addr) return; list.push({ email: addr, status: e?.verificationStatus || e?.status || raw.email_status || "" }); });
  if (!list.length && typeof raw.email === "string" && raw.email.trim()) {
    raw.email.split(/[;,]+/).map((s)=>s.trim()).filter(Boolean).forEach((em)=> list.push({ email: em, status: raw.email_status || "" }));
  }
  return list;
};
const getOrgFieldValue = (h, raw) => {
  const header = String(h);
  if (header === "First Name") return (raw.name||"").split(" ")[0] || "";
  if (header === "Last Name") return (raw.name||"").split(" ").slice(1).join(" ") || "";
  if (header === "Job Title" || header === "Title") return raw.title || raw.current_positions?.[0]?.role || "";
  if (header === "Company" || header === "Company Name") return raw.company || raw.current_positions?.[0]?.company || "";
  if (header === "Email") {
    const list = pickEmailsPlain(raw);
    const firstBiz = list.find((e)=> e.email && !String(e.email).includes("@gmail."));
    return (firstBiz?.email || list[0]?.email || "");
  }
  if (header === "Email Status") {
    const list = pickEmailsPlain(raw);
    return (list[0]?.status || "");
  }
  if (header === "Business Email 1" || header === "Business Email 1 Status" || header === "Business Email 2" || header === "Business Email 2 Status" || header === "Personal Email 1" || header === "Personal Email 1 Status" || header === "Personal Email 2" || header === "Personal Email 2 Status") {
    const src = pickEmailsPlain(raw);
    const personalDomains = ["gmail.com","yahoo.com","hotmail.com","outlook.com","icloud.com","live.com","mail.com"];
    const isPersonal = (email) => personalDomains.includes(String(email).split("@")[1]?.toLowerCase() || "");
    const biz = src.filter((x)=> !isPersonal(x.email));
    const per = src.filter((x)=> isPersonal(x.email));
    const map = {
      "Business Email 1": biz[0]?.email || "",
      "Business Email 1 Status": biz[0]?.status || "",
      "Business Email 2": biz[1]?.email || "",
      "Business Email 2 Status": biz[1]?.status || "",
      "Personal Email 1": per[0]?.email || "",
      "Personal Email 1 Status": per[0]?.status || "",
      "Personal Email 2": per[1]?.email || "",
      "Personal Email 2 Status": per[1]?.status || "",
    };
    return map[header] || "";
  }
  if (header === "Mobile Phone" || header === "Phone") return pickPhonesPlain(raw).mobile || "";
  if (header === "Second Phone") return pickPhonesPlain(raw).second || "";
  if (header === "Other Numbers 1") return (pickPhonesPlain(raw).others || [])[1] || "";
  if (header === "Corporate Phone") return pickPhonesPlain(raw).hq || "";
  if (header === "# Employees" || header === "Employees") {
    if (raw.company_headcount) return raw.company_headcount;
    if (raw.employees) return raw.employees;
    if (raw['# Employees']) return raw['# Employees'];
    if (Array.isArray(raw.current_employee_count) && raw.current_employee_count.length > 0) return raw.current_employee_count.join("-");
    if (raw.current_employee_count && !Array.isArray(raw.current_employee_count)) return raw.current_employee_count;
    if (Array.isArray(raw.employee_count) && raw.employee_count.length > 0) return raw.employee_count.join("-");
    if (raw.employee_count && !Array.isArray(raw.employee_count)) return raw.employee_count;
    return "";
  }
  if (header === "Industry") {
    let arr = raw.organization__industry;
    if (!arr || (Array.isArray(arr) && arr.length === 0)) arr = raw.organization__industries;
    if (!arr || (Array.isArray(arr) && arr.length === 0)) arr = raw.industry;
    if (!arr || (Array.isArray(arr) && arr.length === 0)) {
      const pos0 = Array.isArray(raw.current_positions) ? raw.current_positions[0] : null;
      arr = pos0 ? pos0.industry : null;
    }
    return Array.isArray(arr) ? arr.join("; ") : (arr || "");
  }
  if (header === "Keywords") {
    let kws = raw.keywords;
    if (!kws || (Array.isArray(kws) && kws.length === 0)) kws = raw.organization__keywords;
    return Array.isArray(kws) ? kws.join("; ") : (kws || "");
  }
  if (header === "Person LinkedIn URL" || header === "Linkedin Url") return raw.public_profile_url || raw.linkedin_url || "";
  if (header === "Website") return raw.organization__website || "";
  if (header === "Company Linkedin Url") return raw.organization__linkedin_url || "";
  if (header === "Facebook Url") return raw.organization__facebook_url || "";
  if (header === "Twitter Url") return raw.organization__twitter_url || "";
  if (header === "City") return String(raw.location||"").split(",").map(s=>s.trim())[0] || "";
  if (header === "Country") return String(raw.location||"").split(",").map(s=>s.trim())[2] || "";
  if (header === "Company Address" || header === "Address") return raw.company_address || raw.organization__address || raw.address || "";
  if (header === "Company City") return raw.company_city || raw.organization__city || raw.city || "";
  if (header === "Company State") return raw.company_state || raw.organization__state || raw.state || "";
  if (header === "Company Country") return raw.company_country || raw.organization__country || raw.country || "";
  if (header === "Company Street") return raw.company_street || raw.organization__street || "";
  if (header === "Company Postal Code") return raw.company_postal_code || raw.organization__postal_code || raw.postal_code || "";
  if (header === "Company Phone") return raw.organization__phone || raw.company_phone || raw.phone || "";
  if (header === "Short Description") return raw.short_description || raw.organization__short_description || raw.description || "";
  if (header === "Founded Year") return raw.founded_year || raw.organization__founded_year || raw.founded_at || "";
    if (header === "Technologies") {
      let techs = raw.organization__current_technologies;
      if (!techs || (Array.isArray(techs) && techs.length === 0)) techs = raw.organization__technologies;
      if (!techs || (Array.isArray(techs) && techs.length === 0)) techs = raw.technologies;
      return Array.isArray(techs) ? techs.join("; ") : (techs || "");
    }
    if (header === "Annual Revenue") return raw.annual_revenue || raw.organization__annual_revenue || "";
    if (header === "Total Funding") return raw.total_funding || raw.organization__total_funding || "";
  if (header === "Latest Funding") return raw.latest_funding || raw.organization__latest_funding || "";
  if (header === "Latest Funding Amount") return raw.latest_funding_amount || raw.organization__latest_funding_amount || "";
  if (header === "Last Raised At") return raw.last_raised_at || raw.organization__last_raised_at || "";
  if (header === "Seniority") return raw.seniority || "";
  if (header === "Departments") {
    let arr = raw.departments;
    if (!arr || (Array.isArray(arr) && arr.length === 0)) arr = raw.job_function;
    if (!arr || (Array.isArray(arr) && arr.length === 0)) {
      const pos0 = Array.isArray(raw.current_positions) ? raw.current_positions[0] : null;
      arr = pos0 ? pos0.function : null;
    }
    if (!arr || (Array.isArray(arr) && arr.length === 0)) arr = raw.function;
    if (!arr || (Array.isArray(arr) && arr.length === 0)) arr = raw.department;
    if (!arr || (Array.isArray(arr) && arr.length === 0)) arr = raw.seniority;
    return Array.isArray(arr) ? arr.join("; ") : (arr || "");
  }
  if (header === "Public Identifier") return raw.public_identifier || "";
  if (header === "Headers") {
    const h = raw.__headers;
    if (Array.isArray(h)) return h.join("; ");
    return h ? JSON.stringify(h) : "";
  }
  if (header === "Original") {
    const o = raw.__original;
    if (o && typeof o === 'object') return JSON.stringify(o);
    return o || "";
  }
  if (header === "Source") {
    const src = String(raw.audit__source || "").toLowerCase();
    return src === 'extension' ? 'Extension' : (src === 'enrichment' ? 'Enrichment' : (src === 'search' ? 'Search' : ''));
  }
  return raw[header] || "";
};
