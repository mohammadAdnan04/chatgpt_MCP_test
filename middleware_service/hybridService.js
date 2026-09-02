
require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });

const contactOutService = require("./service");
const MawsoolService = require("./mawsoolService");
const mawsoolService = new MawsoolService();

// Define MENA Countries (Normalized to lowercase)
const MENA_COUNTRIES = new Set([
  // Full Names
  "algeria", "bahrain", "egypt", "iran", "iraq", "israel", "jordan", "kuwait", 
  "lebanon", "libya", "morocco", "oman", "palestine", "qatar", "saudi arabia", 
  "syria", "tunisia", "turkey", "united arab emirates", "yemen", 
  // Common Abbreviations / Variations
  "uae", "ksa", "saudi",
  // ISO Codes (2-letter)
  "dz", "bh", "eg", "ir", "iq", "il", "jo", "kw", 
  "lb", "ly", "ma", "om", "ps", "qa", "sa", 
  "sy", "tn", "tr", "ae", "ye"
]);

class HybridService {
  constructor() {
    this.contactOut = contactOutService;
    this.mawsool = mawsoolService;
  }

  /**
   * Helper to extract flat list of locations from filters
   */
  _getLocations(filters) {
    const locs = [];
    if (!filters) return locs;

    const extract = (val) => {
        if (!val) return;
        if (Array.isArray(val)) {
            val.forEach(v => extract(v));
        } else if (typeof val === 'object' && val.include) {
            extract(val.include);
        } else if (typeof val === 'string') {
            locs.push(val);
        }
    };

    extract(filters.location);
    extract(filters.country);
    extract(filters.locations);

    return locs.map(l => l.toLowerCase().trim()).filter(Boolean);
  }

  /**
   * Determine Search Mode based on Location Filter
   * - MENA_ONLY: If all locations are MENA countries.
   * - GLOBAL_ONLY: If any location is NOT a MENA country.
   * - NO_FILTER: If no location filter is provided.
   */
  determineSearchMode(filters) {
    // We now have all global data in Elasticsearch.
    // ALWAYS force MENA_ONLY which maps to Mawsool local engine.
    return 'MENA_ONLY';
  }

