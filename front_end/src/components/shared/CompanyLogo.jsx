"use client";

import React, { useState, useMemo, useEffect } from "react";

// Company logo component with caching and error handling
const CompanyLogo = ({ companyName, logo, className = "w-6 h-6" }) => {
  const [logoUrl, setLogoUrl] = useState(logo || null);
  const [loading, setLoading] = useState(!logo);
  const [error, setError] = useState(false);
  const [hasTriedFallback, setHasTriedFallback] = useState(false);

  const fetchLogo = async () => {
    if (!companyName) {
      setLoading(false);
      return;
    }

    // Check global cache first
    const cacheKey = companyName.toLowerCase();
    if (window.__LOGO_CACHE__ && window.__LOGO_CACHE__.has(cacheKey)) {
      const cachedUrl = window.__LOGO_CACHE__.get(cacheKey);
      setLogoUrl(cachedUrl);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(false);
      
      // Try Clearbit Autocomplete first (Free, Fast, Matches Backend)
      try {
          const clearbitResp = await fetch(`https://autocomplete.clearbit.com/v1/companies/suggest?query=${encodeURIComponent(companyName)}`);
          if (clearbitResp.ok) {
              const suggestions = await clearbitResp.json();
              if (suggestions && suggestions.length > 0) {
                  const best = suggestions[0];
                  if (best && best.logo) {
                      // Proxy Clearbit URL immediately
                      const b64 = btoa(best.logo);
                      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
                      const logoUrl = `${API_URL}/api/proxy/image?key=${b64}`;
                      
                      // Cache and Set
                      if (!window.__LOGO_CACHE__) window.__LOGO_CACHE__ = new Map();
                      window.__LOGO_CACHE__.set(cacheKey, logoUrl);
                      setLogoUrl(logoUrl);
                      setLoading(false);
                      return; // Exit early if successful
                  }
              }
          }
      } catch (e) {
          // Ignore Clearbit error and fall through to logo.dev
      }

      // Fallback to logo.dev if Clearbit fails
      const response = await fetch(`https://api.logo.dev/search?q=${encodeURIComponent(companyName)}`, {
        headers: {
          'Authorization': 'Bearer sk_MGrj4y0nTpaD9-a2Hp6lWw'
        }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch logo: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Find the best matching logo
      let bestMatch = null;
      let foundUrl = null;
      
      if (data && Array.isArray(data) && data.length > 0) {
        const companyLower = companyName.toLowerCase();
        
        // Strategy: Look for exact or best company name match
        bestMatch = data.find(item => 
          item.name && item.name.toLowerCase() === companyLower
        );
        
        if (!bestMatch) {
          bestMatch = data.find(item => 
            item.name && item.name.toLowerCase().includes(companyLower)
          );
        }
        
        if (!bestMatch) {
          bestMatch = data.find(item => 
            item.name && companyLower.includes(item.name.toLowerCase())
          );
        }
        
        if (!bestMatch) {
          bestMatch = data[0];
        }
        
        // FOUND URL from Logo.dev
        foundUrl = bestMatch?.logo_url;

        // PROXY IT IF FOUND
        if (foundUrl) {
             // We need to proxy this to avoid exposing the source or just for consistency
             // But we don't have the backend URL easily accessible here without env vars.
             // Let's assume for now we use the raw URL because the backend whitelist 
             // might not be reachable from here easily without full config.
             // BUT wait, the user wants it proxied.
             // If we are in the browser, we can try to use the backend URL from env if available
             const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
             const b64 = btoa(foundUrl);
             foundUrl = `${API_URL}/api/proxy/image?key=${b64}`;
        }
      }
      
      // Initialize cache if needed
      if (!window.__LOGO_CACHE__) {
          window.__LOGO_CACHE__ = new Map();
      }
      
      // Cache the result
      window.__LOGO_CACHE__.set(cacheKey, foundUrl);
      setLogoUrl(foundUrl);
      // If we found a URL, clear error so we try to render it
      if (foundUrl) setError(false);
      
      // If no prop logo provided, just fail immediately to show initial
      setError(true);
      setLogoUrl(null);
    } catch (err) {
      setError(true);
      if (!window.__LOGO_CACHE__) window.__LOGO_CACHE__ = new Map();
      window.__LOGO_CACHE__.set(cacheKey, null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // If a logo prop is provided, try using it first
    if (logo) {
      // If logo is a proxy URL (ContactOut) or Clearbit URL (Backend), use it directly.
      setLogoUrl(logo);
      setLoading(false);
      setHasTriedFallback(false);
      return;
    }

    // Otherwise, fetch from API immediately
    // Enable fallback fetch
    fetchLogo();
  }, [companyName, logo]);

  const handleImageError = () => {
    // If we haven't tried the fallback yet (meaning we were likely using the provided 'logo' prop)
    // and we have a company name to search for, try the fallback.
    
    // Enable fallback fetch
    if (!hasTriedFallback && companyName) {
      setHasTriedFallback(true);
      fetchLogo();
    } else {
      // We already tried fallback or have no company name, so just show error state
      setError(true);
      setLogoUrl(null);
    }
    
    /* DISABLE FALLBACK FOR TESTING
    setError(true);
    setLogoUrl(null);
    */
  };

  if (loading) {
    return (
      <div className={`${className} bg-gray-100 rounded animate-pulse flex-shrink-0`} />
    );
  }

  if (error || !logoUrl) {
    // Fallback: Show company initial or generic icon
    const initial = companyName?.charAt(0)?.toUpperCase() || '?';
    return (
      <div className={`${className} bg-gray-200 rounded flex items-center justify-center text-xs font-medium text-gray-600 flex-shrink-0`}>
        {initial}
      </div>
    );
  }

  return (
    <img
      src={logoUrl}
      alt={`${companyName} logo`}
      className={`${className} rounded object-contain flex-shrink-0`}
      onError={handleImageError}
    />
  );
};

export default CompanyLogo;
