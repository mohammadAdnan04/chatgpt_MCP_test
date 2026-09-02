const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const crypto = require('crypto');
const contactOutService = require('./index');
const liveEnrichmentService = require('./liveEnrichmentService');
const SearchCache = require('./models/SearchCache');
const ApiKey = require('./models/ApiKey');
const authenticateApiKey = require('./authMiddleware');
require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });

const axios = require('axios');
const app = express();

// Trust Proxy: Required for correct IP detection behind Cloudflare/Coolify
app.set('trust proxy', 1);

const PORT = process.env.PORT || 3001;

// Connect to MongoDB
const MONGO_URI = process.env.MONGO_URI;
const API_MAWSOOL_MONGO_URI = process.env.API_MAWSOOL_MONGO_URI;

if (!MONGO_URI) {
  console.error("❌ MONGO_URI is missing in .env file");
} else {
  mongoose.connect(MONGO_URI)
    .then(() => console.log('MongoDB connected for Middleware Cache'))
    .catch(err => console.error('MongoDB connection error:', err));
}

// Create a secondary connection for the User/API Keys
let apiMawsoolDb;
if (API_MAWSOOL_MONGO_URI) {
  apiMawsoolDb = mongoose.createConnection(API_MAWSOOL_MONGO_URI);
  apiMawsoolDb.on('connected', () => console.log('Secondary MongoDB connected for API Users'));
  apiMawsoolDb.on('error', (err) => console.error('Secondary MongoDB connection error:', err));
  
  // Pass the connection to the User and Credit models so they use the right DB
  require('./models/User').init(apiMawsoolDb);
  require('./models/Credit').init(apiMawsoolDb);
  require('./models/ApiUsage').init(apiMawsoolDb);
}

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const stringify = require('fast-json-stable-stringify');
const path = require('path');

// Expose the allowed filters Excel/CSV file for documentation
app.get('/downloads/mawsool_api_allowed_filters.xlsx', (req, res) => {
  const filePath = path.join(__dirname, 'mawsool_api_allowed_filters.xlsx');
  res.download(filePath, 'mawsool_api_allowed_filters.xlsx', (err) => {
    if (err) {
      console.error('[Middleware] File download error:', err.message);
      res.status(404).send('File not found');
    }
  });
});



// Helper to hash filters for caching
const hashFilters = (filters, type) => {
  const str = stringify({ filters, type }); // Use stable stringify
  return crypto.createHash('md5').update(str).digest('hex');
};

// Helper to format total results
const formatTotal = (total) => {
    // Check if exact totals are requested
    // Ensure we are checking against the string 'true' and handling potential whitespace
    const showExact = process.env.NEXT_PUBLIC_SHOW_EXACT_TOTALS === 'true';
    
    if (showExact) {
        // Ensure total is a number before formatting
        const num = Number(total);
        return !isNaN(num) ? num.toLocaleString() : (total || "0");
    }

    if (!total) return "0";
    if (total < 1000) return total.toString(); 
    
    // Handle Millions
    if (total >= 1000000) {
        return `~${Math.ceil(total / 1000000)}M`;
    }
    
    // Handle Thousands
    if (total >= 1000) {
        return `~${Math.ceil(total / 1000)}K`;
    }
    return total.toString();
};

// Helper to shuffle array
const shuffleArray = (array) => {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
};

