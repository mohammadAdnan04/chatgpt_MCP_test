const axios = require('axios');

const apifyMonthToNum = (monthStr) => {
    if (!monthStr) return null;
    const months = { 'January': 1, 'February': 2, 'March': 3, 'April': 4, 'May': 5, 'June': 6, 'July': 7, 'August': 8, 'September': 9, 'October': 10, 'November': 11, 'December': 12 };
    return months[monthStr] || null;
};

const normalizeApifyData = (apifyData) => {
    if (!apifyData) return null;
    
    let mappedExperiences = [];
    if (Array.isArray(apifyData.experience)) {
        apifyData.experience.forEach(exp => {
            const isCurrent = exp.dateRange && exp.dateRange.toLowerCase().includes('present');
            mappedExperiences.push({
                startsAt: exp.startDate && exp.startDate.year ? { year: exp.startDate.year, month: apifyMonthToNum(exp.startDate.month) } : null,
                endsAt: exp.endDate && exp.endDate.year ? { year: exp.endDate.year, month: apifyMonthToNum(exp.endDate.month) } : null,
                company: exp.companyName || '',
                companyLinkedinProfileUrl: exp.companyLinkedInUrl || '',
                title: exp.title || '',
                description: exp.description || '',
                location: exp.location || '',
                // Ensure it mimics the API Club format for validation
                subtitle: exp.companyName ? `${exp.companyName} · ${isCurrent ? 'Present' : 'Past'}` : '',
                caption: isCurrent ? 'Present' : ''
            });
        });
    }

    let addressWithCountry = '';
    let addressCountryOnly = '';
    let addressWithoutCountry = '';

    if (apifyData.location) {
        addressWithCountry = apifyData.location.linkedinText || '';
        if (apifyData.location.parsed) {
            addressCountryOnly = apifyData.location.parsed.countryCode || apifyData.location.parsed.country || '';
            addressWithoutCountry = apifyData.location.parsed.city || '';
        }
    }

    return {
        firstName: apifyData.firstName || '',
        lastName: apifyData.lastName || '',
        fullName: `${apifyData.firstName || ''} ${apifyData.lastName || ''}`.trim(),
        publicIdentifier: apifyData.publicIdentifier || '',
        headline: apifyData.headline || '',
        followers: apifyData.followerCount || 0,
        addressWithCountry: addressWithCountry,
        addressCountryOnly: addressCountryOnly,
        addressWithoutCountry: addressWithoutCountry,
        about: apifyData.about || '',
        experiences: mappedExperiences,
        skills: Array.isArray(apifyData.skills) ? apifyData.skills.map(s => s.name || s) : []
    };
};

const normalizeRenidlyData = (renDataRaw) => {
    if (!renDataRaw) return null;
    
    // Sometimes Renidly wraps data in another data object
    const renData = renDataRaw.data || renDataRaw;
    
    let mappedExperiences = [];
    if (Array.isArray(renData.experience)) {
        renData.experience.forEach(exp => {
            let isCurrent = false;
            if (exp.end_date) {
                isCurrent = exp.end_date.year === null && exp.end_date.month === null;
            } else {
                isCurrent = true; // No end date often means present
            }
            
            mappedExperiences.push({
                startsAt: exp.start_date ? { year: exp.start_date.year, month: exp.start_date.month } : null,
                endsAt: exp.end_date && !isCurrent ? { year: exp.end_date.year, month: exp.end_date.month } : null,
                company: exp.company_name || '',
                companyLinkedinProfileUrl: exp.company_url || '',
                title: exp.title || '',
                description: exp.description || '',
                location: exp.location || '',
                // Ensure it mimics the API Club format for validation
                subtitle: exp.company_name ? `${exp.company_name} · ${isCurrent ? 'Present' : 'Past'}` : '',
                caption: isCurrent ? 'Present' : ''
            });
        });
    }

    return {
        firstName: renData.first_name || '',
        lastName: renData.last_name || '',
        fullName: renData.name || `${renData.first_name || ''} ${renData.last_name || ''}`.trim(),
        publicIdentifier: renData.public_identifier || '',
        headline: renData.headline || '',
        followers: renData.follower_count || 0,
        addressWithCountry: renData.location_name || '',
        addressCountryOnly: renData.country || '',
        addressWithoutCountry: renData.city || '',
        about: renData.summary || '',
        experiences: mappedExperiences,
        skills: Array.isArray(renData.skills) ? renData.skills : []
    };
};

