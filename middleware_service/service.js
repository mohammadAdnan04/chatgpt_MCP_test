
require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });
const axios = require("axios");
const { 
  CONTACTOUT_INDUSTRIES, 
  COUNTRY_MAP, 
  EXPERIENCE_BUCKETS, 
  SIZE_BUCKETS 
} = require("./config");

class ContactOutService {
  constructor() {
    this.apiKey = process.env.CONTACTOUT_TOKEN; // Ensure this is set in .env
    this.baseUrl = "https://api.contactout.com/v1";
    this.axiosInstance = axios.create({
      baseURL: this.baseUrl,
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "token": this.apiKey
      },
      timeout: 60000 // 60s timeout
    });

    // Interceptor for Rate Limiting (429)
    this.axiosInstance.interceptors.response.use(
      response => response,
      async error => {
        const { config, response } = error;
        if (response && response.status === 429) {
          console.warn("[ContactOut] Rate limit hit. Retrying...");
          // Simple retry logic could go here, or handled by caller. 
          // For now, we propagate with clear message.
        }
        
        // Hide "ContactOut" from error messages
        if (error.message && error.message.toLowerCase().includes("contactout")) {
            error.message = error.message.replace(/contactout/gi, "search");
        }
        if (error.response && error.response.data && typeof error.response.data === 'string' && error.response.data.toLowerCase().includes("contactout")) {
             error.response.data = error.response.data.replace(/contactout/gi, "search");
        }
        
        return Promise.reject(error);
      }
    );
  }

  // --- MAPPING HELPERS ---

  /**
   * Maps generic industry strings to ContactOut specific values
   * Also applies the INDUSTRY_HIERARCHY to expand parent industries into their sub-industries
   */
  mapIndustry(input) {
    if (!input) return undefined;
    const inputs = Array.isArray(input) ? input : [input];

    const validIndustries = new Set();

    inputs.forEach(i => {
      if (typeof i !== 'string') return;
      const cleanInput = i.trim();
      
      const match = CONTACTOUT_INDUSTRIES.find(ci => ci.toLowerCase() === cleanInput.toLowerCase());
      if (match) {
        validIndustries.add(match);
      }
    });

    const result = Array.from(validIndustries);
    return result.length > 0 ? result : undefined;
  }

  /**
   * Helper to combine countries and cities into an array of "City, Country" strings
   */
  _buildLocationArray(countries, cities) {
    const mappedCountries = this.mapLocation(countries) || [];
    const safeCities = cities || [];
    
    if (safeCities.length > 0 && mappedCountries.length > 0) {
        const combined = [];
        safeCities.forEach(city => {
            mappedCountries.forEach(country => {
                combined.push(`${city}, ${country}`);
            });
        });
        return combined;
    }
    if (safeCities.length > 0) return safeCities;
    if (mappedCountries.length > 0) return mappedCountries;
    return undefined;
  }

  /**
   * Maps Country Codes (US, UK) to Full Names (United States)
   */
  mapLocation(input) {
    if (!input) return undefined;
    const inputs = Array.isArray(input) ? input : [input];
    return inputs.map(loc => {
        // Check if it's a code in our map
        if (COUNTRY_MAP[loc.toUpperCase()]) return COUNTRY_MAP[loc.toUpperCase()];
        return loc; // Return as-is (might be "San Francisco")
    });
  }

  /**
   * Maps experience ranges (e.g., "5-10") to API buckets (e.g., ["6_10"])
   */
  mapExperience(input) {
    if (!input) return undefined;
    const inputs = Array.isArray(input) ? input : [input];

    const targetBuckets = new Set();

    inputs.forEach(range => {
      const lowerRange = String(range).toLowerCase();
      
      if (lowerRange.includes("less than")) {
          targetBuckets.add("0_1");
          return;
      }
      
      if (lowerRange.includes("more than") || lowerRange.includes('+')) {
          const numbers = lowerRange.match(/\d+/g);
          if (numbers) {
              // If it's "More than 10 years", send "11_99" to be strictly > 10, or "10_99"
              targetBuckets.add(`${parseInt(numbers[0])}_99`);
          }
          return;
      }

      const numbers = lowerRange.match(/\d+/g);
      if (!numbers) return;

      if (numbers.length >= 2) {
          targetBuckets.add(`${parseInt(numbers[0])}_${parseInt(numbers[1])}`);
      } else {
          targetBuckets.add(`${parseInt(numbers[0])}_${parseInt(numbers[0])}`);
      }
    });

    return Array.from(targetBuckets);
  }

  /**
   * Maps company size ranges to API buckets
   */
  mapSize(input) {
    if (!input) return undefined;
    const inputs = Array.isArray(input) ? input : [input];
    
    const targetBuckets = new Set();
    inputs.forEach(range => {
      // Handle ranges like "201-500", "201_500", "10,001+"
      // Remove commas first to handle "10,001" correctly
      const cleanRange = String(range).replace(/,/g, '');
      const numbers = cleanRange.match(/\d+/g);
      
      if (!numbers) return;
      
      const min = parseInt(numbers[0]);
      // Handle "1000+" -> max is Infinity/Large Number
      const max = numbers.length > 1 ? parseInt(numbers[1]) : (cleanRange.includes('+') ? 999999999 : min);

      // ContactOut Company Search API accepts:
      // "1_10", "11_50", "51_200", "201_500", "501_1000", "1001_5000", "5001_10000", "10001"
      
      // If the input range OVERLAPS with any bucket, include that bucket.
      // Logic: Overlap exists if (RangeMax >= BucketMin) AND (RangeMin <= BucketMax)

      if (max >= 1 && min <= 10) targetBuckets.add("1_10");
      if (max >= 11 && min <= 50) targetBuckets.add("11_50");
      if (max >= 51 && min <= 200) targetBuckets.add("51_200");
      if (max >= 201 && min <= 500) targetBuckets.add("201_500");
      if (max >= 501 && min <= 1000) targetBuckets.add("501_1000");
      if (max >= 1001 && min <= 5000) targetBuckets.add("1001_5000");
      if (max >= 5001 && min <= 10000) targetBuckets.add("5001_10000");
      if (max >= 10001) targetBuckets.add("10001");
    });
    
    const result = Array.from(targetBuckets);
    return result.length > 0 ? result : undefined;
  }

  /**
   * Maps years in current role ranges to API buckets
   * Buckets: 0_2, 2_4, 4_6, 6_8, 8_10, 10
   */
  mapYearsInCurrentRole(input) {
    return this.mapExperience(input); // The logic is identical for both
  }

  // --- CORE SEARCH METHODS ---

  /**
   * Get Total Count for People Search (No Credits Consumed)
   */
  async getPeopleCount(filters) {
    console.log("[DEBUG] getPeopleCount received filters:", JSON.stringify(filters));
    
    // Combine keywords and names into a single query string if specific name fields aren't supported
    const keywords = [
      filters.keywords,
      filters.behavioral_keywords,
      filters.first_name,
      filters.last_name
    ].filter(Boolean).join(" ");

    // 1. Construct Payload (Same as searchPeople but without page/details)
    const payload = {
      keyword: keywords || undefined,
      
      job_title: [
          ...this._extractInclude(filters.job_title || filters.role) || [],
          ...this._extractInclude(filters.past_role) || []
      ],
      
      company: [
          ...this._extractInclude(filters.company_name || filters.company) || [],
          ...this._extractInclude(filters.past_company) || []
      ],

      current_titles_only: (filters.past_role && filters.past_role.include && filters.past_role.include.length > 0) ? false : true,
      current_company_only: (filters.past_company && filters.past_company.include && filters.past_company.include.length > 0) ? false : true,
      
      company_filter: (filters.past_company && filters.past_company.include && filters.past_company.include.length > 0) ? "both" : "current",
      
      exclude_job_titles: this._extractExclude(filters.job_title || filters.role),
      exclude_companies: this._extractExclude(filters.company_name || filters.company),
      
      // ContactOut's API now accepts arrays of "City, Country" combinations.
      location: this._buildLocationArray(
          this._extractRaw(filters.location || filters.country),
          this._extractRaw(filters.city)
      ),
      
      // Maps HQ Location (company_location) to current_work_location
      current_work_location: this.mapLocation(this._extractRaw(filters.company_location || filters.headquarter || filters.hq_location)),
      
      industry: this._resolveIndustryFilter(filters.industry || filters.company_industry),
      
      skills: this._resolveSkillsFilter(filters.skills),
      
      years_of_experience: this.mapExperience(this._extractRaw(filters.experience)),

      years_in_current_role: this.mapYearsInCurrentRole(this._extractRaw(filters.experience_at_role || filters.years_in_current_role || filters.experience_at_company || filters.years_in_current_company)),
      
      company_size: this.mapSize(this._extractRaw(filters.company_size || filters.company_headcount)),
      
      seniority: this._extractRaw(filters.seniority),
      
      job_function: this._extractRaw(filters.function),
      
      languages: this._resolveLanguagesFilter(filters.languages || filters.language),
      
      education: this._resolveEducationsFilter(filters.education || filters.school)
    };

    // Remove undefined keys
    Object.keys(payload).forEach(key => payload[key] === undefined && delete payload[key]);

    try {
      console.log("[ContactOut] Getting People Count:", JSON.stringify(payload));
      const response = await this.axiosInstance.post("/people/count", payload);
      // The ContactOut /people/count API is known to cap or return a max of 10000.
      // If we see 10000 from the count endpoint, we can fall back to the actual search endpoint metadata if needed,
      // or simply accept it as ContactOut's hard cap for the count endpoint.
      return response.data.total_results || 0;
    } catch (error) {
      console.error("[ContactOut] People Count Failed:", error.response?.data || error.message);
      return 0;
    }
  }

  /**
   * Search People
   */
  async searchPeople(filters, page = 1, limit = 20, trackInfo = null) {
    console.log("[DEBUG] searchPeople received filters:", JSON.stringify(filters)); // ADDED LOG
    // Combine keywords and names into a single query string if specific name fields aren't supported
    const keywords = [
      filters.keywords, 
      filters.behavioral_keywords,
      filters.first_name, 
      filters.last_name
    ].filter(Boolean).join(" ");

    // 1. Construct Payload
    const payload = {
      page: page,
      limit: limit,
      detailed_experience: true, // Required for response normalization
      detailed_education: true,
      
      keyword: keywords || undefined, // Send combined query
      
      // Map match_experience logic based on inputs
      // If we have past_role or past_company, we need to consider how to send them.
      // Actually, ContactOut API uses "match_experience" param to toggle between current/past/both
      // for the MAIN "job_title" and "company" params.
      // There are no separate "past_job_title" or "past_company" arrays in the request body 
      // EXCEPT "past_work_location".
      
      // So if the user wants "Past Role", we should add it to "job_title" array 
      // AND set "match_experience" to "past" (or "both").
      // But wait, what if they want Current Role X AND Past Role Y?
      // The API documentation says:
      // "match_experience": "current" | "past" | "both"
      // "If specified false [current_titles_only], the response will return profiles matching the current or past job title."
      
      // Strategy:
      // 1. Combine `job_title` (current) and `past_role` into `job_title` payload.
      // 2. Combine `company` (current) and `past_company` into `company` payload.
      // 3. Set `current_titles_only` / `company_filter` / `match_experience` accordingly.

      job_title: [
          ...this._extractInclude(filters.job_title || filters.role) || [],
          ...this._extractInclude(filters.past_role) || []
      ],
      
      company: [
          ...this._extractInclude(filters.company_name || filters.company) || [],
          ...this._extractInclude(filters.past_company) || []
      ],

      // If we have past filters, we must loosen the strict "current" constraint
      current_titles_only: (filters.past_role && filters.past_role.include && filters.past_role.include.length > 0) ? false : true,
      current_company_only: (filters.past_company && filters.past_company.include && filters.past_company.include.length > 0) ? false : true,
      
      // Explicitly set company_filter if past company is used
      company_filter: (filters.past_company && filters.past_company.include && filters.past_company.include.length > 0) ? "both" : "current",
      
      exclude_job_titles: this._extractExclude(filters.job_title || filters.role),
      exclude_companies: this._extractExclude(filters.company_name || filters.company),
      // But typically "location" param is for GENERAL location.
      // "current_work_location" is for specifically where they work now.
      // The user provided: location (from "Country"), city (from "City"), and company_location (from "HQ Company Location").
      
      // MAPPING LOGIC:
      // 1. "location" (Country + City) -> Maps to API `location` as array of "City, Country"
      // 2. "company_location" (HQ Location) -> Maps to API `current_work_location`
      
      location: this._buildLocationArray(
          this._extractRaw(filters.location || filters.country),
          this._extractRaw(filters.city)
      ),
      
      current_work_location: this.mapLocation(this._extractRaw(filters.company_location || filters.headquarter || filters.hq_location)),
      
      // Industry with Boolean Logic for Excludes
      industry: this._resolveIndustryFilter(filters.industry || filters.company_industry),
      
      skills: this._resolveSkillsFilter(filters.skills),
      
      years_of_experience: this.mapExperience(this._extractRaw(filters.experience)),

        years_in_current_role: this.mapYearsInCurrentRole(this._extractRaw(filters.experience_at_role || filters.years_in_current_role || filters.experience_at_company || filters.years_in_current_company)),

        company_size: this.mapSize(this._extractRaw(filters.company_size || filters.company_headcount)),
      
      seniority: this._extractRaw(filters.seniority),
      
      job_function: this._extractRaw(filters.function),
      
      languages: this._resolveLanguagesFilter(filters.languages || filters.language),
      
      education: this._resolveEducationsFilter(filters.education || filters.school)
    };

    // Remove undefined keys
    Object.keys(payload).forEach(key => payload[key] === undefined && delete payload[key]);

    try {
      console.log("[ContactOut] Searching People:", JSON.stringify(payload));
      const response = await this.axiosInstance.post("/people/search", payload);
      
      if (trackInfo) {
          try {
              const ApiUsage = require('./models/ApiUsage').getModel();
              const today = new Date().toISOString().split('T')[0];
              await ApiUsage.findOneAndUpdate(
                  { date: today, service: 'ContactOut_People_Search', sourceKey: trackInfo.sourceKey },
                  { 
                      $inc: { successCount: 1 },
                      $setOnInsert: { sourceName: trackInfo.sourceName }
                  },
                  { upsert: true, new: true }
              );
          } catch (e) {
              console.error("[Tracking] Failed to log ContactOut usage:", e.message);
          }
      }

      // DEBUG: Log first item to check for logo fields
      if (response.data?.profiles && Object.values(response.data.profiles).length > 0) {
        const firstProfile = Object.values(response.data.profiles)[0];
        console.log("[DEBUG] First People Profile Raw Data (Experience):", JSON.stringify(firstProfile.experience?.[0] || {}, null, 2));
      }

      const normalized = this._normalizePeopleResponse(response.data);
      
      // If ContactOut hit its hard cap of 10000 on the search endpoint metadata,
      // silently query the /people/count endpoint to get the true total results.
      if (normalized.paging.total_count === 10000) {
          try {
              console.log("[ContactOut] 10K limit hit, fetching true count...");
              const trueCount = await this.getPeopleCount(filters);
              if (trueCount > 10000) {
                  normalized.paging.total_count = trueCount;
                  
                  // Re-run formatting for the new true count
                  const formatTotal = (total) => {
                      if (!total) return "0";
                      if (total < 1000) return total.toString(); 
                      if (total >= 1000000) return `${(total / 1000000).toFixed(1).replace(/\\.0$/, '')}M`;
                      return `${(total / 1000).toFixed(1).replace(/\\.0$/, '')}K`;
                  };
                  normalized.total = formatTotal(trueCount);
              }
          } catch(e) {
              console.log("[DEBUG] Failed to fetch true count, keeping 10K+");
          }
      }
      
      return normalized;
    } catch (error) {
      console.error("[ContactOut] People Search Failed:", error.response?.data || error.message);
      // Return empty structure on failure to prevent crash, or throw
      throw error; 
    }
  }

  /**
   * Search Companies
   */
  async searchCompanies(filters, page = 1, limit = 20, trackInfo = null) {
    const payload = {
      page: page,
      limit: limit,
      name: this._extractInclude(filters.keywords || filters.company_name),
      industry: this.mapIndustry(this._extractInclude(filters.industry || filters.company_industry)),
      location: this.mapLocation(this._extractInclude(filters.location || filters.country)),
      size: this.mapSize(this._extractInclude(filters.company_size || filters.company_headcount || filters.num_employees)),
      
      // Revenue (Parse "1000000" from filters)
      min_revenue: this._parseMin(this._extractInclude(filters.revenue)),
      max_revenue: this._parseMax(this._extractInclude(filters.revenue)),
      
      // Founded Year
      year_founded_from: this._parseMin(this._extractInclude(filters.founded_year)),
      year_founded_to: this._parseMax(this._extractInclude(filters.founded_year))
    };

    Object.keys(payload).forEach(key => payload[key] === undefined && delete payload[key]);

    try {
      console.log("[ContactOut] Searching Companies:", JSON.stringify(payload));
      const response = await this.axiosInstance.post("/company/search", payload);
      
      if (trackInfo) {
          try {
              const ApiUsage = require('./models/ApiUsage').getModel();
              const today = new Date().toISOString().split('T')[0];
              await ApiUsage.findOneAndUpdate(
                  { date: today, service: 'ContactOut_Company_Search', sourceKey: trackInfo.sourceKey },
                  { 
                      $inc: { successCount: 1 },
                      $setOnInsert: { sourceName: trackInfo.sourceName }
                  },
                  { upsert: true, new: true }
              );
          } catch (e) {
              console.error("[Tracking] Failed to log ContactOut usage:", e.message);
          }
      }

      // DEBUG: Log first item to check for logo fields
      if (response.data?.companies && response.data.companies.length > 0) {
        console.log("[DEBUG] First Company Raw Data:", JSON.stringify(response.data.companies[0], null, 2));
      }

      return this._normalizeCompanyResponse(response.data);
    } catch (error) {
      console.error("[ContactOut] Company Search Failed:", error.response?.data || error.message);
      throw error;
    }
  }

  // --- PROXY HELPER ---
  _proxyLogo(logo) {
      if (!logo) return logo;
      
      // 1. Handle Hash (32 chars hex) -> ContactOut URL
      if (/^[a-f0-9]{32}$/i.test(logo)) {
          logo = `https://images.contactout.com/companies/${logo}`;
      }

      // 2. PROXY LOGIC
      // Use environment variable for API URL, fallback to production URL
      const backendUrl = process.env.API_URL || "https://backbeta.mawsool.tech";
      
      // Handle ContactOut images
      if (typeof logo === 'string' && logo.includes('images.contactout.com')) {
          try {
              const b64 = Buffer.from(logo).toString('base64');
              return `${backendUrl}/api/proxy/image?key=${b64}`;
          } catch (e) {
              return logo;
          }
      }

      // Handle Clearbit images
      if (typeof logo === 'string' && logo.includes('logo.clearbit.com')) {
          try {
              const b64 = Buffer.from(logo).toString('base64');
              return `${backendUrl}/api/proxy/image?key=${b64}`;
          } catch (e) {
              return logo;
          }
      }

      // Handle Logo.dev images
      if (typeof logo === 'string' && logo.includes('img.logo.dev')) {
          try {
              const b64 = Buffer.from(logo).toString('base64');
              return `${backendUrl}/api/proxy/image?key=${b64}`;
          } catch (e) {
              return logo;
          }
      }

      return logo;
  }

  // --- NORMALIZATION ---

  _normalizePeopleResponse(data) {
    // API returns { profiles: { "url": { ...data... } } }
    // We need to flatten this to [ ...data... ]
    
    const results = [];
    if (data.profiles && typeof data.profiles === 'object') {
      Object.values(data.profiles).forEach(profile => {
        // Resolve current positions FIRST to ensure we have the best logo data
        const currentPositions = this._resolveCurrentPosition(profile);
        
        results.push({
          id: profile.li_vanity || profile.url, // Use vanity or URL as ID
          full_name: profile.full_name,
          first_name: profile.full_name?.split(" ")[0],
          last_name: profile.full_name?.split(" ").slice(1).join(" "),
          headline: profile.headline || profile.title,
          location_country: profile.country, // "United States"
          location_name: profile.location,   // "San Francisco"
          linkedin_url: `https://linkedin.com/in/${profile.li_vanity}`,
          summary: profile.summary,
          skills: profile.skills,
          
          // Flatten Experience
          experience: profile.experience?.map(exp => ({
            company: {
              name: exp.company_name,
              id: exp.company_id, // If available
              industry: exp.industry,
              logo: this._proxyLogo(exp.company_logo || exp.logo_url || exp.logo) // Add logo mapping
            },
            positions: [{
              title: exp.title,
              description: exp.summary,
              startDateYear: exp.start_date_year,
              endDateYear: exp.end_date_year // null implies current
            }]
          })) || [],

          // Infer Current Position (Critical for UI)
          current_positions: currentPositions,
          
          // Flatten attributes for table
          name: profile.full_name,
          public_profile_url: `https://linkedin.com/in/${profile.li_vanity}`,
          location: profile.location || profile.country,
          
          // Add primary logo field for convenience
          logo: currentPositions?.[0]?.logo || "",

          education: profile.education?.map(edu => ({
            school: edu.school_name,
            degree: edu.degree,
            field: edu.field_of_study,
            start_year: edu.start_date_year,
            end_year: edu.end_date_year
          })) || [],

          // Contact Info (Protected)
          personal_emails: profile.contact_info?.personal_emails || [],
          work_emails: profile.contact_info?.work_emails || [],
          mobile_numbers: profile.contact_info?.phones || []
        });
      });
    }

    // --- Helper to Round and Format Total Count ---
    const formatTotal = (total) => {
        if (!total) return "0";
        if (total < 1000) return total.toString(); 
        
        // Handle Millions (e.g. 1,200,000 -> 1.2M, 1,000,000 -> 1M)
        if (total >= 1000000) {
            // Round to 1 decimal place if needed, remove .0
            const millions = (total / 1000000).toFixed(1).replace(/\.0$/, '');
            return `${millions}M`;
        }
        
        // Handle Thousands (e.g. 5,400 -> 5.4K, 5,000 -> 5K)
        // Round to 1 decimal place if needed, remove .0
        const thousands = (total / 1000).toFixed(1).replace(/\.0$/, '');
        return `${thousands}K`;
    };

    // Calculate numeric total for pagination logic
    // NOTE: ContactOut's API hard caps total_results at 10000 to save computation.
    // If the metadata says 10000, it means "10,000+"
    const numericTotal = data.metadata?.total_results || 0;

    return {
      items: results,
      total: formatTotal(numericTotal) + (numericTotal === 10000 ? "+" : ""), // Append + if hit hard cap
      cursor: null,
      cached: false,
      paging: {
        start: ((data.metadata?.page || 1) - 1) * (data.metadata?.page_size || 25),
        page_count: results.length,
        total_count: numericTotal // Keep numeric for frontend pagination logic
      }
    };
  }

  _normalizeCompanyResponse(data) {
    const results = (data.companies || []).map(comp => {
      let logo = comp.logo_url || comp.logo || comp.company_logo;
      logo = this._proxyLogo(logo);
      
      // Fallback: img.logo.dev
      if (!logo && comp.domain) {
          logo = `https://img.logo.dev/${comp.domain}?token=pk_Z9lgPTVDTJePN73JZs8Pvg`;
      }

      logo = this._proxyLogo(logo); // Re-proxy to ensure fallback is covered

      return {
      id: comp.domain || comp.name || `comp_${Math.random()}`, // Robust ID
      name: comp.name,
      domain: comp.domain,
      industry: comp.industry,
      location: comp.country || comp.location || comp.headquarter, 
      location_country: comp.country,
      headcount: comp.size || comp.company_size || comp.employee_count || "", // Use raw size from API
      logo: logo, 
      overview: comp.overview,
      founded_at: comp.founded_at, 
      revenue_min: comp.revenue || comp.annual_revenue || "", // Pass raw revenue string
      revenue_max: comp.revenue || comp.annual_revenue || "", // Pass raw revenue string
      linkedin_url: comp.url,
      // EXPLICITLY NULLIFY PERSON FIELDS to prevent type confusion
      first_name: null,
      last_name: null,
      public_profile_url: null,
      full_name: null
    };
    });

    // --- Helper to Round and Format Total Count ---
    const formatTotal = (total) => {
        if (!total) return "0";
        console.log("[DEBUG] Formatting Total:", total, typeof total); // Debug log
        
        // Handle Millions (e.g. 1,200,000 -> 1.2M, 1,000,000 -> 1M)
        if (total >= 1000000) {
            const millions = (total / 1000000).toFixed(1).replace(/\.0$/, '');
            console.log("[DEBUG] Formatted Millions:", `${millions}M`);
            return `${millions}M`;
        }
        
        // Handle Thousands (e.g. 5,400 -> 5.4K, 5,000 -> 5K)
        if (total >= 1000) {
             const thousands = (total / 1000).toFixed(1).replace(/\.0$/, '');
             console.log("[DEBUG] Formatted Thousands:", `${thousands}K`);
             return `${thousands}K`;
        }

        return total.toString();
    };

    // Calculate numeric total for pagination logic
    const numericTotal = data.metadata?.total_results || 0;

    return {
      items: results,
      total: formatTotal(numericTotal), // Return String "5K", "1.2M"
      cursor: null,
      cached: false,
      paging: {
        start: ((data.metadata?.page || 1) - 1) * (data.metadata?.page_size || 25),
        page_count: results.length,
        total_count: numericTotal // Keep numeric for frontend pagination logic
      }
    };
  }

  _normalizeHeadcount(size) {
    if (!size) return "";
    const s = String(size);
    
    // If it's already a range string like "201-500" or "10001+"
    if (s.includes("-") || s.includes("+")) return s;
    
    // If it's a bucket style "201_500"
    if (s.includes("_")) return s.replace(/_/g, "-");

    const val = parseInt(s.replace(/,/g, ""));
    if (isNaN(val)) return s;

    // Find bucket from SIZE_BUCKETS
    // SIZE_BUCKETS = ["1_10", "11_50", "51_200", "201_500", "501_1000", "1001_5000", "5001_10000", "10001"];
    for (const bucket of SIZE_BUCKETS) {
      if (bucket === "10001") {
        if (val >= 10001) return "10001+";
        continue;
      }
      const parts = bucket.split("_");
      if (parts.length === 2) {
        const min = parseInt(parts[0]);
        const max = parseInt(parts[1]);
        if (val >= min && val <= max) {
          return `${min}-${max}`;
        }
      }
    }
    
    return s; // Fallback if no bucket matches
  }

  // Helper to infer "Current Position" for the UI Card
  _resolveCurrentPosition(profile) {
    // 1. Use API's direct job_title/company if simple
    if (profile.experience && profile.experience.length > 0) {
      // Find items with no end date
      const current = profile.experience.filter(e => !e.end_date_year);
      if (current.length > 0) {
        return current.map(e => {
            let logo = e.company_logo || e.logo_url || e.logo;
            logo = this._proxyLogo(logo);

            // Fallback: img.logo.dev
            if (!logo) {
                 // Try to use company domain if available on profile.company
                 if (profile.company && (profile.company.name === e.company_name) && profile.company.domain) {
                     logo = `https://img.logo.dev/${profile.company.domain}?token=pk_Z9lgPTVDTJePN73JZs8Pvg`;
                 }
                 // If not, try to construct from company name (less reliable but better than nothing?)
                 // Actually, let's stick to domain-based to avoid bad logos.
            }
            // Re-proxy
            logo = this._proxyLogo(logo);

            return {
              company: e.company_name,
              role: e.title,
              industry: [profile.industry || ""].filter(Boolean), 
              logo: logo
            };
        });
      }
    }
    
    // Fallback: Top of the list
    let logo = profile.company?.logo || profile.company?.logo_url || "";
    logo = this._proxyLogo(logo);
    
    // Fallback: img.logo.dev
    if (!logo && profile.company && profile.company.domain) {
        logo = `https://img.logo.dev/${profile.company.domain}?token=pk_Z9lgPTVDTJePN73JZs8Pvg`;
    }
    // Re-proxy
    logo = this._proxyLogo(logo);

    return [{
      company: profile.company?.name || "",
      role: profile.title || "",
      industry: [profile.industry || ""].filter(Boolean),
      logo: logo
    }];
  }

  // Helper to resolve Industry filter with Boolean logic for People Search
  _resolveIndustryFilter(filter) {
    if (!filter) return undefined;
    
    const rawInc = this._extractInclude(filter);
    const rawExc = this._extractExclude(filter);
    
    // Map industries to API values
    const includes = rawInc ? this.mapIndustry(rawInc) : [];
    const excludes = rawExc ? this.mapIndustry(rawExc) : [];

    // Case 1: No Excludes
    if (excludes.length === 0) {
       if (includes.length === 0) return undefined;
       // If includes > 50, use boolean string to bypass array item limit
       if (includes.length > 50) {
           const incStr = includes.map(i => `"${i}"`).join(" OR ");
           return [`(${incStr})`];
       }
       return includes;
    }

    // Case 2: Includes AND Excludes -> Use Boolean String
    if (includes.length > 0) {
        const incStr = includes.map(i => `"${i}"`).join(" OR ");
        const excStr = excludes.map(e => `NOT "${e}"`).join(" ");
        return [`(${incStr}) ${excStr}`];
    }

    // Case 3: ONLY Excludes -> "All except Excludes" (Limited to 50)
    // We cannot use boolean "NOT X" alone because it returns 0 results.
    let baseIndustries = [...CONTACTOUT_INDUSTRIES];
    const allowed = baseIndustries.filter(ind => {
        return !excludes.some(exc => exc.toLowerCase() === ind.toLowerCase());
    });
    
    // LIMIT TO 50 to avoid API error "not have more than 50 items"
    return allowed.slice(0, 50);
  }

  // Helper to resolve Skills filter with Boolean logic for People Search
  _resolveSkillsFilter(filter) {
      if (!filter) return undefined;

      const rawInc = this._extractInclude(filter);
      const rawExc = this._extractExclude(filter);
      
      // If no excludes, standard mapping
      if (!rawExc || rawExc.length === 0) {
        return rawInc;
      }

      // If we have excludes, we MUST use boolean logic string
      // e.g. { "skills": ["(Java OR Python) NOT C++"] }
      
      const includes = rawInc || [];
      const excludes = rawExc;

      let boolQuery = "";

      if (includes.length > 0) {
          const incStr = includes.map(i => `"${i}"`).join(" OR ");
          boolQuery = `(${incStr})`;
      } else {
          // Exclude only for skills is tricky. "NOT Java" might not work without a positive term.
          // We can try just "NOT Java" or return undefined if risky.
          // For now, let's try passing the exclusions as "NOT X" strings if that's what the user wants,
          // but arguably skills usually imply "Has X".
          // If a user says "Exclude Java", they probably mean "Anyone, but not Java users"?
          // That's a huge set.
          // Let's assume user MUST provide includes for skills to be useful, 
          // OR we return undefined to avoid errors.
          return undefined; 
      }

      if (excludes.length > 0) {
          const excStr = excludes.map(e => `NOT "${e}"`).join(" ");
          boolQuery = `${boolQuery} ${excStr}`;
      }

      return [boolQuery];
  }

  _resolveLanguagesFilter(filter) {
    console.log("[DEBUG] _resolveLanguagesFilter input:", JSON.stringify(filter));
    const rawInc = this._extractInclude(filter);
    console.log("[DEBUG] _resolveLanguagesFilter extracted:", JSON.stringify(rawInc));
    
    if (!rawInc || rawInc.length === 0) return undefined;
    
    const LANGUAGE_MAP = {
         "en": "english",
         "es": "spanish",
         "fr": "french",
         "de": "german",
         "it": "italian",
         "pt": "portuguese",
         "ru": "russian",
         "zh": "chinese",
         "ja": "japanese",
         "ko": "korean",
         "ar": "arabic",
         "hi": "hindi",
         "bn": "bengali",
         "pa": "punjabi",
         "jv": "javanese",
         "te": "telugu",
         "vi": "vietnamese",
         "mr": "marathi",
         "tr": "turkish",
         "nl": "dutch",
         "pl": "polish",
         "sv": "swedish",
         "fi": "finnish",
         "da": "danish",
         "no": "norwegian",
         "el": "greek",
         "he": "hebrew",
         "id": "indonesian",
         "ms": "malay",
         "th": "thai"
     };

    return rawInc.map(l => {
        if (typeof l !== 'string') return { language: l };
        const lower = l.toLowerCase();
        const mapped = LANGUAGE_MAP[lower] || lower;
        return { language: mapped };
    });
  }

  _resolveEducationsFilter(filter) {
    const rawInc = this._extractInclude(filter);
    if (!rawInc || rawInc.length === 0) return undefined;
    
    // Return array of strings for "education" parameter
    return rawInc;
  }

  // --- UTILS ---

  // Helper function to safely escape strings that contain boolean keywords like "AND", "OR", "NOT"
  // The ContactOut API treats "and" as a boolean operator unless the entire string is wrapped in double quotes.
  _escapeBooleanKeywords(arr) {
    if (!Array.isArray(arr)) return arr;
    return arr.map(str => {
      if (typeof str !== 'string') return str;
      const lower = str.toLowerCase();
      // If the string contains standalone boolean keywords, wrap it in exact match quotes
      if (/\b(and|or|not)\b/.test(lower)) {
        // If it's already wrapped in quotes, don't double-wrap it
        if (str.startsWith('"') && str.endsWith('"')) return str;
        return `"${str}"`;
      }
      return str;
    });
  }

  _extractInclude(filter) {
    if (!filter) return undefined;

    // Check if it's our standard filter object structure with explicit include/exclude
    if (typeof filter === 'object' && !Array.isArray(filter) && (filter.include !== undefined || filter.exclude !== undefined)) {
        const val = filter.include;
        if (val === undefined || val === null) return undefined;
        const arr = Array.isArray(val) ? val : [val];
        return this._escapeBooleanKeywords(arr);
    }

    // Fallback for simple values, arrays, or other objects (like ranges {min, max})
    const arr = Array.isArray(filter) ? filter : [filter];
    return this._escapeBooleanKeywords(arr);
  }

  _extractExclude(filter) {
    if (!filter) return undefined;
    const val = filter.exclude;
    if (val === undefined || val === null) return undefined;
    const arr = Array.isArray(val) ? val : [val];
    return this._escapeBooleanKeywords(arr);
  }

  // Use this for ENUM fields (job_function, location, etc.) that do NOT support quotes
  _extractRaw(filter) {
    if (!filter) return undefined;
    let extracted;
    if (typeof filter === 'object' && !Array.isArray(filter) && filter.include !== undefined) {
        const val = filter.include;
        if (val === undefined || val === null) return undefined;
        extracted = Array.isArray(val) ? val : [val];
    } else {
        extracted = Array.isArray(filter) ? filter : [filter];
    }

    // Strip out the frontend '&' versions (e.g. 'Community & Social Services') 
    // to only send the strict valid ContactOut Enum ('Community and Social Services')
    return extracted.filter(str => typeof str === 'string' && !str.includes('&'));
  }

  _parseMin(val) {
    if (!val) return undefined;
    const v = Array.isArray(val) ? val[0] : val;
    return typeof v === 'string' ? parseInt(v.split(/[-_]/)[0]) : v;
  }

  _parseMax(val) {
    if (!val) return undefined;
    const v = Array.isArray(val) ? val[0] : val;
    // Handle "1000-5000" -> 5000
    const parts = String(v).split(/[-_]/);
    return parts.length > 1 ? parseInt(parts[1]) : undefined;
  }

  _parseRevenueMin(val) {
    if (!val) return 0;
    if (typeof val === 'number') return val;
    const parts = String(val).split(/[-_]/);
    const num = parseInt(parts[0].replace(/[^0-9]/g, ''));
    return isNaN(num) ? 0 : num;
  }

  _parseRevenueMax(val) {
    if (!val) return 0;
    if (typeof val === 'number') return val;
    const parts = String(val).split(/[-_]/);
    if (parts.length > 1) {
      const num = parseInt(parts[1].replace(/[^0-9]/g, ''));
      return isNaN(num) ? 0 : num;
    }
    return this._parseRevenueMin(val); // If single value, min=max
  }
}

module.exports = new ContactOutService();
