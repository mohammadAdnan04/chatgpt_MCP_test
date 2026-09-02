const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const axios = require("axios");
const SearchCache = require("../models/SearchCache");
const { isAuthenticated } = require("../middlewares/authMiddleware");

const BASE_API_URL = process.env.MAWSOOL_SEARCH_API || "http://nswgw8w0w84ccscgoswckk0s.34.166.92.24.sslip.io";
const EXTERNAL_API_URL = `${BASE_API_URL}/mawsool-search`;
const ACCOUNT_ID = "oUYAc-QUQTmxK3_yq9iL4Q"; // Hardcoded from frontend

// Helper to sort object keys recursively for stable hashing
const sortObject = (obj) => {
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) {
    return obj;
  }
  return Object.keys(obj)
    .sort()
    .reduce((result, key) => {
      result[key] = sortObject(obj[key]);
      return result;
    }, {});
};

// Helper to hash filters for consistent keys
const hashFilters = (filters) => {
  const sortedFilters = sortObject(filters);
  const stableString = JSON.stringify(sortedFilters);
  return crypto.createHash("md5").update(stableString).digest("hex");
};

router.post("/search", isAuthenticated, async (req, res) => {
  try {
    const { filters, page = 1, limit = 10, type = "people" } = req.body;
    
    // Use the configured API URL
    const SEARCH_ENGINE_URL = process.env.MAWSOOL_SEARCH_API || "http://nswgw8w0w84ccscgoswckk0s.34.166.92.24.sslip.io";

    // Helper to extract value from complex filter (handle { include: [...] })
    const extractFilterValue = (val) => {
      if (!val) return undefined;
      if (val.include) return val.include; // Take 'include' array
      return val; // Return raw value (string, array, number)
    };

    // Helper to extract EXCLUDED values from complex filter (handle { exclude: [...] })
    const extractExcludeValue = (val) => {
      if (!val) return undefined;
      if (val.exclude) return val.exclude; // Take 'exclude' array
      return undefined;
    };

    // Country Code Mapping
    const COUNTRY_MAP = {
      "SA": "Saudi Arabia",
      "JO": "Jordan",
      "EG": "Egypt",
      "AE": "United Arab Emirates",
      "US": "United States",
      "UK": "United Kingdom",
      "GB": "United Kingdom",
      "CA": "Canada",
      "IN": "India",
      "PK": "Pakistan",
      "KW": "Kuwait",
      "QA": "Qatar",
      "BH": "Bahrain",
      "OM": "Oman",
      "LB": "Lebanon",
      "TR": "Turkey",
      "DE": "Germany",
      "FR": "France",
      "IT": "Italy",
      "ES": "Spain",
      "AU": "Australia",
      "CN": "China",
      "JP": "Japan",
      "KR": "South Korea",
      "RU": "Russia",
      "BR": "Brazil",
      "MX": "Mexico",
      "ID": "Indonesia",
      "MY": "Malaysia",
      "SG": "Singapore",
      "TH": "Thailand",
      "VN": "Vietnam",
      "PH": "Philippines",
      "ZA": "South Africa",
      "NG": "Nigeria",
      "KE": "Kenya",
      "MA": "Morocco",
      "DZ": "Algeria",
      "TN": "Tunisia"
    };

    const getFullCountryName = (code) => {
      if (!code) return "";
      const upper = code.toUpperCase();
      return COUNTRY_MAP[upper] || code; // Return full name or original code if not found
    };

    let endpoint = "/search/people";
    let payload = {};

    // Helper to ensure array
    const asArray = (val) => {
      if (!val) return undefined;
      return Array.isArray(val) ? val : [val];
    };

    // Helper to extract min value from range strings (e.g., "1000-5000" -> 1000)
    const extractMin = (val) => {
      const raw = extractFilterValue(val);
      if (!raw) return undefined;
      
      // If array, we take the minimum of the mins (OR logic for ranges)
      const items = Array.isArray(raw) ? raw : [raw];
      
      const mins = items.map(item => {
        if (typeof item === 'number') return item;
        if (typeof item === 'string') {
          // Extract first number in string
          const match = item.match(/^(\d+)/);
          return match ? parseInt(match[1]) : null;
        }
        return null;
      }).filter(n => n !== null);
      
      if (mins.length === 0) return undefined;
      return Math.min(...mins);
    };

    // Helper to extract max value from range strings (e.g., "1000-5000" -> 5000)
    // Used for bounded ranges like founded_year (e.g. 2000-2010 -> min:2000, max:2010)
    // BUT the upstream interface only shows 'revenue_min', 'employee_count_min' etc.
    // However, if we want to filter by founded year range, we might need both if supported.
    // Based on the sample provided by user, the index has "founded_at": 2016.
    // The upstream likely supports `founded_year_min` and `founded_year_max` if standard range.
    // I will extract Min for now as per previous pattern, but if range is needed I should add Max extraction too.
    
    if (type === "companies") {
      endpoint = "/search/companies";
      // Flat structure for companies
      payload = {
        page: parseInt(page),
        limit: parseInt(limit),
        keywords: extractFilterValue(filters.keywords) || extractFilterValue(filters.company_name),
        industry: asArray(extractFilterValue(filters.industry || filters.company_industry)),
        location_country: asArray(extractFilterValue(filters.location || filters.country)),
        revenue_min: extractMin(filters.revenue),
        employee_count_min: extractMin(filters.company_size || filters.company_headcount || filters.num_employees),
        founded_year_min: extractMin(filters.founded_year),
        specialties: asArray(extractFilterValue(filters.specialties)),
      };
    } else {
      // Default to People Search
      payload = {
        page: parseInt(page),
        limit: parseInt(limit),
        keywords: extractFilterValue(filters.keywords),
        location: extractFilterValue(filters.location),
        company_industry: extractFilterValue(filters.industry || filters.company_industry),
        job_title: extractFilterValue(filters.job_title || filters.role),
        first_name: extractFilterValue(filters.first_name || filters.firstName),
        last_name: extractFilterValue(filters.last_name || filters.lastName),
        company_name: extractFilterValue(filters.company_name || filters.companyName || filters.company),
        excluded_company_names: extractExcludeValue(filters.company_name || filters.companyName || filters.company),
        // school: extractFilterValue(filters.school || filters.university),
        education: {
          include: extractFilterValue(filters.education || filters.school || filters.university),
          exclude: extractExcludeValue(filters.education || filters.school || filters.university)
        },
        company_location: extractFilterValue(filters.company_location || filters.HQ_location),
        function: extractFilterValue(filters.function),
        seniority: extractFilterValue(filters.seniority || filters.seniority_level),
        experience: extractFilterValue(filters.experience || filters.total_years_experience),
        languages: extractFilterValue(filters.languages || filters.language),
        changed_jobs: filters.changed_jobs === true || filters.job_change === true,
        company_size: extractFilterValue(filters.company_size || filters.company_headcount || filters.num_employees),
        // Add more mappings as needed
      };
    }

    console.log(`🔍 Proxying to Search Engine (${type}):`, payload);
    console.log(`[Proxy] Sending request to: ${SEARCH_ENGINE_URL}${endpoint}`);
    
    // Configure axios with higher timeout and retry logic
    const axiosConfig = {
      timeout: 30000, // 30 seconds timeout
      headers: { 'Content-Type': 'application/json' }
    };

    const response = await axios.post(`${SEARCH_ENGINE_URL}${endpoint}`, payload, axiosConfig);
    const data = response.data;

    let mappedItems = [];

    if (type === "companies") {
      mappedItems = data.results.map(item => ({
        ...item,
        name: item.name || item.company_name,
        domain: item.domain || item.website || item.company_domain,
        industry: item.industry || item.company_industry,
        location: item.location_name || getFullCountryName(item.location_country) || item.location || "",
        headcount: item.employee_count || item.company_size,
        logo: item.logo || item.logo_url,
        overview: item.description || item.summary || item.overview,
        founded: item.founded_year || item.founded,
        revenue: item.revenue,
        specialties: item.specialties
      }));
    } else {
      // Map People Response
      // Helper to resolve current position logic
      const resolveCurrentPosition = (item) => {
        // Helper to check if a company name appears only in past (ended) experiences
        const isCompanyNameStale = (name) => {
          if (!name || !item.experience || !Array.isArray(item.experience)) return false;
          
          // Normalize name for comparison
          const targetName = name.toLowerCase().trim();
          
          // Find all experiences with this company name
          const matchingExps = item.experience.filter(exp => {
            const expName = (exp.company?.name || exp.company || "").toString().toLowerCase().trim();
            return expName === targetName || expName.includes(targetName) || targetName.includes(expName);
          });
          
          if (matchingExps.length === 0) return false; // Not found in experience, assume fresh/unknown
          
          // If ALL matching experiences have end dates, it's stale
          const allEnded = matchingExps.every(exp => {
              if (!exp.positions || !Array.isArray(exp.positions)) return true; // No positions, assume ended/invalid
              return exp.positions.every(pos => pos.endDateYear);
          });
          
          return allEnded;
        };

        // Priority 1: Scan experience for open-ended positions (no endDateYear)
        // We prioritize this over any pre-existing 'current_positions' because the upstream might be wrong
        if (item.experience && Array.isArray(item.experience)) {
          for (const exp of item.experience) {
            if (exp.positions && Array.isArray(exp.positions)) {
              for (const pos of exp.positions) {
                // If endDateYear is missing or null, it's likely current
                if (!pos.endDateYear) { 
                  return [{
                    company: exp.company?.name || item.company_name || "",
                    role: pos.title || item.headline || "",
                    industry: [exp.company?.industry || item.industry || ""]
                  }];
                }
              }
            }
          }
        }

        // Priority 2: Domain-based Inference (Fix for stale company_name)
        // If we have a domain, and the company_name appears to be stale (only in past jobs),
        // we infer the company name from the domain.
        if (item.company_domain) {
          const isStale = item.company_name ? isCompanyNameStale(item.company_name) : true;
          
          if (isStale) {
            // Infer name from domain (e.g. "aramco.com" -> "Aramco")
            let domainName = item.company_domain.replace(/^www\./, '').split('.')[0];
            if (domainName) {
              domainName = domainName.charAt(0).toUpperCase() + domainName.slice(1);
              return [{
                company: domainName, // e.g. "Aramco"
                role: item.headline || item.job_title || "",
                industry: [item.industry || ""]
              }];
            }
          }
        }

        // Priority 3: Root Level Fallback (e.g. "Osama" case where company_name is set but not in active experience)
        if (item.company_name) {
          return [{
            company: item.company_name,
            role: item.headline || item.job_title || "",
            industry: [item.industry || ""]
          }];
        }

        // Priority 4: Check explicitly marked "current_positions" from API
        // Only use this if we couldn't deduce it ourselves from raw data
        if (item.current_positions && item.current_positions.length > 0) {
          return item.current_positions;
        }

        // Priority 5: Last Known Position (First item in experience)
        if (item.experience && item.experience.length > 0) {
          const firstExp = item.experience[0];
          const firstPos = firstExp.positions && firstExp.positions[0];
          return [{
            company: firstExp.company?.name || item.company_name || "",
            role: firstPos?.title || item.headline || "",
            industry: [firstExp.company?.industry || item.industry || ""]
          }];
        }

        // Default Empty
        return [{ company: "", role: "", industry: [] }];
      };

      mappedItems = data.results.map(item => ({
        ...item,
        // Frontend (Table.jsx) expects 'name', API gives 'full_name'
        name: item.full_name || item.name, 
        
        // Frontend expects 'public_profile_url', API might give 'id' or other fields
        // Ensure we have a valid URL for the table to link to
        public_profile_url: item.linkedin_url || item.public_profile_url || `https://www.linkedin.com/in/${item.id}`,
        
        // Frontend expects 'location' string
        location: item.location_name || getFullCountryName(item.location_country) || item.location || "",

        // Extract University/School Name
        // The sample 'osama' file shows education as an array of objects:
        // "education" : [ { "school" : { "name" : "University of Petra..." } } ]
        // But also has a flat "education_schools" array: [ "University of Petra..." ]
        // We should map this to a flat 'school' field for the frontend table
        school: (item.education_schools && item.education_schools[0]) || 
                (item.education && item.education[0] && item.education[0].school && item.education[0].school.name) || 
                "",

        // Frontend expects 'current_positions' array with 'company', 'role', 'industry'
        current_positions: resolveCurrentPosition(item)
      }));
    }

    const mappedResponse = {
      items: mappedItems, // New Engine returns 'results'
      total: data.total,
      cursor: null, // We are using page-based pagination now
      cached: false,
      paging: {
        start: (data.page - 1) * data.limit,
        page_count: data.results.length,
        total_count: data.total
      }
    };

    res.json(mappedResponse);

  } catch (error) {
    console.error("Search Proxy Error:", error.message);
    
    if (error.response) {
        console.error("Upstream Error Status:", error.response.status);
        console.error("Upstream Error Data:", error.response.data);
        // Pass the upstream error to the frontend for better debugging
        return res.status(error.response.status).json({ 
          message: "Search Engine Error", 
          detail: error.response.data || error.message,
          upstream_url: process.env.MAWSOOL_SEARCH_API ? "configured-env-var" : "default-fallback"
        });
    } else if (error.request) {
        console.error("No response received from Search Engine");
        return res.status(502).json({ 
          message: "Search Engine Unreachable", 
          detail: "No response received from upstream service",
          hint: "Check MAWSOOL_SEARCH_API configuration"
        });
    }

    res.status(500).json({ message: "Internal Proxy Error", detail: error.message });
  }
});

module.exports = router;