// Main Search Endpoint
app.post('/search', authenticateApiKey, async (req, res) => {
    try {
        let { filters, page = 1, limit = 10, type = "people", seed, exclude_public_ids } = req.body;
        
        // Pass seed inside filters so it propagates to mawsoolService
        if (seed && filters) {
            filters.seed = seed;
        }
        
        if (exclude_public_ids) {
            if (!filters) filters = {};
            filters.exclude_public_ids = exclude_public_ids;
        }

        // Force parse page and limit to integers to prevent string concatenation bugs
        page = parseInt(page, 10);
        limit = parseInt(limit, 10);
        
        // Ensure type is a string
        const safeType = String(type || "people").toLowerCase();
        
        console.log(`[Middleware] Received request: Type=${safeType}, Page=${page}, Limit=${limit}`);
        // Log incoming filters to stdout (may be truncated in some environments)
        console.log(`[Middleware] Raw Filters Payload: ${JSON.stringify(filters)}`);

        // Similar-company searches and FORCE_BYPASS_CACHE still skip cache.
        // MENA engine page 1 is cached by filters (seed excluded) so repeat searches
        // do not hit Elasticsearch. Page 2+ stays live so PIT pagination stays correct.
        // Special API users keep the old bypass + live-enrichment path.
        let skipCache = false;
        let menaEngineCache = false;
        if (filters && filters.similar_company) {
             skipCache = true;
             console.log(`[Middleware] Similar Companies Search Detected. Skipping Cache.`);
        } else {
            try {
                // contactOutService is the HybridService instance
                if (typeof contactOutService.determineSearchMode === 'function') {
                    const mode = contactOutService.determineSearchMode(filters);
                    if (mode === 'MENA_ONLY') {
                        if (req.isSpecialApiUser) {
                            skipCache = true;
                            console.log(`[Middleware] Search Mode is '${mode}' for special API user. Skipping Cache.`);
                        } else {
                            menaEngineCache = true;
                        }
                    }
                }
            } catch (e) {
                console.warn("[Middleware] Failed to determine search mode for cache skipping:", e.message);
            }
        }

        // FORCE_BYPASS_CACHE env override
        if (process.env.FORCE_BYPASS_CACHE === 'true') {
            skipCache = true;
            menaEngineCache = false;
            console.log(`[Middleware] FORCE_BYPASS_CACHE is true. Skipping Cache.`);
        }

        // 1. Generate Cache Key
        // IMPORTANT: The hash must include the type to avoid mixing People and Company results.
        // We must exclude 'seed' from the hash so identical searches share the cache
        const filtersForHash = { ...filters };
        delete filtersForHash.seed;
        const cacheKey = hashFilters(filtersForHash, safeType);

        const trackInfo = {
            sourceKey: req.isInternal ? 'INTERNAL_BACKEND' : (req.apiUser ? req.apiUser.apiKey : 'UNKNOWN'),
            sourceName: req.isInternal ? 'Internal Backend' : (req.apiUser ? req.apiUser.email : 'UNKNOWN')
        };

        if (skipCache) {
            console.log(`[Middleware] Bypassing cache completely and proxying request.`);
            let result;
            if (safeType === "companies") {
                result = await contactOutService.searchCompanies(filters, page, limit, trackInfo);
            } else {
                result = await contactOutService.searchPeople(filters, page, limit, trackInfo);
            }
            
            // EXCLUDE LISTS LOGIC FOR BYPASSED CACHE
            const applyExclusions = (itemsToFilter) => {
                if (!itemsToFilter || !filters || !filters.exclude_public_ids || filters.exclude_public_ids.length === 0) return itemsToFilter;
                const excludeSet = new Set(filters.exclude_public_ids.map(id => String(id).toLowerCase().trim()));
                return itemsToFilter.filter(item => {
                    const itemIds = [
                        item.id,
                        item.public_identifier,
                        item.public_profile_url,
                        item.linkedin_url,
                        item.profile_url
                    ].map(v => v ? String(v).toLowerCase().trim() : null).filter(Boolean);
                    
                    const shouldExclude = itemIds.some(id => excludeSet.has(id));
                    if (shouldExclude) {
                        console.log(`[Middleware] Excluded item from Bypassed Cache: ${itemIds[0]}`);
                    }
                    return !shouldExclude;
                });
            };

            if (result && result.items) {
                result.items = applyExclusions(result.items);
            }

            // --- LIVE ENRICHMENT FOR BYPASSED CACHE (e.g. MENA Searches) ---
            if (req.isSpecialApiUser && safeType === "people" && result && result.items) {
                console.log(`[Middleware] Special API User detected on Bypassed Cache. Starting Bulk Live Enrichment Loop...`);
                
                const enrichedAndValidItems = [];
                let currentItems = [...result.items];
                let itemCursor = 0;
                let currentPageFetch = page;
                const BATCH_SIZE = 10;
                
                while (enrichedAndValidItems.length < limit) {
                    if (itemCursor >= currentItems.length) {
                        currentPageFetch++;
                        console.log(`[Middleware] Live Enrichment ran out of bypassed items. Fetching next page ${currentPageFetch}.`);
                        try {
                            const newApiResult = await contactOutService.searchPeople(filters, currentPageFetch, limit, trackInfo);
                            if (newApiResult && newApiResult.items && newApiResult.items.length > 0) {
                                currentItems.push(...applyExclusions(newApiResult.items));
                            } else {
                                break;
                            }
                        } catch (e) {
                            console.error(`[Middleware] Failed to fetch more items during Live Enrichment (Bypass):`, e.message);
                            break;
                        }
                    }

                    const currentBatch = [];
                    while (currentBatch.length < BATCH_SIZE && itemCursor < currentItems.length) {
                        const item = currentItems[itemCursor];
                        itemCursor++;
                        
                        const linkedinUrl = item.linkedin_url || item.public_profile_url || item.profile_url;
                        if (linkedinUrl) {
                            currentBatch.push({ item, url: linkedinUrl });
                        } else {
                            if (enrichedAndValidItems.length < limit) {
                                enrichedAndValidItems.push(item);
                            }
                        }
                    }

                    if (currentBatch.length === 0) continue;

                    const urlsToEnrich = currentBatch.map(b => b.url);
                    const bulkEnrichedData = await liveEnrichmentService.enrichProfilesBulk(urlsToEnrich);

                    if (bulkEnrichedData === null) {
                        console.warn(`[Middleware] API Club offline. Falling back to original data for this batch.`);
                        for (const { item } of currentBatch) {
                            if (enrichedAndValidItems.length < limit) enrichedAndValidItems.push(item);
                        }
                        continue;
                    }

                    for (const { item, url } of currentBatch) {
                        if (enrichedAndValidItems.length >= limit) break;

                        let freshData = bulkEnrichedData[url];
                        if (!freshData) {
                            const publicId = url.split('/in/')[1]?.replace(/\/$/, '');
                            if (publicId) {
                                const foundKey = Object.keys(bulkEnrichedData).find(k => k.includes(publicId));
                                if (foundKey) freshData = bulkEnrichedData[foundKey];
                            }
                        }
                        
                        if (freshData) {
                            const mappedItem = liveEnrichmentService.mapToMawsoolFormat(freshData, item);
                            const isValid = liveEnrichmentService.validateAgainstFilters(mappedItem, filters, item);
                            
                            if (isValid) {
                                // PURE VALIDATION MODE: If it's valid, we push the original untouched item from our DB
                                enrichedAndValidItems.push(item);
                            } else {
                                console.log(`[Middleware] Live Enrichment (Bypass): Dropped profile ${item.name} due to filter mismatch.`);
                            }
                        } else {
                            console.log(`[Middleware] Live Enrichment (Bypass): Dropped profile ${item.name} (Not found/Deleted in API Club).`);
                        }
                    }
                }
                
                // Update total to reflect the dropped items
                const droppedCount = itemCursor - enrichedAndValidItems.length;
                if (droppedCount > 0 && result.paging && result.total) {
                    const parsedTotal = parseInt(result.total);
                    if (!isNaN(parsedTotal)) {
                        result.total = String(Math.max(0, parsedTotal - droppedCount));
                    }
                    if (!isNaN(result.paging.total_count)) {
                        result.paging.total_count = Math.max(0, result.paging.total_count - droppedCount);
                    }
                }

                result.items = enrichedAndValidItems;
                console.log(`[Middleware] Bulk Live Enrichment (Bypass) complete. Yielding ${result.items.length} valid profiles. Dropped ${droppedCount} total.`);
            }
            
            // --- CREDIT DEDUCTION (For External API Keys Only) ---
            if (!req.isInternal && req.apiUser) {
                const resultsReturned = result.items ? result.items.length : 0;
                if (resultsReturned > 0) {
                    try {
                        req.apiUser.credits -= resultsReturned;
                        await req.apiUser.save();
                        
                        // Log to Credit History
                        const Credit = require('./models/Credit').getModel();
                        await Credit.create({
                            userId: req.apiUser._id,
                            amount: resultsReturned,
                            balance: req.apiUser.credits,
                            type: "deduct",
                            description: `API Search deduction for ${resultsReturned} results`
                        });
                        
                        console.log(`[Middleware] Deducted ${resultsReturned} credits from ${req.apiUser.email}. Remaining: ${req.apiUser.credits}`);
                    } catch (creditErr) {
                        console.error(`[Middleware] Failed to deduct credits for ${req.apiUser.email}:`, creditErr.message);
                    }
                }
                result.remaining_credits = req.apiUser.credits;
            }
            
            return res.json(result);
        }

        if (menaEngineCache) {
            const applyMenaExclusions = (itemsToFilter) => {
                if (!itemsToFilter || !filters || !filters.exclude_public_ids || filters.exclude_public_ids.length === 0) return itemsToFilter;
                const excludeSet = new Set(filters.exclude_public_ids.map(id => String(id).toLowerCase().trim()));
                return itemsToFilter.filter(item => {
                    const itemIds = [
                        item.id,
                        item.public_identifier,
                        item.public_profile_url,
                        item.linkedin_url,
                        item.profile_url
                    ].map(v => v ? String(v).toLowerCase().trim() : null).filter(Boolean);
                    return !itemIds.some(id => excludeSet.has(id));
                });
            };

            const attachMenaCredits = async (result) => {
                if (!req.isInternal && req.apiUser) {
                    const resultsReturned = result.items ? result.items.length : 0;
                    if (resultsReturned > 0) {
                        try {
                            req.apiUser.credits -= resultsReturned;
                            await req.apiUser.save();
                            const Credit = require('./models/Credit').getModel();
                            await Credit.create({
                                userId: req.apiUser._id,
                                amount: resultsReturned,
                                balance: req.apiUser.credits,
                                type: "deduct",
                                description: `API Search deduction for ${resultsReturned} results`
                            });
                        } catch (creditErr) {
                            console.error(`[Middleware] Failed to deduct credits for ${req.apiUser.email}:`, creditErr.message);
                        }
                    }
                    result.remaining_credits = req.apiUser.credits;
                }
                return result;
            };

            const startIndex = (page - 1) * limit;
            const endIndex = startIndex + limit;
            let menaCache = await SearchCache.findOne({ filters_hash: cacheKey });

            if (menaCache && menaCache.items.length >= endIndex) {
                console.log(`[Middleware] MENA cache hit: Items=${menaCache.items.length}, page=${page}, limit=${limit}`);
                const result = await attachMenaCredits({
                    items: applyMenaExclusions(menaCache.items.slice(startIndex, endIndex)),
                    total: formatTotal(menaCache.total_results) + (menaCache.total_results === 10000 ? "+" : ""),
                    paging: {
                        total_count: menaCache.total_results,
                        page,
                        limit
                    }
                });
                return res.json(result);
            }

            console.log(`[Middleware] MENA cache miss for page=${page}. Proxying to engine.`);
            let result;
            if (safeType === "companies") {
                result = await contactOutService.searchCompanies(filters, page, limit, trackInfo);
            } else {
                result = await contactOutService.searchPeople(filters, page, limit, trackInfo);
            }
            if (result && result.items) {
                result.items = applyMenaExclusions(result.items);
            }

            if (page === 1 && result && Array.isArray(result.items) && result.items.length > 0) {
                const totalResults = (result.paging && result.paging.total_count) || Number(result.total) || result.items.length;
                try {
                    if (!menaCache) {
                        menaCache = new SearchCache({ filters_hash: cacheKey });
                    }
                    menaCache.items = result.items;
                    menaCache.fetched_pages = [1];
                    menaCache.total_results = totalResults;
                    menaCache.created_at = new Date();
                    await menaCache.save();
                    console.log(`[Middleware] MENA page-1 cache saved (${result.items.length} items, total=${totalResults})`);
                } catch (saveError) {
                    if (saveError.code !== 11000) {
                        console.error("[Middleware] MENA cache save failed:", saveError.message);
                    }
                }
            }

            return res.json(await attachMenaCredits(result || { items: [] }));
        }
        
        // 2. Check Cache
        let cache = null;
        if (!skipCache) {
            cache = await SearchCache.findOne({ filters_hash: cacheKey });
        }
        
        // 3. Calculate required items
        // User wants page X with limit 10.
        // e.g. Page 1 -> items 0-9. Page 6 -> items 50-59.
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;
        
        // 4. Determine if we need to fetch more from API
        // If we don't have enough items in cache to cover [startIndex, endIndex], we fetch more.
        
        if (!cache) {
            cache = new SearchCache({ filters_hash: cacheKey });
        } else {
            // SAFETY CHECK: If we found a cache, but somehow it contains data of the WRONG type (e.g. people in company search)
            // we should probably invalidate it. 
            // Since we can't easily inspect "items" deeply here efficiently, we rely on the hashKey being unique per type.
            // But if the previous hash function was buggy (didn't use type), we might have bad data in DB.
            // We can check the first item to see if it matches the expected structure.
            
            if (cache.items.length > 0) {
                const firstItem = cache.items[0];
                const looksLikeCompany = firstItem.domain && !firstItem.first_name; // Rough heuristic
                const looksLikePerson = firstItem.first_name || firstItem.public_profile_url;
                
                if (safeType === "companies" && looksLikePerson && !looksLikeCompany) {
                    console.warn("[Middleware] Cache type mismatch! Found People data for Company search. Invalidating cache.");
                    await SearchCache.deleteOne({ filters_hash: cacheKey });
                    cache = new SearchCache({ filters_hash: cacheKey });
                } else if (safeType === "people" && looksLikeCompany && !looksLikePerson) {
                    console.warn("[Middleware] Cache type mismatch! Found Company data for People search. Invalidating cache.");
                    await SearchCache.deleteOne({ filters_hash: cacheKey });
                    cache = new SearchCache({ filters_hash: cacheKey });
                }
            }
        }

        console.log(`[Middleware] Cache status: Items=${cache.items.length}, FetchedPages=[${cache.fetched_pages}], Total=${cache.total_results}`);
        
        // --- PAGE 10 FETCH BUG FIX ---
        // If we are at the edge of our current cache (e.g. we have 100 items, and user asks for page 11 -> items 100-109),
        // we enter the fetch loop.
        // BUT if the previous fetch loop had an issue or if the API returns mixed results, we might get stuck.
        
        while (cache.items.length < endIndex) {
            console.log(`[Middleware] Loop Start: CacheItems=${cache.items.length}, EndIndex=${endIndex}`);
            // Check if we have fetched all available results from API
            if (cache.total_results > 0 && cache.items.length >= cache.total_results) {
                 console.log("[Middleware] All results cached. Breaking.");
                 break;
            }

            // We need to fetch the next batch from ContactOut.
            // ContactOut pages are size 25.
            // We want to fetch the NEXT available pages that haven't been fetched yet.
            // We can calculate the next page number based on how many pages we've already stored in `fetched_pages`.
            
            // Find the highest page number fetched so far, start from next
            const maxPageFetched = cache.fetched_pages.length > 0 ? Math.max(...cache.fetched_pages) : 0;
            const startPage = maxPageFetched + 1;
            
            console.log(`[Middleware] Planning to fetch Page ${startPage}. MaxFetched=${maxPageFetched}`);

            // User requested "bring back 50 at each request".
            // So we fetch 2 pages (50 items) if possible.
            // But if we are stuck in a loop, we need to break out.
            // Check if startPage exceeds reasonable limit (e.g. total_results / 25)
            if (cache.total_results > 0 && startPage > Math.ceil(cache.total_results / 25)) {
                 console.log("[Middleware] All pages fetched (by calc). Breaking loop.");
                 break;
            }

            // We fetch TWO API pages (25 * 2 = 50 items) to fill our cache.
            // This batch of 50 items will serve 5 Frontend pages (10 items each).
            const pagesToFetch = [startPage, startPage + 1];
            
            console.log(`[Middleware] Fetching API pages ${pagesToFetch.join(',')} for cache...`);
            
            const newItems = [];
            let totalResults = 0;

            for (const p of pagesToFetch) {
                // Double check if page was somehow already fetched (shouldn't happen with max logic but good for safety)
                if (cache.fetched_pages.includes(p)) {
                     console.log(`[Middleware] Page ${p} already fetched. Skipping.`);
                     continue; 
                }
                
                let result;
                try {
                    // IMPORTANT: Ensure we call the correct service method based on safeType
                    // And pass the correct PAGE number to the API
                    // Note: In cache mode, we fetch fixed pages of 25 (ContactOut's native size) to fill our buffer
                    if (safeType === "companies") {
                        result = await contactOutService.searchCompanies(filters, p, 25, trackInfo);
                    } else {
                        result = await contactOutService.searchPeople(filters, p, 25, trackInfo);
                    }
                    
                    if (result && result.items) {
                        const excludeSet = new Set((filters.exclude_public_ids || []).map(id => String(id).toLowerCase().trim()));

                        // FILTER RESULTS TO ENSURE TYPE SAFETY AND EXCLUDE LISTS
                        // Sometimes APIs return mixed results or we need to be extra safe
                        const validItems = result.items.filter(item => {
                            // Check exclusion
                            const itemIds = [
                                item.id,
                                item.public_identifier,
                                item.public_profile_url,
                                item.linkedin_url,
                                item.profile_url
                            ].map(v => v ? String(v).toLowerCase().trim() : null).filter(Boolean);
                            
                            const shouldExclude = itemIds.some(id => excludeSet.has(id));
                            if (shouldExclude) {
                                console.log(`[Middleware] Excluded item from ContactOut cache: ${itemIds[0]}`);
                                return false;
                            }

                            if (safeType === "companies") {
                                // Must NOT have person fields like first_name/public_profile_url if it's a company search
                                // But some company objects might have minimal fields.
                                // Let's check for company specific fields or lack of person fields
                                return !item.first_name && !item.last_name && !item.public_profile_url;
                            } else {
                                // Must be a person
                                return item.first_name || item.public_profile_url || item.id; 
                            }
                        });

                        // If filtering removed everything, log it
                        if (result.items.length > 0 && validItems.length === 0) {
                            console.warn(`[Middleware] Page ${p} returned ${result.items.length} items but ALL were filtered out due to type mismatch!`);
                        }
                        
                        // FIX: Do NOT push back raw items if validItems is empty, because that defeats the purpose of filtering!
                        // If validItems is empty, we simply got a bad page. We should NOT corrupt the cache.
                        // We push only valid items.
                        if (validItems.length > 0) {
                             newItems.push(...validItems);
                        } else {
                             console.warn(`[Middleware] Page ${p} contained NO valid ${safeType} items. Skipping.`);
                        }

                        // Update total results from the latest API response
                        totalResults = result.paging.total_count;
                        cache.fetched_pages.push(p);
                    } else {
                        console.log(`[Middleware] Page ${p} returned no items.`);
                    }
                } catch (err) {
                    console.error(`[Middleware] Failed to fetch page ${p}:`, err.message);
                    // If one page fails (e.g. 404 or out of range), we stop fetching further pages in this loop
                    break;
                }
            }
            
            console.log(`[Middleware] New items from API: ${newItems.length}`);

            if (newItems.length === 0) {
                // No more data from API
                // If this was the first fetch, ensure total_results is 0
                if (cache.items.length === 0) cache.total_results = 0;
                console.log("[Middleware] Break: API returned no items");
                break; 
            }

            // Check source to decide whether to shuffle
            let shouldShuffle = true;
            if (newItems.length > 0) {
                const firstSource = newItems[0]._source;
                // Only shuffle ContactOut (Global) results
                if (firstSource && firstSource.includes("MENA")) {
                    shouldShuffle = false;
                }
            }

            // Shuffle the NEW batch of 50 (or less) items ONLY if it's Global
            const processedBatch = shouldShuffle ? shuffleArray(newItems) : newItems;
            
            // Append to cache
            cache.items.push(...processedBatch);
            
            // Update total results only if we got a valid number back, otherwise keep existing
            if (totalResults > 0) {
                // If it hit the cap but we had a higher true count, don't overwrite it with 10K
                if (totalResults === 10000 && cache.total_results > 10000) {
                    console.log(`[Middleware] Ignoring 10K cap overwrite, keeping true count: ${cache.total_results}`);
                } else {
                    cache.total_results = totalResults;
                }
            }
            
            // Safety break if we've fetched everything
            if (cache.total_results > 0 && cache.items.length >= cache.total_results) {
                console.log("[Middleware] Break: Reached total results");
                break;
            }
        }
        
        console.log("[Middleware] Saving cache...");
        
        // Check source to decide whether to save
        let shouldSave = true;
        if (cache.items.length > 0) {
            const firstSource = cache.items[0]._source;
            // We don't save Local or Hybrid results (as per user request)
            if (firstSource && (firstSource.includes("Local") || firstSource.includes("Hybrid"))) {
                shouldSave = false;
                console.log(`[Middleware] Data source is '${firstSource}'. SKIPPING MongoDB cache save.`);
            }
        }

        // FIX: Handle Duplicate Key Error (Race Condition)
        if (shouldSave) {
            try {
                // Save cache updates
                await cache.save();
                console.log("[Middleware] Cache saved");
            } catch (saveError) {
                if (saveError.code === 11000) {
                    console.warn("[Middleware] Duplicate cache key detected (Race Condition). Ignoring save.");
                    // Optional: If we want to be super robust, we could fetch the latest and merge, 
                    // but simply ignoring the save is safe here because the other process likely saved similar data.
                } else {
                    console.error("[Middleware] Cache save failed:", saveError.message);
                }
            }
        } else {
            console.log("[Middleware] Cache save skipped (Local/Hybrid data).");
        }

        // 5. Slice and Return
        let slicedItems = cache.items.slice(startIndex, endIndex);

        // --- LIVE ENRICHMENT & SELF-HEALING LOOP FOR SPECIAL API USERS ---
        if (req.isSpecialApiUser && safeType === "people") {
            console.log(`[Middleware] Special API User detected. Starting Bulk Live Enrichment Loop for target ${limit} items.`);
            
            const enrichedAndValidItems = [];
            let cacheIndexCursor = startIndex;
            const BATCH_SIZE = 10; // Enrich 10 URLs at a time
            
            let droppedCount = 0;

            // Keep fetching, enriching, and validating until we have the requested limit
            while (enrichedAndValidItems.length < limit) {
                // If we ran out of cached items, we need to fetch more from ContactOut
                if (cacheIndexCursor >= cache.items.length) {
                    console.log(`[Middleware] Live Enrichment ran out of cached items at index ${cacheIndexCursor}. Fetching next page.`);
                    
                    const maxPageFetched = cache.fetched_pages.length > 0 ? Math.max(...cache.fetched_pages) : 0;
                    const nextApiPage = maxPageFetched + 1;
                    
                    let newApiResult;
                    try {
                        newApiResult = await contactOutService.searchPeople(filters, nextApiPage, 25, trackInfo);
                        if (newApiResult && newApiResult.items && newApiResult.items.length > 0) {
                            cache.items.push(...newApiResult.items);
                            cache.fetched_pages.push(nextApiPage);
                            try { await cache.save(); } catch (e) { /* ignore race conditions */ }
                        } else {
                            console.log(`[Middleware] No more results available from provider. Breaking Live Enrichment loop.`);
                            break; 
                        }
                    } catch (e) {
                        console.error(`[Middleware] Failed to fetch more items during Live Enrichment:`, e.message);
                        break;
                    }
                }

                // Prepare a batch of items to enrich
                const currentBatch = [];
                while (currentBatch.length < BATCH_SIZE && cacheIndexCursor < cache.items.length) {
                    const item = cache.items[cacheIndexCursor];
                    cacheIndexCursor++;
                    
                    const linkedinUrl = item.linkedin_url || item.public_profile_url || item.profile_url;
                    if (linkedinUrl) {
                        currentBatch.push({ item, url: linkedinUrl });
                    } else {
                        // If no URL, we can't enrich it. Assume it's valid based on ElasticSearch and add it directly.
                        if (enrichedAndValidItems.length < limit) {
                            enrichedAndValidItems.push(item);
                        }
                    }
                }

                if (currentBatch.length === 0) continue;

                // Send the batch to API Club
                const urlsToEnrich = currentBatch.map(b => b.url);
                const bulkEnrichedData = await liveEnrichmentService.enrichProfilesBulk(urlsToEnrich);

                if (bulkEnrichedData === null) {
                    console.warn(`[Middleware] API Club offline. Falling back to original data for this batch.`);
                    for (const { item } of currentBatch) {
                        if (enrichedAndValidItems.length < limit) enrichedAndValidItems.push(item);
                    }
                    continue;
                }

                // Process the results
                for (const { item, url } of currentBatch) {
                    if (enrichedAndValidItems.length >= limit) break; // We hit our target!

                    // Find the matching enriched data. (Try exact match, or partial match if API club altered the URL slightly)
                    let freshData = bulkEnrichedData[url];
                    if (!freshData) {
                        // Fallback: Look for it by matching the public identifier
                        const publicId = url.split('/in/')[1]?.replace(/\/$/, '');
                        if (publicId) {
                            const foundKey = Object.keys(bulkEnrichedData).find(k => k.includes(publicId));
                            if (foundKey) freshData = bulkEnrichedData[foundKey];
                        }
                    }
                    
                    if (freshData) {
                        const mappedItem = liveEnrichmentService.mapToMawsoolFormat(freshData, item);
                        const isValid = liveEnrichmentService.validateAgainstFilters(mappedItem, filters, item);
                        
                        if (isValid) {
                            // PURE VALIDATION MODE: If it's valid, we push the original untouched item from our DB
                            enrichedAndValidItems.push(item);
                        } else {
                            droppedCount++;
                            console.log(`[Middleware] Live Enrichment: Dropped profile ${item.name} due to filter mismatch after enrichment.`);
                        }
                    } else {
                        droppedCount++;
                        console.log(`[Middleware] Live Enrichment: Dropped profile ${item.name} (Not found/Deleted in API Club).`);
                    }
                }
            }

            slicedItems = enrichedAndValidItems;
            
            // Adjust the total count in the cache so the frontend pagination stays accurate
            if (droppedCount > 0 && cache.total_results) {
                cache.total_results = Math.max(0, cache.total_results - droppedCount);
                try { await cache.save(); } catch (e) { /* ignore */ }
            }

            console.log(`[Middleware] Bulk Live Enrichment complete. Yielding ${slicedItems.length} valid profiles. Dropped ${droppedCount} total.`);
        }
        // --- END LIVE ENRICHMENT ---

        // --- CREDIT DEDUCTION (For External API Keys Only) ---
        if (!req.isInternal && req.apiUser) {
            const resultsReturned = slicedItems.length;
            if (resultsReturned > 0) {
                try {
                    req.apiUser.credits -= resultsReturned;
                    await req.apiUser.save();
                    
                    // Log to Credit History
                    const Credit = require('./models/Credit').getModel();
                    await Credit.create({
                        userId: req.apiUser._id,
                        amount: resultsReturned,
                        balance: req.apiUser.credits,
                        type: "deduct",
                        description: `API Search deduction for ${resultsReturned} results`
                    });
                    
                    console.log(`[Middleware] Deducted ${resultsReturned} credits from ${req.apiUser.email}. Remaining: ${req.apiUser.credits}`);
                } catch (creditErr) {
                    console.error(`[Middleware] Failed to deduct credits for ${req.apiUser.email}:`, creditErr.message);
                }
            }
        }
        
        res.json({
            items: slicedItems,
            total: formatTotal(cache.total_results) + (cache.total_results === 10000 ? "+" : ""), // Add + if hard capped in cache
            paging: {
                total_count: cache.total_results,
                page: page,
                limit: limit
            },
            // Optionally tell external users their balance
            remaining_credits: !req.isInternal && req.apiUser ? req.apiUser.credits : undefined
        });

    } catch (error) {
        console.error("[Middleware] Error:", error.message);
        // Handle axios errors from the service
        if (error.response) {
            res.status(error.response.status).json(error.response.data);
        } else {
            res.status(500).json({ error: error.message });
        }
    }
});

