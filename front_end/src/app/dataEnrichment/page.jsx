"use client";
import React, { useMemo, useRef, useState } from "react";
import axios from "axios";
import Button from "@/components/shared/Button";
import Modal from "@/components/shared/Modal";
import Dropdown from "@/components/shared/Dropdown";
import { ChevronDown } from "lucide-react";
import Pagination from "@/components/shared/Pagination";
import DashboardContainer from "@/components/dashboardLayoutContainer";
import Swal from "sweetalert2";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { useReveal } from "@/contexts/RevealContext";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
  headers: { Accept: "application/json" },
});

// --- helpers ---
const isLikelyLinkedIn = (s) =>
  typeof s === "string" && /linkedin\.com\/in\//i.test(s);

const extractUrlsFromCsv = (text) => {
  const urls = [];
  const regex = /([a-zA-Z0-9.-]*linkedin\.com\/in\/[^\s,"]+)/gi;
  let m;
  while ((m = regex.exec(text)) !== null) {
    let url = m[1].trim();
    if (!url.startsWith('http')) {
      url = `https://${url}`;
    }
    if (isLikelyLinkedIn(url)) urls.push(url);
  }
  return Array.from(new Set(urls));
};

const fmtDate = (d) => {
  if (!d) return "";
  try {
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return String(d);
    const y = dt.getUTCFullYear();
    const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
  } catch {
    return String(d);
  }
};

const jobLine = (job) => {
  if (!job) return "";
  const title = job.title || "Role";
  const comp = job.companyName || "Company";
  const start = fmtDate(job.startDate);
  const end = job.current ? "present" : fmtDate(job.endDate) || "";
  const range = start || end ? ` (${start} – ${end})` : "";
  return `${title} @ ${comp}${range}`;
};

// --- mapping Mawsool -> row model your table expects ---
const normalizeRecord = (o) => {
  if (!o || typeof o !== "object") return null;
  const profileUrl =
    o.contact__linkedin_url ||
    o.linkedin_url_searched ||
    o.url ||
    o.profile_url ||
    "";
  const profileName =
    o.contact__name ||
    [o.contact__first_name, o.contact__last_name].filter(Boolean).join(" ") ||
    "Profile";
  const photoUrl = o.contact__photo_url || o.photo || o.avatar || o.image_url;
  let company =
    o.contact__organization_name ||
    (Array.isArray(o.employmentHistory)
      ? (o.employmentHistory.find((j) => j.current) || o.employmentHistory[0])
          ?.companyName
      : null) ||
    o.organization__city ||
    o.organization__short_description ||
    "N/A";
  const locationParts = [
    o.contact__city,
    o.contact__state,
    o.contact__country,
  ].filter(Boolean);
  const location = locationParts.length ? locationParts.join(", ") : "N/A";
  const summary =
    o.contact__headline || o.organization__short_description || "N/A";
  const emails = [];
  if (Array.isArray(o.contact__all_emails)) {
    o.contact__all_emails.forEach((e) => {
      if (e?.email) {
        emails.push({
          email: e.email,
          verificationStatus: e.verificationStatus || "unknown",
          score: e.score || null,
        });
      }
    });
  } else if (o.contact__email) {
    emails.push({
      email: o.contact__email,
      verificationStatus: o.contact__email_status || "unknown",
      score: null,
    });
  }
  let phones = null;
  if (Array.isArray(o.contact__phone_numbers)) {
    phones = o.contact__phone_numbers.map((p) => ({
      number: p?.sanitized_number || p?.raw_number,
      type: p?.type || "unknown",
    })).filter((p) => p.number);
  }
  let currentJob =
    o.contact__title ||
    (Array.isArray(o.employmentHistory)
      ? jobLine(o.employmentHistory.find((j) => j.current))
      : null) ||
    "N/A";
  let jobHistory = null;
  if (Array.isArray(o.employmentHistory) && o.employmentHistory.length) {
    jobHistory = o.employmentHistory.map(jobLine).filter(Boolean);
    if (!o.contact__organization_name) {
      const cur = o.employmentHistory.find((j) => j.current);
      if (cur?.companyName) company = cur.companyName;
    }
  }
  const status = o.status || "unknown";
  const creditsRemaining =
    typeof o.creditsRemaining === "number" ? o.creditsRemaining : null;
  const apiMessage = o.message || "";
  const normalized = {
    profileUrl,
    profileName,
    photoUrl,
    company,
    location,
    summary,
    emails,
    status,
    creditsRemaining,
    phones,
    currentJob,
    jobHistory,
    apiMessage,
    _phone_revealed: o._phone_revealed,
  };
  return normalized;
};

const toCsv = (rows) => {
  const headers = [
    "profileUrl",
    "profileName",
    "company",
    "location",
    "summary",
    "emails",
    "phones",
    "currentJob",
    "jobHistory",
  ];
  const esc = (v) => {
    const s = Array.isArray(v)
      ? v.join("; ")
      : v === undefined || v === null
      ? ""
      : String(v);
    return `"${s.replace(/"/g, '""')}"`;
  };
  const lines = [
    headers.join(","),
    ...rows.map((r) => {
      const emailStrings = Array.isArray(r.emails)
        ? r.emails.map((e) =>
            e.score
              ? `${e.email} ${e.verificationStatus} (Score: ${e.score})`
              : `${e.email} ${e.verificationStatus}`
          )
        : [];
      const phoneStrings = Array.isArray(r.phones)
        ? r.phones.map((p) => `${p.number} (${p.type})`)
        : [];
      return [
        r.profileUrl,
        r.profileName,
        r.company,
        r.location,
        r.summary,
        emailStrings.join("; ") || "",
        phoneStrings.join("; ") || "",
        r.currentJob,
        Array.isArray(r.jobHistory)
          ? r.jobHistory.join(" | ")
          : r.jobHistory || "",
      ]
        .map(esc)
        .join(",");
    }),
  ];
  return lines.join("\n");
};

const toFilteredJson = (rows) => {
  return rows.map((r) => ({
    profileUrl: r.profileUrl,
    profileName: r.profileName,
    company: r.company,
    location: r.location,
    summary: r.summary,
    emails: r.emails,
    phones: r.phones,
    currentJob: r.currentJob,
    jobHistory: r.jobHistory,
  }));
};

const Arrow = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="12"
    height="12"
    viewBox="0 0 12 12"
    fill="none"
  >
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M3.85983 6.85983C4.00628 6.71339 4.24372 6.71339 4.39017 6.85983L6 8.46967L7.60984 6.85983C7.75628 6.71339 7.99372 6.71339 8.14016 6.85983C8.28661 7.00628 8.28661 7.24372 8.14016 7.39017L6.26516 9.26516C6.11872 9.41161 5.88128 9.41161 5.73484 9.26516L3.85983 7.39017C3.71339 7.24372 3.71339 7.00628 3.85983 6.85983Z"
      fill="#242E2C"
    />
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M3.85983 5.14017C4.00628 5.28661 4.24372 5.28661 4.39017 5.14017L6 3.53033L7.60984 5.14017C7.75628 5.28661 7.99372 5.28661 8.14016 5.14017C8.28661 4.99372 8.28661 4.75628 8.14016 4.60983L6.26516 2.73484C6.11872 2.58839 5.88128 2.58839 5.73484 2.73484L3.85983 4.60983C3.71339 4.75628 3.71339 4.99372 3.85983 5.14017Z"
      fill="#242E2C"
    />
  </svg>
);

const Linkedin = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M13.8182 0H2.18182C0.976833 0 0 0.976833 0 2.18182V13.8182C0 15.0232 0.976833 16 2.18182 16H13.8182C15.0232 16 16 15.0232 16 13.8182V2.18182C16 0.976833 15.0232 0 13.8182 0Z"
      fill="#0A66C2"
    />
    <path
      d="M5.76341 4.36364C5.76341 4.63334 5.68343 4.89698 5.53359 5.12123C5.38375 5.34548 5.17078 5.52026 4.92161 5.62347C4.67244 5.72668 4.39826 5.75369 4.13374 5.70107C3.86922 5.64845 3.62624 5.51858 3.43553 5.32787C3.24483 5.13717 3.11495 4.89419 3.06234 4.62967C3.00972 4.36515 3.03672 4.09097 3.13993 3.8418C3.24314 3.59262 3.41793 3.37965 3.64217 3.22981C3.86642 3.07998 4.13007 3 4.39977 3C4.76143 3 5.10828 3.14367 5.36401 3.3994C5.61974 3.65513 5.76341 4.00198 5.76341 4.36364ZM5.45432 6.63636V12.6609C5.45456 12.7054 5.44601 12.7494 5.42917 12.7905C5.41232 12.8317 5.38752 12.8691 5.35618 12.9006C5.32483 12.9321 5.28757 12.9571 5.24653 12.9742C5.20549 12.9912 5.16149 13 5.11704 13H3.67977C3.63533 13.0001 3.5913 12.9915 3.55021 12.9745C3.50913 12.9575 3.4718 12.9326 3.44037 12.9012C3.40894 12.8698 3.38404 12.8325 3.36709 12.7914C3.35013 12.7503 3.34147 12.7063 3.34159 12.6618V6.63636C3.34159 6.54667 3.37722 6.46065 3.44064 6.39723C3.50406 6.33381 3.59008 6.29818 3.67977 6.29818H5.11704C5.20658 6.29842 5.29236 6.33416 5.35559 6.39755C5.41881 6.46095 5.45432 6.54683 5.45432 6.63636ZM12.967 9.77273V12.6891C12.9672 12.73 12.9592 12.7704 12.9436 12.8082C12.928 12.846 12.9051 12.8803 12.8762 12.9092C12.8474 12.9381 12.813 12.961 12.7753 12.9766C12.7375 12.9922 12.697 13.0001 12.6561 13H11.1107C11.0698 13.0001 11.0293 12.9922 10.9916 12.9766C10.9538 12.961 10.9195 12.9381 10.8906 12.9092C10.8617 12.8803 10.8388 12.846 10.8232 12.8082C10.8076 12.7704 10.7997 12.73 10.7998 12.6891V9.86273C10.7998 9.44091 10.9234 8.01545 9.69704 8.01545C8.74704 8.01545 8.55341 8.99091 8.51522 9.42909V12.6891C8.51523 12.7708 8.4831 12.8492 8.42577 12.9073C8.36845 12.9655 8.29053 12.9988 8.20886 13H6.71613C6.67535 13 6.63496 12.992 6.59729 12.9763C6.55962 12.9607 6.52541 12.9378 6.49661 12.9089C6.46781 12.88 6.44499 12.8457 6.42947 12.808C6.41394 12.7703 6.40601 12.7299 6.40613 12.6891V6.61C6.40601 6.56921 6.41394 6.52881 6.42947 6.49109C6.44499 6.45337 6.46781 6.41909 6.49661 6.39021C6.52541 6.36133 6.55962 6.33841 6.59729 6.32277C6.63496 6.30714 6.67535 6.29909 6.71613 6.29909H8.20886C8.29132 6.29909 8.3704 6.33185 8.42871 6.39015C8.48701 6.44846 8.51977 6.52754 8.51977 6.61V7.13545C8.8725 6.60636 9.39522 6.19818 10.5107 6.19818C12.9816 6.19818 12.967 8.50545 12.967 9.77273Z"
      fill="white"
    />
  </svg>
);