  /**
   * Expands job title abbreviations to include full terms.
   * Modifies the filters object in place.
   */
  _expandJobTitles(filters) {
    if (!filters) return;
    
    // Respect the expand_job_titles flag if it is explicitly set to false
    if (filters.expand_job_titles === false) return;

    const ABBREVIATIONS = {
      // C-Suite
      'ceo': 'chief executive officer',
      'cfo': 'chief financial officer',
      'cto': 'chief technology officer',
      'cmo': 'chief marketing officer',
      'coo': 'chief operating officer',
      'cio': 'chief information officer',
      'ciso': 'chief information security officer',
      'chro': 'chief human resources officer',
      'cro': 'chief revenue officer',
      'cpo': 'chief product officer',
      
      // Leadership & Seniority
      'vp': 'vice president',
      'svp': 'senior vice president',
      'evp': 'executive vice president',
      'avp': 'assistant vice president',
      'dir': 'director',
      'mgr': 'manager',
      'sr': 'senior',
      'jr': 'junior',
      'exec': 'executive',
      'asst': 'assistant',
      'assoc': 'associate',
      'coord': 'coordinator',
      'rep': 'representative',
      'admin': 'administrator',

      // Departments & Roles
      'hr': 'human resources',
      'pr': 'public relations',
      'it': 'information technology',
      'qa': 'quality assurance',
      'dev': 'developer',
      'eng': 'engineer',
      'ops': 'operations',
      'mktg': 'marketing',
      'fin': 'finance',
      'biz': 'business',
      'bd': 'business development',
      
      // Custom / Variations
      'manager': 'management'
    };

    const expandTitles = (titles) => {
      if (!titles || !Array.isArray(titles)) return titles;
      const expandedSet = new Set(titles);

      titles.forEach(title => {
        if (typeof title !== 'string') return;
        
        // Forward expansion (e.g. hr -> human resources)
        let expandedTitle = title;
        let hasChanges = false;

        for (const [abbr, full] of Object.entries(ABBREVIATIONS)) {
          const regex = new RegExp(`\\b${abbr}\\b`, 'gi');
          if (regex.test(title)) {
            // Create a variant with just this abbreviation expanded
            expandedSet.add(title.replace(regex, full));
            
            // Accumulate changes for fully expanded version
            if (regex.test(expandedTitle)) {
              expandedTitle = expandedTitle.replace(regex, full);
              hasChanges = true;
            }
          }
        }
        
        if (hasChanges) {
          expandedSet.add(expandedTitle);
        }

        // Backward expansion (e.g. human resources -> hr)
        let backwardTitle = title;
        let hasBackwardChanges = false;
        for (const [abbr, full] of Object.entries(ABBREVIATIONS)) {
          const regex = new RegExp(`\\b${full}\\b`, 'gi');
          if (regex.test(title)) {
            expandedSet.add(title.replace(regex, abbr));
            
            if (regex.test(backwardTitle)) {
              backwardTitle = backwardTitle.replace(regex, abbr);
              hasBackwardChanges = true;
            }
          }
        }
        if (hasBackwardChanges) expandedSet.add(backwardTitle);
      });

      return Array.from(expandedSet);
    };

    // Apply expansion to role filters
    if (filters.role && filters.role.include) {
      filters.role.include = expandTitles(filters.role.include);
    } else if (Array.isArray(filters.role)) {
      filters.role = expandTitles(filters.role);
    }

    if (filters.job_title && filters.job_title.include) {
      filters.job_title.include = expandTitles(filters.job_title.include);
    } else if (Array.isArray(filters.job_title)) {
      filters.job_title = expandTitles(filters.job_title);
    }

    if (filters.past_role && filters.past_role.include) {
      filters.past_role.include = expandTitles(filters.past_role.include);
    } else if (Array.isArray(filters.past_role)) {
      filters.past_role = expandTitles(filters.past_role);
    }
  }

  /**
   * Parses the combined "Name|||Domain" format from the frontend.
   * - Mawsool (MENA): Uses the domain (for exact matching in Elasticsearch).
   * - ContactOut (Global): Uses the exact name wrapped in quotes.
   */
  _parseCombinedCompany(filters, targetService) {
    if (!filters) return filters;
    
    // Deep clone to avoid mutating the original
    const newFilters = JSON.parse(JSON.stringify(filters));

    const processArray = (arr) => {
      if (!Array.isArray(arr)) return arr;
      return arr.map(item => {
        if (typeof item === 'string' && item.includes('|||')) {
          const [name, domain] = item.split('|||');
          if (targetService === 'mawsool') {
             // Ignore generic domains like t.co
             if (domain && domain.toLowerCase() === 't.co') {
               return name && String(name).trim().length >= 3 ? name : null;
             }
             // Use domain if it exists and is valid, else fallback to name
             return domain && domain !== 'null' && domain !== 'undefined' && domain !== name ? domain : name;
          } else {
             // For ContactOut, do not wrap in exact quotes per user request
             return name;
          }
        }
        return item;
      }).filter((item) => item != null && String(item).trim() !== "");
    };

    ['company', 'company_name', 'past_company', 'ex_company'].forEach(key => {
      if (newFilters[key]) {
        if (newFilters[key].include) newFilters[key].include = processArray(newFilters[key].include);
        if (newFilters[key].exclude) newFilters[key].exclude = processArray(newFilters[key].exclude);
        if (Array.isArray(newFilters[key])) newFilters[key] = processArray(newFilters[key]);
      }
    });

    return newFilters;
  }

