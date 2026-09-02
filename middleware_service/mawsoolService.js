
require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });
const axios = require("axios");

class MawsoolService {
  constructor() {
    this.baseUrl = process.env.MAWSOOL_ENGINE_URL || "http://localhost:3000";
    this.axiosInstance = axios.create({
      baseURL: this.baseUrl,
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      timeout: 60000 // Increased to 60s to prevent timeouts on cold starts
    });

    // Add retry interceptor for timeouts and 5xx errors
    this.axiosInstance.interceptors.response.use(null, async (error) => {
      const { config, code, message } = error;
      
      // Check if retry is allowed and remaining
      if (!config || !config.retry) {
        return Promise.reject(error);
      }

      // Retry on timeout or server error
      const isTimeout = code === 'ECONNABORTED' || message.includes('timeout');
      const isServerError = error.response && error.response.status >= 500;

      if (isTimeout || isServerError) {
        config.retry -= 1;
        console.warn(`[Mawsool] Request failed (${isTimeout ? 'Timeout' : 'Server Error'}). Retrying... (${config.retry} attempts left)`);
        
        // Wait 1 second before retrying
        await new Promise(resolve => setTimeout(resolve, 1000));
        return this.axiosInstance(config);
      }

      return Promise.reject(error);
    });
  }

  _extractFilterValue(val) {
    if (!val) return undefined;
    if (typeof val === 'object' && !Array.isArray(val) && val.include) {
      return val.include;
    }
    return val;
  }

  _resolveLanguagesFilter(filter) {
    const rawInc = this._extractFilterValue(filter);
    if (!rawInc) return undefined;
    
    // Ensure it's an array for mapping
    const arr = Array.isArray(rawInc) ? rawInc : [rawInc];
    if (arr.length === 0) return undefined;
    
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

    return arr.map(l => {
        if (typeof l !== 'string') return l;
        const lower = l.toLowerCase();
        return LANGUAGE_MAP[lower] || lower;
    });
  }

  _processCompanyFilters(filters) {
    let companyIds = [];
    let companyNames = [];

    // Grab any explicit IDs
    let explicitIds = this._extractFilterValue(filters.company_linkedin_id || filters.company_id) || [];
    if (!Array.isArray(explicitIds)) explicitIds = [explicitIds];
    if (explicitIds.length) {
      companyIds = companyIds.concat(explicitIds);
    }

    // Grab values from company_name and company, and separate numeric IDs from text
    let companyNameFilter = this._extractFilterValue(filters.company_name) || [];
    if (!Array.isArray(companyNameFilter)) companyNameFilter = [companyNameFilter];
    
    let companyFilter = this._extractFilterValue(filters.company) || [];
    if (!Array.isArray(companyFilter)) companyFilter = [companyFilter];
    
    let rawCompanyNames = [...companyNameFilter, ...companyFilter];
    
    rawCompanyNames.forEach(val => {
      if (!val) return;
      // Check if it's a numeric ID (like 81831244) or has ||| (legacy fallback)
      if (/^\d+$/.test(val)) {
        companyIds.push(val);
      } else {
        companyNames.push(val); // Keep full val (including |||) so the engine can parse name & domain!
      }
    });

    // Deduplicate
    companyIds = [...new Set(companyIds)];
    companyNames = [...new Set(companyNames)];

    return { companyIds, companyNames };
  }

  _chunkArray(arr, size) {
    const out = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  }