// Autocomplete Endpoints
app.get('/search/education/suggest', authenticateApiKey, async (req, res) => {
    try {
        console.log(`[Middleware] Education Autocomplete requested: ${req.query.q}`);
        // Proxy to Mawsool Engine
        const response = await axios.get(`${process.env.MAWSOOL_ENGINE_URL || "http://localhost:3000"}/search/education/suggest`, {
            params: req.query
        });
        res.json(response.data);
    } catch (e) {
        console.error("Education suggest failed", e.message);
        res.json([]);
    }
});

app.get('/search/cities/suggest', authenticateApiKey, async (req, res) => {
    try {
        console.log(`[Middleware] City Autocomplete requested: ${req.query.q}`);
        const response = await axios.get(`${process.env.MAWSOOL_ENGINE_URL || "http://localhost:3000"}/search/cities/suggest`, {
            params: req.query
        });
        res.json(response.data);
    } catch (e) {
        console.error("City suggest failed", e.message);
        res.json([]);
    }
});

app.get('/search/companies/suggest', authenticateApiKey, async (req, res) => {
    try {
        const q = req.query.q || req.query.keywords;
        console.log(`[Middleware] Company Autocomplete requested: ${q}`);
        
        let response;
        const engineUrl = process.env.MAWSOOL_ENGINE_URL || "http://localhost:3000";
        
        try {
            response = await axios.get(`${engineUrl}/search/companies/suggest`, {
                params: { ...req.query, q },
                timeout: 3000 // Short timeout for local check
            });
        } catch (localError) {
            console.warn(`[Middleware] Local Engine failed (${localError.message}). Trying Production...`);
            // Fallback to Production Engine
            response = await axios.get(`https://menasearch.mawsool.tech/search/companies/suggest`, {
                params: { ...req.query, q }
            });
        }
        
        // Proxy logos in suggestions
        const items = (response.data || []).map(item => ({
            ...item,
            logo: contactOutService.mawsool._proxyLogo(item.logo)
        }));
        
        res.json(items);
    } catch (e) {
        console.error("Company suggest failed", e.message);
        res.json([]);
    }
});