  /**
   * Unified Search People
   */
  async searchPeople(filters, page = 1, limit = 20, trackInfo = null) {
    this._expandJobTitles(filters);
    const mode = this.determineSearchMode(filters);
    console.log(`[HybridService] Search People Mode: ${mode}`);

    if (mode === 'MENA_ONLY') {
        // Case 1: MENA Filter -> Local Data Only
        const localFilters = this._parseCombinedCompany(filters, 'mawsool');
        const result = await this.mawsool.searchPeople(localFilters, page, limit, trackInfo);
        if (result.items) {
            result.items.forEach(item => item._source = 'MENA');
        }
        // Apply rounding to hide exact numbers
        if (result.paging && result.paging.total_count) {
             const originalTotalStr = String(result.total || "");
             result.paging.total_count = this._roundTotal(result.paging.total_count);
             result.total = this._formatTotal(result.paging.total_count);
             
             // Preserve the '+' if the underlying service hit a hard cap and returned '10K+'
             if (originalTotalStr.endsWith('+')) {
                 result.total = result.total.replace('~', '') + '+';
             }
        }
        return result;

    } else {
        // Case 2 & 3: Non-MENA Filter or No Filter -> ContactOut Only
        console.log(`[HybridService] Routing to ContactOut (Global) for mode: ${mode}`);
        const globalFilters = this._parseCombinedCompany(filters, 'contactout');
        const result = await this.contactOut.searchPeople(globalFilters, page, limit, trackInfo);
        if (result.items) {
            result.items.forEach(item => item._source = 'Global');
        }
        // Apply rounding to hide exact numbers
        if (result.paging && result.paging.total_count) {
             const originalTotalStr = String(result.total || "");
             result.paging.total_count = this._roundTotal(result.paging.total_count);
             result.total = this._formatTotal(result.paging.total_count);
             
             // Preserve the '+' if the underlying service hit a hard cap and returned '10K+'
             if (originalTotalStr.endsWith('+')) {
                 result.total = result.total.replace('~', '') + '+';
             }
        }
        return result;
    }
  }

  /**
   * Unified Search Companies
   */
  async searchCompanies(filters, page = 1, limit = 20, trackInfo = null) {
    // Check for Similar Companies first
    if (filters && filters.similar_company) {
        const publicId = filters.similar_company;
        console.log(`[HybridService] Fetching similar companies for: ${publicId}`);
        // Pass the full filters object so we can filter by location/industry/etc.
        const result = await this.mawsool.getSimilarCompanies(publicId, filters);

        // Force source to be 'Local (MENA)' since similar companies are always from our DB
        if (result.items) {
        result.items.forEach(item => item._source = 'MENA');
    }
        return result;
    }

    // ALWAYS use local Mawsool data (User Request: Stop using ContactOut for companies)
    console.log(`[HybridService] Search Companies: Forcing Local (Mawsool) Search`);
    
    const localFilters = this._parseCombinedCompany(filters, 'mawsool');
    const result = await this.mawsool.searchCompanies(localFilters, page, limit, trackInfo);
    
    if (result.items) {
        result.items.forEach(item => item._source = 'MENA');
    }

    // Apply rounding
    if (result.paging && result.paging.total_count) {
         const originalTotalStr = String(result.total || "");
         result.paging.total_count = this._roundTotal(result.paging.total_count);
         result.total = this._formatTotal(result.paging.total_count);
         if (originalTotalStr.endsWith('+')) {
             result.total = result.total.replace('~', '') + '+';
         }
    }
    return result;
  }