/**
 * Service to handle Live Enrichment via API Club for special users.
 */
class LiveEnrichmentService {
    constructor() {
        // Use the API key from environment variables
        this.apiKey = process.env.API_CLUB_KEY;
        this.apiUrl = process.env.API_CLUB_URL || "https://leads-backend-tcng.onrender.com/linkedin_bulk/profiles";
        
        this.apifyApiKey = process.env.APIFY_API_KEY || "";
        this.renidlyApiKey = process.env.RENIDLY_API_KEY || "";
    }

    /**
     * Enriches an array of LinkedIn URLs using Apify's bulk endpoint with a strict timeout
     */
    async fetchApifyBulk(linkedinUrls, timeoutMs = 15000) {
        if (!this.apifyApiKey || linkedinUrls.length === 0) return {};
        
        try {
            console.log(`[LiveEnrichment] Fetching bulk data from Apify for ${linkedinUrls.length} profiles...`);
            const response = await axios.post(
                `https://api.apify.com/v2/acts/harvestapi~linkedin-profile-scraper/run-sync-get-dataset-items?token=${this.apifyApiKey}`,
                {
                    profileScraperMode: "Profile details no email ($4 per 1k)",
                    queries: linkedinUrls
                },
                {
                    headers: { 'Content-Type': 'application/json' },
                    timeout: timeoutMs // Strict timeout
                }
            );

            const resultMap = {};
            if (response.data && Array.isArray(response.data)) {
                response.data.forEach(profile => {
                    if (profile && profile.linkedinUrl) {
                        resultMap[profile.linkedinUrl] = normalizeApifyData(profile);
                    }
                });
            }
            return resultMap;
        } catch (error) {
            if (error.code === 'ECONNABORTED') {
                console.log(`[LiveEnrichment] Apify bulk request timed out after ${timeoutMs}ms.`);
            } else {
                console.error(`[LiveEnrichment] Failed to bulk enrich profiles via Apify:`, error.message);
            }
            return {};
        }
    }