app.get('/search-ids/companies', authenticateApiKey, async (req, res) => {
    try {
        console.log(`[Middleware] Company IDs Search requested: ${req.query.keywords}`);
        // Map 'keywords' to 'q' for the engine
        const params = { ...req.query, q: req.query.keywords || req.query.q };
        
        let response;
        const engineUrl = process.env.MAWSOOL_ENGINE_URL || "http://localhost:3000";

        try {
            response = await axios.get(`${engineUrl}/search/companies/suggest`, {
                params: params,
                timeout: 3000
            });
        } catch (localError) {
             console.warn(`[Middleware] Local Engine failed for search-ids. Trying Production...`);
             response = await axios.get(`https://menasearch.mawsool.tech/search/companies/suggest`, {
                params: params
            });
        }
        
        // Proxy logos in items and ensure ID is present
        const items = (response.data || []).map(item => ({
            ...item,
            id: item.public_id || item.id || item.name, // Ensure ID is mapped correctly
            logo: contactOutService.mawsool._proxyLogo(item.logo)
        }));
        
        res.json({ items });
    } catch (e) {
        console.error("Company IDs search failed", e.message);
        res.json({ items: [] });
    }
});

// Similar Companies Endpoint
app.get('/search/companies/similar/:publicId', authenticateApiKey, async (req, res) => {
    try {
        const publicId = req.params.publicId;
        console.log(`[Middleware] Similar Companies requested for: ${publicId}`);
        const result = await contactOutService.mawsool.getSimilarCompanies(publicId);
        res.json(result);
    } catch (e) {
        console.error("Similar Companies failed", e.message);
        res.status(500).json({ items: [] });
    }
});