const DataEnrichment = () => {
  const { credits, personalCredits, creditScope, updateCredits, isAuthenticated } = useAuth();
  const revealCtx = useReveal();
  const [urlsInput, setUrlsInput] = useState("");
  const [rawJson, setRawJson] = useState([]);
  const [loading, setLoading] = useState(false);
  const [revealLoading, setRevealLoading] = useState({});
  const [searchFilter, setSearchFilter] = useState("");
  const fileRef = useRef(null);
  const [enrichModalOpen, setEnrichModalOpen] = useState(false);
  const [enrichChoice, setEnrichChoice] = useState("email,phone");
  const [completedCount, setCompletedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const router = useRouter();
  const [selected, setSelected] = useState({});
  const selectedCount = Object.values(selected).filter(Boolean).length;
  const [listModalOpen, setListModalOpen] = useState(false);
  const [lists, setLists] = useState([]);
  const [listsLoading, setListsLoading] = useState(false);
  const [selectedListId, setSelectedListId] = useState(null);
  const [newListName, setNewListName] = useState("");
  const [creatingList, setCreatingList] = useState(false);
  const [addingItems, setAddingItems] = useState(false);
  const selectAllRef = useRef(null);
  const [autoSaveMap, setAutoSaveMap] = useState({});
  const [failedItems, setFailedItems] = useState([]); // State for failed/empty URLs

  const toggleSelect = (profileUrl) => {
    setSelected((prev) => ({ ...prev, [profileUrl]: !prev[profileUrl] }));
  };

  const isSelected = (profileUrl) => !!selected[profileUrl];

  const findOriginalByProfileUrl = (profileUrl) => {
    const arr = toArray(rawJson);
    const hit = arr.find((o) => {
      const u =
        o.contact__linkedin_url ||
        o.linkedin_url_searched ||
        o.url ||
        o.profile_url ||
        "";
      return String(u).trim() === String(profileUrl).trim();
    });
    return hit || null;
  };

  const loadLists = async () => {
    try {
      setListsLoading(true);
      const res = await api.get("/api/list/");
      setLists(Array.isArray(res.data) ? res.data : []);
    } catch {
      setLists([]);
    } finally {
      setListsLoading(false);
    }
  };

  const handleCreateList = async () => {
    if (!newListName.trim()) return;
    try {
      setCreatingList(true);
      const res = await api.post("/api/list/create/extension", { name: newListName.trim(), listType: "people" });
      const created = res?.data?.list;
      if (created) {
        setLists((prev) => [created, ...prev]);
        setSelectedListId(created._id);
        setNewListName("");
      }
    } catch (err) {
      Swal.fire({ title: "Error", text: err?.response?.data?.msg || "Failed to create list", imageUrl: "/icons/mawsool-error.webp", imageAlt: "Error", confirmButtonText: "OK", customClass: { confirmButton: "swal-confirm-button" } });
    } finally {
      setCreatingList(false);
    }
  };

  const handleOpenListModal = async () => {
    await loadLists();
    setListModalOpen(true);
  };

  const normalizeToListRaw = (raw) => {
    const safe = raw || {};
    const nameSource = safe.contact__name || safe.name || "";
    const nameTokens = nameSource ? nameSource.split(/[•\s]+/).filter(Boolean) : [];
    const first = safe.contact__first_name || nameTokens[0] || "";
    const last = safe.contact__last_name || (nameTokens.length > 1 ? nameTokens[nameTokens.length - 1] : "");
    const headline = safe.contact__headline || "";
    const city = safe.contact__city || "";
    const state = safe.contact__state || "";
    const country = safe.contact__country || "";
    const location = [city, state, country].filter(Boolean).join(", ");
    const photo = safe.contact__photo_url || safe.photo || safe.avatar || safe.image_url || "";
    const linkedinUrl = safe.contact__linkedin_url || safe.profile_url || safe.url || "";
    const publicProfileUrl = safe.public_profile_url || linkedinUrl;
    const profileUrl = safe.profile_url || safe.url || linkedinUrl;
    const industry = Array.isArray(safe.contact__industry)
      ? safe.contact__industry
      : (Array.isArray(safe.organization__industry)
        ? safe.organization__industry
        : (Array.isArray(safe.organization__industries)
          ? safe.organization__industries
          : []));
    const emailListAll = Array.isArray(safe.contact__all_emails) ? safe.contact__all_emails : (Array.isArray(safe.contact__emails) ? safe.contact__emails : []);
    const emailStatusRaw = safe.contact__email_status || (emailListAll.find((e)=>e?.verificationStatus)?.verificationStatus) || "";
    const emailPrimary = emailListAll.find((e)=>e?.email)?.email || safe.contact__email || "";
    const phonesArr = Array.isArray(safe.contact__phone_numbers) ? safe.contact__phone_numbers : (Array.isArray(safe.contact__phones) ? safe.contact__phones : (Array.isArray(safe.phones) ? safe.phones : []));
    const phone1 = phonesArr[0] ? (phonesArr[0].sanitized_number || phonesArr[0].raw_number || "") : "";
    const phone1Type = phonesArr[0]?.type || "";
    const phone2 = phonesArr[1] ? (phonesArr[1].sanitized_number || phonesArr[1].raw_number || "") : "";
    const phone2Type = phonesArr[1]?.type || "";
    const companyFromCurrent = Array.isArray(safe.employmentHistory) ? (safe.employmentHistory.find((j)=>j.current)?.companyName || safe.employmentHistory[0]?.companyName) : "";
    const roleFromCurrent = Array.isArray(safe.employmentHistory) ? (safe.employmentHistory.find((j)=>j.current)?.title || safe.employmentHistory[0]?.title) : "";
    const title = safe.contact__title || roleFromCurrent || "";
    const company = safe.contact__organization_name || companyFromCurrent || (typeof safe.company === "string" ? safe.company : "");
    const currentPositions = Array.isArray(safe.employmentHistory) ? safe.employmentHistory.map((j)=>({ company: j?.companyName || "", role: j?.title || "", startDate: j?.startDate || "", endDate: j?.endDate || "", current: !!j?.current })) : (Array.isArray(safe.current_positions) ? safe.current_positions : []);
    const idFromUrl = linkedinUrl ? (linkedinUrl.split("/").filter(Boolean).pop() || "") : "";
    const mapStatus = (s) => {
      const v = String(s || "").toLowerCase();
      if (v === "deliverable") return "Verified A+";
      if (v === "valid") return "Valid B+";
      if (v === "undeliverable" || v === "unknown") return "Unverified";
      return s || "";
    };
    const normalized = {
      first_name: first || "N/A",
      last_name: last || "N/A",
      headline: headline || "N/A",
      location: location || "N/A",
      profile_picture_url: photo || "",
      linkedin_url: linkedinUrl || "",
      public_profile_url: publicProfileUrl || "",
      profile_url: profileUrl || "",
      industry: industry,
      email: emailPrimary || "",
      email_status: mapStatus(emailStatusRaw) || "N/A",
      phone: phone1 ? `${phone1}${phone1Type ? " (" + phone1Type + ")" : ""}` : "",
      second_phone: phone2 ? `${phone2}${phone2Type ? " (" + phone2Type + ")" : ""}` : "",
      title: title || "N/A",
      company: company || "N/A",
      current_positions: currentPositions,
      id: idFromUrl || "",
      name: nameSource || "",
      contact__all_emails: Array.isArray(safe.contact__all_emails)
        ? safe.contact__all_emails
        : (Array.isArray(safe.contact__emails) ? safe.contact__emails : []),
      contact__phone_numbers: Array.isArray(safe.contact__phone_numbers)
        ? safe.contact__phone_numbers
        : (Array.isArray(safe.contact__phones) ? safe.contact__phones : []),
    };
    return normalized;
  };

  const buildItemPayloadFromRaw = (raw, url, includePhones = false) => {
    const mappedRaw = normalizeToListRaw(raw);
    const safe = raw || {};
    
    // Logic for Phone:
    // If includePhones is ON and no phone is found -> save as "Not available"
    // If includePhones is OFF -> leave empty (triggers Reveal button)
    let phoneToSave = mappedRaw.phone;
    let secondPhoneToSave = mappedRaw.second_phone;
    
    if (includePhones) {
        if (!phoneToSave) phoneToSave = "Not available";
    }

    // Logic for Email:
    // If no email is found -> always save as "Not available" (since enrichment always tries email)
    let emailToSave = mappedRaw.email;
    if (!emailToSave) emailToSave = "Not available";

    return {
      ...mappedRaw,
      linkedin_url: mappedRaw.linkedin_url || url,
      public_profile_url: mappedRaw.public_profile_url || url,
      profile_url: mappedRaw.profile_url || url,
      id: mappedRaw.id || "",
      person_id: mappedRaw.id || "",
      phone: phoneToSave,
      second_phone: secondPhoneToSave,
      email: emailToSave,
      seniority: mappedRaw.seniority || safe?.seniority || "",
      function: mappedRaw.function || (Array.isArray(safe?.functions) ? safe.functions[0] : (Array.isArray(safe?.departments) ? safe.departments[0] : "")),
      organization__industry: mappedRaw.organization__industry || mappedRaw.industry || safe?.organization__industry || safe?.organization__industries || safe?.contact__industry || [],
      company_headcount: mappedRaw.company_headcount || safe?.company_headcount || safe?.organization__estimated_num_employees || "",
      keywords: mappedRaw.keywords || safe?.organization__keywords || safe?.keywords || [],
      organization__website: mappedRaw.organization__website || safe?.organization__website || safe?.organization__website_url || safe?.website || "",
      organization__linkedin_url: mappedRaw.organization__linkedin_url || safe?.organization__linkedin_url || "",
      organization__facebook_url: mappedRaw.organization__facebook_url || safe?.organization__facebook_url || "",
      organization__twitter_url: mappedRaw.organization__twitter_url || safe?.organization__twitter_url || "",
      organization__address: mappedRaw.organization__address || safe?.organization__address || safe?.organization__raw_address || "",
      organization__city: mappedRaw.organization__city || safe?.organization__city || "",
      organization__state: mappedRaw.organization__state || safe?.organization__state || "",
      organization__country: mappedRaw.organization__country || safe?.organization__country || "",
      organization__technologies: mappedRaw.organization__technologies || safe?.organization__current_technologies || safe?.organization__technologies || [],
      organization__founded_year: mappedRaw.organization__founded_year || safe?.organization__founded_year || "",
      organization__annual_revenue: mappedRaw.annual_revenue || safe?.organization__annual_revenue || "",
      organization__total_funding: mappedRaw.organization__total_funding || safe?.organization__total_funding || "",
      organization__latest_funding: mappedRaw.organization__latest_funding || safe?.organization__latest_funding || safe?.organization__latest_funding_stage || "",
      organization__latest_funding_amount: mappedRaw.organization__latest_funding_amount || safe?.organization__latest_funding_amount || "",
      organization__last_raised_at: mappedRaw.organization__last_raised_at || safe?.organization__last_raised_at || safe?.organization__latest_funding_round_date || "",
      contact__all_emails: mappedRaw.contact__all_emails || safe?.contact__all_emails || safe?.contact__emails || [],
      contact__phone_numbers: mappedRaw.contact__phone_numbers || safe?.contact__phone_numbers || [],
      public_identifier: mappedRaw.id || "",
      audit__source: 'enrichment',
      audit__timestamp: new Date().toISOString(),
    };
  };

  const buildItemsPayload = () => {
    const selectedUrls = rows.filter((r) => isSelected(r.profileUrl)).map((r) => r.profileUrl);
    const items = selectedUrls.map((url) => {
      const raw = findOriginalByProfileUrl(url);
      return buildItemPayloadFromRaw(raw, url);
    });
    return items;
  };

  const handleConfirmAddToList = async () => {
    try {
      setAddingItems(true);
      let targetListId = selectedListId;
      if (!targetListId || targetListId === "__CREATE__") {
        const name = (newListName || '').trim();
        if (!name) {
          setAddingItems(false);
          return;
        }
        const createdRes = await api.post("/api/list/create/extension", { name, listType: "people" });
        const created = createdRes?.data?.list;
        if (!created || !created._id) throw new Error("Failed to create list");
        targetListId = created._id;
        setLists((prev) => [created, ...prev]);
        setSelectedListId(created._id);
        setNewListName("");
      }
      const items = buildItemsPayload();
      const batchSize = 8;
      let totalAdded = 0;
      for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        const res = await api.post(`/api/list/add/${targetListId}/items`, batch);
        totalAdded += res?.data?.added || batch.length;
      }
      setListModalOpen(false);
      setSelected({});
      Swal.fire({ title: "Success", text: `Added ${totalAdded} item(s)`, imageUrl: "/icons/mawsool-success.webp", imageAlt: "Success", timer: 1500, showConfirmButton: false });
    } catch (err) {
      Swal.fire({ title: "Error", text: err?.response?.data?.msg || "Failed to add to list", imageUrl: "/icons/mawsool-error.webp", imageAlt: "Error", confirmButtonText: "OK", customClass: { confirmButton: "swal-confirm-button" } });
    } finally {
      setAddingItems(false);
    }
  };

  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const handleReveal = async (item) => {
    if (!item.profileUrl) return;
    const key = item.profileUrl + "-phone";
    setRevealLoading((prev) => ({ ...prev, [key]: true }));

    try {
        if (!isAuthenticated) throw new Error("Login to reveal");
        const availableCredits = typeof credits === "number" ? (creditScope === "org" ? (credits + personalCredits) : credits) : 999999;
        if (availableCredits < 20) throw new Error("Insufficient credits (20 required)");

        // 1. Fetch data
        const url = `${process.env.NEXT_PUBLIC_API_URL}/api/mawsool/contact?url=${encodeURIComponent(item.profileUrl)}&fields=phone`;
        let attempts = 0;
        let res;
        while (attempts < 3) {
            attempts++;
            try {
                // Use relative URL to hit Next.js API route instead of backend directly
                res = await axios.get(url, {
                    headers: { accept: "application/json" },
                    validateStatus: () => true,
                    withCredentials: true,
                    timeout: 30000,
                });
                if (res.status === 200 && res.data.status === "success") break;
                if (res.data.status === "processing") attempts = 0;
            } catch (err) {}
            if (attempts < 3) await delay(8000);
            else throw new Error("Failed to fetch phone data");
        }

        const data = res.data;
        const phones = data.contact__phone_numbers || [];
        
        // 2. Bundle/Deduct credits
        const phoneString = phones.map((p) => `${p.sanitized_number || p.raw_number} (${p.type || ""})`).filter(Boolean).join(',') || "Not available";
        
        const bundleRes = await api.post("/api/reveal/bundle-search", {
            phone: phoneString,
            email: "Not available", // We are only revealing phone here
            profileUrl: item.profileUrl,
            types: ['phone']
        });

        if (bundleRes.data?.pending) {
            throw new Error(bundleRes.data?.message || "Verification pending");
        }

        if (typeof bundleRes.data?.creditsLeft === 'number') {
            await updateCredits(bundleRes.data.creditsLeft);
        }

        // 3. Update Global Context
        revealCtx.markRevealed(item.profileUrl, "phone");

        // 4. Update Local Table State (rawJson)
        setRawJson((prev) => {
            return prev.map((row) => {
                const u = row.contact__linkedin_url || row.linkedin_url_searched || row.url || row.profile_url || "";
                if (u === item.profileUrl) {
                    return {
                        ...row,
                        contact__phone_numbers: phones,
                        // Mark that we tried to reveal phone, so we don't show button again if empty
                        _phone_revealed: true 
                    };
                }
                return row;
            });
        });

        if (!phones.length) {
             Swal.fire({ toast: true, position: 'top-end', title: "No phone found", icon: "info", timer: 2000, showConfirmButton: false });
        } else {
             Swal.fire({ toast: true, position: 'top-end', title: "Phone revealed", icon: "success", timer: 2000, showConfirmButton: false });
             
             // Trigger auto-save to "revealed-search-results" list to persist the phone
             try {
                // We use item.profileUrl directly since that's what we have
                const keyUrl = item.profileUrl;
                
                // Construct a temporary listToAdd array with the updated data (including phones)
                // We need to merge the newly found phones into the original item structure
                const updatedItem = {
                    ...item,
                    contact__phone_numbers: phones,
                    // Ensure we have the raw structure expected by buildItemPayloadFromRaw
                    // If 'item' is already normalized, we might need to be careful. 
                    // However, findOriginalByProfileUrl uses rawJson, so let's use that.
                    // Wait, 'item' passed to handleReveal is from 'filteredRows', which is normalized.
                    // We should find the raw record first.
                };

                const rawRecord = findOriginalByProfileUrl(keyUrl);
                if (rawRecord) {
                    // Update raw record with new phones
                    const newRaw = { ...rawRecord, contact__phone_numbers: phones };
                    
                    const created = await api.post("/api/list/create/revealed-search-results", {});
                    const special = created?.data?.list;
                    
                    if (special && special._id) {
                        // Pass true for includePhones to ensure phone is saved (not "Not available")
                        const payload = buildItemPayloadFromRaw(newRaw, keyUrl, true);
                        const resAdd = await api.post(`/api/list/add-special/${special._id}/items`, [payload]);
                        
                        setAutoSaveMap((prev)=> ({ ...prev, [keyUrl]: (resAdd?.data?.added ? 'saved' : 'updated') }));
                    }
                }
             } catch (e) {
                 console.error("Auto-save after reveal failed", e);
             }
        }

    } catch (err) {
        Swal.fire({
            title: "Error",
            text: err.message || "Failed to reveal phone",
            icon: "error",
            confirmButtonText: "OK",
            customClass: { confirmButton: "swal-confirm-button" }
        });
    } finally {
        setRevealLoading((prev) => ({ ...prev, [key]: false }));
    }
  };

  const rows = useMemo(() => {
    const list = Array.isArray(rawJson)
      ? rawJson
      : Array.isArray(rawJson?.results)
      ? rawJson.results
      : Array.isArray(rawJson?.data)
      ? rawJson.data
      : Array.isArray(rawJson?.items)
      ? rawJson.items
      : rawJson && typeof rawJson === "object"
      ? [rawJson]
      : [];
    const normalizedRows = list.map(normalizeRecord).filter(Boolean);
    return normalizedRows;
  }, [rawJson]);

  const handleImportCsv = () => fileRef.current?.click();

  const onFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const links = extractUrlsFromCsv(text);
    setUrlsInput(links.join("\n"));
    e.target.value = "";
  };

  const resolveFieldsForApi = (choice) => {
    if (!choice) return undefined;
    const v = String(choice).toLowerCase().replace(/\s/g, "");
    if (v === "email,phone" || v === "phone,email") return "email,phone";
    if (v === "email") return "email";
    if (v === "phone") return "phone";
    return undefined;
  };

  const toArray = (data) => {
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.results)) return data.results;
    if (Array.isArray(data?.data)) return data.data;
    if (Array.isArray(data?.items)) return data.items;
    return data ? [data] : [];
  };

  const fetchOne = async (oneUrl, fieldsChoice) => {
    const fieldsParam = resolveFieldsForApi(fieldsChoice);
    // Increased retries to 6 (approx 48s) to handle slower leads
    const params = { url: oneUrl, retries: 6, retryDelayMs: 8000 };
    if (fieldsParam) params.fields = fieldsParam;
    const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/mawsool/contact`, {
      params,
      validateStatus: () => true,
    });
    if (!res || res.status >= 400) {
      const msg =
        (res?.data && (res.data.error || res.data.message)) ||
        `Request failed (${res?.status})`;
      throw new Error(msg);
    }
    return res.data;
  };

  async function runWithConcurrency(items, worker, maxConcurrent = 3) {
    const queue = items.slice();
    const running = [];
    async function runNext() {
      const item = queue.shift();
      if (!item) return;
      await worker(item);
      await runNext();
    }
    for (let i = 0; i < Math.min(maxConcurrent, items.length); i++) {
      running.push(runNext());
    }
    await Promise.all(running);
  }

  const handleEnrich = async (choice) => {
    let urls = urlsInput
      .split(/\n|,/)
      .map((s) => s.trim())
      .filter((s) => s && isLikelyLinkedIn(s));
      
    // Auto-prepend https:// to raw text input here as well, in case they typed it manually
    urls = urls.map(url => url.startsWith('http') ? url : `https://${url}`);
    
    const perLinkCost = choice === "email,phone" ? 25 : choice === "phone" ? 20 : 5;
    const totalRequired = urls.length * perLinkCost;
    const availableCredits = typeof credits === "number" ? (creditScope === "org" ? (credits + personalCredits) : credits) : 999999;
    if (availableCredits < totalRequired) {
      Swal.fire({
        title: "Insufficient Credits",
        text: `You don't have enough credits to enrich these profiles. A minimum of ${totalRequired} credits is required`,
        imageUrl: "/icons/mawsool-error.webp",
        imageAlt: "Custom alert icon",
        confirmButtonText: "Buy Credits",
        customClass: {
          confirmButton: "swal-confirm-button",
        },
      }).then((result) => {
        if (result.isConfirmed) {
          router.push("/setting/planOverview");
        }
      });
      return;
    }
    try {
      setLoading(true);
      setRawJson([]);
      setFailedItems([]); // Reset failed items
      const savedUrls = new Set();
      setCompletedCount(0);
      setTotalCount(urls.length);
      const failed = [];
      const deferred = []; // Queue for slow/processing leads
      const localFailedItems = []; // Track failures locally
      let savedCount = 0; // Track total successful saves
      let totalCharged = 0;
      let totalEmailsFound = 0;
      let totalPhonesFound = 0;

      // Helper for processing successful results (dedup + save)
      const processEnrichedResult = async (oneUrl, listToAdd) => {
        setRawJson((prev) => {
          const prevArr = Array.isArray(prev) ? prev : [];
          // Mark as phone revealed if we requested phones, so button doesn't show up again
          const augmented = listToAdd.map(item => ({
             ...item,
             _phone_revealed: choice.includes("phone")
          }));
          return [...prevArr, ...augmented];
        });
        // Deduct via server-side dedup using profileUrl
        const norm = normalizeRecord(listToAdd[0]); // Normalize first to get the correct profileUrl
        
        // Mark context
        if (choice.includes("phone")) revealCtx.markRevealed(norm.profileUrl || oneUrl, 'phone');
        if (choice.includes("email")) revealCtx.markRevealed(norm.profileUrl || oneUrl, 'email');

        try {
          const phones = Array.isArray(norm.phones) ? norm.phones.map((p)=>`${p.number}${p.type?` (${p.type})`:""}`).join(',') : "Not available";
          const emails = Array.isArray(norm.emails) ? norm.emails.map((e)=>e.email).join(', ') : "Not available";
          const emailStatusesArray = Array.isArray(norm.emails) ? norm.emails.map((e)=>e.verificationStatus || "") : [];
          
          const typesArray = [];
          if (choice.includes("email")) typesArray.push("email");
          if (choice.includes("phone")) typesArray.push("phone");

          // Count them as found regardless of billing success, since they were retrieved
          if (Array.isArray(norm.emails)) totalEmailsFound += norm.emails.length;
          if (Array.isArray(norm.phones)) totalPhonesFound += norm.phones.length;

          const bundleRes = await api.post("/api/reveal/bundle-search", { 
            phone: phones, 
            email: emails, 
            emailStatuses: emailStatusesArray,
            types: typesArray,
            profileUrl: norm.profileUrl || oneUrl 
          });
          
          if (bundleRes.data?.pending) throw new Error(bundleRes.data?.message || "Verification pending");
          if (typeof bundleRes.data?.creditsLeft === 'number') await updateCredits(bundleRes.data.creditsLeft);
          if (typeof bundleRes.data?.charged === 'number') totalCharged += bundleRes.data.charged;
          
        } catch (e) {
            console.error("Billing/Bundle registration failed:", e);
        }
        // Auto-save to Saved leads list
        try {
          // Use the normalized profileUrl for the saved set and map key, fallback to oneUrl if empty
          const keyUrl = norm.profileUrl || oneUrl;
          
          if (!savedUrls.has(keyUrl)) {
            const created = await api.post("/api/list/create/revealed-search-results", {});
            const special = created?.data?.list;
            if (special && special._id) {
              const raw = listToAdd[0] || {};
              const payload = buildItemPayloadFromRaw(raw, oneUrl, choice.includes("phone"));
              const resAdd = await api.post(`/api/list/add-special/${special._id}/items`, [payload]);
              savedUrls.add(keyUrl);
              // Fix: Use keyUrl (normalized) so it matches the table row key
              setAutoSaveMap((prev)=> ({ ...prev, [keyUrl]: (resAdd?.data?.added ? 'saved' : 'updated') }));
              savedCount++; 
            }
          }
        } catch (e) {
          const keyUrl = norm.profileUrl || oneUrl;
          setAutoSaveMap((prev)=> ({ ...prev, [keyUrl]: 'error' }));
          console.error("Auto-save failed for", oneUrl, e);
        }
      };

      // Helper to check if item has ANY meaningful data (not just email/phone)
      const hasMeaningfulData = (item) => {
        if (!item) return false;
        // Contact info
        if ((Array.isArray(item.contact__all_emails) && item.contact__all_emails.length > 0)) return true;
        if ((Array.isArray(item.contact__phone_numbers) && item.contact__phone_numbers.length > 0)) return true;
        if (item.contact__email || item.contact__phone) return true;
        
        // Profile info
        if (item.contact__name || item.contact__first_name || item.contact__last_name) return true;
        if (item.contact__organization_name || item.contact__headline) return true;
        if (Array.isArray(item.employmentHistory) && item.employmentHistory.length > 0) return true;
        
        return false;
      };

      await runWithConcurrency(
        urls,
        async (oneUrl) => {
          let isDeferred = false;
          try {
            const data = await fetchOne(oneUrl, choice);
            const listToAdd = toArray(data);
            const item = listToAdd[0] || {};

            // VALIDATION: Check for 'processing' or empty data
            const status = String(item.status || item.contact__status || "").toLowerCase();
            const isProcessing = status === 'processing' || status === 'in_progress' || String(item.message || "").toLowerCase().includes('in progress');
            const hasData = hasMeaningfulData(item);
            const isNotFound = status === 'not_found' || status === 'profile_not_found' || status === 'no_profile_found';

            if (isNotFound || (!hasData && !isProcessing)) {
               localFailedItems.push(oneUrl);
               return; 
            }

            if (isProcessing || !hasData) {
                deferred.push(oneUrl);
                isDeferred = true;
                return;
            }

            await processEnrichedResult(oneUrl, listToAdd);

          } catch (e) {
            console.error(`Fetch failed for ${oneUrl}:`, e.message);
            // If it's a 404 or specifically says not found, don't retry, just mark as failed
            if (e.message.includes('404') || e.message.includes('not found') || e.message.includes('Profile not found')) {
              localFailedItems.push(oneUrl);
            } else {
              failed.push(oneUrl);
            }
          } finally {
            if (!isDeferred && !localFailedItems.includes(oneUrl) && !failed.includes(oneUrl)) {
                // We only increment completed count here if it actually succeeded
                // The original code incremented it no matter what, which messed up the progress bar if we deferred
            }
            if (!isDeferred) setCompletedCount((c) => c + 1);
          }
        },
        3
      );

      // --- DEFERRED PASS (Client-side Wait & Retry) ---
      if (deferred.length > 0) {
        Swal.fire({
            toast: true, position: "top-end",
            title: `Waiting 10s for ${deferred.length} pending profiles...`,
            showConfirmButton: false, timer: 10000
        });
        await new Promise((r) => setTimeout(r, 10000));
        
        await runWithConcurrency(deferred, async (oneUrl) => {
              try {
                 const data = await fetchOne(oneUrl, choice);
                 const listToAdd = toArray(data);
                 const item = listToAdd[0] || {};
                 
                 // Check validity again
                 const status = (item.status || "").toLowerCase();
                 const hasData = hasMeaningfulData(item);
                 
                 if (!hasData) {
                    localFailedItems.push(oneUrl);
                 } else {
                    await processEnrichedResult(oneUrl, listToAdd);
                 }
              } catch(e) {
                 // If it fails with exception in deferred pass, treat as failed item
                 localFailedItems.push(oneUrl);
              } finally {
                 setCompletedCount((c) => c + 1);
              }
         }, 3);
       }
       
       // Handle network failures (retries)
       if (failed.length) {
         await new Promise((r) => setTimeout(r, 1200));
         await runWithConcurrency(
           failed,
           async (oneUrl) => {
             try {
               const data = await fetchOne(oneUrl, choice);
               const listToAdd = toArray(data);
               const item = listToAdd[0] || {};
               // Check validity
               const hasData = hasMeaningfulData(item);

               if (!hasData) {
                   localFailedItems.push(oneUrl);
               } else {
                   await processEnrichedResult(oneUrl, listToAdd);
               }
             } catch (e) {
               console.error(`Retry failed for ${oneUrl}:`, e.message);
               localFailedItems.push(oneUrl); // Final failure
             }
           },
           3
         );
       }

       setFailedItems(localFailedItems);
      
       if (savedCount > 0) {
        Swal.fire({
          title: "Success",
          html: `Enrichment complete. <b>${savedCount}</b> lead(s) saved.<br/>
                 Credits deducted: <b>${totalCharged}</b><br/>
                 Found: <b>${totalEmailsFound}</b> email(s) and <b>${totalPhonesFound}</b> phone(s).`,
          imageUrl: "/icons/mawsool-success.webp",
          imageAlt: "Custom alert icon",
          confirmButtonText: "OK",
          customClass: { confirmButton: "swal-confirm-button" },
        });
      }
    } catch (err) {
      console.error("Enrichment error:", err);
      Swal.fire({
        title: "Error",
        text: err.message || "Failed to fetch data",
        imageUrl: "/icons/mawsool-error.webp",
        imageAlt: "Custom alert icon",
        confirmButtonText: "OK",
        customClass: {
          confirmButton: "swal-confirm-button",
        },
      });
    } finally {
      setLoading(false);
    }
  };

  const copyJson = async () => {
    try {
      const filteredData = toFilteredJson(rows);
      await navigator.clipboard.writeText(
        JSON.stringify(filteredData, null, 2)
      );
      Swal.fire({
        title: "Success",
        text: `JSON copied to clipboard`,
        imageUrl: "/icons/mawsool-success.webp",
        imageAlt: "Custom alert icon",
        timer: 1500,
        showConfirmButton: false,
      });
    } catch {
      Swal.fire({
        title: "Error",
        text: "Copy failed",
        imageUrl: "/icons/mawsool-error.webp",
        imageAlt: "Custom alert icon",
        confirmButtonText: "OK",
        customClass: {
          confirmButton: "swal-confirm-button",
        },
      });
    }
  };

  const downloadCsv = () => {
    try {
      const csv = toCsv(rows);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "contacts.csv";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      Swal.fire({
        title: "Error",
        text: "CSV generation failed",
        imageUrl: "/icons/mawsool-error.webp",
        imageAlt: "Custom alert icon",
        confirmButtonText: "OK",
        customClass: {
          confirmButton: "swal-confirm-button",
        },
      });
    }
  };

  const filteredRows = useMemo(() => {
    const q = searchFilter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const hay = [
        r.profileName,
        r.profileUrl,
        r.company,
        r.location,
        r.summary,
        Array.isArray(r.emails) ? r.emails.map((e) => e.email).join(" ") : r.emails,
        Array.isArray(r.phones) ? r.phones.map((p) => `${p.number} ${p.type}`).join(" ") : r.phones,
        r.currentJob,
        Array.isArray(r.jobHistory) ? r.jobHistory.join(" ") : r.jobHistory,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, searchFilter]);

  const allSelected = filteredRows.length > 0 && filteredRows.every((r) => isSelected(r.profileUrl));
  const someSelected = filteredRows.some((r) => isSelected(r.profileUrl));

  const handleToggleAll = () => {
    const next = !allSelected;
    setSelected((prev) => {
      const copy = { ...prev };
      filteredRows.forEach((r) => {
        copy[r.profileUrl] = next;
      });
      return copy;
    });
  };

  const handleRowClick = (e, profileUrl) => {
    const target = e.target;
    if (target.closest("input, a, button, textarea, select, svg")) return;
    toggleSelect(profileUrl);
  };

  React.useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = !allSelected && someSelected;
    }
  }, [allSelected, someSelected]);

  const statusDotClass = (s) => {
    const val = (s || "").toLowerCase();
    if (val === "success" || val === "active" || val === "ok")
      return "bg-[#2FF34C]";
    if (val === "pending" || val === "processing") return "bg-yellow-400";
    if (val === "error" || val === "failed") return "bg-red-500";
    return "bg-gray-300";
  };

  const options = [
    { value: "email,phone", label: "Full profile" },
    { value: "email", label: "Email" },
  ];

  const percent =
    totalCount > 0
      ? Math.min(100, Math.round((completedCount / totalCount) * 100))
      : 0;

  const handleOpenEnrichModal = () => {
    let currentUrls = urlsInput
      .split(/\n|,/)
      .map((s) => s.trim())
      .filter((s) => s && isLikelyLinkedIn(s));
      
    if (currentUrls.length > 100) {
      Swal.fire({
        title: "Limit Exceeded",
        text: "You can enrich up to 100 URLs at a time",
        imageUrl: "/icons/mawsool-error.webp",
        imageAlt: "Custom alert icon",
        confirmButtonText: "OK",
        customClass: { confirmButton: "swal-confirm-button" },
      });
      return;
    }
    if (!currentUrls.length) {
      Swal.fire({
        title: "Error",
        text: `Please enter at least one valid LinkedIn profile URL (linkedin.com/in/...)`,
        imageUrl: "/icons/mawsool-error.webp",
        imageAlt: "Custom alert icon",
        confirmButtonText: "OK",
        customClass: {
          confirmButton: "swal-confirm-button",
        },
      });
      return;
    }
    setEnrichModalOpen(true);
  };

  return (
    <DashboardContainer heading="Data Enrichment">
      <div className="w-full h-full overflow-y-auto p-4 flex flex-col gap-4 rounded-[16px] border border-[#E5E6E6] bg-[#FBFBFC]">
        <div className="w-full px-4 py-6 flex flex-col gap-4 rounded-[16px] border border-[#E5E6E6] bg-[#FBFBFC]">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-[#222]">
              Input LinkedIn Profile URLs
            </p>
            <div
              onClick={handleImportCsv}
              className="w-fit px-3 py-2 text-xs font-medium text-white flex items-center gap-1 bg-[#04145C] rounded-lg cursor-pointer hover:bg-[#052074] transition-colors duration-200"
              title="Import CSV of LinkedIn URLs"
            >
              <img
                src="/icons/importIcon.svg"
                className="select-none"
                draggable={false}
                alt=""
              />{" "}
              Import Data
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={onFileChange}
            />
          </div>
          <textarea
            value={urlsInput}
            onChange={(e) => {
              const val = e.target.value;
              const parts = val.split(/\n|,/).map((s)=>s.trim()).filter(Boolean);
              const links = parts.filter((s)=> isLikelyLinkedIn(s));
              if (links.length > 100) {
                setUrlsInput(links.slice(0,100).join("\n"));
              } else {
                setUrlsInput(val);
              }
            }}
            placeholder={`Enter LinkedIn URLs, one per line or comma-separated...
e.g., https://www.linkedin.com/in/example1/
https://www.linkedin.com/in/example2/`}
            className="input__field h-[140px]"
          />
          <Button
            arrow={false}
            variant="small"
            className={"w-fit !rounded-xl"}
            onClick={handleOpenEnrichModal}
            disabled={loading}
          >
            {loading
              ? `Loading… ${completedCount} of ${totalCount}`
              : "Enrich Contacts"}
          </Button>
        </div>
        <div className="w-full p-4 flex flex-col gap-4 rounded-[16px] border border-[#E5E6E6] bg-[#FBFBFC]">
          {failedItems.length > 0 && (
            <div className="w-full p-3 bg-red-50 border border-red-200 rounded-lg flex flex-col gap-2">
               <p className="text-sm font-medium text-red-800">Unable to enrich the following profiles (Try again later):</p>
               <div className="flex flex-col gap-1 max-h-[100px] overflow-y-auto">
                 {failedItems.map((u, i) => (
                    <div key={i} className="text-xs text-red-600 truncate font-mono">{u}</div>
                 ))}
               </div>
            </div>
          )}
          <div className="w-full flex items-center justify-between">
            <p className="text-sm text-[#222]">Results</p>
            <div className="flex items-center gap-5">
              {totalCount > 0 && (
                <div className="flex items-center gap-2">
                  <div
                    className="relative h-6 w-6"
                    title={`${completedCount} of ${totalCount}`}
                  >
                    <div className="absolute inset-0 rounded-full border-2 border-[#E5E6E6]" />
                    {percent < 100 ? (
                      <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-[#04145C] animate-spin" />
                    ) : (
                      <div className="absolute inset-0 rounded-full border-2 border-[#2FF34C]" />
                    )}
                  </div>
                  <div className="text-xs text-[#242E2C]">
                    {completedCount} of {totalCount}
                  </div>
                </div>
              )}
              <Button
                arrow={false}
                variant="small"
                className={`w-fit !rounded-xl ${selectedCount ? "" : "opacity-50 cursor-not-allowed"}`}
                onClick={selectedCount ? handleOpenListModal : undefined}
                aria-disabled={!selectedCount}
              >
                Add to List
              </Button>
              
            </div>
          </div>
          <div className="flex flex-col gap-0">
            <div className="w-full px-2.5 py-1.5 flex items-center justify-between border-b-[1px] border-[#E5E6E6]">
              <div className="min-w-[24px] max-w-[24px] flex items-center justify-center">
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  aria-label="Select all"
                  checked={allSelected}
                  onChange={handleToggleAll}
                />
              </div>
              {[
                "Profile URL",
                "Company",
                "Location",
                "Summary",
                "Emails",
                "Phones",
                "Current Job",
                "Job History",
              ].map((label) => (
                <div
                  key={label}
                  className={`${
                    label === "Emails"
                      ? "min-w-[150px] max-w-[150px]"
                      : "min-w-[100px] max-w-[100px]"
                  } flex items-center gap-0`}
                >
                  <p className="text-xs text-[#242E2C]">{label}</p>
                  <Arrow />
                </div>
              ))}
            </div>
            {filteredRows.map((item, idx) => (
              <div
                key={(item.profileUrl || item.profileName || "row") + "-" + idx}
                className={`w-full px-2.5 py-3.5 flex items-center justify-between ${isSelected(item.profileUrl) ? "bg-[#EFF7FF]" : ""}`}
                onClick={(e) => handleRowClick(e, item.profileUrl)}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    toggleSelect(item.profileUrl);
                  }
                }}
              >
                <div className="min-w-[24px] max-w-[24px] flex items-center justify-center">
                  <input
                    type="checkbox"
                    aria-label={`Select ${item.profileName}`}
                    checked={isSelected(item.profileUrl)}
                    onChange={() => toggleSelect(item.profileUrl)}
                  />
                </div>
                <div className="min-w-[100px] max-w-[100px] flex items-center gap-1.5">
                  <Linkedin />
                  {item.profileUrl ? (
                    <a
                      href={item.profileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-[#242E2C] underline"
                    >
                      {item.profileName}
                    </a>
                  ) : (
                    <p className="text-xs text-[#242E2C] underline">
                      {item.profileName}
                    </p>
                  )}
                  {autoSaveMap[item.profileUrl] && (
                    <span
                      className={`ml-2 inline-block px-2 py-0.5 rounded-full text-[10px] border ${
                        autoSaveMap[item.profileUrl] === 'saved'
                          ? 'border-[#6ced82] text-[#222222] bg-[#6ced82]'
                          : autoSaveMap[item.profileUrl] === 'updated'
                          ? 'border-[#2d6cff] text-[#222222] bg-[#dbe7ff]'
                          : 'border-[#f87171] text-[#222222] bg-[#fde2e2]'
                      }`}
                    >
                      {autoSaveMap[item.profileUrl]}
                    </span>
                  )}
                </div>
                
                <div className="min-w-[100px] max-w-[100px] flex items-center gap-0">
                  <p className="text-xs text-[#242E2C]">{item.company}</p>
                </div>
                <div className="min-w-[100px] max-w-[100px] flex items-center gap-0">
                  <p className="text-xs text-[#242E2C]">{item.location}</p>
                </div>
                <div className="min-w-[100px] max-w-[100px] flex items-center gap-0">
                  <p className="text-xs text-[#242E2C] line-clamp-3">{item.summary}</p>
                </div>
                <div className="min-w-[150px] max-w-[150px] flex flex-col gap-1">
                  {Array.isArray(item.emails) && item.emails.length ? (
                    item.emails.map((e, idx) => (
                      <div key={e.email + idx} className="">
                        <p className="text-xs text-[#242E2C]">{e.email}</p>
                        <div>
                          <span
                            className={`text-xs px-2 py-1 rounded-full capitalize ${
                              e.verificationStatus.toLowerCase() === "deliverable"
                                ? "bg-green-100 text-green-800"
                                : e.verificationStatus.toLowerCase() === "undeliverable"
                                ? "bg-red-100 text-red-800"
                                : "bg-gray-100 text-gray-800"
                            }`}
                          >
                            {e.verificationStatus}
                          </span>
                          <span className="text-xs text-[#242E2C]">{e.score !== null && ` (Score: ${e.score})`}</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-[#242E2C]">N/A</p>
                  )}
                </div>
                <div className="min-w-[100px] max-w-[100px] flex flex-col gap-1">
                  {Array.isArray(item.phones) && item.phones.length ? (
                    item.phones.map((p, idx) => (
                      <p key={p.number + idx} className="text-xs text-[#242E2C]">
                        {p.number} ({p.type})
                      </p>
                    ))
                  ) : (item._phone_revealed || revealCtx.isRevealed(item.profileUrl, 'phone')) ? (
                    <p className="text-xs text-[#242E2C]">N/A</p>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleReveal(item);
                      }}
                      disabled={revealLoading[item.profileUrl + "-phone"]}
                      className="text-xs font-medium text-white bg-[#0090FF] px-3 py-1.5 rounded-md hover:bg-[#007ACC] disabled:opacity-50 transition-all flex items-center gap-1.5 w-fit shadow-[0_0_10px_rgba(0,144,255,0.4)] hover:shadow-[0_0_15px_rgba(0,144,255,0.6)]"
                    >
                      {revealLoading[item.profileUrl + "-phone"] ? (
                        <svg className="animate-spin h-3 w-3 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                      ) : (
                        <>
                          <span>Reveal</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
                <div className="min-w-[100px] max-w-[100px] flex items-center gap-0">
                  <p className="text-xs text-[#242E2C]">{item.currentJob}</p>
                </div>
                <div className="min-w-[100px] max-w-[100px] flex items-center gap-0">
                  <p className="text-xs text-[#242E2C] line-clamp-3">
                    {Array.isArray(item.jobHistory) && item.jobHistory.length
                      ? item.jobHistory.join(", ")
                      : "N/A"}
                  </p>
                </div>
              </div>
            ))}
            {!loading && rows.length === 0 && (
              <div className="px-2.5 py-6 text-sm text-[#717171]">
                No results yet. Try enriching some LinkedIn URLs.
              </div>
            )}
          </div>
          {/* Enrichment Options Modal */}
          <Modal heading="" isOpen={enrichModalOpen} onClose={() => setEnrichModalOpen(false)}>
            <div className="w-full max-w-[500px]">
              <h2 className="text-lg font-medium text-[#222] mb-4">Select Enrichment Type</h2>
              <p className="text-sm text-[#434343] mb-5">
                Choose the data you want to retrieve for the selected profile(s).
              </p>
              
              <div className="flex flex-col gap-3 mb-6">
                {[
                  { id: "email", label: "Email only", cost: 5 },
                  { id: "phone", label: "Phones only", cost: 20 },
                  { id: "email,phone", label: "Email and phone", cost: 25 },
                ].map((opt) => (
                  <label
                    key={opt.id}
                    className={`flex items-center justify-between p-4 rounded-xl border-2 cursor-pointer transition-all ${
                      enrichChoice === opt.id
                        ? "border-[#04145C] bg-[#F4F7FF]"
                        : "border-[#E5E6E6] hover:border-[#B0B0B0]"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="relative flex items-center justify-center w-5 h-5">
                        <input
                          type="radio"
                          name="enrichmentType"
                          value={opt.id}
                          checked={enrichChoice === opt.id}
                          onChange={(e) => setEnrichChoice(e.target.value)}
                          className="peer appearance-none w-5 h-5 border-2 border-gray-400 rounded-full checked:border-[#04145C] focus:outline-none cursor-pointer"
                        />
                        <div className="absolute w-2.5 h-2.5 bg-[#04145C] rounded-full opacity-0 peer-checked:opacity-100 transition-opacity"></div>
                      </div>
                      <span className="text-sm font-medium text-[#222]">{opt.label}</span>
                    </div>
                    <span className="text-xs font-semibold text-[#04145C] bg-[#E8EDFF] px-2.5 py-1 rounded-md">
                      {opt.cost} credits/profile
                    </span>
                  </label>
                ))}
              </div>

              <div className="flex items-center justify-between p-4 bg-[#F8F9FA] rounded-xl mb-6">
                <span className="text-sm font-medium text-[#434343]">Estimated cost per profile:</span>
                <span className="text-lg font-bold text-[#04145C]">
                  {enrichChoice === "email,phone" ? 25 : enrichChoice === "phone" ? 20 : 5} credits
                </span>
              </div>

              <div className="flex items-center justify-end gap-3">
                <Button
                  arrow={false}
                  variant="small"
                  className="!rounded-xl bg-[#E9E9E9] text-[#242E2C]"
                  onClick={() => setEnrichModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  arrow={false}
                  variant="small"
                  className="!rounded-xl"
                  onClick={() => {
                    setEnrichModalOpen(false);
                    handleEnrich(enrichChoice);
                  }}
                >
                  Confirm & Enrich
                </Button>
              </div>
            </div>
          </Modal>

          {/* List Management Modal */}
          <Modal heading="" isOpen={listModalOpen} onClose={() => setListModalOpen(false)}>
            <div className="w-full max-w-[640px]">
              <h2 className="text-base font-medium text-[#222] mb-3">Add to List</h2>
              <p className="text-xs text-[#434343] mb-4">Selected: {selectedCount} item(s)</p>
              <div className="flex flex-col gap-3 mb-4">
                <p className="text-sm font-medium text-[#222]">Choose an existing list</p>
                {listsLoading ? (
                  <p className="text-xs text-[#717171]">Loading lists…</p>
                ) : (
                  <Dropdown
                    options={[
                      { value: "", label: "Select a list" },
                      { value: "__CREATE__", label: "Create New List…" },
                      ...lists
                        .filter((l) => (l.kind || "user_made") === "user_made")
                        .map((l) => ({ value: l._id, label: `${l.name} (Items: ${l.itemsCount ?? 0})` }))
                    ]}
                    value={selectedListId || ""}
                    onChange={(v) => setSelectedListId(v || null)}
                    placeholder="Select a list"
                  />
                )}
                {selectedListId === "__CREATE__" && (
                  <div className="flex items-center gap-2 mt-2">
                    <input
                      type="text"
                      placeholder="New list name"
                      value={newListName}
                      onChange={(e) => setNewListName(e.target.value)}
                      className="flex-1 border border-[#E5E6E6] rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                )}
              </div>
              <div className="flex items-center justify-end gap-2">
                <Button
                  arrow={false}
                  variant="small"
                  className="!rounded-xl bg-[#E9E9E9] text-[#242E2C]"
                  onClick={() => setListModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  arrow={false}
                  variant="small"
                  className={`!rounded-xl ${selectedListId === "__CREATE__" ? (newListName && newListName.trim() ? '' : 'opacity-50 cursor-not-allowed') : (selectedListId ? '' : 'opacity-50 cursor-not-allowed')}`}
                  onClick={handleConfirmAddToList}
                  disabled={addingItems || (selectedListId === "__CREATE__" ? !newListName.trim() : !selectedListId)}
                >
                  {addingItems ? "Adding…" : "Confirm"}
                </Button>
              </div>
            </div>
          </Modal>
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2.5">
              <span className="text-xs text-[#434343] leading-[130%]">
                Showing
              </span>
              <div className="flex items-center rounded-[7px] gap-1 px-1.5 py-1.5 pl-2 text-xs text-[#717171] font-medium bg-[#E9E9E9]">
                {filteredRows.length}
                <ChevronDown size={16} />
              </div>
              <span className="text-xs text-[#434343] leading-[130%]">
                out of {rows.length}
              </span>
            </div>
            <Pagination className="!p-0" />
          </div>
        </div>
      </div>
    </DashboardContainer>
  );
};

export default DataEnrichment;