    /**
     * Enriches an array of LinkedIn URLs using Renidly's batch endpoint with polling and strict timeout
     */
    async fetchRenidlyBatch(linkedinUrls, timeoutMs = 15000) {
        if (!this.renidlyApiKey || linkedinUrls.length === 0) return {};

        const startTime = Date.now();
        
        // 1. Extract handles from URLs
        const handles = linkedinUrls.map(url => {
            const match = url.match(/\/in\/([^\/\?]+)/);
            return match ? match[1] : null;
        }).filter(Boolean);

        if (handles.length === 0) return {};

        try {
            console.log(`[LiveEnrichment] Submitting batch to Renidly for ${handles.length} handles...`);
            
            // 2. Submit the batch job
            const submitResponse = await axios.post(
                'https://renidly.com/api/data/v1/people/batch/enrich',
                {
                    handles: handles,
                    enrich_live: true
                },
                {
                    headers: {
                        'X-renidly-apikey': this.renidlyApiKey,
                        'Content-Type': 'application/json'
                    },
                    timeout: 5000
                }
            );

            const jobId = submitResponse.data?.data?.job_id;
            if (!jobId) {
                console.error(`[LiveEnrichment] Renidly did not return a job_id`);
                return {};
            }

            console.log(`[LiveEnrichment] Renidly batch submitted. Job ID: ${jobId}. Starting polling...`);

            const resultMap = {};
            let isDone = false;

            // 3. Poll for results until timeout or completion
            while (Date.now() - startTime < timeoutMs && !isDone) {
                // Wait 2 seconds before polling
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                // Check if we've exceeded timeout during sleep
                if (Date.now() - startTime >= timeoutMs) {
                    console.log(`[LiveEnrichment] Renidly polling timed out after ${timeoutMs}ms.`);
                    break;
                }

                try {
                    const pollResponse = await axios.get(
                        `https://renidly.com/api/data/v1/people/batch/enrich?job_id=${jobId}`,
                        {
                            headers: { 'X-renidly-apikey': this.renidlyApiKey },
                            timeout: 5000
                        }
                    );

                    const pollData = pollResponse.data;
                    
                    if (pollData && pollData.success) {
                        // Check if job is finished
                        if (pollData.data?.status === 'finished' || pollData.data?.status === 'completed') {
                            isDone = true;
                        }

                        // Different Renidly API versions might return data in 'data.data' or 'data.results' or directly in 'data' as an object
                        let resultsArray = [];
                        if (Array.isArray(pollData.data?.profiles)) resultsArray = pollData.data.profiles; // NEW: found in the log!
                        else if (Array.isArray(pollData.data?.results)) resultsArray = pollData.data.results;
                        else if (Array.isArray(pollData.data?.data)) resultsArray = pollData.data.data;
                        else if (pollData.data && typeof pollData.data === 'object' && !Array.isArray(pollData.data)) {
                            // Sometimes it's a map: { "handle1": {data}, "handle2": {data} }
                            // Or it's just the status object. Let's see if there are profile-like keys.
                            for (const key of Object.keys(pollData.data)) {
                                if (key !== 'status' && key !== 'job_id' && typeof pollData.data[key] === 'object') {
                                    resultsArray.push({
                                        handle: key,
                                        data: pollData.data[key]
                                    });
                                }
                            }
                        }
                        
                        if (Array.isArray(resultsArray) && resultsArray.length > 0) {
                            resultsArray.forEach(result => {
                                // Extract handle from the ids/handles array if it exists
                                const resultHandle = result.handle || result.id || (result.data ? result.data.public_identifier : null) || (result.person ? result.person.public_identifier : null);
                                const originalUrl = linkedinUrls.find(u => resultHandle && u.includes(resultHandle));
                                
                                // The data object might be in result.data or result.person or the result itself
                                const profileData = result.data || result.person || (result.first_name ? result : null) || result; // Fallback to result itself if it IS the profile
                                
                                if (originalUrl && profileData) {
                                    resultMap[originalUrl] = normalizeRenidlyData(profileData);
                                }
                            });
                        }
                    }
                } catch (pollError) {
                    console.error(`[LiveEnrichment] Renidly polling error:`, pollError.message);
                    // Continue polling despite a single error unless timed out
                }
            }

            return resultMap;
        } catch (error) {
            console.error(`[LiveEnrichment] Failed to initiate Renidly batch:`, error.message);
            return {};
        }
    }

    /**
     * Enriches an array of LinkedIn URLs using API Club's bulk endpoint
     */
    async fetchApiClubBulk(linkedinUrls, timeoutMs = 15000) {
        if (!linkedinUrls || !Array.isArray(linkedinUrls) || linkedinUrls.length === 0) return {};

        try {
            console.log(`[LiveEnrichment] Fetching bulk data from API Club for ${linkedinUrls.length} profiles...`);
            const response = await axios.post(
                this.apiUrl,
                { links: linkedinUrls },
                {
                    headers: {
                        'api_key': this.apiKey,
                        'Content-Type': 'application/json'
                    },
                    timeout: timeoutMs
                }
            );

            const resultMap = {};
            if (response.data && response.data.success) {
                const responseData = response.data.data;
                if (Array.isArray(responseData)) {
                    responseData.forEach(item => {
                        if (item && item.entry && item.data) {
                            resultMap[item.entry] = item.data; // Raw format, we'll handle it in mapToMawsoolFormat
                        }
                    });
                } else if (typeof responseData === 'object') {
                    for (const url of Object.keys(responseData)) {
                        resultMap[url] = responseData[url];
                    }
                }
            }
            return resultMap;
        } catch (error) {
            if (error.code === 'ECONNABORTED') {
                console.log(`[LiveEnrichment] API Club bulk request timed out after ${timeoutMs}ms.`);
            } else {
                console.error(`[LiveEnrichment] Failed to bulk enrich profiles via API Club:`, error.message);
            }
            return {};
        }
    }