app.post('/profiles/by-ids', authenticateApiKey, async (req, res) => {
    try {
        const { public_ids } = req.body || {};
        if (!Array.isArray(public_ids) || public_ids.length === 0) {
            return res.status(400).json({ error: "public_ids is required" });
        }
        if (public_ids.length > 1000) {
            return res.status(400).json({ error: "Too many ids. Max 1000." });
        }
        const engineRes = await contactOutService.mawsool.getProfilesByIds(public_ids);
        if (engineRes?.error) {
            return res.status(502).json({ error: engineRes.error, items: [] });
        }
        const results = engineRes?.results || [];
        const normalized = contactOutService.mawsool._normalizePeopleResponse({
            results,
            total: results.length,
            page: 1,
            limit: results.length
        }, {});
        res.json({ items: normalized.items || [] });
    } catch (e) {
        console.error("[Middleware] profiles/by-ids failed", e.message);
        res.status(500).json({ items: [] });
    }
});

// --- NEW: Asynchronous Bulk Save Job ---
app.post('/api/jobs/bulk-save', async (req, res) => {
    let { userId, listId, filters, requestedCount, revealContacts, initialItems, revealType, maxPerCompany, exclude_public_ids, exclude_numeric_ids } = req.body;

    if (exclude_public_ids && Array.isArray(exclude_public_ids)) {
        if (!filters) filters = {};
        filters.exclude_public_ids = exclude_public_ids;
    }
    
    if (exclude_numeric_ids && Array.isArray(exclude_numeric_ids)) {
        if (!filters) filters = {};
        filters.exclude_numeric_ids = exclude_numeric_ids;
    }

    // Acknowledge receipt to free up the backend/frontend immediately
    res.status(202).json({ status: "accepted", message: "Bulk save job started" });

    const trackInfo = {
        sourceKey: 'INTERNAL_BULK_SAVE',
        sourceName: `Bulk Save Job for User: ${userId}`
    };

    console.log(`[Middleware-Job] Started Bulk Save for User ${userId}, List ${listId}, Count ${requestedCount}, MaxPerCompany: ${maxPerCompany}`);

    try {
        let itemsSaved = 0;
        let currentPage = 1;
        const limitPerPage = 100; // Increased to 100 for faster bulk saving
        const companyCounts = new Map(); // Track how many people we've saved from each company in this job

        // Generate a unique seed for this bulk save job to ensure stable PIT pagination
        const jobId = Date.now().toString() + Math.random().toString(36).substring(2, 7);
        if (filters) {
            filters.seed = `bulk_save_${jobId}`;
        } else {
            filters = { seed: `bulk_save_${jobId}` };
        }

            // We now PREPEND the explicitly passed initialItems (e.g. approved sample leads)
            // so they are ALWAYS saved first and guaranteed to be in the final list.
            if (currentPage === 1 && initialItems && Array.isArray(initialItems) && initialItems.length > 0) {
                console.log(`[Middleware-Job] Processing ${initialItems.length} explicitly provided initial items (samples) first...`);
                
                // Normalize the raw engine hits to match the structured format
                const normalizedInitialData = contactOutService.mawsool._normalizePeopleResponse({ results: initialItems }, filters);
                const normalizedItems = normalizedInitialData.items || [];
                
                const itemsToSave = [];
                for (const item of normalizedItems) {
                    const publicId = item.public_identifier || item.id || "";
                    const personId = item.id || item.person_id || publicId || "";

                    const extractCompanyDetails = (companyName, experienceArray) => {
                        if (!companyName || !Array.isArray(experienceArray)) return {};
                        const lowerName = String(companyName).toLowerCase().trim();
                        for (const exp of experienceArray) {
                            const expCompName = String(exp.company?.name || exp.companyName || (typeof exp.company === 'string' ? exp.company : "")).toLowerCase().trim();
                            if (expCompName && (expCompName === lowerName || expCompName.includes(lowerName) || lowerName.includes(expCompName))) {
                                return {
                                    website: exp.company?.domain || exp.company?.website || "",
                                    linkedin_url: exp.company?.url || exp.company?.linkedinUrl || exp.company?.linkedin_url || "",
                                    industry: exp.company?.industry || "",
                                    headcount: exp.company?.employeeCount || exp.company?.size || ""
                                };
                            }
                        }
                        return {};
                    };

                    const targetTitle = (item.current_positions && item.current_positions.length > 0 && item.current_positions[0]?.title) || item.title || item.headline || "";
                    const targetCompany = (item.current_positions && item.current_positions.length > 0 && item.current_positions[0]?.company) || item.company || item.company_name || "";
                    const targetSeniority = (item.current_positions && item.current_positions.length > 0 && (item.current_positions[0]?.seniority || item.current_positions[0]?.mawsool_seniority)) || item.seniority || "";
                    
                    const matchedCompanyDetails = extractCompanyDetails(targetCompany, item.experience || item.employmentHistory || (item.raw && (item.raw.experience || item.raw.employmentHistory)));
                    
                    const targetWebsite = (item.current_positions && item.current_positions.length > 0 && item.current_positions[0]?.website) || matchedCompanyDetails.website || item.website || item.organization__website || "";
                    const targetLinkedinUrl = (item.current_positions && item.current_positions.length > 0 && item.current_positions[0]?.company_linkedin_url) || matchedCompanyDetails.linkedin_url || item.company_linkedin_url || item.organization__linkedin_url || "";
                    
                    // DEBUGGING
                    console.log(`[DEBUG] Initial Bulk Save Item: ${item.name}`);
                    console.log(`   - Target Company: ${targetCompany}`);
                    console.log(`   - Matched Details:`, matchedCompanyDetails);
                    console.log(`   - Target Website: ${targetWebsite}`);
                    console.log(`   - Target LinkedIn: ${targetLinkedinUrl}`);

                    itemsToSave.push({
                        listId,
                        person_id: personId,
                        industry: item.industry || [],
                        name: item.name || (item.first_name ? `${item.first_name} ${item.last_name || ''}`.trim() : ""),
                        public_identifier: publicId,
                        linkedin_url: item.linkedin_url || "",
                        public_profile_url: item.public_profile_url || "",
                        profile_url: item.profile_url || "",
                        profile_picture_url: item.profile_picture_url || "",
                        location: item.location || "",
                        headline: item.headline || "",
                        current_positions: item.current_positions || {},
                        email: item.email || "",
                        phone: item.phone || "",
                        department: item.job_function || item.function || item.department || "",
                        departments: item.departments || [],
                        job_function: item.job_function || "",
                        employees: item.company_headcount || item.employees || item['# Employees'] || (Array.isArray(item.current_employee_count) ? item.current_employee_count.join("-") : item.current_employee_count) || (Array.isArray(item.employee_count) ? item.employee_count.join("-") : item.employee_count) || item.headcount || "",
                        status: "",
                        title: targetTitle,
                        company: targetCompany,
                        seniority: targetSeniority,
                        website: targetWebsite,
                        company_linkedin_url: targetLinkedinUrl,
                        organization__website: targetWebsite,
                        organization__linkedin_url: targetLinkedinUrl,
                        raw: { 
                            ...item, 
                            website: targetWebsite, 
                            company_linkedin_url: targetLinkedinUrl, 
                            organization__website: targetWebsite, 
                            organization__linkedin_url: targetLinkedinUrl 
                        } // Inject matched company URLs into raw so CSV export picks them up
                    });
                    
                    // Add to exclude list so pagination loop doesn't fetch them again!
                    if (publicId) {
                        if (!filters.exclude_public_ids) filters.exclude_public_ids = [];
                        if (!filters.exclude_public_ids.includes(publicId)) {
                            filters.exclude_public_ids.push(publicId);
                        }
                    }
                }

                if (itemsToSave.length > 0) {
                    // Tell the backend exactly how many more we need AFTER inserting these
                    const remainingCount = requestedCount !== null ? requestedCount - itemsToSave.length : null;
                    const backendUrl = process.env.BACKEND_URL || "http://localhost:8000";
                    try {
                        const response = await axios.post(`${backendUrl}/api/list/internal/${listId}/bulk-insert`, {
                            items: itemsToSave,
                            userId,
                            remainingCount,
                            revealType
                        }, {
                            headers: { 'x-internal-secret': process.env.INTERNAL_SECRET || 'secret123' }
                        });
                        const inserted = response.data.insertedCount || 0;
                        itemsSaved += inserted;
                        console.log(`[Middleware-Job] Initial items inserted. Total saved: ${itemsSaved}`);
                    } catch (saveErr) {
                        console.error(`[Middleware-Job] Failed to save initial items:`, saveErr.message);
                    }
                }
            }

            // Now fetch pages if we still need more leads
            while (requestedCount === null || itemsSaved < requestedCount) {
                console.log(`[Middleware-Job] Fetching page ${currentPage} for bulk save...`);
                
                // Re-use existing hybrid service to fetch data (this handles MENA vs ContactOut automatically!)
                let result;
                try {
                    // determine type to support bulk saving companies if needed in the future
                    // currently defaults to people
                    const searchType = filters && filters.searchMode === 'companies' ? 'companies' : 'people';
                    if (searchType === 'companies') {
                        result = await contactOutService.searchCompanies(filters, currentPage, limitPerPage, trackInfo);
                    } else {
                        result = await contactOutService.searchPeople(filters, currentPage, limitPerPage, trackInfo);
                    }
                } catch (err) {
                    console.error(`[Middleware-Job] Search failed on page ${currentPage}:`, err.message);
                    break; // Stop if search engine fails
                }

                if (!result || !result.items || result.items.length === 0) {
                    console.log(`[Middleware-Job] No more results found at page ${currentPage}. Stopping.`);
                    break;
                }

                const itemsToSave = [];
                for (const item of result.items) {
                    // --- MAX PER COMPANY LOGIC ---
                    if (maxPerCompany && maxPerCompany > 0) {
                        const companyKeys = new Set();

                        const addCompanyKey = (rawCompany) => {
                            const compName = String(rawCompany || "").toLowerCase().replace(/[^a-z0-9]/g, "");
                            if (compName) companyKeys.add(compName);
                        };

                        addCompanyKey(item.company || item.company_name || item.organization_name || "");
                        if (Array.isArray(item.current_positions)) {
                            for (const pos of item.current_positions) {
                                addCompanyKey(pos && pos.company);
                            }
                        }

                        let shouldSkip = false;
                        for (const key of companyKeys) {
                            const currentCount = companyCounts.get(key) || 0;
                            if (currentCount >= maxPerCompany) {
                                shouldSkip = true;
                                break;
                            }
                        }
                        if (shouldSkip) continue;

                        for (const key of companyKeys) {
                            const currentCount = companyCounts.get(key) || 0;
                            companyCounts.set(key, currentCount + 1);
                        }
                    }

                    // Format ALL items on the page for the ListItem schema
                    const publicId = item.public_identifier || "";
                    const personId = item.id || item.person_id || publicId || "";

                    // Context-Aware Company Selection for Bulk Save
                    if (Array.isArray(item.current_positions) && item.current_positions.length > 1) {
                        const getFilterLabels = (key) => {
                            const val = filters[key];
                            if (!val) return [];
                            const labels = [];
                            if (val.includeLabels && Object.keys(val.includeLabels).length > 0) {
                                Object.values(val.includeLabels).forEach(label => labels.push(String(label).toLowerCase()));
                            } else if (val.include && Array.isArray(val.include)) {
                                val.include.forEach(id => labels.push(String(id).toLowerCase()));
                            } else if (Array.isArray(val)) {
                                val.forEach(v => labels.push(String(v).toLowerCase()));
                            } else if (typeof val === 'string') {
                                labels.push(val.toLowerCase());
                            }
                            return labels;
                        };

                        const filterCompanies = [
                            ...getFilterLabels('company'),
                            ...getFilterLabels('company_name'),
                            ...getFilterLabels('past_company'),
                        ].map((c) => (c.includes('|||') ? c.split('|||')[0].trim() : c));
                        const filterIndustries = getFilterLabels('industry');
                        const filterRoles = [...getFilterLabels('role'), ...getFilterLabels('job_title')];
                        const currentCompany = String(item.current_company_name || '').toLowerCase().trim();

                        let bestScore = -1;
                        let bestMatchIndex = 0;

                        item.current_positions.forEach((pos, idx) => {
                            let score = 0;
                            const posCompany = String(pos.company || '').toLowerCase();
                            const posRole = String(pos.role || '').toLowerCase();
                            const posIndustries = Array.isArray(pos.industry) 
                                ? pos.industry.map(i => String(i).toLowerCase()) 
                                : [String(pos.industry || '').toLowerCase()];

                            const getBaseName = (str) => String(str || '').toLowerCase().split('.')[0].trim();

                            if (filterCompanies.length > 0 && filterCompanies.some(c => {
                                const baseC = getBaseName(c);
                                const baseP = getBaseName(posCompany);
                                
                                let filterVal = c;
                                if (c.includes('|||')) {
                                    filterVal = c.split('|||')[0].trim().toLowerCase();
                                }

                                const parsedBaseC = getBaseName(filterVal);
                                return posCompany.includes(filterVal) || filterVal.includes(posCompany) || baseP.includes(parsedBaseC) || parsedBaseC.includes(baseP);
                            })) {
                                score += 50;
                            } else if (filterCompanies.length === 0 && currentCompany && (posCompany.includes(currentCompany) || currentCompany.includes(posCompany))) {
                                score += 40;
                            }
                            if (filterRoles.length > 0 && filterRoles.some(r => posRole.includes(r) || r.includes(posRole))) {
                                score += 10;
                            }
                            if (filterIndustries.length > 0 && filterIndustries.some(fi => posIndustries.some(pi => pi.includes(fi) || fi.includes(pi)))) {
                                score += 10;
                            }

                            if (score > bestScore) {
                                bestScore = score;
                                bestMatchIndex = idx;
                            }
                        });

                        if (bestMatchIndex > 0) {
                            const matchedPos = item.current_positions.splice(bestMatchIndex, 1)[0];
                            item.current_positions.unshift(matchedPos); // move it to the front!
                        }
                    }

                    const extractCompanyDetails = (companyName, experienceArray) => {
                        if (!companyName || !Array.isArray(experienceArray)) return {};
                        const lowerName = String(companyName).toLowerCase().trim();
                        for (const exp of experienceArray) {
                            const expCompName = String(exp.company?.name || exp.companyName || (typeof exp.company === 'string' ? exp.company : "")).toLowerCase().trim();
                            if (expCompName && (expCompName === lowerName || expCompName.includes(lowerName) || lowerName.includes(expCompName))) {
                                return {
                                    website: exp.company?.domain || exp.company?.website || "",
                                    linkedin_url: exp.company?.url || exp.company?.linkedinUrl || exp.company?.linkedin_url || "",
                                    industry: exp.company?.industry || "",
                                    headcount: exp.company?.employeeCount || exp.company?.size || ""
                                };
                            }
                        }
                        return {};
                    };

                    const targetTitle = (item.current_positions && item.current_positions.length > 0 && item.current_positions[0]?.title) || item.title || item.headline || "";
                    const targetCompany = (item.current_positions && item.current_positions.length > 0 && item.current_positions[0]?.company) || item.company || item.company_name || "";
                    const targetSeniority = (item.current_positions && item.current_positions.length > 0 && (item.current_positions[0]?.seniority || item.current_positions[0]?.mawsool_seniority)) || item.seniority || "";
                    
                    const matchedCompanyDetails = extractCompanyDetails(targetCompany, item.experience || item.employmentHistory || (item.raw && (item.raw.experience || item.raw.employmentHistory)));
                    
                    const targetWebsite = (item.current_positions && item.current_positions.length > 0 && item.current_positions[0]?.website) || matchedCompanyDetails.website || item.website || item.organization__website || "";
                            const targetLinkedinUrl = (item.current_positions && item.current_positions.length > 0 && item.current_positions[0]?.company_linkedin_url) || matchedCompanyDetails.linkedin_url || item.company_linkedin_url || item.organization__linkedin_url || "";
                            
                            // DEBUGGING
                            console.log(`[DEBUG] Fetched Bulk Save Item: ${item.name}`);
                            console.log(`   - Target Company: ${targetCompany}`);
                            console.log(`   - Matched Details:`, matchedCompanyDetails);
                            console.log(`   - Target Website: ${targetWebsite}`);
                            console.log(`   - Target LinkedIn: ${targetLinkedinUrl}`);
                            console.log(`   - Raw Item organization__website BEFORE:`, item.organization__website);
                            console.log(`   - current_positions[0].website:`, item.current_positions && item.current_positions.length > 0 ? item.current_positions[0].website : 'N/A');

                            itemsToSave.push({
                        listId,
                        person_id: personId,
                        industry: item.industry || [],
                        name: item.name || (item.first_name ? `${item.first_name} ${item.last_name || ''}`.trim() : ""),
                        public_identifier: publicId,
                        linkedin_url: item.linkedin_url || "",
                        public_profile_url: item.public_profile_url || "",
                        profile_url: item.profile_url || "",
                        profile_picture_url: item.profile_picture_url || "",
                        location: item.location || "",
                        headline: item.headline || "",
                        current_positions: item.current_positions || {},
                        email: item.email || "",
                        phone: item.phone || "",
                        department: item.job_function || item.function || item.department || "",
                        departments: item.departments || [],
                        job_function: item.job_function || "",
                        employees: item.company_headcount || item.employees || item['# Employees'] || (Array.isArray(item.current_employee_count) ? item.current_employee_count.join("-") : item.current_employee_count) || (Array.isArray(item.employee_count) ? item.employee_count.join("-") : item.employee_count) || item.headcount || "",
                        status: "",
                        title: targetTitle,
                        company: targetCompany,
                        seniority: targetSeniority,
                        website: targetWebsite,
                        company_linkedin_url: targetLinkedinUrl,
                        organization__website: targetWebsite,
                        organization__linkedin_url: targetLinkedinUrl,
                        raw: { 
                            ...item, 
                            website: targetWebsite, 
                            company_linkedin_url: targetLinkedinUrl, 
                            organization__website: targetWebsite, 
                            organization__linkedin_url: targetLinkedinUrl 
                        } // Inject matched company URLs into raw so CSV export picks them up
                    });
                }

                // Insert into the primary Backend database using its API
                if (itemsToSave.length > 0) {
                    const remainingCount = requestedCount !== null ? requestedCount - itemsSaved : null;
                    console.log(`[Middleware-Job] Sending ${itemsToSave.length} items to backend list to fulfill remaining ${remainingCount}...`);
                    const backendUrl = process.env.BACKEND_URL || "http://localhost:8000";
                    
                    try {
                          const response = await axios.post(`${backendUrl}/api/list/internal/${listId}/bulk-insert`, {
                              items: itemsToSave,
                              userId,
                              remainingCount,
                              revealType
                          }, {
                              headers: { 'x-internal-secret': process.env.INTERNAL_SECRET || 'secret123' }
                          });

                          const inserted = response.data.insertedCount || 0;
                          itemsSaved += inserted;
                          console.log(`[Middleware-Job] Backend inserted ${inserted} new items. Total saved: ${itemsSaved}`);
                      } catch (saveErr) {
                          console.error(`[Middleware-Job] Failed to save batch to ${backendUrl}:`, saveErr.response ? JSON.stringify(saveErr.response.data) : saveErr.message);
                          if (saveErr.response && saveErr.response.status === 402) {
                              console.log(`[Middleware-Job] Stopping Bulk Save: Out of credits`);
                              break;
                          }
                      }
                }

                if (requestedCount !== null && itemsSaved >= requestedCount) {
                    console.log(`[Middleware-Job] Reached requested count of ${requestedCount}. Stopping.`);
                    break;
                }

                currentPage++;
                
                // Add a small delay to respect API rate limits (especially if falling back to ContactOut)
                await new Promise(resolve => setTimeout(resolve, 300));
            }

        console.log(`[Middleware-Job] Completed Bulk Save. Total saved: ${itemsSaved}`);

    } catch (jobError) {
        console.error(`[Middleware-Job] Fatal error during bulk save:`, jobError);
    } finally {
        // Always ensure we mark the list as finished syncing
        try {
            const backendUrl = process.env.BACKEND_URL || "http://localhost:8000";
            await axios.put(`${backendUrl}/api/list/internal/${listId}/sync-status`, {
                isSyncing: false
            }, {
                headers: { 'x-internal-secret': process.env.INTERNAL_SECRET || 'secret123' }
            });
            console.log(`[Middleware-Job] Successfully updated sync status to false for list ${listId}`);
            
            // Auto-trigger Bulk Reveal if requested
            if (revealType && revealType !== 'none') {
                console.log(`[Middleware-Job] Auto-triggering Bulk Reveal (${revealType}) for list ${listId}...`);
                // Give the DB a second to settle
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                // Since this route doesn't require user token locally, we can just call our own endpoint internally!
                // But wait, our bulk-reveal route on middleware expects a direct post. We can just hit it.
                await axios.post(`http://localhost:${PORT}/api/jobs/bulk-reveal`, {
                    userId,
                    listId,
                    revealType
                });
            }
        } catch (statusErr) {
            console.error(`[Middleware-Job] Failed to finalize list ${listId}:`, statusErr.message);
        }
    }
});

