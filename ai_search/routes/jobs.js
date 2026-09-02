const express = require('express');
const router = express.Router();
const AiSearchJob = require('../models/AiSearchJob');
const axios = require('axios');

// Configure this to point to the search engine (NEW-SEARCH-API-testing)
const SEARCH_ENGINE_URL = process.env.SEARCH_ENGINE_URL || 'http://localhost:8000';
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

// Helper function for DeepSeek API with retries
async function callDeepSeekWithRetry(prompt, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const dsResponse = await axios.post("https://api.deepseek.com/chat/completions", {
        model: "deepseek-chat",
        messages: [
          { role: "system", content: "You are a B2B company evaluator. You make reasonable inferences. Return ONLY valid JSON." },
          { role: "user", content: prompt }
        ],
        response_format: { type: "json_object" }
      }, {
        headers: { "Authorization": `Bearer ${process.env.DEEPSEEK_API_KEY}` },
        timeout: 15000 // 15 second timeout to prevent hanging
      });
      return JSON.parse(dsResponse.data.choices[0].message.content);
    } catch (error) {
      const isLastAttempt = i === maxRetries - 1;
      if (isLastAttempt) throw error;
      
      // If it's a network error (ECONNRESET, socket hang up) or 5xx server error, wait and retry
      if (error.code === 'ECONNRESET' || error.code === 'ECONNABORTED' || (error.response && error.response.status >= 500)) {
        console.warn(`DeepSeek API error (${error.code || error.response?.status}), retrying ${i + 1}/${maxRetries}...`);
        await new Promise(resolve => setTimeout(resolve, 1500 * (i + 1))); // Exponential backoff
      } else {
        throw error; // If it's a 4xx error (bad auth, bad request), don't retry
      }
    }
  }
}

