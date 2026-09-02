"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import AdminRoute from "@/components/AdminRoute";
import DashboardContainer from "@/components/dashboardLayoutContainer";
import Swal from "sweetalert2";
const config = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000",
};

// --- Helper Functions ---
function relativeTime(dateString) {
  if (!dateString) return "";
  const date = new Date(dateString);
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60000);

  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min${mins !== 1 ? "s" : ""} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours !== 1 ? "s" : ""} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days !== 1 ? "s" : ""} ago`;
}

// Function to export invoices as CSV
const exportInvoicesToCSV = (invoices) => {
  if (!invoices || !invoices.length) return;

  const headers = ["Invoice Date", "Invoice Number", "Status", "Amount"];
  const rows = invoices.map((invoice) => [
    invoice.created
      ? new Date(invoice.created * 1000).toLocaleDateString()
      : "N/A",
    invoice.number || "N/A",
    invoice.status
      ? invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)
      : "N/A",
    invoice.total !== undefined
      ? `$${(invoice.total / 100).toFixed(2)}`
      : "N/A",
  ]);

  const csvContent = [
    headers.join(","),
    ...rows.map((row) => row.join(",")),
  ].join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute(
    "download",
    `invoice_export_${new Date().toISOString().slice(0, 10)}.csv`
  );
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

const Icon = ({ name, className = "" }) => {
  const iconMap = {
    grid: "🌐",
    list: "📋",
    settings: "⚙️",
    download: "⬇️",
    export: "📤",
    ellipsis: "⋯",
    bell: "🔔",
    search: "🔍",
    user: "👤",
    logo: "Mawsool",
    save: "💾",
    cancel: "❌",
  };
  if(name==='ok' || name==='close'){
    return <img src={`/icons/${name}.svg`} alt={name} className={`inline-block h-4 w-4 ${className}`} />;
  }else{
    return <span className={`mr-1.5 ${className}`}>{iconMap[name] || name}</span>;
  }
  
};

const UserTableHeader = ({ paginatedUsers, selectedUserIds, setSelectedUserIds }) => {
  const allSelected = paginatedUsers.length > 0 && paginatedUsers.every(user => selectedUserIds.includes(user._id));
  const someSelected = paginatedUsers.some(user => selectedUserIds.includes(user._id));

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      const newIds = paginatedUsers.map(user => user._id).filter(id => !selectedUserIds.includes(id));
      setSelectedUserIds([...selectedUserIds, ...newIds]);
    } else {
      const paginatedIds = paginatedUsers.map(user => user._id);
      setSelectedUserIds(selectedUserIds.filter(id => !paginatedIds.includes(id)));
    }
  };

  return (
    <thead className="bg-gray-50 border-b border-gray-200">
      <tr>
        <th className="py-3 px-4 text-left">
          <input
            type="checkbox"
            checked={allSelected}
            ref={input => { if (input) input.indeterminate = someSelected && !allSelected }}
            onChange={handleSelectAll}
            className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
          />
        </th>
        <th className="py-3 px-4 text-left font-semibold text-gray-600">
          User Name <span className="text-xs text-gray-400">↓</span>
        </th>
      <th className="py-3 px-4 text-left font-semibold text-gray-600">
          Email <span className="text-xs text-gray-400">↓</span>
        </th>
        <th className="py-3 px-4 text-left font-semibold text-gray-600">
          WhatsApp <span className="text-xs text-gray-400">↓</span>
        </th>
        <th className="py-3 px-4 text-left font-semibold text-gray-600">
          LinkedIn <span className="text-xs text-gray-400">↓</span>
        </th>
        <th className="py-3 px-4 text-left font-semibold text-gray-600">
          Company Name <span className="text-xs text-gray-400">↓</span>
        </th>
        <th className="py-3 px-4 text-left font-semibold text-gray-600">
        Organization <span className="text-xs text-gray-400">↓</span>
      </th>
      <th className="py-3 px-4 text-left font-semibold text-gray-600">
        Plan <span className="text-xs text-gray-400">↓</span>
      </th>
      <th className="py-3 px-4 text-left font-semibold text-gray-600">
        Credits <span className="text-xs text-gray-400">↓</span>
      </th>
      <th className="py-3 px-4 text-left font-semibold text-gray-600">
        Pool Credits <span className="text-xs text-gray-400">↓</span>
      </th>
      <th className="py-3 px-4 text-left font-semibold text-gray-600">
        Multi-Device <span className="text-xs text-gray-400">↓</span>
      </th>
      <th className="py-3 px-4 text-left font-semibold text-gray-600">
        Join Date <span className="text-xs text-gray-400">↓</span>
      </th>
      <th className="py-3 px-2 text-left font-semibold text-gray-600 text-xs">
        UTM Source
      </th>
      <th className="py-3 px-2 text-left font-semibold text-gray-600 text-xs">
        UTM Medium
      </th>
      <th className="py-3 px-2 text-left font-semibold text-gray-600 text-xs">
        UTM Campaign
      </th>
      <th className="py-3 px-2 text-left font-semibold text-gray-600 text-xs">
        UTM Term
      </th>
      <th className="py-3 px-2 text-left font-semibold text-gray-600 text-xs">
        UTM Content
      </th>
      <th className="py-3 px-4 text-left font-semibold text-gray-600"></th>
    </tr>
  </thead>
  );
};

const UserRow = ({
    user,
    handleGetInvoices,
    handleDelete,
    handleToggleArchive,
    openDropdown,
    toggleDropdown,
    handleUpdateCredits,
    handleUpdateMultiSession, // New Prop
    handleOpenPlanModal,
    handleViewLists,
    handleViewCreditLogs,
    selectedUserIds,
    setSelectedUserIds,
  }) => {
    const dropdownRef = useRef(null);
    const buttonRef = useRef(null);
    const [isNearBottom, setIsNearBottom] = useState(false);
    const [isEditingCredits, setIsEditingCredits] = useState(false);
    const [creditsInput, setCreditsInput] = useState(user.credits || 0);
    const [isEditingPoolCredits, setIsEditingPoolCredits] = useState(false);
    const [poolCreditsInput, setPoolCreditsInput] = useState(user.orgId?.poolCredits || 0);

    const initialUrl = user.linkedInUrl || "";
    const splitStoredUrls = (value) =>
      String(value || "")
        .split(/\|\|\||[\n\r]+/)
        .map((s) => s.trim())
        .filter((s) => s.startsWith("http"));

    const [companyName, setCompanyName] = useState(user.companyName || "");
    const [linkedInUrl, setLinkedInUrl] = useState(splitStoredUrls(initialUrl)[0] || initialUrl || null);
    const [linkedInUrlOptions, setLinkedInUrlOptions] = useState(splitStoredUrls(initialUrl));
    const [isSearchingLi, setIsSearchingLi] = useState(false);

    const saveLinkedInUrl = async (newLiUrl) => {
      if (newLiUrl === "Not Found" || newLiUrl === "Error" || newLiUrl === "No Email" || newLiUrl === "Invalid Email" || newLiUrl === "Generic Email") {
        return;
      }
      try {
        await fetch(`${config.apiUrl}/api/admin/users/${user._id}`, {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ linkedInUrl: newLiUrl || "" })
        });
      } catch (updateErr) {
        console.error("Failed to save LinkedIn URL to DB:", updateErr);
      }
    };

    const saveCompanyName = async (newCompanyName) => {
      if (!newCompanyName) return;
      try {
        await fetch(`${config.apiUrl}/api/admin/users/${user._id}`, {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ companyName: newCompanyName })
        });
      } catch (updateErr) {
        console.error("Failed to save Company Name to DB:", updateErr);
      }
    };

    const handleFindLinkedIn = async (e, searchType = 'exact') => {
      e.stopPropagation();
      
      if (!user.email) {
        setLinkedInUrl("No Email");
        return;
      }

      const domainParts = user.email.split("@");
      if (domainParts.length < 2) {
        setLinkedInUrl("Invalid Email");
        return;
      }
      
      const domain = domainParts[1].toLowerCase();
      const genericDomains = ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com", "live.com"];
      
      if (genericDomains.includes(domain)) {
        setLinkedInUrl("Generic Email");
        return;
      }

      setIsSearchingLi(true);
      try {
        const companyName = domain.split(".")[0];
        const nameParts = (user.name || "").split(" ");
        const firstName = nameParts[0] || "";
        const lastName = nameParts.slice(1).join(" ") || "";

        const filters = {};
        if (firstName) filters.first_name = firstName;
        if (lastName) filters.last_name = lastName;
        if (domain) filters.company = { include: [domain] };
        
        if (searchType === 'exact') {
          filters.name_exact_match = true;
        } else if (searchType === 'fuzzy') {
          filters.name_exact_match = false;
        }
        
        const res = await fetch(`${config.apiUrl}/api/proxy/search`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "people",
            filters,
            limit: 5,
          }),
        });

        if (!res.ok) {
          throw new Error("Search failed");
        }

        const data = await res.json();
        
        let foundCompanyName = "";

        if (data.items && data.items.length > 0) {
          // Extract company name from the first person profile that has one
          for (const item of data.items) {
            let comp = item.company || item.company_name || item.organization?.name || item.organization__name;
            if (typeof comp === 'object' && comp !== null) comp = comp.name;
            if (comp && typeof comp === 'string' && comp.trim() !== "") {
              foundCompanyName = comp.trim();
              break;
            }
          }

          const urls = [...new Set(data.items.map(item => item.linkedin_url || item.public_profile_url).filter(Boolean))];
          if (urls.length > 0) {
            const existing = splitStoredUrls(
              linkedInUrlOptions.length ? linkedInUrlOptions.join("|||") : linkedInUrl
            );
            const merged = [...new Set([...existing, ...urls])];
            setLinkedInUrlOptions(merged);
            setLinkedInUrl(merged[0]);
            saveLinkedInUrl(merged.join("|||"));
          } else if (!splitStoredUrls(linkedInUrl).length) {
            setLinkedInUrl("Not Found");
            setLinkedInUrlOptions([]);
          }
        } else if (!splitStoredUrls(linkedInUrl).length && linkedInUrlOptions.length === 0) {
          setLinkedInUrl("Not Found");
          setLinkedInUrlOptions([]);
        }

        // If we didn't find a company name from people search, do a fallback company search using domain
        if (!foundCompanyName) {
          try {
            const companyRes = await fetch(`${config.apiUrl}/api/proxy/search`, {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                filters: { company_name: { include: [domain] } },
                page: 1,
                limit: 10,
                type: "companies"
              }),
            });
            if (companyRes.ok) {
              const companyData = await companyRes.json();
              if (companyData.items && companyData.items.length > 0) {
                foundCompanyName = companyData.items[0].name || "";
              }
            }
          } catch (companyErr) {
            console.error("Fallback company search error:", companyErr);
          }
        }

        if (foundCompanyName) {
          setCompanyName(foundCompanyName);
          saveCompanyName(foundCompanyName);
        }
      } catch (err) {
        console.error("LinkedIn search error:", err);
        setLinkedInUrl("Error");
        setLinkedInUrlOptions([]);
      } finally {
        setIsSearchingLi(false);
      }
    };

  useEffect(() => {
    setCreditsInput(user.credits || 0);
    setPoolCreditsInput(user.orgId?.poolCredits || 0);
  }, [user.credits, user.orgId?.poolCredits]);

  const handleCreditsChange = (e) => {
    setCreditsInput(e.target.value);
  };

  const handlePoolCreditsChange = (e) => {
    setPoolCreditsInput(e.target.value);
  };

  useEffect(() => {
    if (openDropdown === user._id && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const windowHeight = window.innerHeight || document.documentElement.clientHeight;
      if (windowHeight - rect.bottom < 200) {
        setIsNearBottom(true);
      } else {
        setIsNearBottom(false);
      }
    }
  }, [openDropdown, user._id]);

  const saveCredits = async (e) => {
    e.stopPropagation();
    try {
      await handleUpdateCredits(user._id, parseInt(creditsInput, 10), 'personal');
      setIsEditingCredits(false);
    } catch (error) {
      console.error("Failed to update credits", error);
      Swal.fire({
        title: "Error",
        text: "Failed to update credits",
        icon: "error",
        timer: 1500,
        showConfirmButton: false,
      });
    }
  };

  const savePoolCredits = async (e) => {
    e.stopPropagation();
    try {
      await handleUpdateCredits(user._id, parseInt(poolCreditsInput, 10), 'pool');
      setIsEditingPoolCredits(false);
    } catch (error) {
      console.error("Failed to update pool credits", error);
      Swal.fire({
        title: "Error",
        text: "Failed to update pool credits",
        icon: "error",
        timer: 1500,
        showConfirmButton: false,
      });
    }
  };
  
  const toggleMultiSession = async (e) => {
    e.stopPropagation();
    try {
      await handleUpdateMultiSession(user._id, !user.allowMultipleSessions);
    } catch (err) {
      Swal.fire({
        title: "Error",
        text: err.message || "Failed to update session setting",
        icon: "error",
        timer: 1500,
        showConfirmButton: false,
      });
    }
  };

  const handleRowClick = (e) => {
    // Prevent opening if clicking on interactive elements
    if (e.target.closest("button") || e.target.closest("input") || e.target.closest("a") || isEditingCredits || e.target.closest(".toggle-checkbox")) {
      return;
    }
    handleViewLists(user);
  };

  return (
    <tr 
      className="border-b border-gray-100 hover:bg-blue-50 cursor-pointer transition-colors"
      onClick={handleRowClick}
    >
      <td className="py-2 px-4">
        <input 
          type="checkbox"
          checked={selectedUserIds.includes(user._id)}
          onChange={(e) => {
            e.stopPropagation();
            if (e.target.checked) {
              setSelectedUserIds([...selectedUserIds, user._id]);
            } else {
              setSelectedUserIds(selectedUserIds.filter(id => id !== user._id));
            }
          }}
          className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 cursor-pointer"
        />
      </td>
      <td className="py-2 px-4 text-gray-800 font-medium">
        <div className="flex items-center gap-2">
          <span>{user.name || "Unnamed User"}</span>
          {user.isVerified === false && (
            <span className="bg-red-100 text-red-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-red-200">
              Unverified
            </span>
          )}
        </div>
      </td>
        <td className="py-2 px-4 text-gray-800">{user.email || "N/A"}</td>
        <td className="py-2 px-4 text-gray-800">{user.whatsappNumber || "N/A"}</td>
        <td className="py-2 px-4 text-gray-800 text-xs">
          {isSearchingLi ? (
            <span className="text-blue-500 animate-pulse">Searching...</span>
          ) : (
            <div className="flex flex-col gap-1 min-w-[140px]">
              {(linkedInUrlOptions.length > 0
                ? linkedInUrlOptions
                : linkedInUrl && String(linkedInUrl).startsWith("http")
                  ? [linkedInUrl]
                  : []
              ).map((url, idx) => (
                <div key={`${url}-${idx}`} className="flex items-center justify-between gap-1 bg-blue-50 px-2 py-1 rounded">
                  <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline truncate max-w-[90px]" onClick={(e) => e.stopPropagation()} title={url}>
                    Profile {idx + 1}
                  </a>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const current = linkedInUrlOptions.length > 0
                        ? linkedInUrlOptions
                        : [linkedInUrl];
                      const newOptions = current.filter((u) => u !== url);
                      if (newOptions.length >= 1) {
                        setLinkedInUrlOptions(newOptions);
                        setLinkedInUrl(newOptions[0]);
                        saveLinkedInUrl(newOptions.join("|||"));
                      } else {
                        setLinkedInUrlOptions([]);
                        setLinkedInUrl("");
                        saveLinkedInUrl("");
                      }
                    }}
                    className="text-red-500 hover:text-red-700 bg-white rounded-full p-0.5 shadow-sm"
                    title="Delete this URL"
                  >
                    <Icon name="close" className="w-3 h-3" />
                  </button>
                </div>
              ))}
              {linkedInUrl && !String(linkedInUrl).startsWith("http") && (
                <span className="text-gray-500">{linkedInUrl}</span>
              )}
              <div className="flex flex-col gap-1">
                <button
                  onClick={(e) => handleFindLinkedIn(e, 'exact')}
                  className="px-2 py-1 bg-green-50 hover:bg-green-100 text-green-700 rounded border border-green-200 transition-colors text-[10px]"
                >
                  Exact
                </button>
                <button
                  onClick={(e) => handleFindLinkedIn(e, 'fuzzy')}
                  className="px-2 py-1 bg-gray-100 hover:bg-blue-50 text-blue-600 rounded border border-gray-200 transition-colors text-[10px]"
                >
                  Fuzzy
                </button>
              </div>
            </div>
          )}
        </td>
        <td className="py-2 px-4 text-gray-800 max-w-[150px] truncate" title={companyName}>
          {companyName || "-"}
        </td>
        <td className="py-2 px-4 text-gray-800 max-w-[150px] truncate" title={user.orgId?.name || "No Org"}>
        {user.orgId?.name || "No Org"}
      </td>
      <td className="py-2 px-4 text-gray-800">
        <div 
          className="flex items-center gap-2 group cursor-pointer w-fit" 
          onClick={(e) => {
            e.stopPropagation();
            handleOpenPlanModal(user);
          }}
        >
          <span className="font-medium">{user.planKey || user.orgId?.planKey || "Free"}</span>
          <div className="opacity-0 group-hover:opacity-100 transition-opacity text-blue-600 text-xs font-medium bg-blue-50 px-2 py-0.5 rounded flex items-center gap-1">
            <Icon name="settings" className="w-3 h-3" /> Edit
          </div>
        </div>
      </td>
      <td className="py-2 px-4 text-gray-800 max-w-[120px]">
        {isEditingCredits ? (
          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <input
              type="number"
              value={creditsInput}
              onChange={handleCreditsChange}
              className="w-[80px] py-1 px-2 border border-gray-300 rounded-md text-xs"
              min="0"
            />
            <button
              onClick={saveCredits}
              className="cursor-pointer bg-[#04145C] text-white p-1 rounded-md hover:bg-[#052074]"
            >
              <Icon name="ok" />
            </button>
            <button
              onClick={() => setIsEditingCredits(false)}
              className="cursor-pointer bg-gray-200 text-gray-700 p-1 rounded-md hover:bg-gray-300"
            >
              <Icon name="close" />
            </button>
          </div>
        ) : (
          <div
            className="cursor-pointer hover:bg-gray-100 p-1 rounded flex items-center gap-1 w-fit"
            onClick={(e) => {
              e.stopPropagation();
              setIsEditingCredits(true);
            }}
          >
            {user.credits || 0}
            <span className="text-xs text-gray-400">Edit</span>
          </div>
        )}
      </td>
      <td className="py-2 px-4 text-gray-800 max-w-[120px]">
        {!user.orgId ? (
          <span className="text-gray-400">-</span>
        ) : isEditingPoolCredits ? (
          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <input
              type="number"
              value={poolCreditsInput}
              onChange={handlePoolCreditsChange}
              className="w-[80px] py-1 px-2 border border-gray-300 rounded-md text-xs"
              min="0"
            />
            <button
              onClick={savePoolCredits}
              className="cursor-pointer bg-[#04145C] text-white p-1 rounded-md hover:bg-[#052074]"
            >
              <Icon name="ok" />
            </button>
            <button
              onClick={() => setIsEditingPoolCredits(false)}
              className="cursor-pointer bg-gray-200 text-gray-700 p-1 rounded-md hover:bg-gray-300"
            >
              <Icon name="close" />
            </button>
          </div>
        ) : (
          <div
            className="cursor-pointer hover:bg-gray-100 p-1 rounded flex items-center gap-1 w-fit"
            onClick={(e) => {
              e.stopPropagation();
              setIsEditingPoolCredits(true);
            }}
          >
            {user.orgId.poolCredits || 0}
            <span className="text-xs text-gray-400">Edit</span>
          </div>
        )}
      </td>
      {/* Multi-Session Checkbox */}
      <td className="py-2 px-4 text-gray-800">
        <label className="inline-flex items-center cursor-pointer toggle-checkbox">
          <input 
            type="checkbox" 
            checked={!!user.allowMultipleSessions} 
            onChange={toggleMultiSession}
            className="sr-only peer"
          />
          <div className="relative w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
          <span className="ms-2 text-xs font-medium text-gray-500">{user.allowMultipleSessions ? 'On' : 'Off'}</span>
        </label>
      </td>
      <td className="py-2 px-4 text-gray-800">
        {relativeTime(user.createdAt || "") || "N/A"}
      </td>
      <td className="py-2 px-2 text-gray-600 text-xs max-w-[80px] truncate" title={user.utmSource}>
        {user.utmSource || "-"}
      </td>
      <td className="py-2 px-2 text-gray-600 text-xs max-w-[80px] truncate" title={user.utmMedium}>
        {user.utmMedium || "-"}
      </td>
      <td className="py-2 px-2 text-gray-600 text-xs max-w-[80px] truncate" title={user.utmCampaign}>
        {user.utmCampaign || "-"}
      </td>
      <td className="py-2 px-2 text-gray-600 text-xs max-w-[80px] truncate" title={user.utmTerm}>
        {user.utmTerm || "-"}
      </td>
      <td className="py-2 px-2 text-gray-600 text-xs max-w-[80px] truncate" title={user.utmContent}>
        {user.utmContent || "-"}
      </td>
      <td className="py-2 px-4 text-gray-800 w-12 text-center relative">
        <div className="relative" ref={dropdownRef}>
          <button
            ref={buttonRef}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleDropdown(user._id);
            }}
            className="cursor-pointer h-[40px] w-[40px] rounded-md text-xl font-bold text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-600 focus:outline-none"
          >
            <Icon name="ellipsis" />
          </button>
          {openDropdown === user._id && (
            <div
              className={`absolute right-[calc(100%+4px)] bg-white border border-gray-200 rounded-lg shadow-lg z-[100] min-w-[240px] py-1 ${
                isNearBottom ? "bottom-0" : "top-0"
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className="px-4 py-2 cursor-pointer text-sm text-gray-700 text-left hover:bg-gray-100"
                onClick={(e) => {
                  e.stopPropagation();
                  handleGetInvoices(user._id);
                  toggleDropdown(null);
                }}
              >
                View Invoices
              </div>
              <div
                className="px-4 py-2 cursor-pointer text-sm text-gray-700 text-left hover:bg-gray-100"
                onClick={(e) => {
                  e.stopPropagation();
                  handleViewCreditLogs(user);
                  toggleDropdown(null);
                }}
              >
                View Credit History
              </div>
              <div
                className="px-4 py-2 cursor-pointer text-sm text-[#04145C] text-left hover:bg-gray-100 font-medium"
                onClick={(e) => {
                  e.stopPropagation();
                  // We can re-use the group users modal but pre-fill it with this user as owner
                  // But the user requested a specific modal. For now, we will open a dedicated manage team modal.
                  document.dispatchEvent(new CustomEvent('openManageTeam', { detail: user }));
                  toggleDropdown(null);
                }}
              >
                Manage Team
              </div>
              <div
                className="px-4 py-2 cursor-pointer text-sm text-gray-700 text-left hover:bg-gray-100"
                onClick={async (e) => {
                  e.stopPropagation();
                  toggleDropdown(null);
                  try {
                    Swal.fire({
                      title: "Pushing to Pipedrive...",
                      allowOutsideClick: false,
                      didOpen: () => Swal.showLoading(),
                    });
                    const res = await fetch(
                      `${config.apiUrl}/api/admin/users/${user._id}/pipedrive/push`,
                      { method: "POST", credentials: "include" }
                    );
                    const data = await res.json().catch(() => ({}));
                    if (!res.ok) throw new Error(data.message || "Push failed");
                    Swal.fire({
                      icon: "success",
                      title: "Pushed to Pipedrive",
                      text: data.personId
                        ? "Person and organization were upserted."
                        : "Pipedrive sync completed.",
                      timer: 2000,
                      showConfirmButton: false,
                    });
                  } catch (err) {
                    Swal.fire({
                      icon: "error",
                      title: "Pipedrive push failed",
                      text: err.message || "Could not push this user.",
                    });
                  }
                }}
              >
                Push to Pipedrive
              </div>
              <div
                className="px-4 py-2 cursor-pointer text-sm text-gray-700 text-left hover:bg-gray-100"
                onClick={async (e) => {
                  e.stopPropagation();
                  toggleDropdown(null);
                  try {
                    Swal.fire({
                      title: "Enriching contact...",
                      text: "This may take up to a minute.",
                      allowOutsideClick: false,
                      didOpen: () => Swal.showLoading(),
                    });
                    const res = await fetch(
                      `${config.apiUrl}/api/admin/users/${user._id}/pipedrive/enrich-contact`,
                      { method: "POST", credentials: "include" }
                    );
                    const data = await res.json().catch(() => ({}));
                    if (!res.ok) throw new Error(data.message || "Enrich failed");
                    Swal.fire({
                      icon: "success",
                      title: "Pipedrive updated",
                      text:
                        data.hasEmail || data.hasPhone
                          ? "Contact fields were written to the person."
                          : "Person updated. No email or phone was returned.",
                      timer: 2500,
                      showConfirmButton: false,
                    });
                  } catch (err) {
                    Swal.fire({
                      icon: "error",
                      title: "Enrich failed",
                      text: err.message || "Could not enrich this user.",
                    });
                  }
                }}
              >
                Enrich contact then update Pipedrive
              </div>
              <div
                className="px-4 py-2 cursor-pointer text-sm text-gray-700 text-left hover:bg-gray-100"
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleArchive(user._id, user.isArchived);
                  toggleDropdown(null);
                }}
              >
                {user.isArchived ? "Unarchive" : "Archive"}
              </div>
              <div
                className="px-4 py-2 cursor-pointer text-sm text-red-600 text-left hover:bg-gray-100"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(user._id);
                  toggleDropdown(null);
                }}
              >
                Delete
              </div>
            </div>
          )}
        </div>
      </td>
    </tr>
  );
};