function payloadHasContacts(data) {
    if (!data || typeof data !== "object") return false;
    const emails = Array.isArray(data.contact__all_emails)
        ? data.contact__all_emails
        : (Array.isArray(data.contact__emails) ? data.contact__emails : (Array.isArray(data.emails) ? data.emails : []));
    const phones = Array.isArray(data.contact__phone_numbers)
        ? data.contact__phone_numbers
        : (Array.isArray(data.phones) ? data.phones : []);
    const hasEmail = emails.some((e) => {
        const v = String((e && (e.email || e.sanitized_email)) || (typeof e === "string" ? e : "")).toLowerCase();
        return v && v !== "not available" && v.includes("@");
    }) || (String(data.email || data.contact__email || "").includes("@") && !String(data.email || data.contact__email || "").toLowerCase().includes("not available"));
    const hasPhone = phones.some((p) => {
        const v = String((p && (p.sanitized_number || p.raw_number || p.number)) || (typeof p === "string" ? p : "")).toLowerCase();
        return v && v !== "not available" && v.length > 5;
    }) || (String(data.phone || "").trim() && !String(data.phone || "").toLowerCase().includes("not available"));
    return hasEmail || hasPhone;
}

function isContactProcessing(data = {}, status = "") {
    const st = String(status || "").toLowerCase();
    const dst = String(data?.status || "").toLowerCase();
    return st === "pending" || st === "processing" || dst === "processing" || data?.awaiting_enrichment === true || data?.webhook_pending === true;
}