// Create a new AI Search Job (Step 3 Trigger)
router.post('/jobs', async (req, res) => {
  try {
    let {
        userId,
        originalPrompt,
        isSemanticNeeded,
        extractedFilters,
        semanticSentences,
        requestedLeadCount,
        listName,
        revealInfo,
        authToken,
        searchMode,
        useExternalVectorApi
      } = req.body;

      // Fallback: extract from cookie header if not in body
      if (!authToken && req.headers.cookie) {
        const match = req.headers.cookie.match(/(?:^|;\s*)auth-token=([^;]*)/);
        if (match) {
          authToken = decodeURIComponent(match[1]);
        }
      }

    const job = new AiSearchJob({
      userId,
      originalPrompt,
      isSemanticNeeded,
      extractedFilters,
      semanticSentences,
      requestedLeadCount,
      listName,
      revealInfo,
      authToken,
      searchMode,
      useExternalVectorApi: useExternalVectorApi || false,
      status: isSemanticNeeded ? 'VECTOR_SEARCHING' : 'FULFILLING' // Skip semantic if not needed
    });

    await job.save();

    // Trigger async processing
    processJob(job._id).catch(err => console.error('Job processing failed:', err));

    res.status(201).json({ jobId: job._id, message: 'Job created and processing started' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create job' });
  }
});

// Get job status
router.get('/jobs/:id', async (req, res) => {
  try {
    const job = await AiSearchJob.findById(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json(job);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch job' });
  }
});

// Get active jobs for a user
router.get('/jobs/user/:userId/active', async (req, res) => {
  try {
    const { userId } = req.params;
    // Return jobs that are currently fulfilling
    const jobs = await AiSearchJob.find({
      userId,
      status: 'FULFILLING'
    });
    res.json(jobs);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch active jobs' });
  }
});

    // Approve 10-lead sample
router.post('/jobs/:id/approve', async (req, res) => {
  try {
    const job = await AiSearchJob.findById(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    if (job.status !== 'PENDING_USER_APPROVAL') {
      return res.status(400).json({ error: 'Job is not pending approval' });
    }

    const { listName, revealInfo, maxPerCompany, useExternalVectorApi, approvedCompanies } = req.body;

    // Update the job's extracted filters to strictly include ONLY the approved companies from the frontend
    if (approvedCompanies && Array.isArray(approvedCompanies) && approvedCompanies.length > 0) {
      // OVERWRITE the entire company_domain filter to STRICTLY use only what the user approved in the sample phase
      job.extractedFilters.company_domain = { include: approvedCompanies };
      job.markModified('extractedFilters');
      
      // Update the evaluatedCompanies array to reflect ONLY the frontend's final decision
      // Mark companies as approved only if their domain is in the approvedCompanies array
      job.evaluatedCompanies.forEach(c => {
        c.approved = approvedCompanies.includes(c.domain);
      });
      job.markModified('evaluatedCompanies');
    }

    job.status = 'FULFILLING';
    job.listName = listName;
    job.revealInfo = revealInfo;
    job.useExternalVectorApi = useExternalVectorApi || false;
    await job.save();

    // Trigger async fulfillment
    fulfillJob(job._id, listName, revealInfo, maxPerCompany).catch(err => console.error('Job fulfillment failed:', err));

    res.json({ message: 'Job approved and fulfillment started' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to approve job' });
  }
});

async function processJob(jobId) {
  const job = await AiSearchJob.findById(jobId);
  if (!job) return;

  try {
    if (!job.isSemanticNeeded) {
      // 1. Just fetch 5 leads using the exact filters
      const response = await axios.post(`${SEARCH_ENGINE_URL}/search/people`, {
        ...job.extractedFilters,
        limit: 5
      });

      job.sampleLeads = response.data.results || [];
      job.status = 'PENDING_USER_APPROVAL';
      await job.save();
      return;
    }

    // --- Filter + Semantic Flow ---
    
    // 1. Fetch top leads based on exact filters to extract company IDs and domains
    // We dynamically adjust the limit based on requested lead count to ensure we get enough diverse companies,
    // but cap it at 1000 to prevent payload overload.
    const searchLimit = Math.min(Math.max(job.requestedLeadCount * 5, 500), 1000);
    
    const peopleResponse = await axios.post(`${SEARCH_ENGINE_URL}/search/people`, {
      ...job.extractedFilters,
      limit: searchLimit 
    });

    const leads = peopleResponse.data.results || [];
    const domainsSet = new Set();
    const linkedinIdsSet = new Set();
    
    leads.forEach(lead => {
        let domain = lead.current_company_domain || lead.company_domain;
        if (Array.isArray(domain)) domain = domain[0];
        if (domain) domainsSet.add(domain);

        let linkedinId = lead.company_linkedin_id;
        if (Array.isArray(linkedinId)) linkedinId = linkedinId[0];
        if (linkedinId) linkedinIdsSet.add(String(linkedinId));
      });

    // Chunking helper to process arrays in batches
    const chunkArray = (array, size) => {
      const chunks = [];
      for (let i = 0; i < array.length; i += size) {
        chunks.push(array.slice(i, i + size));
      }
      return chunks;
    };
    
    const companyDomains = Array.from(domainsSet);
    const companyLinkedinIds = Array.from(linkedinIdsSet);
    
    // For the INITIAL phase, we only need to process up to 500 companies, but we will do it in chunks of 100 to avoid timeouts.
    const safeCompanyDomains = companyDomains.slice(0, 500);
    const safeCompanyLinkedinIds = companyLinkedinIds.slice(0, 500);
    
    // Save how many leads were matched by the initial exact filters
    job.initialFilterResultsCount = peopleResponse.data.paging?.total_count || leads.length;
    job.extractedCompaniesCount = safeCompanyLinkedinIds.length > 0 ? safeCompanyLinkedinIds.length : safeCompanyDomains.length;
    await job.save();

    if (job.extractedCompaniesCount === 0) {
      job.status = 'FAILED';
      job.errorMessage = 'No companies found matching the exact filters.';
      await job.save();
      return;
    }

    // 2. Send IDs/domains and sentences to semantic search endpoint
    job.status = 'VECTOR_SEARCHING';
    await job.save();

    let scoredCompanies = [];

    if (job.useExternalVectorApi) {
      console.log(`Using EXTERNAL Vector API for initial ${safeCompanyDomains.length} domains...`);

      try {
        const externalPayload = {
          query: job.originalPrompt,
          domains: safeCompanyDomains
        };
        const externalResponse = await axios.post('http://185.182.187.174:8016/api/search', externalPayload, {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer sms_live_283f0820ad88ed05_mnWt5b9uQ6ASZyAqRzmMsGn-PZoX8qpz',
            'x-api-key': 'sms_live_283f0820ad88ed05_mnWt5b9uQ6ASZyAqRzmMsGn-PZoX8qpz'
          }
        });

        const externalResults = externalResponse.data.results || [];

        job.externalApiDebug = {
          payload: {
            query: externalPayload.query,
            domainsCount: externalPayload.domains.length,
            domainsSample: externalPayload.domains.slice(0, 3)
          },
          responseStatus: externalResponse.status,
          resultsCount: externalResults.length,
          firstResultSample: externalResults.length > 0 ? {
            domain: externalResults[0].domain,
            chunk_score: externalResults[0].chunk_score,
            chunk_text_preview: externalResults[0].chunk_text ? externalResults[0].chunk_text.substring(0, 50) + "..." : ""
          } : null
        };

        scoredCompanies = externalResults.map(item => ({
          domain: item.domain,
          company_domain: item.domain,
          name: item.publicId || item.domain,
          tagline: item.tagline || "",
          overview: item.overview || "",
          specialties: item.chunk_text || "", 
          score: item.chunk_score,
          _score: item.chunk_score
        }));
        console.log(`External API returned ${scoredCompanies.length} initial scored companies.`);
      } catch (externalError) {
        console.error('Initial External API failed:', externalError.message);
      }
    } else {
      console.log(`Using INTERNAL Elastic Vector Search for initial ${safeCompanyLinkedinIds.length > 0 ? safeCompanyLinkedinIds.length + ' IDs' : safeCompanyDomains.length + ' domains'} (Batching)...`);
      
      const idChunks = safeCompanyLinkedinIds.length > 0 
        ? chunkArray(safeCompanyLinkedinIds, 100) 
        : [];
      const domainChunks = safeCompanyDomains.length > 0 && safeCompanyLinkedinIds.length === 0
        ? chunkArray(safeCompanyDomains, 100)
        : [];
        
      const chunksToProcess = idChunks.length > 0 ? idChunks : domainChunks;
      const isUsingIds = idChunks.length > 0;

      for (let i = 0; i < chunksToProcess.length; i++) {
        console.log(`Processing vector batch ${i + 1} of ${chunksToProcess.length}...`);
        try {
          const semanticResponse = await axios.post(`${SEARCH_ENGINE_URL}/search/companies/ai-semantic`, {
            semantic_sentences: job.semanticSentences,
            company_linkedin_ids: isUsingIds ? chunksToProcess[i] : [],
            company_domains: !isUsingIds ? chunksToProcess[i] : []
          });
          if (semanticResponse.data && semanticResponse.data.results) {
            scoredCompanies.push(...semanticResponse.data.results);
          }
        } catch (batchErr) {
          console.error(`Batch ${i + 1} failed:`, batchErr.message);
        }
      }
      
      // Sort the combined results from all batches by score descending
      // SURGICAL FIX: Blend the original Industry Boost (insertion order) with the Vector Score
      // Companies at the top of safeCompanyLinkedinIds matched the Primary Industry (Boost 5.0).
      // We give a small mathematical bonus to preserve this priority against generic vector matches.
      scoredCompanies = scoredCompanies.map(comp => {
        const idToFind = isUsingIds ? String(comp.linkedin_id) : comp.domain;
        let originalIndex = isUsingIds 
          ? safeCompanyLinkedinIds.indexOf(idToFind) 
          : safeCompanyDomains.indexOf(idToFind);
          
        if (originalIndex === -1) originalIndex = 500; // fallback
        
        // SURGICAL FIX: Stronger rankBonus to prevent Vector Washout Effect.
        // We use * 0.01 instead of 0.001 to give up to +5.0 bonus, preserving the 5.0 Primary Industry boost
        // from the initial Elasticsearch query. Vector score (usually 1.0-2.0) acts as a local tie-breaker.
        const rankBonus = Math.max(0, (500 - originalIndex) * 0.01);
        comp._blended_score = (comp._score || 0) + rankBonus;
        return comp;
      });

      scoredCompanies.sort((a, b) => (b._blended_score || 0) - (a._blended_score || 0));
    }

    job.vectorSearchCompaniesCount = scoredCompanies.length;
    await job.save();

    if (scoredCompanies.length === 0) {
      job.status = 'FAILED';
      job.errorMessage = 'Semantic search yielded no results.';
      await job.save();
      return;
    }

    // 3. DeepSeek Scoring
    job.status = 'DEEPSEEK_SCORING';
    await job.save();

    // Select the top 50 highly ranked companies from vector search to pass to DeepSeek
    const companiesToEvaluate = scoredCompanies.slice(0, 50);
    const approvedDomains = [];

    // Fallback in case none are approved
    let topScoringDomain = null;
    let highestScore = -1;

    // Evaluate each company with DeepSeek
    // We do this in chunks or Promise.all, but sequentially is safer for API limits
        for (const company of companiesToEvaluate) {
      const prompt = `
You are an expert B2B company relevance evaluator and semantic reranker. 
Your task is to determine how likely a company matches the user's search intent based ONLY on the information provided. 

You are NOT a compliance checker and NOT a strict validator. 
Your goal is to rank semantic relevance, not to reject companies simply because some attributes are unstated. 

--- 

EVALUATION PRINCIPLES 

1. Focus on User Intent 
Determine the core business intent behind the search. Do not rely on keyword matching. Evaluate the company's actual business model, products, customers, positioning, and activities. 

2. Reasonable Inference Is Allowed 
Use only the provided company information. However, reasonable business inference is allowed. If the profile strongly suggests a company satisfies a requirement, do not penalize heavily simply because the exact wording is missing. Absence of evidence is NOT evidence of absence. 
*Example:* 
User Query: "Fast-growing fintech startups" 
Company Overview: "Digital payments platform expanding across the GCC, backed by investors." 
You may reasonably infer startup and growth characteristics even if the words "startup" or "fast-growing" do not appear explicitly. 

3. Service Provider vs Target Entity (CRITICAL RULE) 
If the user requests a specific organization type, distinguish between: 
A. The actual target entity 
B. Companies selling services, consulting, software, marketing, or products to that entity 
*HARD PENALTY:* If a company is a Service Provider (B) and not the Target Entity (A), its score MUST NOT exceed 39, even if its profile is filled with relevant keywords. 

4. Internal Usage vs Selling 
If a query requires a company to use a technology, value, process, or methodology internally: 
- High Match: The company appears to use it internally. 
- Medium Match: The company provides it as a service to others. 
- Low Match: The company is unrelated. 
However, do not automatically reject a company simply because internal usage is implied rather than explicitly stated. 

5. Relevance Over Certainty 
Score based on likelihood of fit. Do not require proof of every attribute. A company can be highly relevant even when some requested characteristics are only partially supported. 

6. Ignore People and Job Titles 
The user's query often contains job titles, roles, or types of people (e.g., "CEO", "Marketing Manager", "Developers"). You are evaluating ONLY the COMPANY match. Completely ignore any job titles, roles, or people mentioned in the USER REQUEST. Do NOT penalize a company because its profile does not mention the requested job title. Do NOT falsely approve a recruitment or coaching agency just because they serve that job title. 
 
--- 
 
SCORING SCALE 

90-100 (Exceptional Match) 
The company strongly aligns with the user's intended entity type, industry, business model, and semantic requirements. Very likely what the user is looking for. 

75-89 (Strong Match) 
The company appears highly relevant. Most requirements are satisfied or strongly implied. Minor uncertainty may exist. These companies SHOULD generally be approved. 

60-74 (Plausible Match) 
The company is meaningfully related and may satisfy the search intent. Some important requirements are unclear, weakly supported, or only partially present. Potential candidate but not among the strongest matches. 

40-59 (Weak Match) 
Some overlap exists, but the company is likely adjacent to the intended target. Important aspects of the query are missing. 

0-39 (Poor Match / Wrong Entity) 
The company is largely unrelated, serves a different audience, conflicts with the user's intent, or is a Service Provider selling to the target entity instead of being the target itself. 

--- 

OUTPUT REQUIREMENTS 

Return EXACTLY one valid JSON object. 
No markdown. 
No explanations outside the JSON. 

JSON Schema: 
{ 
  "company_business_model_classification": "Briefly state the company's actual business model and core offering (e.g., 'Actual K-12 School', 'Marketing Agency selling to schools', 'B2B SaaS startup', 'Physical manufacturer')", 
  "why_this_matches": "A 1-2 sentence explanation of the reasoning. Describe how the company's business model relates to the requested entity type, noting any inferences or service provider penalties applied.", 
  "score": 0, 
  "confidence": 0 
} 

--- 

USER REQUEST: ${job.originalPrompt} 
SEMANTIC CONTEXT: ${job.semanticSentences.join(' ')} 

COMPANY PROFILE: 
Name: ${company.name || company.company_name} 
Industry: ${company.industry || 'N/A'} 
Tagline: ${company.tagline || 'N/A'} 
Overview: ${company.overview || 'N/A'} 
Specialties: ${company.specialties || 'N/A'}
      `;

      try {
          const dsData = await callDeepSeekWithRetry(prompt);

          // Ensure we parse the score correctly
        let isApproved = false;
        let score = 0;
        
        if (typeof dsData.score === 'number') {
          score = dsData.score;
        } else if (typeof dsData.score === 'string') {
          score = parseInt(dsData.score, 10) || 0;
        }
        
        // Changed to 70 as requested by the user
            isApproved = score >= 70;

        // Track the highest scoring company just in case all are rejected
        if (score > highestScore) {
          highestScore = score;
          topScoringDomain = company.domain || company.company_domain;
        }

        job.evaluatedCompanies.push({
          domain: company.domain || company.company_domain,
          name: company.name || company.company_name,
          approved: isApproved,
          score: score,
          reason: dsData.why_this_matches || dsData.reason || "",
          description: dsData.company_business_model_classification || "",
          evidence: {},
          vectorScore: company.score || company._score || "N/A"
        });

        if (isApproved) {
          approvedDomains.push(company.domain || company.company_domain);
        }
      } catch (e) {
        console.error('DeepSeek evaluation failed for company', company.name, e.message);
      }
    }

    // If DeepSeek rejected literally everything because of the strict Service Provider rule,
    // we need to give the user SOMETHING to look at on the UI, otherwise it's a blank screen.
    // We will push the absolute best scoring domain as a fallback so the UI can render.
    if (approvedDomains.length === 0 && topScoringDomain) {
      console.log(`DeepSeek rejected all companies. Falling back to the highest scored company: ${topScoringDomain} (Score: ${highestScore})`);
      approvedDomains.push(topScoringDomain);
      
      // Mark it as approved in the array so the frontend shows it
      const topCompany = job.evaluatedCompanies.find(c => c.domain === topScoringDomain);
      if (topCompany) {
        topCompany.approved = true;
      }
    }

    job.markModified('evaluatedCompanies');
    await job.save();

    if (approvedDomains.length === 0) {
      job.status = 'FAILED';
      job.errorMessage = 'DeepSeek rejected all semantically matched companies.';
      await job.save();
      return;
    }

    // 4. Fetch 5-lead sample strictly from approved companies
    // UPDATE the extracted filters so that fulfillment uses only the approved domains!
    
    // Filter out empty domains
    const validDomains = approvedDomains.filter(d => d && d.trim() !== "" && d.trim() !== "()");
    
    // Find approved companies that lack a valid domain to search by name instead
    const approvedNamesNoDomain = job.evaluatedCompanies
      .filter(c => c.approved && (!c.domain || c.domain.trim() === "" || c.domain.trim() === "()"))
      .map(c => c.name)
      .filter(n => n && n.trim() !== "");

    // Safety check: ensure company_domain exists
    if (!job.extractedFilters.company_domain) {
      job.extractedFilters.company_domain = { include: [] };
    }
    
    // If user already specified some company domains, keep them, otherwise just use approved
    if (job.extractedFilters.company_domain.include) {
        // Merge them and remove duplicates
        job.extractedFilters.company_domain.include = [...new Set([...job.extractedFilters.company_domain.include, ...validDomains])];
    } else {
        job.extractedFilters.company_domain.include = validDomains;
    }
    
    if (approvedNamesNoDomain.length > 0) {
      if (!job.extractedFilters.company_name) {
        job.extractedFilters.company_name = { include: [] };
      } else if (Array.isArray(job.extractedFilters.company_name)) {
        job.extractedFilters.company_name = { include: job.extractedFilters.company_name };
      } else if (!job.extractedFilters.company_name.include) {
        job.extractedFilters.company_name.include = [];
      }
      job.extractedFilters.company_name.include = [...new Set([...job.extractedFilters.company_name.include, ...approvedNamesNoDomain])];
    }
    
    job.markModified('extractedFilters');

    // Make sure we pass the explicit approved domains/names array to the initial sample fetch!
    const sampleFilters = { ...job.extractedFilters };
    sampleFilters.company_domain = { include: validDomains };
    
    if (approvedNamesNoDomain.length > 0) {
      sampleFilters.company_name = sampleFilters.company_name || { include: [] };
      sampleFilters.company_name.include = [...new Set([...(sampleFilters.company_name.include || []), ...approvedNamesNoDomain])];
    }

    const finalPeopleResponse = await axios.post(`${SEARCH_ENGINE_URL}/search/people`, {
      ...sampleFilters,
      limit: 5
    });

    job.sampleLeads = finalPeopleResponse.data.results || [];
    job.status = 'PENDING_USER_APPROVAL';
    await job.save();

  } catch (error) {
    console.error('Process job error:', error);
    job.status = 'FAILED';
    job.errorMessage = error.message;
    await job.save();
  }
}

async function fulfillJob(jobId, listName, revealInfo, maxPerCompany) {
  const job = await AiSearchJob.findById(jobId);
  if (!job) return;

  try {
    console.log(`Fulfilling job ${jobId} for ${job.requestedLeadCount} leads`);
    
    // --- DYNAMIC SCALING FOR SEMANTIC SEARCH ---
    if (job.isSemanticNeeded) {
      // Helper to check current lead count, passing aggregate_companies to get buckets
      const getLeadCount = async (filters) => {
        try {
          // IMPORTANT: If we have approved domains from the sample phase, we MUST inject them here
          // otherwise this count will check the entire database, not just our approved pool
          const filtersToCheck = { ...filters };
          if (job.extractedFilters && job.extractedFilters.company_domain && job.extractedFilters.company_domain.include) {
             filtersToCheck.company_domain = { include: [...job.extractedFilters.company_domain.include] };
          }
          
          const res = await axios.post(`${SEARCH_ENGINE_URL}/search/people`, { 
            ...filtersToCheck, 
            limit: 0, 
            aggregate_companies: true 
          });
          
          if (!maxPerCompany) {
            return res.data.total || 0;
          }

          // If maxPerCompany is set, calculate the true yield by capping each company's leads
          const buckets = res.data.unique_company_buckets || res.data.unique_company_domains || [];
          let trueYield = 0;
          let countedLeadsFromBuckets = 0;
          
          if (Array.isArray(buckets) && buckets.length > 0 && buckets[0].doc_count !== undefined) {
             // We have actual buckets with doc counts
             buckets.forEach(bucket => {
                trueYield += Math.min(bucket.doc_count, maxPerCompany);
                countedLeadsFromBuckets += bucket.doc_count;
             });
             // Add any leads that weren't in the top 1000 buckets
             const remaining = (res.data.total || 0) - countedLeadsFromBuckets;
             if (remaining > 0) {
                 // Safest assumption: they belong to many small companies, so we just add them
                 trueYield += remaining;
             }
             return trueYield;
          } else {
             // Fallback if no buckets available: just return total
             return res.data.total || 0;
          }
        } catch (e) { 
          return 0; 
        }
      };

      let currentCount = await getLeadCount(job.extractedFilters);
      console.log(`Initial approved domains yield ${currentCount} leads (with maxPerCompany=${maxPerCompany || 'None'}). Target: ${job.requestedLeadCount}`);

      if (currentCount < job.requestedLeadCount) {
        console.log('Not enough leads. Scaling up DeepSeek evaluations...');
        // Get original filters without the strict company_domain restriction
        // We do this to fetch NEW companies, but we MUST keep track of the approved domains
        // so we don't accidentally overwrite them later
        const originalFilters = { ...job.extractedFilters };
        const currentlyApprovedDomains = job.extractedFilters.company_domain ? [...job.extractedFilters.company_domain.include] : [];
        delete originalFilters.company_domain;

        // Fetch a large pool of leads to get more domains
        const searchLimit = Math.min(job.requestedLeadCount * 10, 3000);
        const peopleRes = await axios.post(`${SEARCH_ENGINE_URL}/search/people`, { ...originalFilters, limit: searchLimit });
        
        const domainsSet = new Set();
        const linkedinIdsSet = new Set();
          (peopleRes.data.results || []).forEach(lead => {
            let d = lead.current_company_domain || lead.company_domain;
            if (Array.isArray(d)) d = d[0];
            if (d) domainsSet.add(d);

            let linkedinId = lead.company_linkedin_id;
            if (Array.isArray(linkedinId)) linkedinId = linkedinId[0];
            if (linkedinId) linkedinIdsSet.add(String(linkedinId));
          });

        // In the BACKGROUND loop, we evaluate as many as we safely can without timing out Elasticsearch
        // We will process 1000 companies, chunked into batches of 100
        const safeDomains = Array.from(domainsSet).slice(0, 1000);
        const safeLinkedinIds = Array.from(linkedinIdsSet).slice(0, 1000);
        
        // Vector search for more companies (fetch a larger batch)
        let scoredCompanies = [];

        if (job.useExternalVectorApi) {
          console.log(`Using EXTERNAL Vector API for ${safeDomains.length} domains...`);
          try {
            const externalPayload = {
              query: job.originalPrompt,
              domains: safeDomains
            };
            const externalResponse = await axios.post('http://185.182.187.174:8016/api/search', externalPayload, {
              headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer sms_live_283f0820ad88ed05_mnWt5b9uQ6ASZyAqRzmMsGn-PZoX8qpz',
                'x-api-key': 'sms_live_283f0820ad88ed05_mnWt5b9uQ6ASZyAqRzmMsGn-PZoX8qpz'
              }
            });

            // Map the external API response format to match what our DeepSeek loop expects
            const externalResults = externalResponse.data.results || [];
            
            job.externalApiDebug = {
              payload: {
                query: externalPayload.query,
                domainsCount: externalPayload.domains.length,
                domainsSample: externalPayload.domains.slice(0, 3)
              },
              responseStatus: externalResponse.status,
              resultsCount: externalResults.length,
              firstResultSample: externalResults.length > 0 ? {
                domain: externalResults[0].domain,
                chunk_score: externalResults[0].chunk_score,
                chunk_text_preview: externalResults[0].chunk_text ? externalResults[0].chunk_text.substring(0, 50) + "..." : ""
              } : null
            };

            scoredCompanies = externalResults.map(item => ({
              domain: item.domain,
              company_domain: item.domain,
              name: item.publicId || item.domain, // Fallback if no name
              tagline: item.tagline || "",
              overview: item.overview || "",
              specialties: item.chunk_text || "", // We feed chunk_text into specialties so DeepSeek sees it
              score: item.chunk_score,
              _score: item.chunk_score
            }));
            console.log(`External API returned ${scoredCompanies.length} scored companies.`);
          } catch (externalError) {
            console.error('External API failed:', externalError.message);
            // If external fails, we have no scored companies, the loop will break.
          }
        } else {
          console.log(`Using INTERNAL Elastic Vector Search for ${safeLinkedinIds.length > 0 ? safeLinkedinIds.length + ' IDs' : safeDomains.length + ' domains'} (Batching)...`);
          
          const idChunks = safeLinkedinIds.length > 0 
            ? chunkArray(safeLinkedinIds, 100) 
            : [];
          const domainChunks = safeDomains.length > 0 && safeLinkedinIds.length === 0
            ? chunkArray(safeDomains, 100)
            : [];
            
          const chunksToProcess = idChunks.length > 0 ? idChunks : domainChunks;
          const isUsingIds = idChunks.length > 0;

          for (let i = 0; i < chunksToProcess.length; i++) {
            console.log(`Processing background vector batch ${i + 1} of ${chunksToProcess.length}...`);
            try {
              const semanticRes = await axios.post(`${SEARCH_ENGINE_URL}/search/companies/ai-semantic`, {
                semantic_sentences: job.semanticSentences,
                company_linkedin_ids: isUsingIds ? chunksToProcess[i] : [],
                company_domains: !isUsingIds ? chunksToProcess[i] : [],
                limit: Math.max(100, Math.min(job.requestedLeadCount, 300))
              });
              if (semanticRes.data && semanticRes.data.results) {
                scoredCompanies.push(...semanticRes.data.results);
              }
            } catch (batchErr) {
              console.error(`Background Batch ${i + 1} failed:`, batchErr.message);
            }
          }
          
          // Sort the combined results from all batches by score descending
          scoredCompanies.sort((a, b) => (b._score || 0) - (a._score || 0));
        }
        
        // Filter out already evaluated ones
        const evaluatedDomains = new Set(job.evaluatedCompanies.map(c => c.domain));
        scoredCompanies = scoredCompanies.filter(c => !evaluatedDomains.has(c.domain || c.company_domain));

        let evaluationsCount = 0;

        for (const company of scoredCompanies) {
          if (currentCount >= job.requestedLeadCount) break; // We have enough!
          
          // Evaluate
          const prompt = `
You are an expert B2B company relevance evaluator and semantic reranker. 
Your task is to determine how likely a company matches the user's search intent based ONLY on the information provided. 

You are NOT a compliance checker and NOT a strict validator. 
Your goal is to rank semantic relevance, not to reject companies simply because some attributes are unstated. 

--- 

EVALUATION PRINCIPLES 

1. Focus on User Intent 
Determine the core business intent behind the search. Do not rely on keyword matching. Evaluate the company's actual business model, products, customers, positioning, and activities. 

2. Reasonable Inference Is Allowed 
Use only the provided company information. However, reasonable business inference is allowed. If the profile strongly suggests a company satisfies a requirement, do not penalize heavily simply because the exact wording is missing. Absence of evidence is NOT evidence of absence. 
*Example:* 
User Query: "Fast-growing fintech startups" 
Company Overview: "Digital payments platform expanding across the GCC, backed by investors." 
You may reasonably infer startup and growth characteristics even if the words "startup" or "fast-growing" do not appear explicitly. 

3. Service Provider vs Target Entity (CRITICAL RULE) 
If the user requests a specific organization type, distinguish between: 
A. The actual target entity 
B. Companies selling services, consulting, software, marketing, or products to that entity 
*HARD PENALTY:* If a company is a Service Provider (B) and not the Target Entity (A), its score MUST NOT exceed 39, even if its profile is filled with relevant keywords. 

4. Internal Usage vs Selling 
If a query requires a company to use a technology, value, process, or methodology internally: 
- High Match: The company appears to use it internally. 
- Medium Match: The company provides it as a service to others. 
- Low Match: The company is unrelated. 
However, do not automatically reject a company simply because internal usage is implied rather than explicitly stated. 

5. Relevance Over Certainty 
Score based on likelihood of fit. Do not require proof of every attribute. A company can be highly relevant even when some requested characteristics are only partially supported. 

6. Ignore People and Job Titles 
The user's query often contains job titles, roles, or types of people (e.g., "CEO", "Marketing Manager", "Developers"). You are evaluating ONLY the COMPANY match. Completely ignore any job titles, roles, or people mentioned in the USER REQUEST. Do NOT penalize a company because its profile does not mention the requested job title. Do NOT falsely approve a recruitment or coaching agency just because they serve that job title. 
 
--- 
 
SCORING SCALE 

90-100 (Exceptional Match) 
The company strongly aligns with the user's intended entity type, industry, business model, and semantic requirements. Very likely what the user is looking for. 

75-89 (Strong Match) 
The company appears highly relevant. Most requirements are satisfied or strongly implied. Minor uncertainty may exist. These companies SHOULD generally be approved. 

60-74 (Plausible Match) 
The company is meaningfully related and may satisfy the search intent. Some important requirements are unclear, weakly supported, or only partially present. Potential candidate but not among the strongest matches. 

40-59 (Weak Match) 
Some overlap exists, but the company is likely adjacent to the intended target. Important aspects of the query are missing. 

0-39 (Poor Match / Wrong Entity) 
The company is largely unrelated, serves a different audience, conflicts with the user's intent, or is a Service Provider selling to the target entity instead of being the target itself. 

--- 

OUTPUT REQUIREMENTS 

Return EXACTLY one valid JSON object. 
No markdown. 
No explanations outside the JSON. 

JSON Schema: 
{ 
  "company_business_model_classification": "Briefly state the company's actual business model and core offering (e.g., 'Actual K-12 School', 'Marketing Agency selling to schools', 'B2B SaaS startup', 'Physical manufacturer')", 
  "why_this_matches": "A 1-2 sentence explanation of the reasoning. Describe how the company's business model relates to the requested entity type, noting any inferences or service provider penalties applied.", 
  "score": 0, 
  "confidence": 0 
} 

--- 

USER REQUEST: ${job.originalPrompt} 
SEMANTIC CONTEXT: ${job.semanticSentences.join(' ')} 

COMPANY PROFILE: 
Name: ${company.name || company.company_name} 
Industry: ${company.industry || 'N/A'} 
Tagline: ${company.tagline || 'N/A'} 
Overview: ${company.overview || 'N/A'} 
Specialties: ${company.specialties || 'N/A'}
          `;

          try {
              const dsData = await callDeepSeekWithRetry(prompt);

              // Ensure we parse the score correctly
            let isApproved = false;
            let score = 0;
            
            if (typeof dsData.score === 'number') {
              score = dsData.score;
            } else if (typeof dsData.score === 'string') {
              score = parseInt(dsData.score, 10) || 0;
            }
            
            // Changed to 70 as requested by the user
            isApproved = score >= 70;

            job.evaluatedCompanies.push({
                domain: company.domain || company.company_domain,
                name: company.name || company.company_name,
                approved: isApproved,
                score: score,
                reason: dsData.why_this_matches || dsData.reason || "",
                description: dsData.company_business_model_classification || "",
                evidence: {},
                vectorScore: company.score || company._score || "N/A"
              });

            if (isApproved) {
              const domainToPush = company.domain || company.company_domain;
              if (domainToPush && !currentlyApprovedDomains.includes(domainToPush)) {
                currentlyApprovedDomains.push(domainToPush);
                
                // Ensure company_domain filter structure exists
                if (!job.extractedFilters.company_domain) {
                  job.extractedFilters.company_domain = { include: [] };
                }
                
                job.extractedFilters.company_domain.include = [...currentlyApprovedDomains];
                job.markModified('extractedFilters');
                
                // Check count every time we approve a company to avoid over-evaluating
                currentCount = await getLeadCount(job.extractedFilters);
                console.log(`Approved new company (${domainToPush}). Total leads now: ${currentCount}/${job.requestedLeadCount}`);
              }
            }
          } catch (e) {
            console.error('DeepSeek eval error in fulfillJob:', e.message);
          }
          
          evaluationsCount++;
          if (evaluationsCount >= 100) {
            console.log('Reached maximum dynamic DeepSeek evaluations (100). Stopping evaluation loop.');
            break; 
          }
        }
        
        await job.save();
      }
    }
    // --- END DYNAMIC SCALING ---

    // We connect to the existing main backend endpoint
      const backendUrl = process.env.BACKEND_URL || 'http://localhost:8000';

      // Convert string "yes"/"no" to boolean if needed, or keep string
      // The main backend endpoint `/api/ai/submit` expects `includePhone` as a boolean
      const includePhone = revealInfo === true || revealInfo === "yes";

      // Re-grab the freshest version of the job to ensure we have the absolute latest extractedFilters
      const freshJob = await AiSearchJob.findById(jobId);

      // Prepare payload matching what the frontend normally sends
      const payload = {
        userId: freshJob.userId, 
        prompt: freshJob.originalPrompt,
      listName: listName,
      numLeads: freshJob.requestedLeadCount,
      includePhone: includePhone,
      searchFilter: freshJob.extractedFilters, // This now STRICTLY contains only the approved domains!
      searchMode: freshJob.searchMode || "people", 
      maxPerCompany: maxPerCompany, 
      aiEvaluationStats: {
          totalEvaluated: freshJob.evaluatedCompanies.length,
          totalApproved: freshJob.evaluatedCompanies.filter(c => c.approved).length,
          totalRejected: freshJob.evaluatedCompanies.filter(c => !c.approved).length,
      },
      aiEvaluations: freshJob.evaluatedCompanies,
      result: freshJob.sampleLeads || []
    };

    // We must pass the authorization header since the backend endpoint requires isAuthenticated
      // We use a trusted service-to-service secret to bypass the cookie requirement, 
      // since cookies are notoriously unreliable across cross-origin microservices.
      const config = {
        headers: {
          'Content-Type': 'application/json',
          'x-internal-service-secret': process.env.INTERNAL_SERVICE_SECRET || 'mawsool_internal_secret_123'
        }
      };

      try {
        console.log(`Sending payload to backend: ${backendUrl}/api/ai/submit`);
      const response = await axios.post(`${backendUrl}/api/ai/submit`, payload, config);
      console.log('List created in backend:', response.data);
      job.status = 'COMPLETED';
      await job.save();
    } catch (apiError) {
      console.error('Backend submission failed:', apiError.response?.data || apiError.message);
      // If we don't have the user's token or the backend rejects it, we fail the job
      job.status = 'FAILED';
      job.errorMessage = 'Failed to communicate with main backend to create the list. ' + (apiError.response?.data?.msg || apiError.message);
      await job.save();
    }
  } catch (error) {
    job.status = 'FAILED';
    job.errorMessage = error.message;
    await job.save();
  }
}

// Get active jobs for a user
router.get('/jobs/user/:userId/active', async (req, res) => {
  try {
    const { userId } = req.params;
    // Return jobs that are currently fulfilling
    const jobs = await AiSearchJob.find({
      userId,
      status: 'FULFILLING'
    }).select('_id status listName requestedLeadCount evaluatedCompanies errorMessage createdAt');
    
    res.json(jobs);
  } catch (error) {
    console.error('Error fetching user active jobs:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
