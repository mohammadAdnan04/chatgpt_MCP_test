"use client";

import React, { useEffect, useState, useRef } from "react";
import Papa from "papaparse";
import axios from "axios";
import Swal from "sweetalert2";
import FilterTag from "@/components/search/FilterTag";
import AutoSuggestInput from "@/components/search/AutoSuggestInput";
import Modal from "@/components/shared/Modal";

const ExCompanyFilter = ({ onChange, value, initialValue }) => {
  // Prefer fully controlled `value`, else `initialValue`
  const propValue = value || initialValue;

  const [roleFilter, setRoleFilter] = useState({
    include: propValue?.include || [],
    exclude: propValue?.exclude || [],
  });

  const [labelsMap, setLabelsMap] = useState({
    include: propValue?.includeLabels || {},
    exclude: propValue?.excludeLabels || {},
  });

  // Modal and Lists State
  const [showListModal, setShowListModal] = useState(false);
  const [importType, setImportType] = useState("include");
  const [userLists, setUserLists] = useState([]);
  const [listsLoading, setListsLoading] = useState(false);
  const [importingList, setImportingList] = useState(false);

  // Fetch Lists
  const fetchUserLists = async () => {
    try {
      setListsLoading(true);
      const token = typeof window !== "undefined" ? localStorage.getItem("auth-token") : null;
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const res = await axios.get(`${apiUrl}/api/list?includeTeam=true`, {
        withCredentials: true,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const lists = Array.isArray(res.data) ? res.data : [];
      // Only show company lists
      const companyLists = lists.filter(l => l.listType === 'company' || l.listType === 'companies');
      
      // Get item counts correctly mapped
      const enrichedLists = companyLists.map(list => {
        // Find the count from the itemsCount map if available, otherwise try fallback properties
        const count = list.itemsCount || list.itemCount || list.totalItems || 0;
        return {
          ...list,
          count: count
        };
      });

      setUserLists(enrichedLists);
    } catch (e) {
      console.error("Failed to fetch lists:", e);
      setUserLists([]);
    } finally {
      setListsLoading(false);
    }
  };

  const handleOpenListModal = (type) => {
    setImportType(type);
    setShowListModal(true);
    fetchUserLists();
  };

  const handleSelectList = async (listId) => {
    try {
      setImportingList(true);
      const token = typeof window !== "undefined" ? localStorage.getItem("auth-token") : null;
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      
      let page = 1;
      let pages = 1;
      const limit = 500;
      const allItems = [];
      
      while (page <= pages) {
        const res = await axios.get(`${apiUrl}/api/list/${listId}?page=${page}&limit=${limit}`, {
          withCredentials: true,
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const { items: pageItems, pagination } = res.data;
        (pageItems || []).forEach(it => allItems.push(it));
        pages = pagination?.totalPages || 1;
        page += 1;
      }
      
      // Extract name, domain, and linkedin_id from items
      const extractedItems = allItems.map(item => {
        const name = item.raw?.name || item.raw?.company || item.name || null;
        const domain = item.raw?.domain || item.domain || null;
        const linkedin_id = item.raw?.linkedin_id || item.raw?.company_linkedin_id || item.linkedin_id || null;
        return { name, domain, linkedin_id };
      }).filter(item => item.name || item.domain || item.linkedin_id);

      processExtractedItems(extractedItems, importType);
      setShowListModal(false);
    } catch (e) {
      console.error("Failed to fetch list items:", e);
      alert("Failed to import companies from the selected list.");
    } finally {
      setImportingList(false);
    }
  };

  // Dropdown UI logic
  const [dropdownOpen, setDropdownOpen] = useState({ include: false, exclude: false });
  const dropdownRefs = {
    include: useRef(null),
    exclude: useRef(null)
  };

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRefs.include.current && !dropdownRefs.include.current.contains(e.target)) {
        setDropdownOpen(prev => ({ ...prev, include: false }));
      }
      if (dropdownRefs.exclude.current && !dropdownRefs.exclude.current.contains(e.target)) {
        setDropdownOpen(prev => ({ ...prev, exclude: false }));
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ----- helpers -------------------------------------------------------------

  const normalizeItem = (item) => {
    if (item !== null && typeof item !== "object") {
      return { id: item, title: String(item), domain: "", isCustom: true };
    }
    const id = item?.id ?? item?.domain ?? item?.name ?? item?.value;
    const title = item?.title ?? item?.name ?? item?.label ?? (id != null ? String(id) : "");
    const domain = item?.domain || "";
    const isCustom = item?.isCustom || false;
    const name = item?.name || title;
    return { id, title, domain, isCustom, name };
  };

  const notifyChange = (
    nextFilter,
    includeLabelsOverride,
    excludeLabelsOverride
  ) => {
    const includeLabels = includeLabelsOverride ?? labelsMap.include;
    const excludeLabels = excludeLabelsOverride ?? labelsMap.exclude;

    onChange?.({
      include: nextFilter.include,
      exclude: nextFilter.exclude,
      includeLabels,
      excludeLabels,
      // aliases to match your other filters
      includes: nextFilter.include,
      excludes: nextFilter.exclude,
      includesTitles: includeLabels,
      excludesTitles: excludeLabels,
    });
  };

  // ----- sync from props (merge, don’t wipe) ---------------------------------
  useEffect(() => {
    if (!propValue) {
        setRoleFilter({ include: [], exclude: [] });
        setLabelsMap({ include: {}, exclude: {} });
        return;
      }

    const newInclude = (propValue.include || []).map(String);
    const newExclude = (propValue.exclude || []).map(String);
    
    setRoleFilter(prev => {
      const includeChanged = JSON.stringify(prev.include) !== JSON.stringify(newInclude);
      const excludeChanged = JSON.stringify(prev.exclude) !== JSON.stringify(newExclude);
      if (includeChanged || excludeChanged) {
        return { include: newInclude, exclude: newExclude };
      }
      return prev;
    });

    setLabelsMap((prev) => {
      let hasChanges = false;
      const next = { include: { ...prev.include }, exclude: { ...prev.exclude } };

      if (propValue.includeLabels) {
        for (const [k, v] of Object.entries(propValue.includeLabels)) {
          if (next.include[k] !== v) {
            next.include[k] = v;
            hasChanges = true;
          }
        }
      }

      if (propValue.excludeLabels) {
        for (const [k, v] of Object.entries(propValue.excludeLabels)) {
          if (next.exclude[k] !== v) {
            next.exclude[k] = v;
            hasChanges = true;
          }
        }
      }

      return hasChanges ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(propValue)]);

  // ----- handlers ------------------------------------------------------------

  const processExtractedItems = (items, type) => {
    if (!items || !Array.isArray(items)) return;

    let processedItems = items;

    const newIds = [];
    const newLabels = {};

    processedItems.forEach(item => {
      // If it has a linkedin_id, use it directly for exact matching
      if (typeof item === 'object' && item.linkedin_id) {
        newIds.push(String(item.linkedin_id));
        newLabels[String(item.linkedin_id)] = item.name || item.domain || item.linkedin_id;
        return;
      }

      let rawDomain = typeof item === 'string' ? item : item.domain;
      let rawName = typeof item === 'string' ? null : item.name;

      if (rawDomain) rawDomain = String(rawDomain);
      if (rawName) rawName = String(rawName);

      if (!rawDomain && !rawName) return;

      let cleanDomain = rawDomain;
      if (rawDomain && rawDomain.includes('.')) {
        // Clean up URLs (remove BOM, quotes, http, https, www, paths)
        cleanDomain = rawDomain.toLowerCase()
          .replace(/[\uFEFF"']/g, '') // remove BOM and quotes
          .trim()
          .replace(/^(https?:\/\/)?(www\.)?/, '')
          .split('/')[0]
          .trim();
      } else {
        // It's just a company name
        cleanDomain = rawName ? rawName.trim() : (rawDomain ? rawDomain.trim() : '');
      }

      // Generate Name Part
      let namePart = rawName ? rawName.trim() : (cleanDomain.includes('.') ? cleanDomain.split('.')[0] : cleanDomain);
      if (!rawName && namePart) {
         namePart = namePart.charAt(0).toUpperCase() + namePart.slice(1);
      }

      if (!namePart && !cleanDomain) return;

      const id = `${namePart}|||${cleanDomain}`;
      newIds.push(id);
      newLabels[id] = rawName ? rawName.trim() : cleanDomain; // Display name or domain
    });

    // Filter out items that are already selected
    const safeRoleFilter = roleFilter[type] || [];
    const uniqueNewIds = newIds.filter(id => !safeRoleFilter.includes(id));
    
    if (uniqueNewIds.length === 0) return;

    const nextFilter = {
      ...roleFilter,
      [type]: [...safeRoleFilter, ...uniqueNewIds],
    };

    const safeIncludeLabels = labelsMap.include || {};
    const safeExcludeLabels = labelsMap.exclude || {};

    const nextIncludeLabels = type === "include" ? { ...safeIncludeLabels, ...newLabels } : { ...safeIncludeLabels };
    const nextExcludeLabels = type === "exclude" ? { ...safeExcludeLabels, ...newLabels } : { ...safeExcludeLabels };

    setRoleFilter(nextFilter);
    setLabelsMap({ include: nextIncludeLabels, exclude: nextExcludeLabels });
    notifyChange(nextFilter, nextIncludeLabels, nextExcludeLabels);
  };

  const handleFileUpload = (e, type) => {
    const file = e.target.files[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        let extractedItems = [];

        // Check if there are headers that look like website/domain
        const headers = results.meta.fields || [];
        const domainHeader = headers.find(h => 
          h.toLowerCase().includes('website') || 
          h.toLowerCase().includes('domain') || 
          h.toLowerCase().includes('url')
        );
        const nameHeader = headers.find(h => 
          h.toLowerCase().includes('company name') || 
          h.toLowerCase().includes('name') || 
          h.toLowerCase() === 'company'
        );

        if (domainHeader || nameHeader) {
          // Complex CSV with headers
          extractedItems = results.data.map(row => {
            let domain = domainHeader ? row[domainHeader] : null;
            let name = nameHeader ? row[nameHeader] : null;
            return { domain, name };
          }).filter(item => item.domain || item.name);
        } else {
          // Simple CSV without headers (fallback)
          const reader = new FileReader();
          reader.onload = (event) => {
            const text = event.target.result;
            Papa.parse(text, {
              skipEmptyLines: true,
              complete: (res) => {
                const parsedItems = res.data.map(row => {
                  let name = null;
                  let domain = null;
                  
                  if (row.length === 1) {
                    if (row[0].includes('.')) {
                      domain = row[0].trim();
                    } else {
                      name = row[0].trim();
                      domain = row[0].trim(); // Fallback for ID generation
                    }
                  } else if (row.length >= 2) {
                    if (row[1].includes('.')) {
                      name = row[0].trim();
                      domain = row[1].trim();
                    } else if (row[0].includes('.')) {
                      domain = row[0].trim();
                      name = row[1].trim();
                    } else {
                      name = row[0].trim();
                      domain = row[0].trim();
                    }
                  }
                  return { name, domain };
                }).filter(item => item.name || item.domain);
                
                processExtractedItems(parsedItems, type);
              }
            });
          };
          reader.readAsText(file);
          e.target.value = null;
          return;
        }

        processExtractedItems(extractedItems, type);
      }
    });
    
    // Clear the input so the same file can be uploaded again if needed
    e.target.value = null;
  };

  const handleSelect = (type) => (rawItem) => {
    if (!rawItem) return; // ignore clears from autosuggest
    let { id, title, domain, isCustom, name } = normalizeItem(rawItem);
    if (id == null) return;

    // If it's a custom input (doesn't contain |||) we format it so backend knows it's a custom name
    if (typeof id === 'string' && !id.includes('|||')) {
        // BUT wait! If it's a numeric ID (from linkedin_id), we should NOT format it with |||
        if (!/^\d+$/.test(id)) {
            let namePart = name || title || id;
            let domainPart = domain || id;
            
            // If the user typed a domain like "example.com"
            if (domainPart.includes('.') && !domainPart.includes(' ')) {
                if (!name || name === id) {
                    namePart = domainPart.split('.')[0];
                    namePart = namePart.charAt(0).toUpperCase() + namePart.slice(1);
                }
            }
            id = `${namePart}|||${domainPart}`;
        }
    }

    const idStr = String(id);
    if (roleFilter[type].some((x) => String(x) === idStr)) return; // dedupe

    // 1) compute next filter
    const nextFilter = {
      ...roleFilter,
      [type]: [...roleFilter[type], idStr],
    };

    // 2) compute next label maps synchronously
    const nextIncludeLabels =
      type === "include"
        ? { ...labelsMap.include, [idStr]: title || idStr }
        : { ...labelsMap.include };

    const nextExcludeLabels =
      type === "exclude"
        ? { ...labelsMap.exclude, [idStr]: title || idStr }
        : { ...labelsMap.exclude };

    // 3) update local state
    setRoleFilter(nextFilter);
    setLabelsMap({ include: nextIncludeLabels, exclude: nextExcludeLabels });

    // 4) notify parent with the same snapshot (prevents “add → wipe”)
    notifyChange(nextFilter, nextIncludeLabels, nextExcludeLabels);
  };

  const handleRemove = (type) => (idToRemove) => {
    const idStr = String(idToRemove);

    const nextFilter = {
      ...roleFilter,
      [type]: roleFilter[type].filter((x) => String(x) !== idStr),
    };

    const nextIncludeLabels = { ...labelsMap.include };
    const nextExcludeLabels = { ...labelsMap.exclude };
    if (type === "include") delete nextIncludeLabels[idStr];
    else delete nextExcludeLabels[idStr];

    setRoleFilter(nextFilter);
    setLabelsMap({ include: nextIncludeLabels, exclude: nextExcludeLabels });

    notifyChange(nextFilter, nextIncludeLabels, nextExcludeLabels);
  };

  // ----- render --------------------------------------------------------------

  return (
    <div className="flex flex-col gap-4">
      {/* Include */}
      <div className="flex flex-col gap-2">
        <div className="flex justify-between items-center">
          <p className="text-sm font-medium text-[#222222]">Include</p>
          <div className="relative" ref={dropdownRefs.include}>
            <button 
              className="text-xs text-[#0F62FE] cursor-pointer hover:underline flex items-center gap-1"
              onClick={() => setDropdownOpen(prev => ({ ...prev, include: !prev.include }))}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
              Import Companies
            </button>
            {dropdownOpen.include && (
              <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 shadow-lg rounded z-20 w-40 py-1">
                <label className="block px-4 py-2 text-xs text-gray-700 hover:bg-gray-100 cursor-pointer">
                  Upload CSV
                  <input type="file" accept=".csv" className="hidden" onChange={(e) => { setDropdownOpen(prev => ({ ...prev, include: false })); handleFileUpload(e, 'include'); }} />
                </label>
                <button 
                  className="w-full text-left block px-4 py-2 text-xs text-gray-700 hover:bg-gray-100 cursor-pointer"
                  onClick={() => { setDropdownOpen(prev => ({ ...prev, include: false })); handleOpenListModal('include'); }}
                >
                  Choose from Lists
                </button>
              </div>
            )}
          </div>
        </div>
        <AutoSuggestInput
          placeholder="Choose Company"
          apiUrl={`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/proxy/companies/suggest`}
          queryParam="q"
          accountId="oUYAc-QUQTmxK3_yq9iL4Q"
          onSelect={handleSelect("include")}
          responseSuggestions={(res) => {
            return (res.data || []).map((item) => ({
              id: item.linkedin_id || item.public_id || item.id || item.name, // Prefer linkedin_id for exact matching
              title: item.name,
              name: item.name,
              domain: item.domain,
              logo: item.logo,
            }));
          }}
          selectedItems={roleFilter.include} // IDs array
          showLogo={true}
          allowCustomInput={true}
        />
        <div className="flex flex-wrap gap-2">
          {roleFilter.include.map((id) => {
            const key = String(id);
            const label = labelsMap.include[key] ?? key;
            return (
              <FilterTag
                key={key}
                text={label}
                onRemove={() => handleRemove("include")(key)}
              />
            );
          })}
        </div>
      </div>

      {/* Exclude */}
      <div className="flex flex-col gap-2">
        <div className="flex justify-between items-center">
          <p className="text-sm font-medium text-[#222222]">Exclude</p>
          <div className="relative" ref={dropdownRefs.exclude}>
            <button 
              className="text-xs text-[#0F62FE] cursor-pointer hover:underline flex items-center gap-1"
              onClick={() => setDropdownOpen(prev => ({ ...prev, exclude: !prev.exclude }))}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
              Import Companies
            </button>
            {dropdownOpen.exclude && (
              <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 shadow-lg rounded z-20 w-40 py-1">
                <label className="block px-4 py-2 text-xs text-gray-700 hover:bg-gray-100 cursor-pointer">
                  Upload CSV
                  <input type="file" accept=".csv" className="hidden" onChange={(e) => { setDropdownOpen(prev => ({ ...prev, exclude: false })); handleFileUpload(e, 'exclude'); }} />
                </label>
                <button 
                  className="w-full text-left block px-4 py-2 text-xs text-gray-700 hover:bg-gray-100 cursor-pointer"
                  onClick={() => { setDropdownOpen(prev => ({ ...prev, exclude: false })); handleOpenListModal('exclude'); }}
                >
                  Choose from Lists
                </button>
              </div>
            )}
          </div>
        </div>
        <AutoSuggestInput
          placeholder="Choose Company to Exclude"
          apiUrl={`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/proxy/companies/suggest`}
          queryParam="q"
          accountId="oUYAc-QUQTmxK3_yq9iL4Q"
          onSelect={handleSelect("exclude")}
          responseSuggestions={(res) => {
            return (res.data || []).map((item) => ({
              id: item.linkedin_id || item.public_id || item.id || item.name, // Prefer linkedin_id for exact matching
              title: item.name,
              name: item.name,
              domain: item.domain,
              logo: item.logo,
            }));
          }}
          selectedItems={roleFilter.exclude}
          showLogo={true}
          allowCustomInput={true}
        />
        <div className="flex flex-wrap gap-2">
          {roleFilter.exclude.map((id) => {
            const key = String(id);
            const label = labelsMap.exclude[key] ?? key;
            return (
              <FilterTag
                key={key}
                text={label}
                onRemove={() => handleRemove("exclude")(key)}
              />
            );
          })}
        </div>
      </div>
      {/* Modal for Selecting List */}
      <Modal
        heading={`Import to ${importType === "include" ? "Include" : "Exclude"}`}
        isOpen={showListModal}
        onClose={() => !importingList && setShowListModal(false)}
      >
        <div className="w-full flex flex-col gap-4">
          <p className="text-sm text-gray-600">Select a company list to import its companies into this filter.</p>
          
          {listsLoading ? (
            <div className="flex justify-center py-8">
              <span className="inline-block animate-spin h-6 w-6 border-2 border-[#04145C] border-t-transparent rounded-full" />
            </div>
          ) : userLists.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 bg-gray-50 rounded-xl border border-dashed border-gray-200">
              <img src="/icons/Company.svg" alt="Company" className="w-10 h-10 opacity-50 mb-3" />
              <p className="text-sm font-medium text-gray-600">No company lists found</p>
              <p className="text-xs text-gray-400 mt-1">Save some companies to a list first</p>
            </div>
          ) : (
            <div className="max-h-[300px] overflow-y-auto border border-gray-200 rounded-xl divide-y divide-gray-100 shadow-sm bg-white custom-scrollbar">
              {userLists.map(list => (
                <button
                  key={list._id}
                  disabled={importingList}
                  onClick={() => handleSelectList(list._id)}
                  className="w-full text-left px-5 py-3.5 hover:bg-gray-50 active:bg-gray-100 disabled:opacity-50 flex justify-between items-center transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-[#04145C] group-hover:bg-blue-100 transition-colors">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                    </div>
                    <span className="text-sm font-semibold text-gray-800">{list.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium px-2.5 py-1 bg-gray-100 text-gray-600 rounded-full group-hover:bg-white group-hover:border group-hover:border-gray-200 transition-all">
                      {list.count} companies
                    </span>
                    <svg className="w-4 h-4 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity -translate-x-2 group-hover:translate-x-0 duration-200" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                  </div>
                </button>
              ))}
            </div>
          )}

          {importingList && (
            <div className="flex items-center justify-center gap-2 mt-2 bg-blue-50 py-2.5 rounded-lg border border-blue-100">
              <span className="inline-block animate-spin h-4 w-4 border-2 border-[#0F62FE] border-t-transparent rounded-full" />
              <p className="text-xs font-medium text-[#0F62FE]">Importing companies...</p>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
};

export default ExCompanyFilter;