async function hydrateFromEngineCache(url, itemData = {}) {
    if (payloadHasContacts(itemData)) return itemData;
    try {
        const cacheDb = apiMawsoolDb && apiMawsoolDb.db;
        if (!cacheDb) return itemData;
        const match = String(url || "").match(/\/in\/([^/?#]+)/i);
        const publicIdentifier = match ? decodeURIComponent(match[1]).replace(/\/$/, "") : "";
        if (!publicIdentifier) return itemData;
        const doc = await cacheDb.collection("cacheentries").findOne({ publicIdentifier });
        const cached = doc && doc.responseData;
        if (!cached || typeof cached !== "object") return itemData;
        const awaiting = doc.awaiting_enrichment === true || String(doc.status || "").toLowerCase() === "processing";
        console.log(`[Middleware] Hydrated ${publicIdentifier} from engine cache (awaiting=${awaiting})`);
        return {
            ...itemData,
            ...cached,
            status: awaiting ? "processing" : (cached.status || itemData.status || "success"),
            awaiting_enrichment: awaiting
        };
    } catch (err) {
        console.error("[Middleware] Engine cache hydrate failed:", err.message);
        return itemData;
    }
}

app.get('/api/contact/hydrate', async (req, res) => {
    const secret = req.headers['x-internal-secret'];
    if (secret !== (process.env.INTERNAL_SECRET || 'secret123')) {
        return res.status(403).json({ error: 'Forbidden' });
    }
    const url = req.query.url;
    if (!url) return res.status(400).json({ error: 'Missing url' });
    try {
        const data = await hydrateFromEngineCache(url, {});
        const awaiting = isContactProcessing(data, data.status);
        return res.status(200).json({
            ...data,
            status: awaiting ? "processing" : (data.status || (payloadHasContacts(data) ? "success" : "processing")),
            awaiting_enrichment: awaiting
        });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`Middleware Service running on http://localhost:${PORT}`);
});

// --- BULK REVEAL BACKGROUND JOB ---

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

app.post('/api/jobs/bulk-reveal', async (req, res) => {
    const { userId, listId, revealType } = req.body;
    res.status(202).json({ status: "accepted", message: "Bulk reveal job started" });
    console.log(`[Middleware-Job] Started Bulk Reveal for User ${userId}, List ${listId}, Type ${revealType}`);

    const backendUrl = process.env.BACKEND_URL || "http://localhost:8000";
    const internalSecret = process.env.INTERNAL_SECRET || 'secret123';
    // Use the new bulkv2 engine on port 4000
    const bulkEngineUrl = (process.env.BULK_ENGINE_URL || "http://localhost:4000").replace(/\/$/, '');
    // We must pass an API key that exists in bulkv2's cache DB
    const apiKey = process.env.BULK_ENGINE_API_KEY;

    try {
        // 1. Fetch items that need revealing
        const itemsRes = await axios.get(`${backendUrl}/api/list/internal/${listId}/items-to-reveal?type=${revealType}`, {
            headers: { 'x-internal-secret': internalSecret }
        });
        
        const items = itemsRes.data.items || [];
        console.log(`[Middleware-Job] Found ${items.length} items to reveal for List ${listId}`);
        
        // Prepare the payload for bulkv2
        const payloadItems = items.map(item => {
            const url = item.public_profile_url || item.linkedin_url || item.profile_url || item.raw?.public_profile_url || item.raw?.linkedin_url;
            return { linkedin_url: url, _internal_id: item._id };
        }).filter(i => i.linkedin_url);

        const billingStats = {
            itemsMatched: items.length,
            itemsWithUrl: payloadItems.length,
            itemsMissingUrl: items.length - payloadItems.length,
            totalCost: 0,
            chargedCount: 0,
            zeroCostCount: 0,
            reasonCounts: new Map()
        };

        // Update total progress count based on actual valid items
        await axios.put(`${backendUrl}/api/list/internal/${listId}/reveal-status`, {
            status: "running",
            total: payloadItems.length
        }, { headers: { 'x-internal-secret': internalSecret } });

        if (payloadItems.length === 0) {
             await axios.put(`${backendUrl}/api/list/internal/${listId}/reveal-status`, { status: "completed" }, { headers: { 'x-internal-secret': internalSecret } });
             return;
        }

        // 2. Send to bulkv2
        console.log(`[Middleware-Job] Sending ${payloadItems.length} URLs to Bulkv2...`);
        const createRes = await axios.post(`${bulkEngineUrl}/bulk-contact`, {
            items: payloadItems,
            wantsEmail: revealType === 'email' || revealType === 'both',
            wantsPhone: revealType === 'phone' || revealType === 'both',
            targetCountry: "" // Let bulkv2 auto-detect
        }, { headers: { 'x-api-key': apiKey } });

        const jobId = createRes.data.job_id;
        console.log(`[Middleware-Job] Bulkv2 Job Created: ${jobId}. Polling...`);

        // NEW: Immediately initialize the BulkRevealJobReport on the backend to prevent webhook race conditions
        await axios.put(`${backendUrl}/api/list/internal/${listId}/reveal-status`, {
            status: "running",
            total: payloadItems.length,
            jobId: jobId,
            userId: userId,
            revealType: revealType
        }, { headers: { 'x-internal-secret': internalSecret }, validateStatus: () => true }).catch(err => console.error("[Middleware-Job] Failed to init report", err.message));

        // 3. Poll bulkv2
        let isComplete = false;
        let processedUrls = new Set();
        let partialUrls = new Set();
        let awaitingFlagUrls = new Set();
        let stopRequested = false;
        let pollCount = 0;
        let lastResults = {};
        const MAX_POLLS = 120; // 10 minutes timeout (120 * 5s)

        const isWebhookProcessing = (item) => isContactProcessing((item && item.data) || {}, item?.status);

        const stillWaitingOnWebhook = (item) => {
            if (String(item?.status || "").toLowerCase() === "failed") return false;
            if (isWebhookProcessing(item)) return true;
            return !payloadHasContacts((item && item.data) || {});
        };

        const pushRevealUpdate = async (url, itemData, countBilling = true) => {
            const originalItem = payloadItems.find(i => i.linkedin_url === url);
            if (!originalItem) return;
            try {
                const updateRes = await axios.post(`${backendUrl}/api/list/internal/${listId}/reveal-update`, {
                    userId,
                    itemId: originalItem._internal_id,
                    itemData: itemData,
                    revealType,
                    jobId,
                    skipBilling: !countBilling
                }, { headers: { 'x-internal-secret': internalSecret }, validateStatus: () => true });

                if (countBilling) {
                    const cost = Number(updateRes.data && updateRes.data.cost ? updateRes.data.cost : 0) || 0;
                    billingStats.totalCost += cost;
                    if (cost > 0) billingStats.chargedCount += 1;
                    else billingStats.zeroCostCount += 1;

                    const reasons = Array.isArray(updateRes.data && updateRes.data.billing && updateRes.data.billing.reasons)
                        ? updateRes.data.billing.reasons
                        : ["unknown_reason"];
                    reasons.forEach(r => {
                        const prev = billingStats.reasonCounts.get(r) || 0;
                        billingStats.reasonCounts.set(r, prev + 1);
                    });
                }

                if (updateRes.status === 402 && updateRes.data.stop) {
                    console.log(`[Middleware-Job] Stopping Bulk Reveal: Out of credits`);
                    stopRequested = true;
                }
            } catch (err) {
                console.error(`[Middleware-Job] Failed to update backend for ${url}:`, err.message);
            }
        };

        while (!isComplete && !stopRequested && pollCount < MAX_POLLS) {
            pollCount++;
            await new Promise(r => setTimeout(r, 5000)); // Poll every 5s
            
            const statusRes = await axios.get(`${bulkEngineUrl}/bulk-contact/${jobId}`, {
                headers: { 'x-api-key': apiKey }
            });

            const results = statusRes.data.results || {};
            lastResults = results;
            
            // Check for newly completed or failed items
            for (const url in results) {
                const itemStatus = results[url].status;
                const itemData = await hydrateFromEngineCache(url, results[url].data || {});
                const hydratedItem = { ...results[url], data: itemData };
                lastResults[url] = hydratedItem;
                const awaitingWebhook = stillWaitingOnWebhook(hydratedItem);
                
                // Push whatever we already have, including an awaiting flag, while webhooks are still running
                if (awaitingWebhook && !processedUrls.has(url)) {
                    if (payloadHasContacts(itemData) && !partialUrls.has(url)) {
                        partialUrls.add(url);
                        await pushRevealUpdate(url, { ...itemData, status: itemData.status || "processing", awaiting_enrichment: true }, false);
                        console.log(`[Middleware-Job] Partial contacts ready for ${url}, still waiting on webhook`);
                    } else if (!payloadHasContacts(itemData) && !awaitingFlagUrls.has(url)) {
                        awaitingFlagUrls.add(url);
                        await pushRevealUpdate(url, { ...itemData, status: "processing", awaiting_enrichment: true }, false);
                        console.log(`[Middleware-Job] Job marked ${itemStatus} for ${url} but contacts are still empty. Keeping poll alive.`);
                    }
                }

                // Only consider it 'completed' if the data is NOT just 'processing'
                // This prevents closing the webhook window prematurely.
                const isFinished = (itemStatus === 'completed' && !awaitingWebhook) || itemStatus === 'failed';
                
                if (isFinished && !processedUrls.has(url)) {
                    processedUrls.add(url);
                    await pushRevealUpdate(url, itemData);
                }
            }

            if (statusRes.data.status === 'completed' || statusRes.data.status === 'failed') {
                // IMPORTANT: Even if the bulk job says 'completed', we need to make sure we've processed all the URLs
                // If there are still URLs that are 'processing' in the results object, we shouldn't exit the loop yet.
                const hasProcessingItems = Object.values(lastResults).some(r => stillWaitingOnWebhook(r));
                
                if (!hasProcessingItems) {
                    isComplete = true;
                } else {
                    console.log(`[Middleware-Job] Job says completed but items are still processing. Keeping polling loop alive.`);
                }
            }
        }

        // 4. Mark complete or handle timeout
        if (pollCount >= MAX_POLLS && !isComplete) {
            console.error(`[Middleware-Job] Bulk Reveal TIMEOUT for List ${listId}`);
            for (const url in lastResults) {
                if (!processedUrls.has(url)) {
                    processedUrls.add(url);
                    await pushRevealUpdate(url, lastResults[url].data || {});
                }
            }
            await axios.put(`${backendUrl}/api/list/internal/${listId}/reveal-status`, {
                status: "idle",
                jobId
            }, { headers: { 'x-internal-secret': internalSecret } });
            return;
        }

        if (!stopRequested) {
            await axios.put(`${backendUrl}/api/list/internal/${listId}/reveal-status`, {
                status: "completed",
                jobId
            }, { headers: { 'x-internal-secret': internalSecret } });
            const reasonParts = [];
            for (const [k, v] of billingStats.reasonCounts.entries()) {
                reasonParts.push(`${k}=${v}`);
            }
            console.log(`[Middleware-Job] Bulk Reveal Billing Summary: list=${listId} type=${revealType} matched=${billingStats.itemsMatched} urls=${billingStats.itemsWithUrl} missingUrl=${billingStats.itemsMissingUrl} charged=${billingStats.chargedCount} zeroCost=${billingStats.zeroCostCount} totalCost=${billingStats.totalCost} reasons=${reasonParts.join(", ")}`);
            console.log(`[Middleware-Job] Bulk Reveal Completed for List ${listId}`);
        }

    } catch (jobError) {
        console.error(`[Middleware-Job] Fatal error during bulk reveal:`, jobError.response ? JSON.stringify(jobError.response.data, null, 2) : jobError.message);
        if (jobError.response && jobError.response.status === 401) {
            console.error("[Middleware-Job] Wait! The API key used for bulkv2 is invalid or missing in the DB cache.");
        }
        console.error(jobError.stack);
        try {
            // Revert back to idle instead of failed, so the UI resets cleanly and user can try again
            await axios.put(`${backendUrl}/api/list/internal/${listId}/reveal-status`, {
                status: "idle"
            }, { headers: { 'x-internal-secret': internalSecret } });
        } catch (e) {}
    }
});
