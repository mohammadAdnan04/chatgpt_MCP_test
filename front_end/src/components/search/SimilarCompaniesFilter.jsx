"use client";

import React, { useEffect, useState } from "react";
import FilterTag from "@/components/search/FilterTag";
import AutoSuggestInput from "@/components/search/AutoSuggestInput";
import axios from "axios";

const SimilarCompaniesFilter = ({ onChange, value }) => {
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [isLoadingId, setIsLoadingId] = useState(false);

  // If value is passed from parent (saved filter), sync state
  useEffect(() => {
    if (value && typeof value === 'string' && !selectedCompany) {
       // If we only have the ID, we might want to fetch the name, but for now we just show the ID
       setSelectedCompany({ id: value, title: value });
    }
  }, [value]);

  const handleSelect = async (item) => {
    if (!item) return;

    console.log("SimilarCompaniesFilter: Selected Item:", item);

    // 1. If user selected from dropdown (has ID)
    if (item.id && item.id !== item.title) { 
        // item.id is usually the name in CompanyNameFilter, but let's see what the API returns
        // The suggest API returns { name, logo, domain, linkedin_id, ... }
        // We need the 'public_id' or 'id' which is used for the vector search.
        
        // IMPORTANT: The suggestion API returns 'id' as the public_id usually.
        // Let's ensure we are using the correct ID field.
        const companyId = item.id; 
        
        console.log("SimilarCompaniesFilter: Setting ID:", companyId);
        
        setSelectedCompany({ id: companyId, title: item.title, logo: item.logo });
        onChange(companyId); // Pass the ID to the parent filter state
    } 
    // 2. If user typed a custom domain or name (no ID yet)
    else {
        setIsLoadingId(true);
        try {
            const query = item.title || item;
            console.log("SimilarCompaniesFilter: Looking up ID for:", query);
            
            // Use the search-ids endpoint we saw in server.js to find the company ID
            // GET /search-ids/companies?keywords=...
            const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000"}/search-ids/companies`, {
                params: { keywords: query }
            });
            
            const match = response.data?.items?.[0];
            if (match) {
                const companyId = match.id || match.name;
                console.log("SimilarCompaniesFilter: Found ID:", companyId);
                setSelectedCompany({ id: companyId, title: match.name, logo: match.logo });
                onChange(companyId);
            } else {
                // Fallback: Use the text as ID if no match found (might fail in backend but better than nothing)
                 console.warn("SimilarCompaniesFilter: No ID found, using query:", query);
                 setSelectedCompany({ id: query, title: query });
                 onChange(query);
            }
        } catch (e) {
            console.error("Failed to lookup company ID:", e);
             setSelectedCompany({ id: item.title, title: item.title });
             onChange(item.title);
        } finally {
            setIsLoadingId(false);
        }
    }
  };

  const handleRemove = () => {
    setSelectedCompany(null);
    onChange(null);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        {!selectedCompany ? (
            <div className="relative">
                <AutoSuggestInput
                placeholder="Enter Company Name or Domain"
                apiUrl={`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/proxy/companies/suggest`}
                queryParam="q"
                onSelect={handleSelect}
                responseSuggestions={(res) => {
                    return (res.data || []).map((item) => {
                        return {
                            id: item.public_id || item.id || item.name, // Prefer public_id for vector search
                            title: item.name,
                            logo: item.logo,
                            subtitle: item.domain
                        };
                    });
                }}
                showLogo={true}
                allowCustomInput={true}
                isLoading={isLoadingId}
                />
                 {isLoadingId && (
                    <div className="absolute right-3 top-3">
                        <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full"></div>
                    </div>
                )}
            </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <FilterTag
              text={selectedCompany.title}
              onRemove={handleRemove}
              icon={selectedCompany.logo} // Assuming FilterTag supports icon/logo
            />
          </div>
        )}
      </div>
      <p className="text-xs text-gray-400">
        Enter a company name or domain to find similar companies based on AI vector analysis.
      </p>
    </div>
  );
};

export default SimilarCompaniesFilter;