  async _mapPool(items, concurrency, fn) {
    const results = new Array(items.length);
    let next = 0;
    const worker = async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i], i);
      }
    };
    const n = Math.max(1, Math.min(concurrency, items.length || 1));
    await Promise.all(Array.from({ length: items.length ? n : 0 }, worker));
    return results;
  }

  _looksLikeDomain(val) {
    if (!val || typeof val !== "string") return false;
    const s = val.trim().toLowerCase().replace(/^(https?:\/\/)?(www\.)?/, "").split("/")[0];
    if (!s || s.includes(" ") || s.includes("|||")) return false;
    return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(s);
  }

  _normalizeDomain(val) {
    return String(val || "")
      .trim()
      .toLowerCase()
      .replace(/[\uFEFF"']/g, "")
      .replace(/^[?]+/, "")
      .replace(/^(https?:\/\/)?(www\.)?/, "")
      .split("/")[0]
      .replace(/[?,;]+$/g, "")
      .trim();
  }

  _getCompanyIncludes(filters) {
    const raw =
      this._extractFilterValue(filters?.company_name) ||
      this._extractFilterValue(filters?.company) ||
      [];
    if (Array.isArray(raw)) return raw.filter(Boolean);
    return raw ? [raw] : [];
  }

  _splitCompanyIncludes(filters) {
    const includes = this._getCompanyIncludes(filters);
    const existingDomains = Array.isArray(filters?.company_domain)
      ? filters.company_domain
      : this._extractFilterValue(filters?.company_domain) || [];
    const genericDomains = new Set(["t.co", "bit.ly", "lnkd.in", "goo.gl"]);
    const domains = [];
    const names = [];
    const ids = [];
    for (const val of includes) {
      const s = String(val).trim();
      if (!s) continue;
      if (/^\d+$/.test(s)) {
        ids.push(s);
        continue;
      }
      const domain = this._normalizeDomain(s);
      if (genericDomains.has(domain)) continue;
      if (this._looksLikeDomain(s) || this._looksLikeDomain(domain)) {
        domains.push(domain);
      } else if (s.length >= 3) {
        names.push(s);
      }
    }
    for (const d of existingDomains) {
      if (d) domains.push(this._normalizeDomain(d));
    }
    return {
      domains: [...new Set(domains.filter(Boolean))],
      names: [...new Set(names)],
      ids: [...new Set(ids)],
    };
  }

  _applySplitCompanyFilters(filters, { domains, names, ids }) {
    const next = { ...filters };
    delete next.company_name;
    delete next.company;
    delete next.company_domain;
    if (domains.length) next.company_domain = domains;
    if (ids.length) next.company_linkedin_id = ids;
    const exclude =
      (filters?.company_name && filters.company_name.exclude) ||
      (filters?.company && filters.company.exclude) ||
      undefined;
    if (names.length || exclude) {
      next.company_name = { include: names, ...(exclude ? { exclude } : {}) };
    }
    return next;
  }

  _itemKey(item) {
    const domain = this._normalizeDomain(item?.domain || item?.website || "");
    if (domain && domain.includes(".")) return `d:${domain}`;
    const id = String(item?.id || item?.public_identifier || item?.numeric_id || "").trim();
    if (id && id !== "undefined" && id !== "null") return `i:${id}`;
    const name = String(item?.name || "").trim().toLowerCase();
    if (name) return `n:${name}`;
    return "";
  }

  _companyRank(item) {
    return Number(item?.linkedin_employee_count || item?.headcount || 0);
  }

  _emptyResult() {
    return { items: [], total: "0", paging: { start: 0, page_count: 0, total_count: 0 } };
  }

  _numericTotal(value) {
    if (value === -1 || value === "-1") return -1;
    if (typeof value === "number" && Number.isFinite(value)) return value;
    const parsed = Number(String(value || "").replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  _mergeChunkResults(results, page, limit, { sumRemoteTotals }) {
    const seen = new Set();
    const items = [];
    let remoteTotal = 0;
    let unknownTotal = false;
    for (const r of results || []) {
      const chunkTotal = this._numericTotal(r?.paging?.total_count);
      if (chunkTotal === -1) unknownTotal = true;
      else if (chunkTotal > 0 && chunkTotal < 10000) remoteTotal += chunkTotal;
      else if (chunkTotal >= 10000) remoteTotal += chunkTotal;
      for (const item of r?.items || []) {
        const key = this._itemKey(item);
        if (key) {
          if (seen.has(key)) continue;
          seen.add(key);
        }
        items.push(item);
      }
    }
    const safePage = Number(page) || 1;
    const safeLimit = Number(limit) || 20;
    const start = (safePage - 1) * safeLimit;
    const pageItems = items.slice(start, start + safeLimit);
    let totalCount;
    if (unknownTotal && remoteTotal === 0) totalCount = -1;
    else if (sumRemoteTotals) totalCount = unknownTotal ? Math.max(remoteTotal, items.length) : remoteTotal;
    else totalCount = items.length;
    if (totalCount !== -1 && totalCount < items.length) totalCount = items.length;
    return {
      items: pageItems,
      total: totalCount === -1 ? -1 : String(totalCount),
      paging: {
        start,
        page_count: pageItems.length,
        total_count: totalCount,
      },
    };
  }

  async _fetchAllChunkPages(runOnce, filters, pageSize, maxItems, allowedDomains) {
    const wanted = new Set(
      (allowedDomains || []).map((d) => this._normalizeDomain(d)).filter((d) => d && d.includes("."))
    );
    const best = new Map();
    let page = 1;
    const size = Math.min(Math.max(Number(pageSize) || 100, 1), 100);
    const capPages = wanted.size ? 3 : 5;

    while (page <= capPages) {
      const r = await runOnce(filters, page, size);
      const items = r?.items || [];
      const chunkTotal = this._numericTotal(r?.paging?.total_count);
      if (chunkTotal > 1000000) {
        console.warn("[Mawsool] Engine returned an unfiltered company total; stopping this chunk");
        break;
      }
      if (!items.length) break;
      for (const item of items) {
        const domain = this._normalizeDomain(item?.domain || item?.website || "");
        if (wanted.size && !wanted.has(domain)) continue;
        const key = domain || this._itemKey(item);
        if (!key) continue;
        const prev = best.get(key);
        if (!prev || this._companyRank(item) > this._companyRank(prev)) best.set(key, item);
      }
      if (wanted.size && best.size >= wanted.size) break;
      if (items.length < size) break;
      if (chunkTotal > 0 && chunkTotal !== -1 && page * size >= chunkTotal) break;
      page += 1;
    }

    const all = [...best.values()];
    return {
      items: all,
      total: String(all.length),
      paging: { start: 0, page_count: all.length, total_count: all.length },
    };
  }

  async _searchWithCompanyChunks(filters, page, limit, runOnce, { fetchAllMatches }) {
    const split = this._splitCompanyIncludes(filters);
    // Company search has no company_domain support on the engine; names are fuzzy and must stay small.
    const domainChunkSize = fetchAllMatches ? 8 : 400;
    const nameChunkSize = 40;
    const domainChunks = split.domains.length ? this._chunkArray(split.domains, domainChunkSize) : [];
    const nameChunks = split.names.length ? this._chunkArray(split.names, nameChunkSize) : [];
    const totalChunks = domainChunks.length + nameChunks.length;
    const needsMultiple = totalChunks > 1 || (domainChunks.length > 0 && nameChunks.length > 0);

    if (!needsMultiple && !fetchAllMatches) {
      return runOnce(this._applySplitCompanyFilters(filters, split), page, limit);
    }

    console.log(
      `[Mawsool] Company filter has ${split.domains.length} domains and ${split.names.length} names; splitting into ${Math.max(totalChunks, 1)} chunks`
    );

    const results = [];
    const chunkPage = 1;
    const perPage = fetchAllMatches
      ? 100
      : Math.max(Number(limit) || 20, (Number(page) || 1) * (Number(limit) || 20));

    const runChunk = async (chunkSplit, label, allowedDomains) => {
      const chunkFilters = this._applySplitCompanyFilters(filters, chunkSplit);
      try {
        const r = fetchAllMatches
          ? await this._fetchAllChunkPages(runOnce, chunkFilters, perPage, (allowedDomains || []).length, allowedDomains)
          : await runOnce(chunkFilters, chunkPage, perPage);
        console.log(
          `[Mawsool] ${label}: ${r?.items?.length || 0} exact domain matches, total=${r?.paging?.total_count || r?.total || 0}`
        );
        return r || this._emptyResult();
      } catch (err) {
        console.error(`[Mawsool] ${label} failed:`, err.message);
        return this._emptyResult();
      }
    };

    if (needsMultiple || fetchAllMatches) {
      const domainHits = await this._mapPool(domainChunks, 4, (chunk, i) =>
        runChunk(
          { domains: chunk, names: [], ids: i === 0 ? split.ids : [] },
          `Company chunk ${i + 1}/${Math.max(totalChunks, 1)}`,
          chunk
        )
      );
      results.push(...domainHits);
      for (let i = 0; i < nameChunks.length; i++) {
        results.push(
          await runChunk(
            { domains: [], names: nameChunks[i], ids: domainChunks.length ? [] : split.ids },
            `Company name chunk ${i + 1}/${nameChunks.length}`,
            []
          )
        );
      }
    }

    if (results.length === 0) {
      return runOnce(this._applySplitCompanyFilters(filters, split), page, limit);
    }
    return this._mergeChunkResults(results, page, limit, { sumRemoteTotals: !fetchAllMatches });
  }

  /**
   * Search People
   */
  async searchPeople(filters, page = 1, limit = 20) {
    return this._searchWithCompanyChunks(
      filters,
      page,
      limit,
      (f, p, l) => this._searchPeopleOnce(f, p, l),
      { fetchAllMatches: false }
    );
  }

  async _searchPeopleOnce(filters, page = 1, limit = 20) {
    try {
      const includeCount = this._getCompanyIncludes(filters).length;
      console.log("[Mawsool] Searching People - Incoming Filters:", includeCount > 80 ? `{ company_name include: ${includeCount} values, other keys: ${Object.keys(filters || {}).join(", ")} }` : JSON.stringify(filters, null, 2));
      
      // Map filters to Mawsool SearchPeopleQuery format
      const payload = {
        page: Number(page) || 1,
        limit: Number(limit) || 20, // Dynamic limit
        exclude_public_ids: filters.exclude_public_ids,
        exclude_numeric_ids: filters.exclude_numeric_ids,
        keywords: filters.keywords,
        seed: filters.seed, // Pass the session seed for Redis PIT pagination
        first_name: filters.first_name, // Added: Pass first_name
        last_name: filters.last_name,   // Added: Pass last_name
        name_exact_match: filters.name_exact_match, // Added: Pass exact match flag
        job_title: filters.job_title || filters.role,
        company_name: filters.company_name,
        company_linkedin_id: filters.company_linkedin_id || filters.company_id,
        company_domain: filters.company_domain,
        location: this._extractFilterValue(filters.location || filters.country),
        industry: filters.industry || filters.company_industry,
        city: this._extractFilterValue(filters.city),
        
        // Pass the raw filters object for advanced filtering handled by Mawsool
        filters: {
          first_name: filters.first_name, // Added: Pass first_name to filters object
          last_name: filters.last_name,   // Added: Pass last_name to filters object
          name_exact_match: filters.name_exact_match, // Added: Pass exact match flag to filters object
          expand_job_titles: filters.expand_job_titles,
          role: this._extractFilterValue(filters.role),
          past_role: filters.past_role, // Pass full object { include: [...] }
          past_company: filters.past_company, // Pass full object { include: [...] }
          company_linkedin_id: filters.company_linkedin_id || filters.company_id,
          company_domain: filters.company_domain || this._extractFilterValue(filters.company_domain),
          function: this._extractFilterValue(filters.function),
          industry: this._extractFilterValue(filters.industry || filters.company_industry),
          location: this._extractFilterValue(filters.location),
          city: this._extractFilterValue(filters.city),
          company_location: this._extractFilterValue(filters.company_location || filters.headquarter),
          company_headcount: this._extractFilterValue(filters.company_headcount || filters.company_size),
          seniority: this._extractFilterValue(filters.seniority),
          years_in_current_role: this._extractFilterValue(filters.experience_at_role || filters.years_in_current_role),
          total_experience_years: this._extractFilterValue(filters.experience || filters.total_experience),
          behavioral_keywords: this._extractFilterValue(filters.behavioral_keywords), // Added support for behavioral targeting
          language: this._resolveLanguagesFilter(filters.language || filters.languages),
          education: this._extractFilterValue(filters.education || filters.school),
          skills: this._extractFilterValue(filters.skills)
        },
        exclude_public_ids: filters.exclude_public_ids
      };

      console.log("[mawsoolService] People payload exclude_public_ids count:", payload.exclude_public_ids?.length);

      // Clean undefined
      Object.keys(payload).forEach(key => payload[key] === undefined && delete payload[key]);

      const response = await this.axiosInstance.post("/search/people", payload, { retry: 1 });
      
      return this._normalizePeopleResponse(response.data, filters);
    } catch (error) {
      console.error("[Mawsool] People Search Failed:", error.message);
      // Return empty result instead of throwing to allow fallback/hybrid flow
      return { items: [], total: "0", paging: { start: 0, page_count: 0, total_count: 0 } };
    }
  }

  /**
   * Search Companies
   */
  async searchCompanies(filters, page = 1, limit = 20) {
    return this._searchWithCompanyChunks(
      filters,
      page,
      limit,
      (f, p, l) => this._searchCompaniesOnce(f, p, l),
      { fetchAllMatches: true }
    );
  }

  async _searchCompaniesOnce(filters, page = 1, limit = 20) {
    try {
      const domains = Array.isArray(filters.company_domain)
        ? filters.company_domain.filter(Boolean)
        : this._extractFilterValue(filters.company_domain) || [];
      const { companyIds, companyNames } = this._processCompanyFilters(filters);
      const names = this._extractFilterValue(filters.company_name) || [];
      const nameList = [
        ...(Array.isArray(names) ? names : names ? [names] : []),
        ...companyNames,
        ...companyIds,
        ...domains,
      ].filter(Boolean);

      console.log("[Mawsool] Searching Companies:", {
        page,
        nameCount: nameList.length,
        domainCount: domains.length,
        idCount: companyIds.length,
      });

      // /search/companies ignores company_domain and returns the full 52M index.
      // Domain lists and numeric LinkedIn IDs must be sent as company_name;
      // the engine treats digits as linkedin_id and exact-matches domains in middleware.
      const payload = {
        page: Number(page) || 1,
        limit: Number(limit) || 20,
        exclude_public_ids: filters.exclude_public_ids,
        exclude_numeric_ids: filters.exclude_numeric_ids,
        keywords: filters.keywords,
        industry: this._extractFilterValue(filters.industry || filters.company_industry),
        locations: this._extractFilterValue(filters.location || filters.country),
        city: this._extractFilterValue(filters.city),
        filters: {
           location: this._extractFilterValue(filters.location),
           city: this._extractFilterValue(filters.city),
           industry: this._extractFilterValue(filters.industry),
           company_name: nameList.length ? nameList : undefined,
           linkedin_id: companyIds.length ? companyIds : undefined,
           company_linkedin_id: companyIds.length ? companyIds : undefined,
           company_headcount: this._extractFilterValue(filters.company_size || filters.company_headcount),
           revenue: this._extractFilterValue(filters.revenue),
           founded_year: this._extractFilterValue(filters.founded_year)
        },
        exclude_public_ids: filters.exclude_public_ids
      };

      Object.keys(payload).forEach(key => payload[key] === undefined && delete payload[key]);
      Object.keys(payload.filters).forEach(key => payload.filters[key] === undefined && delete payload.filters[key]);

      const response = await this.axiosInstance.post("/search/companies", payload, { retry: 1 });
      
      return this._normalizeCompanyResponse(response.data);
    } catch (error) {
      console.error("[Mawsool] Company Search Failed:", error.message);
      return { items: [], total: "0", paging: { start: 0, page_count: 0, total_count: 0 } };
    }
  }

  async getProfilesByIds(publicIds = []) {
    try {
      if (!Array.isArray(publicIds) || publicIds.length === 0) {
        return { results: [] };
      }
      const response = await this.axiosInstance.post("/profiles/by-ids", { public_ids: publicIds }, { retry: 1 });
      return response.data || { results: [] };
    } catch (error) {
      const status = error?.response?.status;
      console.error("[Mawsool] Get Profiles By Ids Failed:", error.message);
      if (status === 404) {
        return { error: "engine_missing_profiles_by_ids", results: [] };
      }
      return { error: "engine_profiles_by_ids_failed", results: [] };
    }
  }

  /**
   * Get Similar Companies (Vector Search)
   */
  async getSimilarCompanies(publicId, filters = {}) {
    try {
      console.log("[Mawsool] Fetching Similar Companies for:", publicId, "Filters:", filters);
      
      const payload = { 
        public_id: publicId,
        locations: this._extractFilterValue(filters.location || filters.country),
        industry: this._extractFilterValue(filters.industry || filters.company_industry),
        employee_count: this._extractFilterValue(filters.company_size || filters.company_headcount),
        revenue: this._extractFilterValue(filters.revenue),
        founded_year: this._extractFilterValue(filters.founded_year),
        exclude_public_ids: filters.exclude_public_ids
      };

      // Log the payload to debug filtering issues
      console.log("[Mawsool] Sending Similar Payload:", JSON.stringify(payload, null, 2));

      const response = await this.axiosInstance.post("/search/companies/similar", payload, { retry: 1 });
      return this._normalizeCompanyResponse(response.data);
    } catch (error) {
      console.error("[Mawsool] Similar Companies Search Failed:", error.message);
      return { items: [] };
    }
  }

  // --- NORMALIZATION ---

  _proxyLogo(logo) {
      if (!logo) return logo;

      // 0. Handle Existing Proxy URL (Fix localhost or other domains)
      // If the logo is already a proxy URL (e.g. from DB), ensure it uses the correct backend
      if (typeof logo === 'string' && logo.includes('/api/proxy/image')) {
          const backendUrl = "https://backbeta.mawsool.tech";
          try {
              // If it starts with http, replace origin
              if (logo.startsWith('http')) {
                  const urlObj = new URL(logo);
                  return `${backendUrl}${urlObj.pathname}${urlObj.search}`;
              }
              // If relative, prepend
              return `${backendUrl}${logo}`;
          } catch (e) {
              return logo.replace(/^https?:\/\/[^\/]+/, backendUrl);
          }
      }
      
      // 1. Handle Hash (30-40 chars hex) -> ContactOut URL
      // Relaxed regex to catch slightly different hash lengths
      if (/^[a-f0-9]{30,40}$/i.test(logo)) {
          logo = `https://images.contactout.com/companies/${logo}`;
      }

      // 2. PROXY LOGIC: If logo is from ContactOut, proxy it
      if (typeof logo === 'string' && logo.includes('images.contactout.com')) {
          try {
              const b64 = Buffer.from(logo).toString('base64');
              // User specified backend URL: backbeta.mawsool.tech
              const backendUrl = "https://backbeta.mawsool.tech"; 
              return `${backendUrl}/api/proxy/image?key=${b64}`;
          } catch (e) {
              // Keep original if encoding fails
              return logo;
          }
      }

      // Handle Clearbit images
      if (typeof logo === 'string' && logo.includes('logo.clearbit.com')) {
          try {
              const b64 = Buffer.from(logo).toString('base64');
              const backendUrl = "https://backbeta.mawsool.tech";
              return `${backendUrl}/api/proxy/image?key=${b64}`;
          } catch (e) {
              return logo;
          }
      }

      // Handle Logo.dev images
      if (typeof logo === 'string' && logo.includes('img.logo.dev')) {
          try {
              const b64 = Buffer.from(logo).toString('base64');
              const backendUrl = "https://backbeta.mawsool.tech";
              return `${backendUrl}/api/proxy/image?key=${b64}`;
          } catch (e) {
              return logo;
          }
      }

      return logo;
  }

  _extractFilterLabels(filters, key) {
    const val = filters?.[key];
    if (!val) return [];
    const labels = [];
    if (val.includeLabels && Object.keys(val.includeLabels).length > 0) {
      Object.values(val.includeLabels).forEach((label) => labels.push(String(label).toLowerCase()));
    } else if (val.include && Array.isArray(val.include)) {
      val.include.forEach((id) => labels.push(String(id).toLowerCase()));
    } else if (Array.isArray(val)) {
      val.forEach((v) => labels.push(String(v).toLowerCase()));
    } else if (typeof val === "string") {
      labels.push(val.toLowerCase());
    }
    return labels;
  }

  _namesOverlap(a, b) {
    const na = String(a || "").toLowerCase().trim();
    const nb = String(b || "").toLowerCase().trim();
    if (!na || !nb) return false;
    return na === nb || na.includes(nb) || nb.includes(na);
  }

  _startDateValue(value) {
    if (!value) return 0;
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
    const match = String(value).match(/(\d{4})(?:-(\d{1,2}))?/);
    if (!match) return 0;
    return Date.UTC(Number(match[1]), Number(match[2] || 1) - 1);
  }

  _filterCompanyLabels(filters) {
    return [
      ...this._extractFilterLabels(filters, "company"),
      ...this._extractFilterLabels(filters, "company_name"),
      ...this._extractFilterLabels(filters, "past_company"),
    ].map((c) => (String(c).includes("|||") ? String(c).split("|||")[0].trim() : String(c).trim()));
  }

  _selectPrimaryPosition(current_positions, source, filters) {
    const positions = Array.isArray(current_positions) ? [...current_positions] : [];
    const currentCompany = String(source?.current_company_name || "").trim();
    const filterCompanies = this._filterCompanyLabels(filters);
    const filterIndustries = this._extractFilterLabels(filters, "industry");
    const filterRoles = [
      ...this._extractFilterLabels(filters, "role"),
      ...this._extractFilterLabels(filters, "job_title"),
    ];

    if (
      currentCompany &&
      filterCompanies.length === 0 &&
      !positions.some((p) => this._namesOverlap(p.company, currentCompany))
    ) {
      const domain = Array.isArray(source.current_company_domain)
        ? source.current_company_domain.find((d) => this._namesOverlap(d, currentCompany)) || source.current_company_domain[0]
        : source.current_company_domain || "";
      positions.unshift({
        role: source.current_job_title || source.headline,
        title: source.current_job_title || source.headline,
        company: currentCompany,
        company_logo: this._namesOverlap(source.company_name, currentCompany)
          ? this._proxyLogo(source.company_logo)
          : undefined,
        industry: Array.isArray(source.current_industry)
          ? source.current_industry
          : source.current_industry
            ? [source.current_industry]
            : [],
        start_date: source.current_job_start_date,
        website: domain || "",
      });
    }

    if (positions.length <= 1) return positions;

    let bestIndex = 0;
    let bestScore = -1;
    positions.forEach((pos, idx) => {
      let score = 0;
      const posCompany = String(pos.company || "");
      const posRole = String(pos.role || pos.title || "").toLowerCase();
      const posIndustries = Array.isArray(pos.industry)
        ? pos.industry.map((i) => String(i).toLowerCase())
        : [String(pos.industry || "").toLowerCase()];

      if (filterCompanies.length > 0) {
        if (filterCompanies.some((c) => this._namesOverlap(posCompany, c))) score += 50;
      } else if (currentCompany && this._namesOverlap(posCompany, currentCompany)) {
        score += 40;
      } else {
        score += this._startDateValue(pos.start_date) / 1e13;
      }

      if (filterRoles.length > 0 && filterRoles.some((r) => posRole.includes(r) || r.includes(posRole))) {
        score += 10;
      }
      if (
        filterIndustries.length > 0 &&
        filterIndustries.some((fi) => posIndustries.some((pi) => pi.includes(fi) || fi.includes(pi)))
      ) {
        score += 10;
      }

      if (score > bestScore) {
        bestScore = score;
        bestIndex = idx;
      }
    });

    if (bestIndex > 0) {
      const matched = positions.splice(bestIndex, 1)[0];
      positions.unshift(matched);
    }
    return positions;
  }

  _normalizePeopleResponse(data, filters = {}) {
    // Mawsool returns { results: [...], total: N, ... }
    const items = (data.results || []).map((hit, index) => {
      // Mawsool 'hit' structure: { id, body: { ... }, ... }
      
      // Fix: Merge hit and hit.body to ensure root-level properties (like current_roles) are preserved
      const source = hit.body ? { ...hit, ...hit.body } : hit;
      
      // --- Industry Reordering Logic ---
      // If the user filtered by a specific industry, move it to the front of the list
      // so it appears in the UI (which typically shows industry[0])
      let industries = Array.isArray(source.industry) ? [...source.industry] : (source.industry ? [source.industry] : []);
      const targetVal = this._extractFilterValue(filters.industry || filters.company_industry);
      const targetIndustries = Array.isArray(targetVal) ? targetVal : (targetVal ? [targetVal] : []);
      
      if (targetIndustries.length > 0 && industries.length > 0) {
          const targets = new Set(targetIndustries.map(i => String(i).toLowerCase()));
          industries.sort((a, b) => {
              const aIsTarget = targets.has(String(a).toLowerCase());
              const bIsTarget = targets.has(String(b).toLowerCase());
              if (aIsTarget && !bIsTarget) return -1;
              if (!aIsTarget && bIsTarget) return 1;
              return 0;
          });
          // Update source.industry with reordered list for consistency
          source.industry = industries; 
      }
      // ---------------------------------

      if (index < 3) {
          console.log(`[DEBUG] Item ${index} Raw Hit Structure:`, JSON.stringify({
              hit_keys: Object.keys(hit),
              source_keys: Object.keys(source),
              hit_logo: hit.logo,
              hit_company_logo: hit.company_logo,
              source_logo: source.logo,
              source_company_logo: source.company_logo,
              source_company_name: source.company_name,
              source_current_company_name: source.current_company_name,
              source_domain: source.current_company_domain || source.company_domain
          }, null, 2));
      }

      // Construct Name
      const name = source.full_name || `${source.first_name || ''} ${source.last_name || ''}`.trim();
      
      // Resolve Logo - Prioritize company_logo from body as requested
      let logo = source.company_logo || source.logo || hit.logo || hit.company_logo;
      
      const logoBeforeProxy = logo;

      // Proxy existing logo (Handle Hash -> URL -> Proxy)
      logo = this._proxyLogo(logo);
      
      if (!logo && (source.company_logo || hit.company_logo)) {
          console.warn(`[WARNING] Logo lost during processing!`, {
              id: hit.id,
              name: name,
              original_company_logo: source.company_logo || hit.company_logo,
              logo_before_proxy: logoBeforeProxy,
              logo_after_proxy: logo
          });
      }

      // Fallback: If no logo (after proxy attempt), try img.logo.dev with domain
      /*
      if (!logo) {
          const domain = source.current_company_domain || source.company_domain;
          // IMPORTANT: Check if we have a valid domain before using fallback
          // If domain is missing or generic (e.g. gmail.com), fallback might be bad.
          if (domain) {
              logo = `https://img.logo.dev/${domain}?token=pk_Z9lgPTVDTJePN73JZs8Pvg`;
              // console.log(`[INFO] Using Fallback Logo for ${name}: ${logo}`);
          }
      }
      */
      
      // Construct LinkedIn URL
      let public_profile_url = source.linkedin_url || source.public_profile_url;
      if (!public_profile_url && source.public_id) {
          public_profile_url = `https://www.linkedin.com/in/${source.public_id}`;
      } else if (!public_profile_url && source.id) {
          public_profile_url = `https://www.linkedin.com/in/${source.id}`;
      }

      // Construct Location
      const location = source.location || source.location_name || source.location_country;

      // Construct Current Positions (Frontend expects: current_positions[0].role, .company, .industry[])
      let current_positions = [];
      
      // 1. Prefer the new 'current_roles' array from Elasticsearch
      if (source.current_roles && Array.isArray(source.current_roles) && source.current_roles.length > 0) {
            current_positions = source.current_roles.map(role => ({
                role: role.job_title,
                title: role.job_title,
                company: role.company_name,
                company_logo: this._proxyLogo(role.company_logo) || logo,
                industry: role.industry ? [role.industry] : [],
                employee_count: role.employee_count,
                linkedin_employee_count: role.linkedin_employee_count,
                company_hq_country: role.company_hq_country,
                years_in_current_company: role.years_in_current_company,
                start_date: role.start_date,
                mawsool_seniority: role.mawsool_seniority,
                seniority: role.mawsool_seniority,
                website: role.company_domain || "",
                company_linkedin_url: role.company_linkedin_id ? `https://www.linkedin.com/company/${role.company_linkedin_id}` : ""
            }));
        } else {
          // 2. Fallback to existing 'current_positions'
          current_positions = source.current_positions || [];
      }
      
      // If current_positions is empty, try to construct it from the experience array
      if ((!current_positions || current_positions.length === 0) && source.experience && Array.isArray(source.experience)) {
          source.experience.forEach(exp => {
              const compName = exp.company?.name || exp.companyName || (typeof exp.company === 'string' ? exp.company : null);
              const compLogo = exp.company?.logo || exp.company?.company_logo || exp.company_logo;
              const isDateCurrent = (endYear) => endYear === null || endYear === undefined || endYear === '' || String(endYear).toLowerCase().includes('present');
              
              if (Array.isArray(exp.positions) && exp.positions.length > 0) {
                  exp.positions.forEach(pos => {
                      if (isDateCurrent(pos.endDateYear)) {
                          current_positions.push({
                              role: pos.title || pos.role,
                              title: pos.title || pos.role,
                              company: compName,
                              company_logo: this._proxyLogo(compLogo) || logo,
                              industry: Array.isArray(source.current_industry) ? source.current_industry : (source.current_industry ? [source.current_industry] : []),
                              start_date: pos.startDateYear ? `${pos.startDateYear}-${pos.startDateMonth || 1}` : null,
                              website: exp.company?.domain || exp.company?.website || "",
                              company_linkedin_url: exp.company?.url || exp.company?.linkedinUrl || exp.company?.linkedin_url || ""
                          });
                      }
                  });
              } else if (isDateCurrent(exp.endDateYear) || isDateCurrent(exp.endedOn)) {
                  current_positions.push({
                      role: exp.title || exp.role,
                      title: exp.title || exp.role,
                      company: compName,
                      company_logo: this._proxyLogo(compLogo) || logo,
                      industry: Array.isArray(source.current_industry) ? source.current_industry : (source.current_industry ? [source.current_industry] : []),
                      start_date: exp.startDateYear || exp.startedOn ? `${exp.startDateYear || exp.startedOn}-${exp.startDateMonth || 1}` : null,
                      website: exp.company?.domain || exp.company?.website || "",
                      company_linkedin_url: exp.company?.url || exp.company?.linkedinUrl || exp.company?.linkedin_url || ""
                  });
              }
          });
      }

      current_positions = this._selectPrimaryPosition(current_positions, source, filters);

      // If STILL empty or invalid, try to construct it from root fields
      if (!current_positions || current_positions.length === 0) {
          if (source.current_job_title || source.current_company_name || source.company_name) {
              // Prefer 'current_industry' over 'industry' if available
              const industrySource = source.current_industry && source.current_industry.length > 0 
                  ? source.current_industry 
                  : source.industry;

              current_positions = [{
                  role: source.current_job_title || source.headline, // Frontend uses 'role'
                  title: source.current_job_title || source.headline, // Keep 'title' just in case
                  company: source.current_company_name || source.company_name, // Prioritize current_company_name to avoid concatenated strings
                  company_logo: logo, // Pass logo here for UI
                  industry: Array.isArray(industrySource) ? industrySource : (industrySource ? [industrySource] : []),
                  start_date: source.current_job_start_date
              }];
          }
      } else {
          // Ensure existing positions have 'role' property if missing (map title to role)
          current_positions = current_positions.map(pos => {
              let posIndustry = Array.isArray(pos.industry) ? [...pos.industry] : (pos.industry ? [pos.industry] : []);
              
              // Apply same sorting logic to position-level industry if applicable
              const targetVal = this._extractFilterValue(filters.industry || filters.company_industry);
              const targetIndustries = Array.isArray(targetVal) ? targetVal : (targetVal ? [targetVal] : []);

              if (targetIndustries.length > 0 && posIndustry.length > 0) {
                  const targets = new Set(targetIndustries.map(i => String(i).toLowerCase()));
                  posIndustry.sort((a, b) => {
                      const aIsTarget = targets.has(String(a).toLowerCase());
                      const bIsTarget = targets.has(String(b).toLowerCase());
                      if (aIsTarget && !bIsTarget) return -1;
                      if (!aIsTarget && bIsTarget) return 1;
                      return 0;
                  });
              }

              return {
                  ...pos,
                  role: pos.role || pos.title,
                  company_logo: this._proxyLogo(pos.company_logo) || logo, // Proxy position logo, fallback to root proxied logo
                  industry: posIndustry
              };
          });

          // Bubble the matched position to index 0 based on search filters
          const targetSeniorities = this._extractFilterValue(filters.seniority) || [];
          const targetSenioritiesArr = Array.isArray(targetSeniorities) ? targetSeniorities : [targetSeniorities];
          const targetTitles = this._extractFilterValue(filters.job_title || filters.role) || [];
          const targetTitlesArr = Array.isArray(targetTitles) ? targetTitles : [targetTitles];
          const targetCompanies = this._extractFilterValue(filters.company_name || filters.company) || [];
          const targetCompaniesArr = Array.isArray(targetCompanies) ? targetCompanies : [targetCompanies];

          if (targetSenioritiesArr.length > 0 || targetTitlesArr.length > 0 || targetCompaniesArr.length > 0) {
              const lowerSeniorities = new Set(targetSenioritiesArr.map(s => String(s).toLowerCase().trim()));
              const lowerTitles = new Set(targetTitlesArr.map(t => String(t).toLowerCase().trim()));
              const lowerCompanies = new Set(targetCompaniesArr.map(c => {
                  let filterVal = String(c).toLowerCase().trim();
                  if (filterVal.includes('|||')) {
                      filterVal = filterVal.split('|||')[0].trim();
                  }
                  return filterVal;
              }));
              
              current_positions.sort((a, b) => {
                  let aScore = 0;
                  let bScore = 0;
                  
                  // Score A
                  if (a.mawsool_seniority && lowerSeniorities.has(String(a.mawsool_seniority).toLowerCase())) aScore += 1;
                  if (lowerSeniorities.has('owner / founder')) {
                      if (a.mawsool_seniority && ['owner', 'founder'].includes(String(a.mawsool_seniority).toLowerCase())) aScore += 1;
                  }
                  if (lowerSeniorities.has('cxo / executive')) {
                      if (a.mawsool_seniority && ['cxo'].includes(String(a.mawsool_seniority).toLowerCase())) aScore += 1;
                  }
                  
                  if (a.role && Array.from(lowerTitles).some(t => String(a.role).toLowerCase().includes(t))) aScore += 1;
                  if (a.company && Array.from(lowerCompanies).some(c => String(a.company).toLowerCase().includes(c))) aScore += 10; // Bumped score so company match is prioritized

                  // Score B
                  if (b.mawsool_seniority && lowerSeniorities.has(String(b.mawsool_seniority).toLowerCase())) bScore += 1;
                  if (lowerSeniorities.has('owner / founder')) {
                      if (b.mawsool_seniority && ['owner', 'founder'].includes(String(b.mawsool_seniority).toLowerCase())) bScore += 1;
                  }
                  if (lowerSeniorities.has('cxo / executive')) {
                      if (b.mawsool_seniority && ['cxo'].includes(String(b.mawsool_seniority).toLowerCase())) bScore += 1;
                  }

                  if (b.role && Array.from(lowerTitles).some(t => String(b.role).toLowerCase().includes(t))) bScore += 1;
                  if (b.company && Array.from(lowerCompanies).some(c => String(b.company).toLowerCase().includes(c))) bScore += 10; // Bumped score so company match is prioritized

                  return bScore - aScore; // Descending order (highest score first)
              });
          }
      }

      // Normalize Experience to ensure logos are proxied
      let experience = [];
      if (source.experience && Array.isArray(source.experience)) {
          experience = source.experience.map(exp => ({
              ...exp,
              company: {
                  ...exp.company,
                  logo: this._proxyLogo(exp.company?.logo || exp.company?.company_logo || exp.company_logo)
              },
              positions: exp.positions // Keep positions as is
          }));
      } else if (source.company_name) {
           experience = [{
              company: {
                name: source.company_name,
                id: source.company_id,
                industry: source.industry,
                logo: logo
              },
              positions: [{
                title: source.current_job_title || source.headline,
                role: source.current_job_title || source.headline,
                description: source.summary,
                startDateYear: null, // Unknown
                endDateYear: null
              }]
           }];
      }

      return {
        id: hit.id || hit._id,
        numeric_id: source.numeric_id || hit.numeric_id, // Added numeric_id to middleware output
        name: name, // Frontend uses 'name'
        full_name: name,
        first_name: source.first_name,
        last_name: source.last_name,
        headline: source.headline || source.current_job_title,
        location: location, // Frontend uses 'location'
        location_country: source.location_country,
        location_city: source.location_city || source.city, // Pass city down explicitly
        location_name: location,
        public_profile_url: public_profile_url, // Frontend uses 'public_profile_url'
        linkedin_url: public_profile_url,
        summary: source.summary,
        skills: source.skills,
        
        // Pass Logo at root level too (Standardized)
        logo: logo, 
        
        // Use normalized experience
        experience: experience,

        current_positions: current_positions,
        current_company_name: source.current_company_name || "",

        education: source.education || [],
        
        // Contact Info (likely restricted/missing in public search)
        personal_emails: source.personal_emails || [],
        work_emails: source.work_emails || [],
        mobile_numbers: source.mobile_numbers || [],

        // Extra fields for Lists and CSVs
        seniority: (current_positions.length > 0 && current_positions[0].seniority) ? current_positions[0].seniority : (source.seniority || ""),
          job_function: source.job_function || source.function || "",
          department: source.department || "",
          departments: source.departments || [],
          total_experience_years: source.total_experience_years || "",
          company_headcount: source.company_headcount || source.headcount || "",
        current_employee_count: (current_positions.length > 0 && current_positions[0].employee_count) ? current_positions[0].employee_count : (source.current_employee_count || ""),
        employee_count: (current_positions.length > 0 && current_positions[0].employee_count) ? current_positions[0].employee_count : (source.employee_count || "")
      };
    });

    return {
      items: items,
      total: data.total === -1 ? -1 : this._formatTotal(data.total),
      paging: {
        start: ((data.page || 1) - 1) * (data.limit || 20),
        page_count: items.length,
        total_count: data.total
      },
      source: 'mawsool' // Flag to identify source
    };
  }

  _normalizeCompanyResponse(data) {
    const items = (data.results || []).map(comp => {
      const source = comp && comp.body ? { ...comp, ...comp.body } : comp;
      let logo = source.logo || source.company_logo;
      logo = this._proxyLogo(logo);
      
      /*
      // Fallback
      if (!logo && comp.domain) {
          logo = `https://img.logo.dev/${comp.domain}?token=pk_Z9lgPTVDTJePN73JZs8Pvg`;
      }
      */
      
      return {
        id: source.id || source._id || comp.id || comp._id,
        numeric_id: source.numeric_id,
        name: source.name,
        linkedin_employee_count: source.linkedin_employee_count,
        domain: source.domain,
        website: source.website || source.domain,
        industry: source.industry,
        location: source.location_country || source.location,
        location_country: source.location_country,
        location_city: source.location_city || source.city,
        headquarter: source.headquarter,
        headcount: source.employee_count || source.headcount,
        logo: logo,
        overview: source.overview || source.description,
        founded_at: source.founded_at || source.year_founded,
        revenue_min: source.revenue_min,
        revenue_max: source.revenue_max,
        linkedin_url: source.linkedin_url || source.url,
        funding: source.funding
      };
    });

    // Fix for similar companies which might not return 'total'
    const totalCount = data.total !== undefined ? data.total : items.length;

    return {
      items: items,
      total: totalCount === -1 ? -1 : this._formatTotal(totalCount),
      paging: {
        start: ((data.page || 1) - 1) * (data.limit || 20),
        page_count: items.length,
        total_count: totalCount
      },
      source: 'Mena'
    };
  }

  _formatTotal(total) {
    if (process.env.NEXT_PUBLIC_SHOW_EXACT_TOTALS === 'true') {
        return total ? total.toLocaleString() : "0";
    }

    if (total === undefined || total === null) return "0";
    if (total === -1) return -1;
    if (typeof total === 'string') return total;
    if (total < 1000) return total.toString();
    if (total >= 1000000) return '~' + Math.ceil(total / 1000000) + 'M';
    if (total >= 1000) return '~' + Math.ceil(total / 1000) + 'K';
    return total.toString();
  }
}

module.exports = MawsoolService;