    /**
     * Runs a parallel race across API Club, Apify, and Renidly.
     * Collects all successful responses within a strict 15-second timeout.
     */
    async enrichProfilesBulk(linkedinUrls) {
        if (!linkedinUrls || !Array.isArray(linkedinUrls) || linkedinUrls.length === 0) return {};

        const MAX_TIMEOUT = 15000; // 15 seconds hard limit

        console.log(`[LiveEnrichment] Starting parallel bulk race for ${linkedinUrls.length} profiles...`);

        // Start all three requests concurrently
        const [apiClubResult, apifyResult, renidlyResult] = await Promise.allSettled([
            this.fetchApiClubBulk(linkedinUrls, MAX_TIMEOUT),
            this.fetchApifyBulk(linkedinUrls, MAX_TIMEOUT),
            this.fetchRenidlyBatch(linkedinUrls, MAX_TIMEOUT)
        ]);

        const apiClubData = apiClubResult.status === 'fulfilled' ? apiClubResult.value : {};
        const apifyData = apifyResult.status === 'fulfilled' ? apifyResult.value : {};
        const renidlyData = renidlyResult.status === 'fulfilled' ? renidlyResult.value : {};

        // Merge results, prioritizing Apify > API Club > Renidly (or whoever succeeded)
        const finalResultMap = {};

        for (const url of linkedinUrls) {
            // Find data in any of the providers
            // Note: Apify and Renidly are already normalized to mimic API Club structure
            let freshData = apifyData[url] || apiClubData[url] || renidlyData[url];

            // Handle slight URL variations (e.g. trailing slashes, missing http)
            if (!freshData) {
                const publicId = url.split('/in/')[1]?.replace(/\/$/, '');
                if (publicId) {
                    const findByKey = (dataMap) => {
                        const foundKey = Object.keys(dataMap).find(k => k.includes(publicId));
                        return foundKey ? dataMap[foundKey] : null;
                    };
                    freshData = findByKey(apifyData) || findByKey(apiClubData) || findByKey(renidlyData);
                }
            }

            if (freshData) {
                finalResultMap[url] = freshData;
            }
        }

        // If all providers failed entirely, return null to signal a complete outage
        if (Object.keys(finalResultMap).length === 0 && 
            Object.keys(apiClubData).length === 0 && 
            Object.keys(apifyData).length === 0 && 
            Object.keys(renidlyData).length === 0) {
            console.error(`[LiveEnrichment] All providers failed or timed out.`);
            return null; 
        }

        return finalResultMap;
    }

    /**
     * Maps the API Club response back into our standard search result format
     */
    mapToMawsoolFormat(apiClubData, originalItem) {
        if (!apiClubData) return originalItem;

        // Extract ALL current experiences from API Club
        let currentExperiences = [];
        
        if (Array.isArray(apiClubData.experiences)) {
            currentExperiences = apiClubData.experiences.filter(exp => 
                exp.caption && (exp.caption.toLowerCase().includes('present') || exp.subtitle?.toLowerCase().includes('present'))
            );
            
            // If none say "Present", fallback to the first one just in case
            if (currentExperiences.length === 0 && apiClubData.experiences.length > 0) {
                currentExperiences = [apiClubData.experiences[0]];
            }
        }

        const primaryExperience = currentExperiences.length > 0 ? currentExperiences[0] : null;

        return {
            ...originalItem,
            first_name: apiClubData.firstName || originalItem.first_name,
            last_name: apiClubData.lastName || originalItem.last_name,
            name: apiClubData.fullName || originalItem.name,
            headline: apiClubData.headline || originalItem.headline,
            location: apiClubData.addressWithCountry || apiClubData.addressWithoutCountry || originalItem.location,
            country: apiClubData.primaryLocale?.country || originalItem.country,
            profile_picture_url: apiClubData.profilePic || originalItem.profile_picture_url,
            linkedin_url: originalItem.linkedin_url, // keep original
            public_identifier: apiClubData.publicIdentifier || originalItem.public_identifier,
            
            // Map primary current company data for top-level fields
            company: primaryExperience 
                ? (primaryExperience.breakdown ? primaryExperience.title : (primaryExperience.subtitle ? primaryExperience.subtitle.split(/[\.·\u252C\u2557]/)[0].trim() : originalItem.company))
                : originalItem.company,
            company_linkedin_url: primaryExperience ? primaryExperience.companyLink1 : originalItem.company_linkedin_url,
            domain: originalItem.domain,
            industry: apiClubData.industry || originalItem.industry,
            
            // Map roles
            title: primaryExperience 
                ? (primaryExperience.breakdown && primaryExperience.subComponents && primaryExperience.subComponents.length > 0 ? primaryExperience.subComponents[0].title : primaryExperience.title) 
                : originalItem.title,
            
            // Inject ALL current positions found in API Club so we can validate them
            current_positions: currentExperiences.length > 0 ? currentExperiences.map(exp => ({
                title: exp.breakdown && exp.subComponents && exp.subComponents.length > 0 ? exp.subComponents[0].title : exp.title,
                company: exp.breakdown ? exp.title : (exp.subtitle ? exp.subtitle.split(/[\.·\u252C\u2557]/)[0].trim() : "")
            })) : originalItem.current_positions,

            live_enriched_raw: apiClubData,
            is_live_enriched: true
        };
    }