const InvoiceHistoryPanel = ({ invoices, onClose, isLoading, error }) => (
  <>
    <div
      className="fixed inset-0 bg-gray-700/30 backdrop-blur-sm z-40"
      onClick={onClose}
    ></div>
    <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white shadow-xl z-50 rounded-lg w-[700px] max-h-[80vh] flex flex-col overflow-hidden">
      <div className="flex justify-between items-center p-5 border-b border-gray-200">
        <h3 className="m-0 text-2xl font-semibold text-gray-800">
          Invoice History
        </h3>
        <button
          onClick={onClose}
          className="bg-transparent border-none text-2xl cursor-pointer text-gray-500 hover:text-gray-700"
        >
          &times;
        </button>
      </div>
       {invoices.length !== 0 && (
      <div className="text-right px-5 py-3 border-b border-gray-200">
        <button
          onClick={() => exportInvoicesToCSV(invoices)}
          className="bg-blue-600 text-white border-none py-2 px-4 rounded-md cursor-pointer text-sm font-medium flex items-center gap-1.5 hover:bg-blue-700"
        >
          <Icon name="export" /> Export All
        </button>
      </div>
      )}
      <div className="p-5 overflow-y-auto flex-grow">
        {isLoading && (
          <div className="flex justify-center items-center h-40">
            <div className="text-blue-600">Loading invoices...</div>
          </div>
        )}
        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-md">
            <strong>Error:</strong> {error}
          </div>
        )}
        {!isLoading && !error && (
          <>
            {invoices.length === 0 ? (
              <div className="text-center text-gray-500 py-10">
                <p className="text-lg">No invoices found for this user.</p>
              </div>
            ) : (
              <table className="w-full h-full border-collapse text-sm bg-white rounded-lg overflow-hidden">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="py-3 px-4 text-left font-semibold text-gray-600 border-b border-gray-200">
                      Invoice Date{" "}
                      <span className="text-xs text-gray-400">↓</span>
                    </th>
                    <th className="py-3 px-4 text-left font-semibold text-gray-600 border-b border-gray-200">
                      Invoice Number{" "}
                      <span className="text-xs text-gray-400">↓</span>
                    </th>
                    <th className="py-3 px-4 text-left font-semibold text-gray-600 border-b border-gray-200">
                      Status <span className="text-xs text-gray-400">↓</span>
                    </th>
                    <th className="py-3 px-4 text-left font-semibold text-gray-600 border-b border-gray-200">
                      Amount <span className="text-xs text-gray-400">↓</span>
                    </th>
                    <th className="py-3 px-4 text-center font-semibold text-gray-600 border-b border-gray-200">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((invoice, index) => (
                    <tr
                      key={invoice.id || index}
                      className="border-b border-gray-100 hover:bg-gray-50"
                    >
                      <td className="py-3 px-4 text-gray-800">
                        {invoice.created
                          ? new Date(
                              invoice.created * 1000
                            ).toLocaleDateString()
                          : "N/A"}
                      </td>
                      <td className="py-3 px-4 text-gray-800">
                        {invoice.number || "N/A"}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-1 rounded-full text-xs ${
                            invoice.status === "paid"
                              ? "bg-green-100 text-green-800"
                              : invoice.status === "open"
                              ? "bg-blue-100 text-blue-800"
                              : "bg-yellow-100 text-yellow-800"
                          }`}
                        >
                          {invoice.status
                            ? invoice.status.charAt(0).toUpperCase() +
                              invoice.status.slice(1)
                            : "N/A"}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-gray-800 font-medium">
                        {invoice.total !== undefined && invoice.total !== null
                          ? `$${(invoice.total / 100).toFixed(2)}`
                          : "N/A"}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <a
                          href={invoice.invoice_pdf || "#"}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="bg-blue-50 text-blue-600 border border-blue-100 py-1.5 px-3 rounded-md cursor-pointer text-sm font-medium inline-flex items-center gap-1.5 hover:bg-blue-100 hover:border-blue-200 transition-colors"
                        >
                          <Icon name="download" /> Download
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>
    </div>
  </>
);

const ListDetailsPanel = ({ listId, onBack, onClose }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [exportLoading, setExportLoading] = useState(false);
  const [excelExportLoading, setExcelExportLoading] = useState(false);
  const [bulkRevealLoading, setBulkRevealLoading] = useState(false);

  useEffect(() => {
    const fetchDetails = async () => {
      try {
        const res = await fetch(`${config.apiUrl}/api/admin/list/${listId}`, {
          credentials: "include",
        });
        if (!res.ok) throw new Error("Failed to fetch list details");
        const json = await res.json();
        setData(json);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchDetails();
  }, [listId]);

  const handleExport = async (format = 'csv') => {
    if (!listId) return;
    if (format === 'xlsx') setExcelExportLoading(true);
    else setExportLoading(true);

    try {
      const url = `${config.apiUrl}/api/admin/list/${listId}/export?format=${format}`;
      const res = await fetch(url, {
        method: "GET",
        credentials: "include",
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.msg || "Failed to export list");
      }

      const blob = await res.blob();
      const mimeType = format === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'text/csv;charset=utf-8;';
      const ext = format === 'xlsx' ? '.xlsx' : '.csv';
      
      const suggestedName = `${data?.name || "exported_list"}${ext}`;

      const link = document.createElement("a");
      const blobUrl = URL.createObjectURL(blob);
      link.setAttribute("href", blobUrl);
      link.setAttribute("download", suggestedName);
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => { Swal.fire({ icon: "success", title: "Exported", text: `Export complete` }); }, 500);
    } catch (err) {
      console.error("Export Error:", err);
      Swal.fire({ icon: "error", title: "Export Failed", text: err.message });
    } finally {
      if (format === 'xlsx') setExcelExportLoading(false);
      else setExportLoading(false);
    }
  };

  const handleBulkReveal = async () => {
    if (!listId) return;

    const result = await Swal.fire({
      title: "Start Bulk Reveal?",
      text: "Select what you want to reveal. Credits will be deducted from the user's account.",
      icon: "warning",
      input: 'select',
      inputOptions: {
        email: 'Email Only',
        phone: 'Phone Only',
        both: 'Email and Phone'
      },
      inputValue: 'email',
      showCancelButton: true,
      confirmButtonColor: "#3085d6",
      cancelButtonColor: "#d33",
      confirmButtonText: "Yes, start it",
    });

    if (!result.isConfirmed) return;
    const revealType = result.value;

    setBulkRevealLoading(true);
    try {
      const url = `${config.apiUrl}/api/admin/list/${listId}/bulk-reveal`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revealType }),
        credentials: "include",
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.msg || "Failed to start bulk reveal");
      }

      Swal.fire({ icon: "success", title: "Started", text: "Bulk reveal started successfully!" });
    } catch (err) {
      console.error("Bulk Reveal Error:", err);
      Swal.fire({ icon: "error", title: "Failed", text: err.message });
    } finally {
      setBulkRevealLoading(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-gray-700/30 backdrop-blur-sm z-50" onClick={onClose}></div>
      <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white shadow-xl z-50 rounded-lg w-[900px] max-h-[85vh] flex flex-col overflow-hidden">
        <div className="flex justify-between items-center p-5 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="text-gray-500 hover:text-gray-800">
              ← Back
            </button>
            <h3 className="m-0 text-xl font-semibold text-gray-800">
              {data?.name || "List Details"}
            </h3>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleBulkReveal}
              disabled={bulkRevealLoading || loading || error || !data?.items?.length}
              className="bg-purple-600 text-white px-3 py-1.5 rounded hover:bg-purple-700 text-sm font-medium flex items-center gap-1 disabled:opacity-50"
            >
              <Icon name="search" className="w-3 h-3" /> {bulkRevealLoading ? "Starting..." : "Bulk Reveal"}
            </button>
            <button
              onClick={() => handleExport('csv')}
              disabled={exportLoading || excelExportLoading || loading || error || !data?.items?.length}
              className="bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700 text-sm font-medium flex items-center gap-1 disabled:opacity-50"
            >
              <Icon name="export" className="w-3 h-3" /> {exportLoading ? "Exporting..." : "Export CSV"}
            </button>
            <button
              onClick={() => handleExport('xlsx')}
              disabled={excelExportLoading || exportLoading || loading || error || !data?.items?.length}
              className="bg-green-600 text-white px-3 py-1.5 rounded hover:bg-green-700 text-sm font-medium flex items-center gap-1 disabled:opacity-50"
            >
              <Icon name="export" className="w-3 h-3" /> {excelExportLoading ? "Exporting..." : "Export Excel"}
            </button>
            <button onClick={onClose} className="text-2xl text-gray-500 hover:text-gray-700 ml-2">&times;</button>
          </div>
        </div>
        
        <div className="p-0 overflow-y-auto flex-grow bg-white">
          {loading && <div className="p-10 text-center text-blue-600">Loading leads...</div>}
          {error && <div className="p-10 text-center text-red-600">Error: {error}</div>}
          
          {!loading && !error && data?.items && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-3 font-medium text-gray-600">Name</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Title</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Company</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Email</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Phone</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.items.map((item, idx) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{item.name || "N/A"}</td>
                      <td className="px-4 py-3 text-gray-600">{item.raw?.title || "N/A"}</td>
                      <td className="px-4 py-3 text-gray-600">{item.raw?.company || "N/A"}</td>
                      <td className="px-4 py-3 text-gray-600">{item.email || "N/A"}</td>
                      <td className="px-4 py-3 text-gray-600">{item.phone || "N/A"}</td>
                    </tr>
                  ))}
                  {data.items.length === 0 && (
                    <tr>
                      <td colSpan="5" className="px-4 py-8 text-center text-gray-500">No leads found in this list.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

const UserListsPanel = ({ userId, userName, onClose }) => {
  const [lists, setLists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedListId, setSelectedListId] = useState(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [newListType, setNewListType] = useState("people"); // 'people' or 'company'
  const [isCreating, setIsCreating] = useState(false);
  const [uploadingListId, setUploadingListId] = useState(null);
  const fileInputRef = useRef(null);

  const fetchLists = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${config.apiUrl}/api/admin/user/${userId}/lists`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch user lists");
      const json = await res.json();
      setLists(json);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchLists();
  }, [fetchLists]);

  const handleCreateList = async (e) => {
    e.preventDefault();
    if (!newListName) return;
    setIsCreating(true);
    try {
      const res = await fetch(`${config.apiUrl}/api/admin/user/${userId}/lists`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        // Force 'ai_query' as the kind for all lists created via Admin panel
        body: JSON.stringify({ name: newListName, kind: 'ai_query', listType: newListType }),
      });
      if (!res.ok) throw new Error("Failed to create list");
      
      Swal.fire({
        icon: "success",
        title: "List Created",
        timer: 1500,
        showConfirmButton: false,
      });
      setIsCreateOpen(false);
      setNewListName("");
      fetchLists();
    } catch (err) {
      Swal.fire({
        icon: "error",
        title: "Error",
        text: err.message,
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteList = async (listId, e) => {
    e.stopPropagation();
    const result = await Swal.fire({
      title: 'Are you sure?',
      text: "You won't be able to revert this! All leads in this list will be deleted.",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Yes, delete it!'
    });

    if (result.isConfirmed) {
      try {
        const res = await fetch(`${config.apiUrl}/api/admin/list/${listId}`, {
          method: "DELETE",
          credentials: "include",
        });
        if (!res.ok) throw new Error("Failed to delete list");
        
        Swal.fire(
          'Deleted!',
          'List has been deleted.',
          'success'
        );
        fetchLists();
      } catch (err) {
        Swal.fire(
          'Error!',
          err.message,
          'error'
        );
      }
    }
  };

  const triggerUpload = (listId, e, notify = false) => {
    e.stopPropagation();
    setUploadingListId({ id: listId, notify });
    if (fileInputRef.current) {
      fileInputRef.current.value = ""; 
      fileInputRef.current.click();
    }
  };

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file || !uploadingListId) return;

    const { id: listId, notify } = uploadingListId;

    const formData = new FormData();
    formData.append("leadsFile", file);
    formData.append("isAiQuery", "true"); // Always treat admin uploads as AI Query lists
    if (notify) formData.append("sendNotification", "true");

    Swal.fire({
      title: notify ? 'Uploading & Notifying...' : 'Uploading...',
      text: notify ? 'Processing CSV and sending email...' : 'Processing CSV file',
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });

    try {
      const res = await fetch(`${config.apiUrl}/api/admin/list/${listId}/upload`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Upload failed");

      Swal.fire({
        icon: 'success',
        title: 'Upload Complete',
        text: data.message,
      });
      fetchLists();
    } catch (err) {
      Swal.fire({
        icon: 'error',
        title: 'Upload Failed',
        text: err.message,
      });
    } finally {
      setUploadingListId(null);
    }
  };

  if (selectedListId) {
    return <ListDetailsPanel listId={selectedListId} onBack={() => setSelectedListId(null)} onClose={onClose} />;
  }

  return (
    <>
      <div className="fixed inset-0 bg-gray-700/30 backdrop-blur-sm z-40" onClick={onClose}></div>
      <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white shadow-xl z-50 rounded-lg w-[900px] max-h-[85vh] flex flex-col overflow-hidden">
        <div className="flex justify-between items-center p-5 border-b border-gray-200">
          <h3 className="m-0 text-2xl font-semibold text-gray-800">
            Lists for {userName}
          </h3>
          <div className="flex items-center gap-3">
             <div className="relative flex items-center">
               <span className="absolute left-3 text-gray-400 flex items-center justify-center">
                 <Icon name="search" className="w-4 h-4 m-0" />
               </span>
               <input
                 type="text"
                 placeholder="Search lists..."
                 value={searchQuery}
                 onChange={(e) => setSearchQuery(e.target.value)}
                 className="pl-9 pr-3 py-2 border border-gray-300 rounded text-sm w-64 focus:outline-none focus:ring-1 focus:ring-blue-500"
               />
             </div>
             <button 
               onClick={() => setIsCreateOpen(true)}
               className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 text-sm font-medium"
             >
               + Create List
             </button>
             <button onClick={onClose} className="text-2xl text-gray-500 hover:text-gray-700">&times;</button>
          </div>
        </div>
        
        <input 
          type="file" 
          ref={fileInputRef} 
          className="hidden" 
          accept=".csv" 
          onChange={handleFileChange}
        />

        <div className="p-5 overflow-y-auto flex-grow">
          {loading && <div className="text-center text-blue-600">Loading lists...</div>}
          {error && <div className="text-center text-red-600">Error: {error}</div>}
          
          {!loading && !error && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-3 font-medium text-gray-600">List Name</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Type</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Leads</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Created</th>
                    <th className="px-4 py-3 font-medium text-gray-600 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {lists.filter(list => list.name.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 ? (
                    <tr>
                      <td colSpan="5" className="px-4 py-8 text-center text-gray-500">
                        {lists.length === 0 ? "No lists found." : "No matching lists found."}
                      </td>
                    </tr>
                  ) : (
                    lists.filter(list => list.name.toLowerCase().includes(searchQuery.toLowerCase())).map((list) => (
                        <tr
                          key={list._id}
                          onClick={() => setSelectedListId(list._id)}
                          className="hover:bg-blue-50 cursor-pointer transition-colors group"
                        >
                          <td className="px-4 py-3 font-medium text-blue-600">{list.name}</td>
                          <td className="px-4 py-3">
                              <span className={`px-2 py-1 rounded-full text-xs ${
                                  list.kind === 'ai_query' ? 'bg-purple-100 text-purple-800' : 'bg-green-100 text-green-800'
                              }`}>
                                  {list.kind === 'ai_query' ? 'AI Query' : 'User Made'}
                              </span>
                          </td>
                          <td className="px-4 py-3 text-gray-600">{list.itemsCount}</td>
                          <td className="px-4 py-3 text-gray-600">{new Date(list.createdAt).toLocaleDateString()}</td>
                          <td className="px-4 py-3 text-right">
                              <div className="flex justify-end gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                                  <button
                                      onClick={(e) => triggerUpload(list._id, e)}
                                      className="bg-gray-100 text-gray-700 hover:bg-gray-200 px-2 py-1 rounded text-xs flex items-center gap-1"
                                      title="Upload CSV"
                                  >
                                      <Icon name="export" className="rotate-180" /> Upload
                                  </button>
                                  <button
                                      onClick={(e) => triggerUpload(list._id, e, true)}
                                      className="bg-blue-50 text-blue-600 hover:bg-blue-100 px-2 py-1 rounded text-xs flex items-center gap-1"
                                      title="Upload CSV & Notify User"
                                  >
                                      <Icon name="bell" /> Upload & Notify
                                  </button>
                                  <button
                                      onClick={(e) => handleDeleteList(list._id, e)}
                                      className="bg-red-50 text-red-600 hover:bg-red-100 px-2 py-1 rounded text-xs"
                                      title="Delete List"
                                  >
                                      Delete
                                  </button>
                              </div>
                          </td>
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {isCreateOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg p-6 w-[400px] shadow-xl">
            <h3 className="text-lg font-semibold mb-4 text-gray-800">Create New List</h3>
            <form onSubmit={handleCreateList}>
                <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">List Name</label>
                    <input
                        type="text"
                        value={newListName}
                        onChange={(e) => setNewListName(e.target.value)}
                        className="w-full border border-gray-300 rounded p-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        placeholder="e.g. CEO Leads"
                        required
                    />
                </div>
                <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-1">List Type</label>
                    <select
                        value={newListType}
                        onChange={(e) => setNewListType(e.target.value)}
                        className="w-full border border-gray-300 rounded p-2 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
                    >
                        <option value="people">People / Leads</option>
                        <option value="companies">Companies</option>
                    </select>
                </div>
                <div className="flex justify-end gap-3">
                    <button
                        type="button"
                        onClick={() => setIsCreateOpen(false)}
                        className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={isCreating}
                        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                    >
                        {isCreating ? 'Creating...' : 'Create'}
                    </button>
                </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

export default function AdminApiTestPage() {
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedUserInvoices, setSelectedUserInvoices] = useState(null);
  const [isInvoiceLoading, setIsInvoiceLoading] = useState(false);
  const [invoiceError, setInvoiceError] = useState(null);
  const [openDropdown, setOpenDropdown] = useState(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [csvFile, setCsvFile] = useState(null);
  const [csvColumns, setCsvColumns] = useState([]);
  const [csvFirstRow, setCsvFirstRow] = useState({});
  const [columnMappings, setColumnMappings] = useState({});
  const [searchQuery, setSearchQuery] = useState(""); // Search state
  const [selectedUserIds, setSelectedUserIds] = useState([]);

  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [groupOwnerId, setGroupOwnerId] = useState("");
  const [groupMemberIds, setGroupMemberIds] = useState([]);
  const [groupTeamName, setGroupTeamName] = useState("");
  const [isGrouping, setIsGrouping] = useState(false);

  const [isManageTeamModalOpen, setIsManageTeamModalOpen] = useState(false);
  const [manageTeamOwner, setManageTeamOwner] = useState(null);
  const [manageTeamData, setManageTeamData] = useState(null);
  const [isManagingTeam, setIsManagingTeam] = useState(false);
  const [newTeamMemberId, setNewTeamMemberId] = useState("");
  const [manageTeamPoolCredits, setManageTeamPoolCredits] = useState(0);

  useEffect(() => {
    const handleOpenManageTeam = (e) => {
      const user = e.detail;
      setManageTeamOwner(user);
      setIsManageTeamModalOpen(true);
      fetchTeamDetails(user._id);
    };
    document.addEventListener('openManageTeam', handleOpenManageTeam);
    return () => document.removeEventListener('openManageTeam', handleOpenManageTeam);
  }, []);

  const fetchTeamDetails = async (userId) => {
    try {
      setIsManagingTeam(true);
      const res = await fetch(`${config.apiUrl}/api/admin/getUserById/${userId}`, {
        credentials: "include"
      });
      const data = await res.json();
      if (res.ok && data.user) {
        setManageTeamData(data.user.orgId || null);
        setManageTeamPoolCredits(data.user.orgId?.poolCredits || 0);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsManagingTeam(false);
    }
  };

  const handleAddTeamMember = async () => {
    if (!newTeamMemberId || !manageTeamOwner) return;
    try {
      setIsManagingTeam(true);
      const res = await fetch(`${config.apiUrl}/api/admin/team/add-member`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerId: manageTeamOwner._id, memberId: newTeamMemberId }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to add member");
      }
      setNewTeamMemberId("");
      await fetchTeamDetails(manageTeamOwner._id);
      fetchAllUsers();
      Swal.fire({ title: "Success", text: "Member added successfully", icon: "success", timer: 1500, showConfirmButton: false });
    } catch (err) {
      Swal.fire({ icon: "error", title: "Error", text: err.message });
    } finally {
      setIsManagingTeam(false);
    }
  };

  const handleRemoveTeamMember = async (memberId) => {
    if (!manageTeamOwner) return;
    try {
      setIsManagingTeam(true);
      const res = await fetch(`${config.apiUrl}/api/admin/team/remove-member`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerId: manageTeamOwner._id, memberId }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to remove member");
      }
      await fetchTeamDetails(manageTeamOwner._id);
      fetchAllUsers();
      Swal.fire({ title: "Success", text: "Member removed successfully", icon: "success", timer: 1500, showConfirmButton: false });
    } catch (err) {
      Swal.fire({ icon: "error", title: "Error", text: err.message });
    } finally {
      setIsManagingTeam(false);
    }
  };

  const handleSaveTeamPoolCredits = async () => {
    if (!manageTeamOwner) return;
    try {
      setIsManagingTeam(true);
      await handleUpdateCredits(manageTeamOwner._id, parseInt(manageTeamPoolCredits, 10), 'pool');
      await fetchTeamDetails(manageTeamOwner._id);
    } catch (err) {
      // Error handled in handleUpdateCredits
    } finally {
      setIsManagingTeam(false);
    }
  };

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [usersPerPage, setUsersPerPage] = useState(12);
  const [showArchived, setShowArchived] = useState(false);

  const fetchAllUsers = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setSelectedUserInvoices(null);
    try {
      const res = await fetch(`${config.apiUrl}/api/admin/list-users?archived=${showArchived}&t=${Date.now()}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to fetch user list");
      }
      const data = await res.json();
      setUsers(data.users || []);
      // console.log(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [showArchived]);

  const handleUpdateCredits = async (userId, newCredits, type = 'personal') => {
    try {
      const res = await fetch(`${config.apiUrl}/api/admin/update-credits`, {
        method: "PUT",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userId, credits: newCredits, type }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to update credits");
      }
      await fetchAllUsers();
      Swal.fire({
        title: "Credits Updated!",
        text: type === 'pool' ? "Pool credits updated successfully!" : "User credits updated successfully!",
        imageUrl: "/icons/mawsool-success.webp",
        imageAlt: "Custom alert icon",
        timer: 1500,
        showConfirmButton: false,
      });
    } catch (err) {
      throw err;
    }
  };

  const handleUpdateMultiSession = async (userId, allowed) => {
    try {
      const res = await fetch(`${config.apiUrl}/api/admin/users/${userId}`, {
        method: "PUT",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ allowMultipleSessions: allowed }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to update session setting");
      }
      // Optimistically update local state or re-fetch
      setUsers(prev => prev.map(u => u._id === userId ? { ...u, allowMultipleSessions: allowed } : u));
      
      const Toast = Swal.mixin({
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 2000,
        timerProgressBar: true,
      });
      Toast.fire({
        icon: 'success',
        title: `Multi-session ${allowed ? 'enabled' : 'disabled'}`
      });

    } catch (err) {
      throw err;
    }
  };

  const handleGroupUsers = async (e) => {
    e.preventDefault();
    if (!groupOwnerId) {
      Swal.fire({ icon: "warning", title: "Missing Data", text: "Please select an owner." });
      return;
    }
    setIsGrouping(true);
    try {
      const res = await fetch(`${config.apiUrl}/api/admin/group-users`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ownerId: groupOwnerId,
          memberIds: groupMemberIds,
          teamName: groupTeamName,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to group users");
      }
      Swal.fire({
        title: "Users Grouped!",
        text: "Users have been grouped into the organization.",
        imageUrl: "/icons/mawsool-success.webp",
        imageAlt: "Custom alert icon",
        timer: 1500,
        showConfirmButton: false,
      });
      setIsGroupModalOpen(false);
      setGroupOwnerId("");
      setGroupMemberIds([]);
      setGroupTeamName("");
      fetchAllUsers();
    } catch (error) {
      Swal.fire({ icon: "error", title: "Error", text: error.message });
    } finally {
      setIsGrouping(false);
    }
  };

  const [editingPlanUser, setEditingPlanUser] = useState(null);
  const [newPlan, setNewPlan] = useState("");
  const [billingMode, setBillingMode] = useState("month");
  const [customBillingDate, setCustomBillingDate] = useState("");
  const [newSeatsAllowed, setNewSeatsAllowed] = useState("");
  const [selectedUserForLists, setSelectedUserForLists] = useState(null);
  const [selectedUserForCreditLogs, setSelectedUserForCreditLogs] = useState(null);
  const [creditLogsData, setCreditLogsData] = useState([]);
  const [isLoadingCreditLogs, setIsLoadingCreditLogs] = useState(false);

  const handleViewCreditLogs = async (user) => {
    setSelectedUserForCreditLogs(user);
    setIsLoadingCreditLogs(true);
    setCreditLogsData([]);
    try {
      const res = await fetch(`${config.apiUrl}/api/admin/user/${user._id}/credit-logs`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      
      const contentType = res.headers.get("content-type");
      if (contentType && contentType.indexOf("application/json") !== -1) {
        const data = await res.json();
        if (res.ok) {
          setCreditLogsData(data);
        } else {
          Swal.fire("Error", data.message || "Failed to fetch credit logs", "error");
        }
      } else {
        const text = await res.text();
        console.error("Non-JSON response from server:", text);
        Swal.fire("Error", "Received invalid response from server (404/HTML). Please restart your backend.", "error");
      }
    } catch (error) {
      console.error(error);
      Swal.fire("Error", "Server error", "error");
    } finally {
      setIsLoadingCreditLogs(false);
    }
  };

  const handleViewLists = (user) => {
    setSelectedUserForLists(user);
  };

  const handleUpdatePlan = async () => {
    if (!editingPlanUser) return;
    try {
      const payload = {
        userId: editingPlanUser._id,
        planKey: newPlan,
        billingMode,
      };
      if (billingMode === 'manual' && customBillingDate) {
        payload.billingDate = customBillingDate;
      }
      if (newSeatsAllowed !== "") {
        payload.seatsAllowed = Number(newSeatsAllowed);
      }

      const res = await fetch(`${config.apiUrl}/api/admin/update-plan`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to update plan");
      }

      Swal.fire({
        icon: "success",
        title: "Plan updated successfully",
        showConfirmButton: false,
        timer: 1500,
      });
      setEditingPlanUser(null);
      fetchAllUsers(); 
    } catch (error) {
      console.error("Failed to update plan:", error);
      Swal.fire({
        icon: "error",
        title: "Failed to update plan",
        text: error.message || "Unknown error",
      });
    }
  };

  const handleOpenPlanModal = (user) => {
    setEditingPlanUser(user);
    setNewPlan(user.planKey || user.orgId?.planKey || "BASIC");
    setBillingMode("month"); // Default
    setCustomBillingDate("");
    setNewSeatsAllowed(user.orgId?.seatsAllowed !== undefined ? user.orgId.seatsAllowed : "");
  };

  const regularUsers = useMemo(() => {
    return users.filter((user) => {
      // Show all users including admins
      // const isRegular = !user.role || user.role.toLowerCase() !== "admin";
      // if (!isRegular) return false;

      if (!searchQuery) return true;
      const query = searchQuery.toLowerCase();
      const nameMatch = (user.name || "").toLowerCase().includes(query);
      const emailMatch = (user.email || "").toLowerCase().includes(query);
      return nameMatch || emailMatch;
    });
  }, [users, searchQuery]);

  useEffect(() => {
    fetchAllUsers();
  }, [fetchAllUsers]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (openDropdown !== null) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener("click", handleClickOutside);
    return () => {
      document.removeEventListener("click", handleClickOutside);
    };
  }, [openDropdown]);

  const handleGetInvoices = async (userId) => {
    setIsInvoiceLoading(true);
    setInvoiceError(null);
    try {
      const res = await fetch(
        `${config.apiUrl}/api/admin/invoice/${userId}/invoices`,
        {
          credentials: "include",
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to fetch invoices");
      setSelectedUserInvoices(data.invoices || []);
    } catch (err) {
      setInvoiceError(err.message);
    } finally {
      setIsInvoiceLoading(false);
    }
  };

  const handleToggleArchive = async (userId, isArchived) => {
    const result = await Swal.fire({
      title: "Are you sure?",
      text: `Do you want to ${isArchived ? 'unarchive' : 'archive'} this user?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#3085d6",
      cancelButtonColor: "#d33",
      confirmButtonText: `Yes, ${isArchived ? 'unarchive' : 'archive'}!`
    });

    if (!result.isConfirmed) return;

    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${config.apiUrl}/api/admin/archiveUser/${userId}`,
        {
          method: "PUT",
          credentials: "include",
        }
      );
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to update archive status");
      }
      await fetchAllUsers();
      Swal.fire({
        title: "Status Updated!",
        text: `User ${isArchived ? 'unarchived' : 'archived'} successfully!`,
        imageUrl: "/icons/mawsool-success.webp",
        imageAlt: "Custom alert icon",
        timer: 1500,
        showConfirmButton: false,
      });
    } catch (err) {
      setError(err.message);
      setIsLoading(false);
    }
  };

  const handleDelete = async (userId) => {
    const result = await Swal.fire({
      title: "Are you sure?",
      text: "Are you sure you want to delete this user? This action cannot be undone.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      cancelButtonColor: "#3085d6",
      confirmButtonText: "Yes, delete it!"
    });

    if (!result.isConfirmed) return;
    
    setIsLoading(true);
    setError(null);
    setSelectedUserInvoices(null);
    try {
      const res = await fetch(
        `${config.apiUrl}/api/admin/deleteUser/${userId}`,
        {
          method: "DELETE",
          credentials: "include",
        }
      );
      if (res.status !== 204) {
        const data = await res.json();
        throw new Error(data.message || "Failed to delete user");
      }
      await fetchAllUsers();
      Swal.fire({
        title: "User deleted!",
        text: `User deleted successfully!`,
        imageUrl: "/icons/mawsool-success.webp",
        imageAlt: "Custom alert icon",
        timer: 1500,
        showConfirmButton: false,
      });
    } catch (err) {
      setError(err.message);
      setIsLoading(false);
    }
  };

  const toggleDropdown = (userId) => {
    setOpenDropdown((prev) => (prev === userId ? null : userId));
  };

  const generateUsersCSV = (usersList) => {
    if (!usersList || !usersList.length) return;

    const headers = [
      "Name",
      "Email",
      "WhatsApp Number",
      "LinkedIn Profile",
      "Company Name",
      "Signed Up Date",
      "UTM Source",
      "UTM Medium",
      "UTM Campaign",
      "UTM Term",
      "UTM Content"
    ];

    const rows = usersList.map((u) => [
      `"${(u.name || "").replace(/"/g, '""')}"`,
      `"${(u.email || "").replace(/"/g, '""')}"`,
      `"${(u.whatsappNumber || "").replace(/"/g, '""')}"`,
      `"${(u.linkedInUrl || "").split("|||").join(", ").replace(/"/g, '""')}"`,
      `"${(u.companyName || "").replace(/"/g, '""')}"`,
      `"${u.createdAt ? new Date(u.createdAt).toISOString().split('T')[0] : ""}"`,
      `"${(u.utmSource || "").replace(/"/g, '""')}"`,
      `"${(u.utmMedium || "").replace(/"/g, '""')}"`,
      `"${(u.utmCampaign || "").replace(/"/g, '""')}"`,
      `"${(u.utmTerm || "").replace(/"/g, '""')}"`,
      `"${(u.utmContent || "").replace(/"/g, '""')}"`
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.join(",")),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `users_export_${new Date().toISOString().slice(0, 10)}.csv`
    );
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportCSV = () => {
    Swal.fire({
      title: 'Export Users to CSV',
      html: `
        <div class="flex flex-col gap-4 text-left">
          <p class="text-sm text-gray-600 mb-2">Select what you want to export. This will respect the current view (Active vs Archived).</p>
          
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="exportMode" value="selected" ${selectedUserIds.length === 0 ? 'disabled' : 'checked'} />
            <span class="${selectedUserIds.length === 0 ? 'text-gray-400' : ''}">Selected Users (${selectedUserIds.length})</span>
          </label>
          
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="exportMode" value="current" ${selectedUserIds.length === 0 ? 'checked' : ''} />
            <span>Current View (${regularUsers.length} users)</span>
          </label>

          <label class="flex items-start gap-2 cursor-pointer mt-2 border-t pt-4">
            <input type="radio" name="exportMode" value="date_range" class="mt-1" />
            <div class="flex-1">
              <span class="block font-medium">Filter by Signup Date</span>
              <p class="text-xs text-gray-500 mb-2">Export users from the current view who signed up within a specific range.</p>
              <div class="flex gap-2">
                <div class="flex-1">
                  <label class="text-xs text-gray-500">From</label>
                  <input type="date" id="exportStartDate" class="border border-gray-300 rounded px-2 py-1.5 w-full text-sm mt-1" onclick="document.querySelector('input[name=exportMode][value=date_range]').checked = true;" />
                </div>
                <div class="flex-1">
                  <label class="text-xs text-gray-500">To</label>
                  <input type="date" id="exportEndDate" class="border border-gray-300 rounded px-2 py-1.5 w-full text-sm mt-1" onclick="document.querySelector('input[name=exportMode][value=date_range]').checked = true;" />
                </div>
              </div>
            </div>
          </label>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Export CSV',
      confirmButtonColor: '#2563eb',
      preConfirm: () => {
        const selectedMode = document.querySelector('input[name="exportMode"]:checked')?.value;
        const startDate = document.getElementById('exportStartDate').value;
        const endDate = document.getElementById('exportEndDate').value;
        
        if (selectedMode === 'date_range' && !startDate && !endDate) {
           Swal.showValidationMessage('Please select at least a From or To date for the date range export.');
           return false;
        }
        
        return { mode: selectedMode, startDate, endDate };
      }
    }).then((result) => {
      if (result.isConfirmed) {
        const { mode, startDate, endDate } = result.value;
        
        let usersToExport = [];
        if (mode === 'selected') {
          usersToExport = regularUsers.filter(u => selectedUserIds.includes(u._id));
        } else if (mode === 'current') {
          usersToExport = regularUsers;
        } else if (mode === 'date_range') {
          usersToExport = regularUsers.filter(u => {
            if (!u.createdAt) return false;
            const signupDate = new Date(u.createdAt);
            
            let passesStart = true;
            let passesEnd = true;
            
            if (startDate) {
              const start = new Date(startDate);
              start.setHours(0, 0, 0, 0);
              passesStart = signupDate >= start;
            }
            if (endDate) {
              const end = new Date(endDate);
              end.setHours(23, 59, 59, 999);
              passesEnd = signupDate <= end;
            }
            
            return passesStart && passesEnd;
          });
        }
        
        if (usersToExport.length === 0) {
          Swal.fire("No Users Found", "There are no users matching your export criteria.", "warning");
          return;
        }
        
        generateUsersCSV(usersToExport);
      }
    });
  };

  // Pagination logic
  const totalUsersCount = regularUsers.length;
  const totalPages = Math.ceil(totalUsersCount / usersPerPage);

  // Calculate the slice of users to display
  const indexOfLastUser = currentPage * usersPerPage;
  const indexOfFirstUser = indexOfLastUser - usersPerPage;
  const paginatedUsers = regularUsers.slice(indexOfFirstUser, indexOfLastUser);

  // Handle page change
  const handlePageChange = (pageNumber) => {
    setCurrentPage(pageNumber);
    setOpenDropdown(null); // Close any open dropdowns when changing pages
  };

  // Handle users per page change
  const handleUsersPerPageChange = (event) => {
    setUsersPerPage(Number(event.target.value));
    setCurrentPage(1); // Reset to first page when changing users per page
    setOpenDropdown(null); // Close any open dropdowns
  };

  // Generate page numbers for display
  const getPageNumbers = () => {
    const pageNumbers = [];
    const maxPagesToShow = 3;
    let startPage = Math.max(1, currentPage - Math.floor(maxPagesToShow / 2));
    let endPage = Math.min(totalPages, startPage + maxPagesToShow - 1);

    if (endPage - startPage + 1 < maxPagesToShow) {
      startPage = Math.max(1, endPage - maxPagesToShow + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
      pageNumbers.push(i);
    }
    return pageNumbers;
  };

  return (
    <DashboardContainer heading="User Management">
      <AdminRoute>
        <div className="min-h-screen bg-gray-50">
          <main className="flex flex-col min-h-screen">
            <div className="flex flex-col flex-grow">
              <div className="flex justify-between items-center mb-4 px-1 z-10 relative">
                <div className="flex gap-4 items-center">
                  <div className="relative w-64">
                    <input
                      type="text"
                      placeholder="Search users..."
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        setCurrentPage(1); // Reset to first page on search
                      }}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    />
                    <div className="absolute left-3 top-2.5 text-gray-400">
                      <Icon name="search" className="w-4 h-4" />
                    </div>
                  </div>

                  {/* Bulk Archive Action */}
                  {selectedUserIds.length > 0 && (
                    <button
                      onClick={async () => {
                        const result = await Swal.fire({
                          title: "Are you sure?",
                          text: `Do you want to ${showArchived ? 'unarchive' : 'archive'} ${selectedUserIds.length} selected users?`,  
                          icon: "warning",
                          showCancelButton: true,
                          confirmButtonColor: "#3085d6",
                          cancelButtonColor: "#d33",
                          confirmButtonText: `Yes, ${showArchived ? 'unarchive' : 'archive'} them!`
                        });

                        if (!result.isConfirmed) return;

                        setIsLoading(true);
                        try {
                          const res = await fetch(`${config.apiUrl}/api/admin/bulkArchiveUsers`, {
                            method: "PUT",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              userIds: selectedUserIds,
                              archiveStatus: !showArchived // If currently showing active, we want to archive them (true)
                            }),
                            credentials: "include",
                          });

                          if (!res.ok) throw new Error("Failed to bulk update archive status");

                          setSelectedUserIds([]); // Clear selection
                          await fetchAllUsers(); // Refresh table

                          Swal.fire({
                            title: "Success!",
                            text: `${selectedUserIds.length} users ${showArchived ? 'unarchived' : 'archived'} successfully!`,
                            imageUrl: "/icons/mawsool-success.webp",
                            imageAlt: "Custom alert icon",
                            timer: 1500,
                            showConfirmButton: false,
                          });
                        } catch (err) {
                          setError(err.message);
                          setIsLoading(false);
                        }
                      }}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${
                        showArchived
                          ? "bg-green-100 text-green-700 border-green-200 hover:bg-green-200"
                          : "bg-red-100 text-red-700 border-red-200 hover:bg-red-200"
                      }`}
                    >
                      {showArchived ? `Unarchive Selected (${selectedUserIds.length})` : `Archive Selected (${selectedUserIds.length})`}
                    </button>
                  )}
                </div>

                {/* Archive Toggle Button */}
                <button
                  onClick={() => {
                    setShowArchived(!showArchived);
                    setCurrentPage(1);
                  }}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${
                    showArchived 
                      ? "bg-purple-100 text-purple-700 border-purple-200 hover:bg-purple-200" 
                      : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  {showArchived ? "View Active Users" : "View Archived Bots"}
                </button>

                {/* Export CSV Button */}
                <button
                  onClick={handleExportCSV}
                  className="px-4 py-2 rounded-lg text-sm font-medium transition-colors border bg-green-50 text-green-700 border-green-200 hover:bg-green-100 flex items-center gap-2"
                >
                  <Icon name="export" className="w-4 h-4" /> Export CSV
                </button>
              </div>

              <div className="flex-grow bg-white rounded-lg shadow-sm overflow-visible border border-gray-200">
                {isLoading && paginatedUsers.length === 0 && (
                  <p className="p-6 text-center">Loading users...</p>
                )}
                {error && !isLoading && paginatedUsers.length === 0 && (
                  <p className="text-red-600 p-6">
                    <strong>Error:</strong> {error}
                  </p>
                )}
                {!isLoading && !error && paginatedUsers.length === 0 && (
                  <p className="p-6 text-center">No regular users found.</p>
                )}

                {paginatedUsers.length > 0 && (
                  <div className="overflow-x-auto h-full min-h-[300px]">
                    <table className="w-full h-full border-collapse text-sm bg-white rounded-lg whitespace-nowrap">
                      <UserTableHeader paginatedUsers={paginatedUsers} selectedUserIds={selectedUserIds} setSelectedUserIds={setSelectedUserIds} />
                      <tbody>
                        {paginatedUsers.map((user) => (
                          <UserRow
                            key={user._id}
                            user={user}
                            handleGetInvoices={handleGetInvoices}
                            handleDelete={handleDelete}
                            handleToggleArchive={handleToggleArchive}
                            handleUpdateCredits={handleUpdateCredits}
                            handleUpdateMultiSession={handleUpdateMultiSession} // Pass the handler
                            handleOpenPlanModal={handleOpenPlanModal}
                            handleViewLists={handleViewLists} // Pass it here
                            handleViewCreditLogs={handleViewCreditLogs}
                            selectedUserIds={selectedUserIds}
                            setSelectedUserIds={setSelectedUserIds}
                            openDropdown={openDropdown}
                            toggleDropdown={toggleDropdown}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Pagination and showing count */}
              <div className="flex justify-between items-center py-4 mt-4">
                <div className="text-sm text-gray-600">
                  Showing{" "}
                  <select
                    className="py-1.5 px-2.5 rounded border border-gray-200"
                    value={usersPerPage}
                    onChange={handleUsersPerPageChange}
                  >
                    <option value="12">12</option>
                    <option value="25">25</option>
                    <option value="50">50</option>
                  </select>{" "}
                  out of {totalUsersCount}
                </div>
                <div className="flex gap-1.5">
                  <button
                    className={`bg-blue-50 text-blue-600 border border-blue-100 py-2 px-3 rounded-md min-w-[35px] hover:bg-blue-100 ${
                      currentPage === 1 ? "opacity-50 cursor-not-allowed" : ""
                    }`}
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                  >
                    {"<"}
                  </button>
                  {getPageNumbers().map((pageNumber) => (
                    <button
                      key={pageNumber}
                      className={`py-2 px-3 rounded-md min-w-[35px] border ${
                        pageNumber === currentPage
                          ? "bg-blue-600 text-white border-blue-600"
                          : "bg-blue-50 text-blue-600 border-blue-100 hover:bg-blue-100"
                      }`}
                      onClick={() => handlePageChange(pageNumber)}
                    >
                      {pageNumber}
                    </button>
                  ))}
                  {totalPages > 3 && currentPage < totalPages - 1 && (
                    <span className="py-2 px-1.5 text-gray-600">...</span>
                  )}
                  {totalPages > 3 && currentPage < totalPages && (
                    <button
                      className="bg-blue-50 text-blue-600 border border-blue-100 py-2 px-3 rounded-md min-w-[35px] hover:bg-blue-100"
                      onClick={() => handlePageChange(totalPages)}
                    >
                      {totalPages}
                    </button>
                  )}
                  <button
                    className={`bg-blue-50 text-blue-600 border border-blue-100 py-2 px-3 rounded-md min-w-[35px] hover:bg-blue-100 ${
                      currentPage === totalPages
                        ? "opacity-50 cursor-not-allowed"
                        : ""
                    }`}
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                  >
                    {">"}
                  </button>
                </div>
              </div>
            </div>
          </main>

          {selectedUserInvoices && (
            <InvoiceHistoryPanel
              invoices={selectedUserInvoices}
              onClose={() => setSelectedUserInvoices(null)}
              isLoading={isInvoiceLoading}
              error={invoiceError}
            />
          )}

          {selectedUserForLists && (
            <UserListsPanel
              userId={selectedUserForLists._id}
              userName={selectedUserForLists.name || "User"}
              onClose={() => setSelectedUserForLists(null)}
            />
          )}

          {/* Credit History Modal */}
          {selectedUserForCreditLogs && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 overflow-hidden" onClick={() => setSelectedUserForCreditLogs(null)}>
              <div 
                className="bg-white rounded-lg p-6 w-[800px] max-h-[80vh] flex flex-col shadow-xl relative" 
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex justify-between items-center mb-4 pb-2 border-b">
                  <h3 className="text-xl font-semibold text-gray-800">
                    Credit History: {selectedUserForCreditLogs.name}
                  </h3>
                  <button 
                    onClick={() => setSelectedUserForCreditLogs(null)}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <Icon name="close" className="w-5 h-5" />
                  </button>
                </div>
                
                <div className="flex-1 overflow-y-auto">
                  {isLoadingCreditLogs ? (
                    <div className="flex justify-center items-center py-10">
                      <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                    </div>
                  ) : creditLogsData.length === 0 ? (
                    <div className="text-center py-10 text-gray-500">
                      No credit history found for this user.
                    </div>
                  ) : (
                    <table className="w-full border-collapse text-sm text-left">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="py-3 px-4 font-medium text-gray-600 border-b">Date</th>
                          <th className="py-3 px-4 font-medium text-gray-600 border-b">Action</th>
                          <th className="py-3 px-4 font-medium text-gray-600 border-b text-right">Amount</th>
                          <th className="py-3 px-4 font-medium text-gray-600 border-b text-right">Balance</th>
                          <th className="py-3 px-4 font-medium text-gray-600 border-b">Reason / Details</th>
                        </tr>
                      </thead>
                      <tbody>
                        {creditLogsData.map((log) => (
                          <tr key={log._id} className="border-b hover:bg-gray-50 transition-colors">
                            <td className="py-3 px-4 text-gray-600 whitespace-nowrap">
                              {new Date(log.createdAt).toLocaleString()}
                            </td>
                            <td className="py-3 px-4">
                              <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                                log.type === 'buy' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                              }`}>
                                {log.type === 'buy' ? 'Added' : 'Deducted'}
                              </span>
                            </td>
                            <td className={`py-3 px-4 text-right font-medium ${
                              log.type === 'buy' ? 'text-green-600' : 'text-red-600'
                            }`}>
                              {log.type === 'buy' ? '+' : '-'}{log.amount}
                            </td>
                            <td className="py-3 px-4 text-right text-gray-800 font-semibold">
                              {log.balance !== undefined && log.balance !== null ? log.balance : 'N/A'}
                            </td>
                            <td className="py-3 px-4 text-gray-700">
                              {log.description || 'N/A'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Manage Team Modal */}
          {isManageTeamModalOpen && manageTeamOwner && (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                  <h2 className="text-xl font-bold text-gray-800">
                    Manage Team: {manageTeamOwner.name}
                  </h2>
                  <button onClick={() => setIsManageTeamModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                    <Icon name="close" className="w-5 h-5" />
                  </button>
                </div>
                
                <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar">
                  {/* Team Details & Seats */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-blue-50 rounded-lg border border-blue-100">
                      <p className="text-sm text-blue-600 mb-1">Team Name</p>
                      <p className="text-lg font-semibold text-gray-800">{manageTeamData?.name || "No Team Yet"}</p>
                    </div>
                    <div className="p-4 bg-green-50 rounded-lg border border-green-100 flex flex-col justify-center">
                      <div className="flex justify-between items-center mb-1">
                        <p className="text-sm text-green-600">Seats Allowed</p>
                        <button
                          onClick={() => {
                            setIsManageTeamModalOpen(false);
                            handleOpenPlanModal(manageTeamOwner);
                          }}
                          className="text-xs text-blue-600 hover:text-blue-800 underline"
                        >
                          Edit Limit
                        </button>
                      </div>
                      <p className="text-lg font-semibold text-gray-800">
                        {manageTeamData ? `${manageTeamData.members?.length || 0} / ${(Math.max(manageTeamData.seatsAllowed || 0, manageTeamData.maxExtraUsers || 0)) + 1}` : "0 / 0"}
                        <span className="text-xs text-gray-500 font-normal ml-2">(Owner included)</span>
                      </p>
                    </div>
                  </div>

                  {/* Edit Pool Credits */}
                  <div className="p-4 border border-gray-200 rounded-lg">
                    <h3 className="text-md font-semibold text-gray-800 mb-3">Team Pool Credits</h3>
                    <div className="flex items-center gap-3">
                      <input
                        type="number"
                        value={manageTeamPoolCredits}
                        onChange={(e) => setManageTeamPoolCredits(e.target.value)}
                        className="w-32 p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#04145C]"
                      />
                      <button
                        onClick={handleSaveTeamPoolCredits}
                        disabled={isManagingTeam}
                        className="bg-[#04145C] text-white px-4 py-2 rounded-lg hover:bg-[#052074] transition-colors text-sm font-medium disabled:opacity-50"
                      >
                        {isManagingTeam ? "Saving..." : "Save Credits"}
                      </button>
                    </div>
                  </div>

                  {/* Add Member */}
                  <div className="p-4 border border-gray-200 rounded-lg">
                    <h3 className="text-md font-semibold text-gray-800 mb-3">Add Team Member</h3>
                    <div className="flex items-center gap-3">
                      <select
                        value={newTeamMemberId}
                        onChange={(e) => setNewTeamMemberId(e.target.value)}
                        className="flex-1 p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#04145C]"
                      >
                        <option value="">-- Select user to add --</option>
                        {users
                          .filter(u => u._id !== manageTeamOwner._id)
                          .filter(u => !manageTeamData?.members?.some(m => String(m.userId?._id || m.userId) === String(u._id)))
                          .map(u => (
                            <option key={u._id} value={u._id}>{u.name || u.email} ({u.email})</option>
                          ))}
                      </select>
                      <button
                        onClick={handleAddTeamMember}
                        disabled={isManagingTeam || !newTeamMemberId}
                        className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors text-sm font-medium disabled:opacity-50"
                      >
                        Add Member
                      </button>
                    </div>
                  </div>

                  {/* Member List */}
                  <div>
                    <h3 className="text-md font-semibold text-gray-800 mb-3">Current Members</h3>
                    {!manageTeamData || !manageTeamData.members || manageTeamData.members.length === 0 ? (
                      <p className="text-sm text-gray-500 italic">No members yet.</p>
                    ) : (
                      <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-48 overflow-y-auto">
                        {manageTeamData.members.map(member => {
                          const mUser = member.userId;
                          if (!mUser) return null;
                          const isOwner = String(mUser._id || mUser) === String(manageTeamOwner._id);
                          return (
                            <div key={mUser._id || mUser} className="flex justify-between items-center p-3 hover:bg-gray-50">
                              <div>
                                <p className="text-sm font-medium text-gray-800">{mUser.name || "Unknown"} <span className="text-xs text-gray-500 font-normal">({mUser.email})</span></p>
                                <p className="text-xs text-gray-500 capitalize">{member.role || "Member"}</p>
                              </div>
                              {!isOwner && (
                                <button
                                  onClick={() => handleRemoveTeamMember(mUser._id || mUser)}
                                  disabled={isManagingTeam}
                                  className="text-red-500 hover:text-red-700 text-sm font-medium px-3 py-1 rounded hover:bg-red-50 transition-colors disabled:opacity-50"
                                >
                                  Remove
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                </div>
              </div>
            </div>
          )}

          {/* Edit Plan Modal */}
          {editingPlanUser && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
              <div className="bg-white rounded-lg p-6 w-[400px] shadow-xl">
                <h3 className="text-lg font-semibold mb-4 text-[#222]">
                  Edit Plan for {editingPlanUser.name}
                </h3>
                
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Select Plan
                  </label>
                  <div className="flex flex-col gap-2">
                    {["FREE", "BASIC", "PRO", "PREMIUM"].map((plan) => (
                      <label
                        key={plan}
                        className={`flex items-center p-3 border rounded-lg cursor-pointer transition-colors ${
                          newPlan === plan
                            ? "border-[#04145C] bg-blue-50"
                            : "border-gray-200 hover:border-gray-300"
                        }`}
                      >
                        <input
                          type="radio"
                          name="plan"
                          value={plan}
                          checked={newPlan === plan}
                          onChange={(e) => setNewPlan(e.target.value)}
                          className="mr-3 text-[#04145C] focus:ring-[#04145C]"
                        />
                        <span className="text-sm font-medium text-[#222]">
                          {plan}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Next Billing Date
                  </label>
                  <div className="flex flex-col gap-2">
                    <select 
                      value={billingMode} 
                      onChange={(e) => setBillingMode(e.target.value)}
                      className="w-full p-2 border border-gray-300 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#04145C]"
                    >
                      <option value="month">1 Month from Now</option>
                      <option value="year">1 Year from Now</option>
                      <option value="manual">Custom Date</option>
                    </select>
                    
                    {billingMode === 'manual' && (
                      <input 
                        type="date" 
                        value={customBillingDate}
                        onChange={(e) => setCustomBillingDate(e.target.value)}
                        className="w-full p-2 border border-gray-300 rounded-lg text-sm text-gray-800"
                      />
                    )}
                  </div>
                </div>

                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Extra Team Seats Limit (Admin Override)
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="Leave empty for plan default"
                    value={newSeatsAllowed}
                    onChange={(e) => setNewSeatsAllowed(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#04145C]"
                  />
                  <p className="text-xs text-gray-500 mt-1">This overrides the default max extra users allowed for this team.</p>
                </div>

                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => setEditingPlanUser(null)}
                    className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleUpdatePlan}
                    className="px-4 py-2 text-sm text-white bg-[#04145C] hover:bg-[#03124A] rounded-lg transition-colors"
                  >
                    Save Changes
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Group Users Modal */}
          {isGroupModalOpen && (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                  <h2 className="text-xl font-bold text-gray-800">Group Users into Team</h2>
                  <button onClick={() => setIsGroupModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                    <Icon name="close" className="w-5 h-5" />
                  </button>
                </div>
                
                <div className="p-6 space-y-4 overflow-y-auto custom-scrollbar">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Team Name (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. Acme Corp Team"
                      value={groupTeamName}
                      onChange={(e) => setGroupTeamName(e.target.value)}
                      className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#04145C]"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Select Owner (Admin)</label>
                    <select
                      value={groupOwnerId}
                      onChange={(e) => setGroupOwnerId(e.target.value)}
                      className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#04145C]"
                    >
                      <option value="">-- Choose Owner --</option>
                      {users.map(u => (
                        <option key={u._id} value={u._id}>{u.name || u.email} ({u.email})</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Select Members</label>
                    <div className="border border-gray-300 rounded-lg max-h-48 overflow-y-auto p-2 space-y-1">
                      {users.filter(u => u._id !== groupOwnerId).map(u => (
                        <label key={u._id} className="flex items-center gap-2 p-1.5 hover:bg-gray-50 rounded cursor-pointer">
                          <input
                            type="checkbox"
                            checked={groupMemberIds.includes(u._id)}
                            onChange={(e) => {
                              if (e.target.checked) setGroupMemberIds([...groupMemberIds, u._id]);
                              else setGroupMemberIds(groupMemberIds.filter(id => id !== u._id));
                            }}
                            className="rounded text-[#04145C] focus:ring-[#04145C]"
                          />
                          <span className="text-sm text-gray-700">{u.name || u.email} ({u.email})</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="p-4 border-t border-gray-100 flex justify-end gap-3 bg-gray-50">
                  <button
                    onClick={() => setIsGroupModalOpen(false)}
                    className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleGroupUsers}
                    disabled={isGrouping || !groupOwnerId}
                    className="px-4 py-2 text-sm text-white bg-[#04145C] hover:bg-[#03124A] rounded-lg transition-colors disabled:opacity-50"
                  >
                    {isGrouping ? "Grouping..." : "Group Users"}
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>
      </AdminRoute>
    </DashboardContainer>
  );
}