  /**
   * Strategy for "No Filter":
   * - Fetch Items from Local (Mawsool)
   * - Fetch Total from External (ContactOut) via Count Endpoint (No Credits)
   * - Return Local Items with External Total
   */
  async _executeNoFilterStrategy(filters, page, limit, method) {
    // Run in parallel
    // For People, use getPeopleCount (No credits). For Companies, fallback to search (Page 1).
    
    const externalPromise = method === 'searchPeople' 
        ? this.contactOut.getPeopleCount(filters)
        : this.contactOut[method](filters, 1, limit).then(res => res.paging?.total_count || 0);

    const [localResult, externalResult] = await Promise.allSettled([
        this.mawsool[method](filters, page, limit),
        externalPromise
    ]);

    const localData = localResult.status === 'fulfilled' ? localResult.value : { items: [], total: "0" };
    const externalTotalNum = externalResult.status === 'fulfilled' ? externalResult.value : 0;

    // Parse local total (which might be a string like "1.2M")
    const localTotalNum = this._parseTotal(localData.total);
    
    // User wants "total results number from the api of contact out"
    // We use the Maximum to be safe (in case local somehow has more, though unlikely for "No Filter")
    // or just strictly External. Let's use Max to ensure we don't show LESS than what we actually have locally.
    const grandTotal = Math.max(localTotalNum, externalTotalNum);

    const finalItems = localData.items || [];
    finalItems.forEach(item => item._source = 'Hybrid (Local Data + Global Count)');

    return {
        items: finalItems,
        total: this._formatTotal(grandTotal),
        paging: {
            start: (page - 1) * limit,
            page_count: finalItems.length,
            total_count: this._roundTotal(grandTotal)
        },
        source: 'local_items_global_total'
    };
  }

async executeAiSemanticSearch(semanticSentences, companyDomains) {
    console.log(`[HybridService] Executing AI Semantic Search for ${companyDomains.length} domains...`);

    // 1. Convert sentences to vectors
    const sentenceVectors = [];
    for (const sentence of semanticSentences) {
      try {
        const vector = await this.getEmbedding(sentence);
        if (vector) sentenceVectors.push(vector);
      } catch (err) {
        console.error(`[HybridService] Failed to embed sentence: "${sentence}"`, err.message);
      }
    }

    if (sentenceVectors.length === 0) {
      console.warn("[HybridService] No valid vectors generated from semantic sentences.");
      return [];
    }

    // 2. Build the Elasticsearch query
    // We want to filter by the provided domains, then rank them by vector similarity
    const esQuery = {
      size: Math.min(companyDomains.length, 1000), // Return as many as possible, capped at 1000 for safety
      _source: ["company_domain", "name", "tagline", "overview", "specialties"],
      query: {
        bool: {
          filter: [
            {
              terms: {
                "company_domain.keyword": companyDomains
              }
            }
          ],
          should: sentenceVectors.map(vector => ({
            script_score: {
              query: { match_all: {} },
              script: {
                source: "cosineSimilarity(params.query_vector, 'embedding') + 1.0",
                params: { query_vector: vector }
              }
            }
          }))
        }
      }
    };

    try {
      const response = await this.client.search({
        index: 'companies',
        body: esQuery
      });

      const hits = response.body.hits.hits;
      console.log(`[HybridService] Semantic Search returned ${hits.length} scored companies.`);

      // 3. Format and return results
      return hits.map(hit => ({
        domain: hit._source.company_domain,
        company_domain: hit._source.company_domain,
        name: hit._source.name,
        tagline: hit._source.tagline || "",
        overview: hit._source.overview || "",
        specialties: hit._source.specialties || "",
        _score: hit._score,
        score: hit._score // Normalized representation
      }));

    } catch (error) {
      console.error("[HybridService] Elasticsearch AI Semantic Search failed:", error);
      return [];
    }
  }


  // --- HELPERS ---

  _roundTotal(num) {
    if (process.env.NEXT_PUBLIC_SHOW_EXACT_TOTALS === 'true') {
        return num;
    }
    if (num >= 1000000) return Math.ceil(num / 1000000) * 1000000;
    if (num >= 1000) return Math.ceil(num / 1000) * 1000;
    return num;
  }

  _parseTotal(str) {
    if (!str) return 0;
    if (typeof str === 'number') return str;
    const s = String(str).toUpperCase().replace(/,/g, '').replace('~', '');
    let mult = 1;
    if (s.endsWith('M')) {
        mult = 1000000;
        return parseFloat(s) * mult;
    }
    if (s.endsWith('K')) {
        mult = 1000;
        return parseFloat(s) * mult;
    }
    return parseFloat(s) || 0;
  }

  _formatTotal(num) {
    if (process.env.NEXT_PUBLIC_SHOW_EXACT_TOTALS === 'true') {
        return num.toLocaleString();
    }
    if (num >= 1000000) return '~' + Math.ceil(num / 1000000) + 'M';
    if (num >= 1000) return '~' + Math.ceil(num / 1000) + 'K';
    return num.toString();
  }
}

module.exports = new HybridService();