    /**
     * Validates an enriched profile by checking if the specific company 
     * that caused the search match is still active in API Club.
     * 
     * This acts as a Smart Evaluator Job Change Detector.
     */
    validateAgainstFilters(mappedItem, filters, originalItem) {
        if (!originalItem || !originalItem.current_positions || originalItem.current_positions.length === 0) {
            return true; // Nothing to compare against
        }

        // 1. Get all current company names from API Club
        const apiClubCompanies = (mappedItem.current_positions || [])
            .map(pos => (pos.company || "").toLowerCase().trim())
            .filter(c => c.length > 0);

        if (apiClubCompanies.length === 0) {
            console.log(`[LiveEnrichment] Profile ${originalItem.name} dropped: API Club shows no current companies.`);
            return false;
        }

        // 2. Extract search filters
        const safeFilters = filters || {};
        const extractIncludes = (key) => (safeFilters[key] && Array.isArray(safeFilters[key].include)) 
            ? safeFilters[key].include.map(v => String(v).toLowerCase().trim()) 
            : [];

        const searchCompanies = [...extractIncludes('company_name'), ...extractIncludes('company')];
        const searchIndustries = extractIncludes('industry');
        const searchRoles = extractIncludes('job_title');

        // 3. Identify the "Matching Position" in our DB
        // Which of their DB positions actually caused them to appear in this search?
        let matchingDbPosition = null;

        for (const pos of originalItem.current_positions) {
            const posCompany = String(pos.company || '').toLowerCase().trim();
            const posRole = String(pos.role || pos.title || '').toLowerCase().trim();
            const posIndustries = Array.isArray(pos.industry) 
                ? pos.industry.map(i => String(i).toLowerCase().trim()) 
                : [String(pos.industry || '').toLowerCase().trim()];

            let isMatch = true;

            // If user searched by company, this position must match it
            if (searchCompanies.length > 0) {
                if (!searchCompanies.some(sc => posCompany.includes(sc) || sc.includes(posCompany))) {
                    isMatch = false;
                }
            }

            // If user searched by role, this position must match it
            if (isMatch && searchRoles.length > 0) {
                if (!searchRoles.some(sr => posRole.includes(sr) || sr.includes(posRole))) {
                    isMatch = false;
                }
            }

            // If user searched by industry, this position must match it
            if (isMatch && searchIndustries.length > 0) {
                if (!searchIndustries.some(si => posIndustries.some(pi => pi.includes(si) || si.includes(pi)))) {
                    isMatch = false;
                }
            }

            if (isMatch) {
                matchingDbPosition = pos;
                break; // Found the position that satisfied the search!
            }
        }

        // If we couldn't figure out which position matched (e.g. they searched by location only),
        // we fallback to checking if they still work at their primary (first) DB company.
        const targetCompanyToCheck = matchingDbPosition 
            ? String(matchingDbPosition.company || "").toLowerCase().trim()
            : String(originalItem.current_positions[0].company || "").toLowerCase().trim();

        if (!targetCompanyToCheck) return true;

        // 4. Compare: Does API Club still show them working at the Target Company?
        const stillWorksAtTargetCompany = apiClubCompanies.some(apiComp => 
            apiComp.includes(targetCompanyToCheck) || targetCompanyToCheck.includes(apiComp)
        );

        if (!stillWorksAtTargetCompany) {
            console.log(`[LiveEnrichment] Profile ${originalItem.name} dropped: Smart Evaluator detected job change. DB matched company [${targetCompanyToCheck}], but API Club says: [${apiClubCompanies.join(", ")}]`);
            return false;
        }

        return true;
    }
}

module.exports = new LiveEnrichmentService();