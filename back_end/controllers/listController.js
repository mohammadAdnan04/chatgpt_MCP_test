const List = require("../models/List");
const ListItem = require("../models/ListItem");
const ListKind = require("../models/ListKind");
const mongoose = require("mongoose");
const { Parser } = require("json2csv");
const axios = require("axios");
const { deductCreditsForUser, resolveWallet, getBalanceForUser } = require("../utils/wallet");
const BulkRevealJobReport = require("../models/BulkRevealJobReport");
const { evaluateEmailForBilling, evaluatePhoneForBilling, computeCost, pickBestBillableEmail, isLikelyCorporatePhone, normalizeEmailStatus } = require("../utils/revealBilling");
const { listItemIdentityOr } = require("../utils/leadIdentityQuery");

function isAiPeopleKind(kind) {
  const k = String(kind || "").toLowerCase();
  return k === "ai_query" || k === "ai_mode";
}

function isEmptyOverlayValue(value) {
  if (value === null || value === undefined) return true;
  if (Array.isArray(value) && value.length === 0) return true;
  if (typeof value === "string") {
    const s = value.trim().toLowerCase();
    return !s || s === "n/a" || s === "not available" || s === "null" || s === "undefined" || s === "processing";
  }
  return false;
}

function pickNonEmpty(...vals) {
  return vals.find((v) => !isEmptyOverlayValue(v));
}

function isPlaceholderContact(value) {
  const s = String(value || "").trim().toLowerCase();
  return !s || s === "not available" || s === "n/a" || s === "null" || s === "undefined";
}

function isPlaceholderArray(arr, pick) {
  if (!Array.isArray(arr) || arr.length === 0) return true;
  return arr.every((item) => isPlaceholderContact(pick(item)));
}

function firstDisplayEmail(emailEval) {
  if (emailEval?.email && !isPlaceholderContact(emailEval.email)) return emailEval.email;
  const candidate = (emailEval?.candidates || []).find((c) => c && c.email && !isPlaceholderContact(c.email));
  return candidate ? candidate.email : "";
}

function firstDisplayPhone(phoneEval) {
  if (phoneEval?.best && !isPlaceholderContact(phoneEval.best)) return phoneEval.best;
  const candidate = (phoneEval?.candidates || []).find((c) => c && (c.num || c.raw) && !isPlaceholderContact(c.num || c.raw));
  return candidate ? (candidate.raw || candidate.num) : "";
}

function isAwaitingAsyncWebhook(itemData, emailEval, wantsEmail) {
  const status = String(itemData?.status || "").toLowerCase();
  return (
    status === "processing" ||
    status === "pending" ||
    itemData?.awaiting_enrichment === true ||
    itemData?.webhook_pending === true ||
    (wantsEmail && emailEval?.hasAny && emailEval.hasMissingStatus && !emailEval.hasBillable)
  );
}

async function markRevealProgressIfNeeded(listId, existingRaw, newRaw, hasSavedContact) {
  if (!hasSavedContact || existingRaw?.bulk_reveal_counted) {
    if (hasSavedContact) newRaw.bulk_reveal_counted = true;
    return;
  }
  newRaw.bulk_reveal_counted = true;
  const list = await List.findByIdAndUpdate(listId, { $inc: { "revealProgress.current": 1 } }, { new: true });
  const current = Number(list?.revealProgress?.current || 0);
  const total = Number(list?.revealProgress?.total || 0);
  if (total > 0 && current >= total) {
    await List.updateOne({ _id: listId }, { $set: { revealStatus: "completed" } });
  }
}

// Auto-enrich Company Data by calling internal middleware
const autoEnrichCompanyFirmographics = async (item) => {
    try {
        const raw = item.raw || item;
        const companyName = item.company || raw.company || raw.company_name || raw.organization_name || "";
        const domainsToTry = [
            item.organization__website, raw.organization__website, raw.website, raw.domain, raw.company_domain
        ].filter(Boolean).map(d => String(d).replace(/^(?:https?:\/\/)?(?:www\.)?/i, "").split('/')[0]).filter((v, i, a) => a.indexOf(v) === i);

        let companyLinkedIn = item.organization__linkedin_url || raw.organization__linkedin_url || raw.company_linkedin_url || "";
        
        // Deep scan for domain and LinkedIn URL if missing at root
        if (!companyLinkedIn && Array.isArray(raw.experience)) {
            const exp = raw.experience.find(e => e.company && e.company.name && e.company.name.toLowerCase().includes(companyName.toLowerCase()));
            if (exp && exp.company.url) companyLinkedIn = exp.company.url;
        }
        
        // Sometimes domain is hidden in current_positions or logo
        if (domainsToTry.length === 0 && raw.logo && typeof raw.logo === 'string' && raw.logo.includes('logo.clearbit.com/')) {
            domainsToTry.push(raw.logo.split('logo.clearbit.com/')[1]);
        }

        // Try to extract companyId from experience array or top-level company object
        let companyId = item.companyId || raw.companyId || (raw.company && raw.company.companyId) || null;
        
        if (!companyId && Array.isArray(raw.experience)) {
            const exp = raw.experience.find(e => e.company && e.company.name && e.company.name.toLowerCase().includes(companyName.toLowerCase()));
            if (exp && exp.company && exp.company.companyId) {
                companyId = exp.company.companyId;
            }
        }
        
        if (!companyId && Array.isArray(raw.current_positions)) {
            const pos = raw.current_positions.find(e => e.company && e.company.name && e.company.name.toLowerCase().includes(companyName.toLowerCase()));
            if (pos && pos.company && pos.company.companyId) {
                companyId = pos.company.companyId;
            }
        }
        
        // Also check if we can extract it from the linkedin_url slug
        if (!companyId && companyLinkedIn) {
            const match = companyLinkedIn.match(/company\/([^/?]+)/);
            if (match && !isNaN(Number(match[1]))) {
                companyId = match[1];
            }
        }

        if (!companyName && domainsToTry.length === 0 && !companyLinkedIn) return item; // Nothing to search

        const engineUrl = process.env.MAWSOOL_ENGINE_URL || "https://menasearch.mawsool.tech";
        
        const payload = {
            page: 1,
            limit: 10,
            filters: {}
        };

        let esResults = [];
        let bestResult = null;

        // Helper to score a result
        const getResultScore = (res) => {
            let score = 0;
            if (res.funding && Object.keys(res.funding).length > 0) score += 10;
            if (res.founded_at || res.founded_year) score += 5;
            if (res.employee_count) score += 1;
            return score;
        };

        const isGoodResult = (res) => getResultScore(res) >= 5;

        // Helper to find best result in an array
        const findBestResult = (results) => {
            if (!results || results.length === 0) return null;
            let best = results[0];
            let maxScore = getResultScore(best);
            
            for (let i = 1; i < results.length; i++) {
                const score = getResultScore(results[i]);
                if (score > maxScore) {
                    maxScore = score;
                    best = results[i];
                }
            }
            return best;
        };

        // 1. Try by Exact LinkedIn ID first
        if (companyId) {
            payload.filters.linkedin_id = [companyId];
            console.log(`[Auto-Enrich] Querying engine for company by linkedin_id:`, payload.filters.linkedin_id);
            const res = await axios.post(`${engineUrl}/search/companies`, payload, { headers: { 'Content-Type': 'application/json' } });
            if (res.data && res.data.results && res.data.results.length > 0) {
                const currentBest = findBestResult(res.data.results);
                if (currentBest && isGoodResult(currentBest)) {
                    esResults = [currentBest];
                    bestResult = currentBest;
                } else if (!bestResult) {
                    esResults = [currentBest || res.data.results[0]];
                    bestResult = esResults[0];
                }
            }
            delete payload.filters.linkedin_id; // Clean up for fallback queries
        }

        // 2. Try by Domains
        if (!bestResult || !isGoodResult(bestResult)) {
            for (const domain of domainsToTry) {
                payload.filters.company_name = [domain];
                console.log(`[Auto-Enrich] Querying engine for company by domain:`, payload.filters.company_name);
                const res = await axios.post(`${engineUrl}/search/companies`, payload, { headers: { 'Content-Type': 'application/json' } });
                if (res.data && res.data.results && res.data.results.length > 0) {
                    const currentBest = findBestResult(res.data.results);
                    if (currentBest && isGoodResult(currentBest)) {
                        esResults = [currentBest];
                        bestResult = currentBest;
                        break;
                    } else if (!bestResult || getResultScore(currentBest) > getResultScore(bestResult)) {
                        esResults = [currentBest || res.data.results[0]];
                        bestResult = esResults[0];
                    }
                }
            }
        }

        // 3. Try by LinkedIn slug if no good result yet
        if ((!bestResult || !isGoodResult(bestResult)) && companyLinkedIn && !companyId) {
            const match = companyLinkedIn.match(/company\/([^/?]+)/);
            if (match && isNaN(Number(match[1]))) {
                payload.filters.company_name = [match[1]];
                console.log(`[Auto-Enrich] Poor or no domain result. Querying engine by linkedin slug:`, payload.filters.company_name);
                const res = await axios.post(`${engineUrl}/search/companies`, payload, { headers: { 'Content-Type': 'application/json' } });
                if (res.data && res.data.results && res.data.results.length > 0) {
                    const currentBest = findBestResult(res.data.results);
                    if (currentBest && (isGoodResult(currentBest) || !bestResult || getResultScore(currentBest) > getResultScore(bestResult))) {
                        esResults = [currentBest];
                        bestResult = currentBest;
                    }
                }
            }
        }
        
        // 4. If no results OR poor results, try by Name
        if ((!bestResult || !isGoodResult(bestResult)) && companyName) {
            payload.filters.company_name = [companyName];
            console.log(`[Auto-Enrich] Poor or no domain/slug result. Querying engine by name:`, payload.filters.company_name);
            const res = await axios.post(`${engineUrl}/search/companies`, payload, { headers: { 'Content-Type': 'application/json' } });
            if (res.data && res.data.results && res.data.results.length > 0) {
                const currentBest = findBestResult(res.data.results);
                if (currentBest && (isGoodResult(currentBest) || !bestResult || getResultScore(currentBest) > getResultScore(bestResult))) {
                    esResults = [currentBest];
                    bestResult = currentBest;
                }
            }
        }

        if (esResults.length > 0) {
            const companyData = esResults[0];
            console.log(`[Auto-Enrich] Found company: ${companyData.name} | Domain: ${companyData.domain} | Founded: ${companyData.founded_at} | Funding: ${companyData.funding?.lastRound?.moneyRaised?.amount}`);
            const target = item.raw || item;
            
            // PREVENT KEEPING BAD FALLBACKS: Only use target.organization__* if it's already a substantial string, else overwrite
            const safeAssign = (current, incoming) => {
                if (current && String(current).length > 3 && current !== "Not available") return current;
                return incoming || current || "";
            };

            // Map the deep firmographics over based on actual Elasticsearch schema
            target.organization__website = safeAssign(target.organization__website, companyData.website || companyData.domain);
            
            // Extract Address from headquarter.address if available
            let addressLine = companyData.address || companyData.location || "";
            if (companyData.headquarter && companyData.headquarter.address) {
                addressLine = companyData.headquarter.address.line1 || addressLine;
                target.organization__city = safeAssign(target.organization__city, companyData.headquarter.address.city);
                target.organization__country = safeAssign(target.organization__country, companyData.headquarter.address.country);       
                target.organization__state = safeAssign(target.organization__state, companyData.headquarter.address.geographic_area);   
            }
            target.organization__address = safeAssign(target.organization__address, addressLine);

            // Fallback for location if headquarter is missing
            target.organization__city = safeAssign(target.organization__city, companyData.location_city || companyData.city);
            target.organization__country = safeAssign(target.organization__country, companyData.location_country || companyData.country);

            target.organization__founded_year = safeAssign(target.organization__founded_year, companyData.founded_year || companyData.founded_at);
            target.organization__annual_revenue = safeAssign(target.organization__annual_revenue, companyData.annual_revenue || companyData.revenue_min);
            
            // Extract Funding Data
            if (companyData.funding && companyData.funding.lastRound) {
                const lastRound = companyData.funding.lastRound;
                target.organization__latest_funding = safeAssign(target.organization__latest_funding, lastRound.type);
                
                if (lastRound.moneyRaised && lastRound.moneyRaised.amount) {
                    const amount = lastRound.moneyRaised.amount;
                    const currency = lastRound.moneyRaised.currencyCode || "USD";
                    const formattedFunding = `${amount} ${currency}`;
                    target.organization__latest_funding_amount = safeAssign(target.organization__latest_funding_amount, formattedFunding);
                    // We also map total_funding to this if it's the only round we have
                    target.organization__total_funding = safeAssign(target.organization__total_funding, formattedFunding);
                }
                
                if (lastRound.announcedOn) {
                    const { year, month, day } = lastRound.announcedOn;
                    if (year && month && day) {
                        target.organization__last_raised_at = safeAssign(target.organization__last_raised_at, `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
                    } else if (year && month) {
                        target.organization__last_raised_at = safeAssign(target.organization__last_raised_at, `${year}-${String(month).padStart(2, '0')}`);
                    }
                }
            }

            if (!target.organization__technologies || target.organization__technologies.length === 0) {
                target.organization__technologies = companyData.technologies || [];
            }
            
            // Also mirror to top level if it's a doc structure, just to be safe
            if (item.raw) {
                item.organization__website = target.organization__website;
                item.organization__city = target.organization__city;
                item.organization__country = target.organization__country;
                item.organization__state = target.organization__state;
                item.organization__address = target.organization__address;
                item.organization__founded_year = target.organization__founded_year;
                item.organization__annual_revenue = target.organization__annual_revenue;
                item.organization__latest_funding = target.organization__latest_funding;
                item.organization__latest_funding_amount = target.organization__latest_funding_amount;
                item.organization__total_funding = target.organization__total_funding;
                item.organization__last_raised_at = target.organization__last_raised_at;
                item.organization__technologies = target.organization__technologies;
            }
            console.log(`[Auto-Enrich] Hydrated target payload with funding: ${target.organization__total_funding} and founded: ${target.organization__founded_year}`);
        } else {
            console.log(`[Auto-Enrich] No company found in Elasticsearch for`, payload.filters.company_name);
        }
    } catch (err) {
        console.error("[Auto-Enrich] Failed to fetch company data from middleware:", err.message);
    }
    return item;
};

async function enrichItemFromCache(userId, item) {
  try {
    const publicId = item.public_identifier || "";
    const urls = [item.public_profile_url, item.linkedin_url, item.profile_url].filter(Boolean).map((v)=>String(v).trim());
    
    const orClauses = [];
    if (publicId) {
        orClauses.push({ 'raw.public_identifier': publicId });
        orClauses.push({ 'public_identifier': publicId });
    }
    urls.forEach(u => {
      orClauses.push({ 'raw.public_profile_url': u });
      orClauses.push({ 'raw.linkedin_url': u });
      orClauses.push({ 'raw.profile_url': u });
      orClauses.push({ 'linkedin_url': u });
    });

    if (orClauses.length === 0) return item;

    // Find all lists owned by the user to check if they've revealed this lead anywhere
    const userLists = await List.find({ createdBy: userId }).select('_id').lean();
    const listIds = userLists.map(l => l._id);

    if (listIds.length === 0) return item;

    // Look for the most complete cached item across all user lists
    const cacheItems = await ListItem.find({ listId: { $in: listIds }, $or: orClauses }).lean();
    
    if (!cacheItems || cacheItems.length === 0) return item;

    // Merge data from all found cache items to get the best email/phone
    const merged = { ...item };
    merged.raw = { ...(item.raw || {}) };

    for (const cacheItem of cacheItems) {
      if (!merged.email && (cacheItem.email || cacheItem.raw?.email)) {
        merged.email = cacheItem.email || cacheItem.raw?.email;
        merged.raw.email = merged.email;
      }
      if (!merged.phone && (cacheItem.phone || cacheItem.raw?.phone)) {
        merged.phone = cacheItem.phone || cacheItem.raw?.phone;
        merged.raw.phone = merged.phone;
      }
      if (!merged.contact__all_emails && Array.isArray(cacheItem.raw?.contact__all_emails)) {
        merged.contact__all_emails = cacheItem.raw.contact__all_emails;
        merged.raw.contact__all_emails = cacheItem.raw.contact__all_emails;
      }
      if (!merged.contact__phone_numbers && Array.isArray(cacheItem.raw?.contact__phone_numbers)) {
        merged.contact__phone_numbers = cacheItem.raw.contact__phone_numbers;
        merged.raw.contact__phone_numbers = cacheItem.raw.contact__phone_numbers;
      }
      if (!merged.email_status && cacheItem.raw?.email_status) {
        merged.email_status = cacheItem.raw.email_status;
        merged.raw.email_status = cacheItem.raw.email_status;
      }
      
      // Merge Firmographics
      const bestTechs = cacheItem.raw?.organization__current_technologies?.length ? cacheItem.raw.organization__current_technologies : (cacheItem.raw?.organization__technologies?.length ? cacheItem.raw.organization__technologies : (cacheItem.raw?.technologies?.length ? cacheItem.raw.technologies : []));
      if (!merged.raw.organization__technologies?.length && bestTechs.length) {
          merged.raw.organization__technologies = bestTechs;
          merged.raw.technologies = bestTechs;
          merged.raw.organization__current_technologies = bestTechs;
          merged.organization__technologies = bestTechs;
      }
      
      if (!merged.raw.organization__facebook_url && (cacheItem.raw?.organization__facebook_url || cacheItem.raw?.facebook_url)) {
          merged.raw.organization__facebook_url = cacheItem.raw.organization__facebook_url || cacheItem.raw.facebook_url;
          merged.raw.facebook_url = merged.raw.organization__facebook_url;
          merged.organization__facebook_url = merged.raw.organization__facebook_url;
      }
      
      if (!merged.raw.organization__twitter_url && (cacheItem.raw?.organization__twitter_url || cacheItem.raw?.twitter_url)) {
          merged.raw.organization__twitter_url = cacheItem.raw.organization__twitter_url || cacheItem.raw.twitter_url;
          merged.raw.twitter_url = merged.raw.organization__twitter_url;
          merged.organization__twitter_url = merged.raw.organization__twitter_url;
      }
      
      if (!merged.raw.organization__linkedin_url && (cacheItem.raw?.organization__linkedin_url || cacheItem.raw?.company_linkedin_url)) {
          merged.raw.organization__linkedin_url = cacheItem.raw.organization__linkedin_url || cacheItem.raw.company_linkedin_url;
          merged.organization__linkedin_url = merged.raw.organization__linkedin_url;
      }
      
      const firmFields = ['annual_revenue', 'total_funding', 'latest_funding', 'latest_funding_amount', 'last_raised_at', 'website', 'address', 'city', 'state', 'country', 'founded_year'];
      firmFields.forEach(f => {
          const orgF = `organization__${f}`;
          if (!merged.raw[orgF] && (cacheItem.raw?.[orgF] || cacheItem.raw?.[f])) {
              merged.raw[orgF] = cacheItem.raw[orgF] || cacheItem.raw[f];
              if (merged.raw[f] === undefined || merged.raw[f] === "") merged.raw[f] = merged.raw[orgF];
              merged[orgF] = merged.raw[orgF];
          }
      });
    }

    return merged;
  } catch {
    return item;
  }
}

    // Helper to sync to other lists (including hidden cache)
    const syncToOtherLists = async (item, publicId, urls, userId) => {
        const queryOr = [];
        if (publicId) queryOr.push({ public_identifier: publicId });
        urls.forEach(u => {
             queryOr.push({ public_profile_url: u });
             queryOr.push({ linkedin_url: u });
             queryOr.push({ 'raw.public_profile_url': u });
             queryOr.push({ 'raw.linkedin_url': u });
        });
        if (queryOr.length === 0) return;

        // Find all lists for user
        const allLists = await List.find({ createdBy: userId }).select('_id').lean();
        const allListIds = allLists.map(l => l._id);

        // Find matching items in ANY list (excluding current one being processed if needed, but safe to update all)
        const matches = await ListItem.find({
            listId: { $in: allListIds },
            $or: queryOr
        });

        for (const m of matches) {
            let modified = false;
            // Merge Phone
            if (item.phone) {
                if (!m.raw.phone || String(m.raw.phone) === 'Not available') {
                    m.raw.phone = item.phone;
                    m.phone = item.phone; // Update top level too
                    modified = true;
                }
                const existingPhones = Array.isArray(m.raw.contact__phone_numbers) ? m.raw.contact__phone_numbers : [];
                const mergedP = [...existingPhones];
                const pVal = item.phone || '';
                pVal.split(',').map(s=>s.trim()).filter(Boolean).forEach(v => {
                    const match = v.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
                    const num = match ? match[1].trim() : v;
                    const type = match ? match[2].trim() : '';
                    if (!mergedP.find(x => (x?.sanitized_number || x?.raw_number) === num)) {
                        mergedP.push({ sanitized_number: num, raw_number: num, type });
                    }
                });
                m.raw.contact__phone_numbers = mergedP;
                modified = true;
            }

            // Merge Email
            if (item.email) {
                 if (!m.raw.email || String(m.raw.email) === 'Not available') {
                    m.raw.email = item.email;
                    m.email = item.email;
                    modified = true;
                }
                const existingEmails = Array.isArray(m.raw.contact__all_emails) ? m.raw.contact__all_emails : [];
                const mergedE = [...existingEmails];
                const eVal = item.email || '';
                
                // Determine global status from item if available
                const globalStatus = item.email_status || item.raw?.email_status || "";
                // Fix: Check contact__all_emails first, then contact__emails
                const newEmails = Array.isArray(item.contact__all_emails) ? item.contact__all_emails : (Array.isArray(item.contact__emails) ? item.contact__emails : []);

                eVal.split(/[;,]+/).map(s=>s.trim()).filter(Boolean).forEach(em => {
                    const existing = mergedE.find(x => (x?.email || x?.sanitized_email) === em);
                    
                    // Try to find specific status for this email from input
                    const specific = newEmails.find(x => (x?.email || x?.sanitized_email) === em);
                    const specificStatus = specific?.verificationStatus || specific?.status || "";
                    
                    const finalStatus = specificStatus || globalStatus || 'unknown';

                    if (!existing) {
                        mergedE.push({ email: em, verificationStatus: finalStatus, status: finalStatus });
                    } else if (finalStatus && finalStatus !== 'unknown' && (!existing.verificationStatus || existing.verificationStatus === 'unknown')) {
                        // Upgrade status if we have a better one
                        existing.verificationStatus = finalStatus;
                        existing.status = finalStatus;
                    }
                });
                m.raw.contact__all_emails = mergedE;
                m.raw.email_status = globalStatus || m.raw.email_status; // Update top level status
                modified = true;
            }

            // Also merge standard fields like title, company, location, keywords, etc.
            if (item.title && (!m.title || m.title === "N/A")) { m.title = item.title; m.raw.title = item.title; modified = true; }
            if (item.company && (!m.company || m.company === "N/A")) { m.company = item.company; m.raw.company = item.company; modified = true; }
            if (item.location && (!m.location || m.location === "N/A")) { m.location = item.location; m.raw.location = item.location; modified = true; }
            if (item.headline && (!m.headline || m.headline === "N/A")) { m.headline = item.headline; m.raw.headline = item.headline; modified = true; }
            if (item.company_headcount && !m.company_headcount) { m.company_headcount = item.company_headcount; m.raw.company_headcount = item.company_headcount; modified = true; }
            if (item.seniority && !m.seniority) { m.seniority = item.seniority; m.raw.seniority = item.seniority; modified = true; }
            if (item.function && !m.function) { m.function = item.function; m.raw.function = item.function; modified = true; }
            if (item.organization__annual_revenue && !m.organization__annual_revenue) { m.organization__annual_revenue = item.organization__annual_revenue; m.raw.organization__annual_revenue = item.organization__annual_revenue; modified = true; }
            if (item.organization__latest_funding && !m.organization__latest_funding) { m.organization__latest_funding = item.organization__latest_funding; m.raw.organization__latest_funding = item.organization__latest_funding; modified = true; }
            if (item.organization__latest_funding_amount && !m.organization__latest_funding_amount) { m.organization__latest_funding_amount = item.organization__latest_funding_amount; m.raw.organization__latest_funding_amount = item.organization__latest_funding_amount; modified = true; }

            // Merge deep firmographics
            if (item.organization__facebook_url && !m.organization__facebook_url) { m.organization__facebook_url = item.organization__facebook_url; m.raw.organization__facebook_url = item.organization__facebook_url; modified = true; }
            if (item.facebook_url && !m.raw.facebook_url) { m.raw.facebook_url = item.facebook_url; modified = true; }
            
            if (item.organization__twitter_url && !m.organization__twitter_url) { m.organization__twitter_url = item.organization__twitter_url; m.raw.organization__twitter_url = item.organization__twitter_url; modified = true; }
            if (item.twitter_url && !m.raw.twitter_url) { m.raw.twitter_url = item.twitter_url; modified = true; }
            
            if (item.organization__linkedin_url && !m.organization__linkedin_url) { m.organization__linkedin_url = item.organization__linkedin_url; m.raw.organization__linkedin_url = item.organization__linkedin_url; modified = true; }
            if (item.organization__website && !m.organization__website) { m.organization__website = item.organization__website; m.raw.organization__website = item.organization__website; modified = true; }
            if (item.organization__address && !m.organization__address) { m.organization__address = item.organization__address; m.raw.organization__address = item.organization__address; modified = true; }
            if (item.organization__city && !m.organization__city) { m.organization__city = item.organization__city; m.raw.organization__city = item.organization__city; modified = true; }
            if (item.organization__country && !m.organization__country) { m.organization__country = item.organization__country; m.raw.organization__country = item.organization__country; modified = true; }
            if (item.organization__state && !m.organization__state) { m.organization__state = item.organization__state; m.raw.organization__state = item.organization__state; modified = true; }
            if (item.organization__founded_year && !m.organization__founded_year) { m.organization__founded_year = item.organization__founded_year; m.raw.organization__founded_year = item.organization__founded_year; modified = true; }
            if (item.organization__total_funding && !m.organization__total_funding) { m.organization__total_funding = item.organization__total_funding; m.raw.organization__total_funding = item.organization__total_funding; modified = true; }
            if (item.organization__last_raised_at && !m.organization__last_raised_at) { m.organization__last_raised_at = item.organization__last_raised_at; m.raw.organization__last_raised_at = item.organization__last_raised_at; modified = true; }

            // Arrays
            const mergeArray = (a, b) => Array.from(new Set([...(Array.isArray(a)?a:[]), ...(Array.isArray(b)?b:[])].filter(Boolean)));
            if (item.industry && item.industry.length > 0) { m.industry = mergeArray(m.industry, item.industry); m.raw.industry = m.industry; modified = true; }
            if (item.organization__industry && item.organization__industry.length > 0) { m.organization__industry = mergeArray(m.organization__industry, item.organization__industry); m.raw.organization__industry = m.organization__industry; modified = true; }
            if (item.keywords && item.keywords.length > 0) { m.keywords = mergeArray(m.keywords, item.keywords); m.raw.keywords = m.keywords; modified = true; }
            
            // Handle all technology arrays
            const sourceTechs = item.organization__current_technologies?.length ? item.organization__current_technologies : (item.organization__technologies?.length ? item.organization__technologies : (item.technologies?.length ? item.technologies : []));
            if (sourceTechs.length > 0) { 
                m.organization__technologies = mergeArray(m.organization__technologies, sourceTechs); 
                m.raw.organization__technologies = mergeArray(m.raw.organization__technologies, sourceTechs);
                m.raw.technologies = mergeArray(m.raw.technologies, sourceTechs);
                m.raw.organization__current_technologies = mergeArray(m.raw.organization__current_technologies, sourceTechs);
                modified = true; 
            }

            if (modified) {
                m.markModified('raw');
                await m.save();
            }
        }
    };

exports.createList = async (req, res) => {
  const { name, listType } = req.body;
  const userId = req.user.sub || req.user.id || req.user._id; 
  if (!name) {
    return res.status(400).json({ msg: "List name is required" });
  }

  try {
    const list = await List.create({
      name,
      createdBy: userId, // from isAuthenticated middleware
      listType: listType || "people"
    });

    try {
      await ListKind.updateOne({ listId: list._id }, { $set: { kind: 'user_made' } }, { upsert: true });
    } catch {}

    res.status(201).json({ msg: "List created successfully", list });
  } catch (err) {
    res.status(500).json({ msg: "Server error", error: err.message });
  }
};

exports.createListFromExtension = async (req, res) => {
  const { name, listType } = req.body;
  const userId = req.user.sub || req.user.id || req.user._id;
  if (!name) {
    return res.status(400).json({ msg: "List name is required" });
  }

  try {
    const list = await List.create({
      name,
      createdBy: userId,
      status: "active",
      listType: listType || "people"
    });

    try {
      await ListKind.updateOne({ listId: list._id }, { $set: { kind: 'user_made' } }, { upsert: true });
    } catch {}

    res.status(201).json({ msg: "List created successfully", list });
  } catch (err) {
    res.status(500).json({ msg: "Server error", error: err.message });
  }
};

exports.createAIList = async (req, res) => {
  const { name } = req.body;
  const userId = req.user.sub || req.user.id || req.user._id;
  if (!name) {
    return res.status(400).json({ msg: "List name is required" });
  }
  try {
    const list = await List.create({ name, createdBy: userId });
    await ListKind.updateOne({ listId: list._id }, { $set: { kind: 'ai_query' } }, { upsert: true });
    return res.status(201).json({ msg: "List created successfully", list });
  } catch (err) {
    return res.status(500).json({ msg: "Server error", error: err.message });
  }
};

exports.createRevealedSearchResultsList = async (req, res) => {
  const userId = req.user.sub || req.user.id || req.user._id;
  const defaultName = 'saved leads';
  try {
    const names = ['saved leads', 'revealed search results'];
    let listDoc = await List.findOne({ name: { $in: names }, createdBy: userId });
    if (!listDoc) {
      listDoc = await List.create({ name: defaultName, createdBy: userId, status: 'active' });
    } else if (String(listDoc.name).toLowerCase() !== defaultName) {
      listDoc.name = defaultName;
      await listDoc.save();
    }
    const list = listDoc.toObject();
    await ListKind.updateOne({ listId: list._id }, { $set: { kind: 'revealed_search_results' } }, { upsert: true });
    return res.status(201).json({ msg: "List ready", list });
  } catch (err) {
    return res.status(500).json({ msg: "Server error", error: err.message });
  }
};

// Helper function to handle the actual insertion and deduplication logic
const performBulkInsert = async (listId, userId, items, remainingCount, revealType, isManualSelection = false) => {
  if (!items || !Array.isArray(items) || items.length === 0) {
    return 0;
  }

  // 1. Extract identifiers to check for duplicates
  const publicIdentifiers = items.map(item => item.public_identifier).filter(id => id);
  const linkedinUrls = items.map(item => item.linkedin_url).filter(url => url);
  const personIds = items.map(item => item.person_id).filter(id => id);

  // 2. Find existing items in this list to prevent duplicates
  const existingItems = await ListItem.find({
      listId,
      $or: [
          { public_identifier: { $in: publicIdentifiers } },
          { linkedin_url: { $in: linkedinUrls } },
          { person_id: { $in: personIds } }
      ]
  }).select('public_identifier linkedin_url person_id');

  // 3. Filter out items that already exist in this list
    let newItems = items.filter(item => {
        return !existingItems.some(existing =>
            (existing.public_identifier && item.public_identifier && existing.public_identifier === item.public_identifier) ||
            (existing.linkedin_url && item.linkedin_url && existing.linkedin_url === item.linkedin_url) ||
            (existing.person_id && item.person_id && existing.person_id === item.person_id)
        );
    });

    if (newItems.length === 0) return 0;

    // 4. Enrich new items with previously revealed contact info from the hidden cache AND company firmographics
  let enrichedItems = newItems;
  if (userId) {
    enrichedItems = await Promise.all(newItems.map(async (item) => {
      try {
        let enriched = await enrichItemFromCache(userId, item);
        enriched = enriched || item;
        
        // --- NEW: Auto-enrich missing firmographics from Elasticsearch ---
        enriched = await autoEnrichCompanyFirmographics(enriched);
        
        return enriched;
      } catch (e) {
        return item; // Fallback to original item if enrichment fails
      }
    }));
  }

  // 5. If this is a Bulk Reveal AND it's NOT a manual selection, filter out leads the user already has the requested data for
  // If it IS a manual selection, we want to save exactly what the user checked, even if they already revealed it!
  if (revealType && revealType !== 'none' && !isManualSelection) {
      enrichedItems = enrichedItems.filter(item => {
          const hasValidEmail = item.email && item.email !== "Not available" && !String(item.email).includes('*');
          const hasValidPhone = item.phone && item.phone !== "Not available" && !String(item.phone).includes('*');
          
          if (revealType === 'email') return !hasValidEmail; // Keep if NO valid email
          if (revealType === 'phone') return !hasValidPhone; // Keep if NO valid phone
          if (revealType === 'both') return !(hasValidEmail && hasValidPhone); // Keep if missing either
          return true;
      });
  }

  // 6. Slice to remainingCount if specified so we don't insert more than requested
  if (remainingCount !== null && remainingCount !== undefined && !isManualSelection) {
      enrichedItems = enrichedItems.slice(0, remainingCount);
  }

  if (enrichedItems.length === 0) return 0;

  // --- CREDIT DEDUCTION FOR COMPANIES ---
  const list = await List.findById(listId).select('listType');
  if (list && list.listType === 'companies') {
      const { getBalanceForUser, deductCreditsForUser } = require('../utils/wallet');
      const currentCredits = await getBalanceForUser(userId);
      const availableCredits = currentCredits.scope === "org" 
          ? (currentCredits.balance + currentCredits.personalCredits) 
          : currentCredits.balance;

      if (availableCredits < enrichedItems.length) {
          // Adjust the number of items we save to what they can afford
          const affordableCount = availableCredits;
          if (affordableCount <= 0) {
              throw { status: 402, message: "Insufficient credits to save companies." };
          }
          enrichedItems = enrichedItems.slice(0, affordableCount);
      }
      
      if (enrichedItems.length > 0) {
          // Deduct credits
          await deductCreditsForUser(userId, enrichedItems.length, `Bulk Save Companies deduction for ${enrichedItems.length} companies`);
      }
  }

  // Format explicitly for insertMany to ensure firmographics are pulled up to top-level Document fields
  const formattedItems = enrichedItems.map(workingItem => {
    const raw = workingItem.raw || workingItem;
    const publicId = workingItem.public_identifier || raw.public_identifier || "";
    const personId = workingItem.id || workingItem.person_id || raw.person_id || publicId || "";
    
    return {
      listId,
      person_id: personId,
      industry: workingItem.industry || raw.industry || [],
      name: workingItem.name || raw.name || "",
      public_identifier: publicId,
      linkedin_url: workingItem.linkedin_url || raw.linkedin_url || "",
      public_profile_url: workingItem.public_profile_url || raw.public_profile_url || "",
      profile_url: workingItem.profile_url || raw.profile_url || "",
      profile_picture_url: workingItem.profile_picture_url || raw.profile_picture_url || "",
      profile_picture_url_large: workingItem.profile_picture_url_large || raw.profile_picture_url_large || "",
      network_distance: workingItem.network_distance || raw.network_distance || "",
      location: workingItem.location || raw.location || "",
      headline: workingItem.headline || raw.headline || "",
      current_positions: workingItem.current_positions || raw.current_positions || {},
      email: workingItem.email || raw.email || "",
      phone: workingItem.phone || raw.phone || "",
      second_phone: workingItem.second_phone || raw.second_phone || "",
      status: workingItem.status || raw.status || "",
      title: workingItem.title || raw.title || "",
      company: workingItem.company || raw.company || "",
      city: workingItem.city || raw.city || "",
      state: workingItem.state || raw.state || "",
      country: workingItem.country || raw.country || "",
      company_headcount: workingItem.company_headcount || raw.company_headcount || "",
      organization__industry: workingItem.organization__industry || raw.organization__industry || [],
      organization__website: workingItem.organization__website || raw.organization__website || "",
      organization__linkedin_url: workingItem.organization__linkedin_url || raw.organization__linkedin_url || "",
      organization__facebook_url: workingItem.organization__facebook_url || raw.organization__facebook_url || "",
      organization__twitter_url: workingItem.organization__twitter_url || raw.organization__twitter_url || "",
      organization__address: workingItem.organization__address || raw.organization__address || "",
      organization__city: workingItem.organization__city || raw.organization__city || "",
      organization__state: workingItem.organization__state || raw.organization__state || "",
      organization__country: workingItem.organization__country || raw.organization__country || "",
      organization__technologies: workingItem.organization__technologies || raw.organization__technologies || [],
      organization__founded_year: workingItem.organization__founded_year || raw.organization__founded_year || "",
      organization__total_funding: workingItem.organization__total_funding || raw.organization__total_funding || "",
      organization__latest_funding: workingItem.organization__latest_funding || raw.organization__latest_funding || "",
      organization__latest_funding_amount: workingItem.organization__latest_funding_amount || raw.organization__latest_funding_amount || "",
      organization__last_raised_at: workingItem.organization__last_raised_at || raw.organization__last_raised_at || "",
      organization__annual_revenue: workingItem.organization__annual_revenue || raw.organization__annual_revenue || "",
      seniority: workingItem.seniority || raw.seniority || "",
      function: workingItem.department || workingItem.job_function || workingItem.function || raw.function || "",
      keywords: workingItem.keywords || raw.keywords || [],
      raw: raw
    };
  });

  await ListItem.insertMany(formattedItems, { ordered: false });
  
  // Sync all bulk inserted items to other lists
  for (const item of formattedItems) {
      const publicId = item.public_identifier || "";
      const urls = [item.public_profile_url, item.linkedin_url, item.profile_url].filter(Boolean).map(v => String(v).trim());
      await syncToOtherLists(item.raw, publicId, urls, userId);
  }
  
  // Update the list count in List model
  const totalLeads = await ListItem.countDocuments({ listId });
  await List.findByIdAndUpdate(listId, { itemCount: totalLeads });

  return enrichedItems.length;
};

exports.addListItems = async (req, res) => {
  const { listId } = req.params;
  const items = Array.isArray(req.body) ? req.body : [req.body];

  if (!listId || items.length === 0) {
    return res.status(400).json({ msg: "List ID and at least one item are required." });
  }

  try {
    // Ownership check
    const ownerList = await List.findById(listId).lean();
    const userId = req.user.sub || req.user.id || req.user._id;
    if (!ownerList || String(ownerList.createdBy) !== String(userId)) {
      return res.status(404).json({ msg: 'List not found or access denied' });
    }
    const kindRec = await ListKind.findOne({ listId });
    const kind = kindRec?.kind || 'user_made';
    if (kind !== 'user_made') {
      return res.status(403).json({ msg: 'Cannot add items to this list type' });
    }
    let added = 0;
    let updated = 0;
    for (const item of items) {
      let enriched = await enrichItemFromCache(userId, item);
      enriched = enriched || item;
      
      // --- NEW: Auto-enrich missing firmographics from Elasticsearch ---
      let workingItem = await autoEnrichCompanyFirmographics(enriched);
      
      const publicId = item.public_identifier || "";
      const personId = item.id || item.person_id || publicId || "";
      const urls = [item.public_profile_url, item.linkedin_url, item.profile_url].filter(Boolean).map((v)=>String(v).trim());
      const queryOr = [];
      if (personId) queryOr.push({ person_id: personId });
      if (publicId) queryOr.push({ public_identifier: publicId });
      urls.forEach((u)=>{
        queryOr.push({ public_profile_url: u });
        queryOr.push({ linkedin_url: u });
        queryOr.push({ profile_url: u });
        queryOr.push({ 'raw.public_profile_url': u });
        queryOr.push({ 'raw.linkedin_url': u });
        queryOr.push({ 'raw.profile_url': u });
      });
      const existing = queryOr.length
        ? await ListItem.findOne({ listId, $or: queryOr })
        : null;
      if (existing) {
        const mergeArray = (a, b) => {
          const A = Array.isArray(a) ? a : (typeof a === 'string' && a ? [a] : []);
          const B = Array.isArray(b) ? b : (typeof b === 'string' && b ? [b] : []);
          const set = new Set([...A, ...B].filter((v)=>v!=null));
          return Array.from(set);
        };
        const mergeEmails = (a, b) => {
          const A = Array.isArray(a) ? a : [];
          const B = Array.isArray(b) ? b : [];
          const map = new Map();
          
          [...A, ...B].forEach((e) => {
            if (!e) return;
            const addr = e.email || e.sanitized_email;
            if (!addr) return;
            const key = String(addr).toLowerCase();
            const existing = map.get(key);
            
            // If it's new, just add it
            if (!existing) {
                map.set(key, e);
                return;
            }
            
            // If it exists, determine if we should upgrade the status
            const currentStatus = existing.verificationStatus || existing.status || "";
            const newStatus = e.verificationStatus || e.status || "";
            
            // If new one has status and current doesn't, or new one is generally "better" (non-empty is better than empty)
            if (newStatus && !currentStatus) {
                map.set(key, e);
            } else if (newStatus && currentStatus) {
                // If both have status, prefer the one from B (the later one in the loop) which acts as an update
                // Or we could implement ranking here, but preferring the latest (B) is usually correct for updates
                map.set(key, e);
            }
          });
          return Array.from(map.values());
        };
        const mergePhones = (a, b) => {
          const A = Array.isArray(a) ? a : [];
          const B = Array.isArray(b) ? b : [];
          const out = [];
          const canon = (n)=> String(n||'').replace(/[^+\d]/g,'');
          const seen = new Set();
          [...A, ...B].forEach((p)=>{
            if (!p) return;
            const num = p.sanitized_number || p.raw_number;
            if (!num) return;
            const key = canon(num);
            if (key && !seen.has(key)) { seen.add(key); out.push(p); }
          });
          return out;
        };
      // Update the fields in the top-level document too
      const setFields = {
        person_id: personId || existing.person_id || "",
        name: workingItem.name || existing.name || "",
        public_identifier: publicId || existing.public_identifier || "",
        linkedin_url: workingItem.linkedin_url || existing.linkedin_url || "",
        public_profile_url: workingItem.public_profile_url || existing.public_profile_url || "",
        profile_url: workingItem.profile_url || existing.profile_url || "",
        profile_picture_url: workingItem.profile_picture_url || existing.profile_picture_url || "",
        profile_picture_url_large: workingItem.profile_picture_url_large || existing.profile_picture_url_large || "",
        network_distance: workingItem.network_distance || existing.network_distance || "",
        location: workingItem.location || existing.location || "",
        headline: workingItem.headline || existing.headline || "",
        current_positions: workingItem.current_positions || existing.current_positions || {},
        industry: mergeArray(existing.industry, workingItem.industry),
        email: workingItem.email || existing.email || "",
        second_phone: workingItem.second_phone || existing.second_phone || "",
        phone: workingItem.phone || existing.phone || "",
        // Top-level mapped fields that need updating
        title: workingItem.title || existing.title || "",
        company: workingItem.company || existing.company || "",
        city: workingItem.city || existing.city || "",
        state: workingItem.state || existing.state || "",
        country: workingItem.country || existing.country || "",
        company_headcount: workingItem.company_headcount || existing.company_headcount || "",
        organization__industry: mergeArray(existing.organization__industry, workingItem.organization__industry),
        organization__website: workingItem.organization__website || existing.organization__website || "",
        organization__linkedin_url: workingItem.organization__linkedin_url || existing.organization__linkedin_url || "",
        organization__facebook_url: workingItem.organization__facebook_url || existing.organization__facebook_url || "",
        organization__twitter_url: workingItem.organization__twitter_url || existing.organization__twitter_url || "",
        organization__address: workingItem.organization__address || existing.organization__address || "",
        organization__city: workingItem.organization__city || existing.organization__city || "",
        organization__state: workingItem.organization__state || existing.organization__state || "",
        organization__country: workingItem.organization__country || existing.organization__country || "",
        organization__technologies: mergeArray(existing.organization__technologies, workingItem.organization__technologies),
        organization__founded_year: workingItem.organization__founded_year || existing.organization__founded_year || "",
        organization__total_funding: workingItem.organization__total_funding || existing.organization__total_funding || "",
        organization__latest_funding: workingItem.organization__latest_funding || existing.organization__latest_funding || "",
        organization__latest_funding_amount: workingItem.organization__latest_funding_amount || existing.organization__latest_funding_amount || "",
        organization__last_raised_at: workingItem.organization__last_raised_at || existing.organization__last_raised_at || "",
        organization__annual_revenue: workingItem.organization__annual_revenue || existing.organization__annual_revenue || "",
        seniority: workingItem.seniority || existing.seniority || "",
        function: workingItem.function || existing.function || "",
        keywords: mergeArray(existing.keywords, workingItem.keywords),
      };
        const newRaw = Object.assign({}, existing.raw || {}, workingItem || {});
        newRaw.contact__all_emails = mergeEmails(existing.raw?.contact__all_emails, workingItem?.contact__all_emails || workingItem?.contact__emails);
        newRaw.contact__phone_numbers = mergePhones(existing.raw?.contact__phone_numbers, workingItem?.contact__phone_numbers);
        
        // Sync Status if provided in item
        if (workingItem.email_status) newRaw.email_status = workingItem.email_status;
        
        await ListItem.updateOne({ _id: existing._id }, { $set: { ...setFields, raw: newRaw } });
        updated++;
      } else {
        const doc = {
          listId,
          person_id: personId,
          industry: item.industry || [],
          name: workingItem.name || "",
          public_identifier: publicId,
          linkedin_url: workingItem.linkedin_url || "",
          public_profile_url: workingItem.public_profile_url || "",
          profile_url: workingItem.profile_url || "",
          profile_picture_url: workingItem.profile_picture_url || "",
          profile_picture_url_large: workingItem.profile_picture_url_large || "",
          network_distance: workingItem.network_distance || "",
          location: workingItem.location || "",
          headline: workingItem.headline || "",
          current_positions: workingItem.current_positions || {},
          email: workingItem.email || "",
          phone: workingItem.phone || "",
          second_phone: workingItem.second_phone || "",
          status: "",
          // Top-level mapped fields that need initializing on creation
          title: workingItem.title || "",
          company: workingItem.company || "",
          city: workingItem.city || "",
          state: workingItem.state || "",
          country: workingItem.country || "",
          company_headcount: workingItem.company_headcount || "",
          organization__industry: workingItem.organization__industry || [],
          organization__website: workingItem.organization__website || "",
          organization__linkedin_url: workingItem.organization__linkedin_url || "",
          organization__facebook_url: workingItem.organization__facebook_url || "",
          organization__twitter_url: workingItem.organization__twitter_url || "",
          organization__address: workingItem.organization__address || "",
          organization__city: workingItem.organization__city || "",
          organization__state: workingItem.organization__state || "",
          organization__country: workingItem.organization__country || "",
          organization__technologies: workingItem.organization__technologies || [],
          organization__founded_year: workingItem.organization__founded_year || "",
          organization__total_funding: workingItem.organization__total_funding || "",
          organization__latest_funding: workingItem.organization__latest_funding || "",
          organization__latest_funding_amount: workingItem.organization__latest_funding_amount || "",
          organization__last_raised_at: workingItem.organization__last_raised_at || "",
          organization__annual_revenue: workingItem.organization__annual_revenue || "",
          seniority: workingItem.seniority || "",
          function: workingItem.function || "",
          keywords: workingItem.keywords || [],
          raw: workingItem
        };

        // If creating a new record, automatically sync from existing revealed duplicate leads just to be 100% safe
        try {
           const searchUrl = (doc.public_profile_url || doc.linkedin_url || doc.profile_url || "").trim();
           if (searchUrl) {
              const List = require('../models/List');
              const userLists = await List.find({ createdBy: userId }).select('_id').lean();
              const userListIds = userLists.map(l => l._id);
              
              const toRegex = (val) => new RegExp(`^${String(val).replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}$`, 'i');
              const searchUrlAlt = searchUrl.endsWith('/') ? searchUrl.slice(0, -1) : searchUrl + '/';
              
              const otherMatch = await ListItem.findOne({
                 listId: { $in: userListIds },
                 $and: [
                   {
                     $or: [
                       { 'raw.public_profile_url': { $in: [toRegex(searchUrl), toRegex(searchUrlAlt)] } },
                       { 'raw.linkedin_url': { $in: [toRegex(searchUrl), toRegex(searchUrlAlt)] } },
                       { 'raw.profile_url': { $in: [toRegex(searchUrl), toRegex(searchUrlAlt)] } }
                     ]
                   },
                   {
                     $or: [
                       { 'raw.organization__technologies': { $exists: true, $not: { $size: 0 } } },
                       { 'raw.technologies': { $exists: true, $not: { $size: 0 } } },
                       { 'raw.organization__current_technologies': { $exists: true, $not: { $size: 0 } } },
                       { 'raw.facebook_url': { $exists: true, $ne: "" } },
                       { 'raw.organization__facebook_url': { $exists: true, $ne: "" } }
                     ]
                   }
                 ]
              }).lean();
              
              if (otherMatch && otherMatch.raw) {
                 const oRaw = otherMatch.raw;
                 console.log("Found duplicate with firmographics, copying to new lead:", searchUrl, "from List:", otherMatch.listId);
                 
                 // Resolve the best firmographic values from the duplicate
                 const bestTechs = oRaw.organization__current_technologies?.length ? oRaw.organization__current_technologies : (oRaw.organization__technologies?.length ? oRaw.organization__technologies : (oRaw.technologies?.length ? oRaw.technologies : []));
                 const bestFb = oRaw.organization__facebook_url || oRaw.facebook_url || "";
                 const bestTw = oRaw.organization__twitter_url || oRaw.twitter_url || "";
                 const bestRev = oRaw.organization__annual_revenue || oRaw.annual_revenue || "";
                 const bestTotFund = oRaw.organization__total_funding || oRaw.total_funding || "";
                 const bestLatFund = oRaw.organization__latest_funding || oRaw.latest_funding || "";
                 const bestLatFundAmt = oRaw.organization__latest_funding_amount || oRaw.latest_funding_amount || "";
                 const bestLastRaised = oRaw.organization__last_raised_at || oRaw.last_raised_at || "";

                 // Merge deep firmographics from duplicate into doc.raw
                 if (!doc.raw.organization__technologies?.length && bestTechs.length) doc.raw.organization__technologies = bestTechs;
                 if (!doc.raw.technologies?.length && bestTechs.length) doc.raw.technologies = bestTechs;
                 if (!doc.raw.organization__current_technologies?.length && bestTechs.length) doc.raw.organization__current_technologies = bestTechs;
                 if (!doc.raw.organization__facebook_url && bestFb) doc.raw.organization__facebook_url = bestFb;
                 if (!doc.raw.facebook_url && bestFb) doc.raw.facebook_url = bestFb;
                 if (!doc.raw.organization__twitter_url && bestTw) doc.raw.organization__twitter_url = bestTw;
                 if (!doc.raw.twitter_url && bestTw) doc.raw.twitter_url = bestTw;
                 if (!doc.raw.organization__annual_revenue && bestRev) doc.raw.organization__annual_revenue = bestRev;
                 if (!doc.raw.annual_revenue && bestRev) doc.raw.annual_revenue = bestRev;
                 if (!doc.raw.organization__total_funding && bestTotFund) doc.raw.organization__total_funding = bestTotFund;
                 if (!doc.raw.total_funding && bestTotFund) doc.raw.total_funding = bestTotFund;
                 if (!doc.raw.organization__latest_funding && bestLatFund) doc.raw.organization__latest_funding = bestLatFund;
                 if (!doc.raw.latest_funding && bestLatFund) doc.raw.latest_funding = bestLatFund;
                 if (!doc.raw.organization__latest_funding_amount && bestLatFundAmt) doc.raw.organization__latest_funding_amount = bestLatFundAmt;
                 if (!doc.raw.latest_funding_amount && bestLatFundAmt) doc.raw.latest_funding_amount = bestLatFundAmt;
                 if (!doc.raw.organization__last_raised_at && bestLastRaised) doc.raw.organization__last_raised_at = bestLastRaised;
                 if (!doc.raw.last_raised_at && bestLastRaised) doc.raw.last_raised_at = bestLastRaised;
                 
                 // Merge deep firmographics into top-level doc
                 if (!doc.organization__facebook_url && bestFb) doc.organization__facebook_url = bestFb;
                 if (!doc.organization__twitter_url && bestTw) doc.organization__twitter_url = bestTw;
                 if (!doc.organization__technologies?.length && bestTechs.length) doc.organization__technologies = bestTechs;
                 if (!doc.organization__annual_revenue && bestRev) doc.organization__annual_revenue = bestRev;
                 if (!doc.organization__total_funding && bestTotFund) doc.organization__total_funding = bestTotFund;
                 if (!doc.organization__latest_funding && bestLatFund) doc.organization__latest_funding = bestLatFund;
                 if (!doc.organization__latest_funding_amount && bestLatFundAmt) doc.organization__latest_funding_amount = bestLatFundAmt;
                 if (!doc.organization__last_raised_at && bestLastRaised) doc.organization__last_raised_at = bestLastRaised;
              } else {
                 console.log("No duplicate with firmographics found for:", searchUrl);
              }
           }
        } catch (e) {
           console.error("Auto-sync firmographics on add item failed:", e);
        }

        await ListItem.create(doc);
        added++;
      }
      
      // SYNC TO OTHER LISTS (Manual Reveal Sync)
      // Pass workingItem so we sync the enriched firmographics as well
      await syncToOtherLists(workingItem, publicId, urls, userId);
    }

    res.status(201).json({
      msg: "List item(s) processed",
      added,
      updated
    });
  } catch (error) {
    res.status(500).json({ msg: "Error adding items", error: error.message });
  }
};

// Allow server-side auto-add to special saved leads list
exports.addListItemsToSpecial = async (req, res) => {
  const { listId } = req.params;
  const items = Array.isArray(req.body) ? req.body : [req.body];
  if (!listId || items.length === 0) {
    return res.status(400).json({ msg: "List ID and at least one item are required." });
  }
  try {
    const listDoc = await List.findById(listId).lean();
    const userId = req.user.sub || req.user.id || req.user._id;
    if (!listDoc || String(listDoc.createdBy) !== String(userId)) {
      return res.status(404).json({ msg: 'List not found or access denied' });
    }
    const kindRec = await ListKind.findOne({ listId }).lean();
    const kind = kindRec?.kind || 'user_made';
    if (kind !== 'revealed_search_results') {
      return res.status(403).json({ msg: 'Only saved leads list can accept auto-added items' });
    }
    let added = 0;
    let updated = 0;
    const RevealedContact = require('../models/RevealedContact');

    // Helper to sync to other lists (including hidden cache)
    const syncToOtherLists = async (item, publicId, urls, userId) => {
        const queryOr = [];
        if (publicId) queryOr.push({ public_identifier: publicId });
        urls.forEach(u => {
             queryOr.push({ public_profile_url: u });
             queryOr.push({ linkedin_url: u });
             queryOr.push({ 'raw.public_profile_url': u });
             queryOr.push({ 'raw.linkedin_url': u });
        });
        if (queryOr.length === 0) return;

        // Find all lists for user
        const allLists = await List.find({ createdBy: userId }).select('_id').lean();
        const allListIds = allLists.map(l => l._id);

        // Find matching items in ANY list (excluding current one being processed if needed, but safe to update all)
        const matches = await ListItem.find({
            listId: { $in: allListIds },
            $or: queryOr
        });

        for (const m of matches) {
            let modified = false;
            // Merge Phone
            if (item.phone) {
                if (!m.raw.phone || String(m.raw.phone) === 'Not available') {
                    m.raw.phone = item.phone;
                    m.phone = item.phone; // Update top level too
                    modified = true;
                }
                const existingPhones = Array.isArray(m.raw.contact__phone_numbers) ? m.raw.contact__phone_numbers : [];
                const mergedP = [...existingPhones];
                const pVal = item.phone || '';
                pVal.split(',').map(s=>s.trim()).filter(Boolean).forEach(v => {
                    const match = v.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
                    const num = match ? match[1].trim() : v;
                    const type = match ? match[2].trim() : '';
                    if (!mergedP.find(x => (x?.sanitized_number || x?.raw_number) === num)) {
                        mergedP.push({ sanitized_number: num, raw_number: num, type });
                    }
                });
                m.raw.contact__phone_numbers = mergedP;
                modified = true;
            }

            // Merge Email
            if (item.email) {
                 if (!m.raw.email || String(m.raw.email) === 'Not available') {
                    m.raw.email = item.email;
                    m.email = item.email;
                    modified = true;
                }
                const existingEmails = Array.isArray(m.raw.contact__all_emails) ? m.raw.contact__all_emails : [];
                const mergedE = [...existingEmails];
                const eVal = item.email || '';
                
                // Determine global status from item if available
                const globalStatus = item.email_status || item.raw?.email_status || "";
                
                eVal.split(/[;,]+/).map(s=>s.trim()).filter(Boolean).forEach(em => {
                    const existing = mergedE.find(x => (x?.email || x?.sanitized_email) === em);
                    if (!existing) {
                        mergedE.push({ email: em, verificationStatus: globalStatus || 'unknown', status: globalStatus || 'unknown' });
                    } else if (globalStatus && (!existing.verificationStatus || existing.verificationStatus === 'unknown')) {
                        // Upgrade status if we have a better one
                        existing.verificationStatus = globalStatus;
                        existing.status = globalStatus;
                    }
                });
                m.raw.contact__all_emails = mergedE;
                m.raw.email_status = globalStatus || m.raw.email_status; // Update top level status
                modified = true;
            }

            // Also merge standard fields like title, company, location, keywords, etc.
            if (item.title && (!m.title || m.title === "N/A")) { m.title = item.title; m.raw.title = item.title; modified = true; }
            if (item.company && (!m.company || m.company === "N/A")) { m.company = item.company; m.raw.company = item.company; modified = true; }
            if (item.location && (!m.location || m.location === "N/A")) { m.location = item.location; m.raw.location = item.location; modified = true; }
            if (item.headline && (!m.headline || m.headline === "N/A")) { m.headline = item.headline; m.raw.headline = item.headline; modified = true; }
            if (item.company_headcount && !m.company_headcount) { m.company_headcount = item.company_headcount; m.raw.company_headcount = item.company_headcount; modified = true; }
            if (item.seniority && !m.seniority) { m.seniority = item.seniority; m.raw.seniority = item.seniority; modified = true; }
            if (item.function && !m.function) { m.function = item.function; m.raw.function = item.function; modified = true; }
            if (item.organization__annual_revenue && !m.organization__annual_revenue) { m.organization__annual_revenue = item.organization__annual_revenue; m.raw.organization__annual_revenue = item.organization__annual_revenue; modified = true; }
            if (item.organization__latest_funding && !m.organization__latest_funding) { m.organization__latest_funding = item.organization__latest_funding; m.raw.organization__latest_funding = item.organization__latest_funding; modified = true; }
            if (item.organization__latest_funding_amount && !m.organization__latest_funding_amount) { m.organization__latest_funding_amount = item.organization__latest_funding_amount; m.raw.organization__latest_funding_amount = item.organization__latest_funding_amount; modified = true; }

            // Merge deep firmographics
            if (item.organization__facebook_url && !m.organization__facebook_url) { m.organization__facebook_url = item.organization__facebook_url; m.raw.organization__facebook_url = item.organization__facebook_url; modified = true; }
            if (item.facebook_url && !m.raw.facebook_url) { m.raw.facebook_url = item.facebook_url; modified = true; }
            
            if (item.organization__twitter_url && !m.organization__twitter_url) { m.organization__twitter_url = item.organization__twitter_url; m.raw.organization__twitter_url = item.organization__twitter_url; modified = true; }
            if (item.twitter_url && !m.raw.twitter_url) { m.raw.twitter_url = item.twitter_url; modified = true; }
            
            if (item.organization__linkedin_url && !m.organization__linkedin_url) { m.organization__linkedin_url = item.organization__linkedin_url; m.raw.organization__linkedin_url = item.organization__linkedin_url; modified = true; }
            if (item.organization__website && !m.organization__website) { m.organization__website = item.organization__website; m.raw.organization__website = item.organization__website; modified = true; }
            if (item.organization__address && !m.organization__address) { m.organization__address = item.organization__address; m.raw.organization__address = item.organization__address; modified = true; }
            if (item.organization__city && !m.organization__city) { m.organization__city = item.organization__city; m.raw.organization__city = item.organization__city; modified = true; }
            if (item.organization__country && !m.organization__country) { m.organization__country = item.organization__country; m.raw.organization__country = item.organization__country; modified = true; }
            if (item.organization__state && !m.organization__state) { m.organization__state = item.organization__state; m.raw.organization__state = item.organization__state; modified = true; }
            if (item.organization__founded_year && !m.organization__founded_year) { m.organization__founded_year = item.organization__founded_year; m.raw.organization__founded_year = item.organization__founded_year; modified = true; }
            if (item.organization__total_funding && !m.organization__total_funding) { m.organization__total_funding = item.organization__total_funding; m.raw.organization__total_funding = item.organization__total_funding; modified = true; }
            if (item.organization__last_raised_at && !m.organization__last_raised_at) { m.organization__last_raised_at = item.organization__last_raised_at; m.raw.organization__last_raised_at = item.organization__last_raised_at; modified = true; }

            // Arrays
            const mergeArray = (a, b) => Array.from(new Set([...(Array.isArray(a)?a:[]), ...(Array.isArray(b)?b:[])].filter(Boolean)));
            if (item.industry && item.industry.length > 0) { m.industry = mergeArray(m.industry, item.industry); m.raw.industry = m.industry; modified = true; }
            if (item.organization__industry && item.organization__industry.length > 0) { m.organization__industry = mergeArray(m.organization__industry, item.organization__industry); m.raw.organization__industry = m.organization__industry; modified = true; }
            if (item.keywords && item.keywords.length > 0) { m.keywords = mergeArray(m.keywords, item.keywords); m.raw.keywords = m.keywords; modified = true; }
            
            // Handle all technology arrays
            const sourceTechs = item.organization__current_technologies?.length ? item.organization__current_technologies : (item.organization__technologies?.length ? item.organization__technologies : (item.technologies?.length ? item.technologies : []));
            if (sourceTechs.length > 0) { 
                m.organization__technologies = mergeArray(m.organization__technologies, sourceTechs); 
                m.raw.organization__technologies = mergeArray(m.raw.organization__technologies, sourceTechs);
                m.raw.technologies = mergeArray(m.raw.technologies, sourceTechs);
                m.raw.organization__current_technologies = mergeArray(m.raw.organization__current_technologies, sourceTechs);
                modified = true; 
            }

            if (modified) {
                m.markModified('raw');
                await m.save();
            }
        }
    };

    for (const item of items) {
      const publicId = item.public_identifier || "";
      const personId = item.id || item.person_id || publicId || "";
      const urls = [item.public_profile_url, item.linkedin_url, item.profile_url].filter(Boolean).map((v)=>String(v).trim());
      const queryOr = [];
      if (personId) queryOr.push({ person_id: personId });
      if (publicId) queryOr.push({ public_identifier: publicId });
      urls.forEach((u)=>{
        queryOr.push({ public_profile_url: u });
        queryOr.push({ linkedin_url: u });
        queryOr.push({ profile_url: u });
        queryOr.push({ 'raw.public_profile_url': u });
        queryOr.push({ 'raw.linkedin_url': u });
        queryOr.push({ 'raw.profile_url': u });
      });
      const existing = queryOr.length
        ? await ListItem.findOne({ listId, $or: queryOr })
        : null;
      if (existing) {
        const mergeArray = (a, b) => {
          const A = Array.isArray(a) ? a : [];
          const B = Array.isArray(b) ? b : [];
          const set = new Set([...A, ...B].filter((v)=>v!=null));
          return Array.from(set);
        };
        const mergeEmails = (a, b) => {
          const A = Array.isArray(a) ? a : [];
          const B = Array.isArray(b) ? b : [];
          const map = new Map();
          
          [...A, ...B].forEach((e) => {
            if (!e) return;
            const addr = e.email || e.sanitized_email;
            if (!addr) return;
            const key = String(addr).toLowerCase();
            const existing = map.get(key);
            
            // If it's new, just add it
            if (!existing) {
                map.set(key, e);
                return;
            }
            
            // If it exists, determine if we should upgrade the status
            const currentStatus = existing.verificationStatus || existing.status || "";
            const newStatus = e.verificationStatus || e.status || "";
            
            // If new one has status and current doesn't, or new one is generally "better" (non-empty is better than empty)
            if (newStatus && !currentStatus) {
                map.set(key, e);
            } else if (newStatus && currentStatus) {
                // If both have status, prefer the one from B (the later one in the loop) which acts as an update
                map.set(key, e);
            }
          });
          return Array.from(map.values());
        };
        const mergePhones = (a, b) => {
          const A = Array.isArray(a) ? a : [];
          const B = Array.isArray(b) ? b : [];
          const out = [];
          const canon = (n)=> String(n||'').replace(/[^+\d]/g,'');
          const seen = new Set();
          [...A, ...B].forEach((p)=>{
            if (!p) return;
            const num = p.sanitized_number || p.raw_number;
            if (!num) return;
            const key = canon(num);
            if (key && !seen.has(key)) { seen.add(key); out.push(p); }
          });
          return out;
        };
      // Update the fields in the top-level document too
      const setFields = {
        person_id: personId || existing.person_id || "",
        name: pickNonEmpty(item.name, existing.name) || "",
        public_identifier: publicId || existing.public_identifier || "",
        linkedin_url: pickNonEmpty(item.linkedin_url, existing.linkedin_url) || "",
        public_profile_url: pickNonEmpty(item.public_profile_url, existing.public_profile_url) || "",
        profile_url: pickNonEmpty(item.profile_url, existing.profile_url) || "",
        profile_picture_url: pickNonEmpty(item.profile_picture_url, existing.profile_picture_url) || "",
        profile_picture_url_large: pickNonEmpty(item.profile_picture_url_large, existing.profile_picture_url_large) || "",
        network_distance: pickNonEmpty(item.network_distance, existing.network_distance) || "",
        location: pickNonEmpty(item.location, existing.location) || "",
        headline: pickNonEmpty(item.headline, existing.headline) || "",
        current_positions: pickNonEmpty(item.current_positions, existing.current_positions) || {},
        industry: pickNonEmpty(item.industry, existing.industry) || [],
        email: pickNonEmpty(item.email, existing.email) || "",
        second_phone: pickNonEmpty(item.second_phone, existing.second_phone) || "",
        phone: pickNonEmpty(item.phone, existing.phone) || "",
        title: pickNonEmpty(item.title, existing.title) || "",
        company: pickNonEmpty(item.company, existing.company) || "",
        city: item.city || existing.city || "",
        state: item.state || existing.state || "",
        country: item.country || existing.country || "",
        company_headcount: item.company_headcount || existing.company_headcount || "",
        organization__industry: item.organization__industry || existing.organization__industry || [],
        organization__website: item.organization__website || existing.organization__website || "",
        organization__linkedin_url: item.organization__linkedin_url || existing.organization__linkedin_url || "",
        organization__facebook_url: item.organization__facebook_url || existing.organization__facebook_url || "",
        organization__twitter_url: item.organization__twitter_url || existing.organization__twitter_url || "",
        organization__address: item.organization__address || existing.organization__address || "",
        organization__city: item.organization__city || existing.organization__city || "",
        organization__state: item.organization__state || existing.organization__state || "",
        organization__country: item.organization__country || existing.organization__country || "",
        organization__technologies: item.organization__technologies || existing.organization__technologies || [],
        organization__founded_year: item.organization__founded_year || existing.organization__founded_year || "",
        organization__total_funding: item.organization__total_funding || existing.organization__total_funding || "",
        organization__latest_funding: item.organization__latest_funding || existing.organization__latest_funding || "",
        organization__latest_funding_amount: item.organization__latest_funding_amount || existing.organization__latest_funding_amount || "",
        organization__last_raised_at: item.organization__last_raised_at || existing.organization__last_raised_at || "",
        organization__annual_revenue: item.organization__annual_revenue || existing.organization__annual_revenue || "",
        seniority: item.seniority || existing.seniority || "",
        function: item.department || item.job_function || item.function || existing.function || "",
        company_headcount: item.employees || item.company_headcount || existing.company_headcount || "",
        keywords: item.keywords || existing.keywords || [],
      };

      const newRaw = { ...(existing.raw || {}) };
      Object.keys(item || {}).forEach((key) => {
        if (isEmptyOverlayValue(item[key])) return;
        newRaw[key] = item[key];
      });
      
      // Ensure arrays are merged correctly
      newRaw.contact__all_emails = mergeEmails(existing.raw?.contact__all_emails, item?.contact__all_emails || item?.contact__emails);
      newRaw.contact__phone_numbers = mergePhones(existing.raw?.contact__phone_numbers, item?.contact__phone_numbers);

      // Sync Status if provided in item
      if (item.email_status) newRaw.email_status = item.email_status;

      await ListItem.updateOne({ _id: existing._id }, { $set: { ...setFields, raw: newRaw } });
      updated++;
      
      // Sync to other lists
      await syncToOtherLists(newRaw, publicId, urls, req.user.id);

      // Backfill "Not available" for top-level if applicable to prevent UI bugs
      if (item.email === "" && Array.isArray(newRaw.contact__all_emails) && newRaw.contact__all_emails.length > 0 && String(newRaw.contact__all_emails[0]?.email).toLowerCase() === "not available") {
        await ListItem.updateOne({ _id: existing._id }, { $set: { email: "Not available", "raw.email": "Not available" } });
      }
      if (item.phone === "" && Array.isArray(newRaw.contact__phone_numbers) && newRaw.contact__phone_numbers.length > 0 && String(newRaw.contact__phone_numbers[0]?.sanitized_number || newRaw.contact__phone_numbers[0]?.raw_number).toLowerCase() === "not available") {
        await ListItem.updateOne({ _id: existing._id }, { $set: { phone: "Not available", "raw.phone": "Not available" } });
      }

    } else {
        const doc = {
          listId,
          person_id: personId,
          industry: item.industry || [],
          name: item.name || "",
          public_identifier: publicId,
          linkedin_url: item.linkedin_url || "",
          public_profile_url: item.public_profile_url || "",
          profile_url: item.profile_url || "",
          profile_picture_url: item.profile_picture_url || "",
          profile_picture_url_large: item.profile_picture_url_large || "",
          network_distance: item.network_distance || "",
          location: item.location || "",
          headline: item.headline || "",
          current_positions: item.current_positions || {},
          email: item.email || "",
          phone: item.phone || "",
          second_phone: item.second_phone || "",
          status: "",
          title: item.title || "",
          company: item.company || "",
          city: item.city || "",
          state: item.state || "",
          country: item.country || "",
          company_headcount: item.company_headcount || "",
          organization__industry: item.organization__industry || [],
          organization__website: item.organization__website || "",
          organization__linkedin_url: item.organization__linkedin_url || "",
          organization__facebook_url: item.organization__facebook_url || "",
          organization__twitter_url: item.organization__twitter_url || "",
          organization__address: item.organization__address || "",
          organization__city: item.organization__city || "",
          organization__state: item.organization__state || "",
          organization__country: item.organization__country || "",
          organization__technologies: item.organization__technologies || [],
          organization__founded_year: item.organization__founded_year || "",
          organization__total_funding: item.organization__total_funding || "",
          organization__latest_funding: item.organization__latest_funding || "",
          organization__latest_funding_amount: item.organization__latest_funding_amount || "",
          organization__last_raised_at: item.organization__last_raised_at || "",
          organization__annual_revenue: item.organization__annual_revenue || "",
          seniority: item.seniority || "",
          function: item.department || item.job_function || item.function || "",
          company_headcount: item.employees || item.company_headcount || "",
          keywords: item.keywords || [],
          raw: item
        };
        await ListItem.create(doc);
        added++;
        await syncToOtherLists(doc.raw, publicId, urls, userId);
      }
    }
    return res.status(201).json({ msg: 'Saved leads updated', added, updated });
  } catch (error) {
    return res.status(500).json({ msg: 'Error adding items', error: error.message });
  }
};

exports.getUserLists = async (req, res) => {
  // console.log(req.user);
  const userId = req.user.sub || req.user.id || req.user._id; 
  const includeTeam = req.query.includeTeam === 'true';

  try {
    let createdByFilter = [userId];

    if (includeTeam) {
      const User = require('../models/User');
      const currentUser = await User.findById(userId).lean();
      if (currentUser && currentUser.orgId) {
        const teamUsers = await User.find({ orgId: currentUser.orgId }).select('_id').lean();
        createdByFilter = teamUsers.map(u => u._id.toString());
      }
    }

    // Step 1: Get all lists created by the user (and team if requested) (excluding hidden cache)
    const lists = await List.find({ 
      createdBy: { $in: createdByFilter },
      name: { $ne: '__mawsool_hidden_global_cache__' }
    }).populate('createdBy', 'name').lean();

    // Step 2: Get item counts for all lists in one query
    const counts = await ListItem.aggregate([
      { $match: { listId: { $in: lists.map(list => list._id) } } },
      { $group: { _id: "$listId", count: { $sum: 1 } } }
    ]);

    // Step 3: Map list ID to count
    const countMap = {};
    counts.forEach(c => {
      countMap[c._id.toString()] = c.count;
    });

    // Step 4: Attach item count and kind to each list
    const kinds = await ListKind.find({ listId: { $in: lists.map(l => l._id) } }).lean();
    const kindMapById = {};
    kinds.forEach(k => { kindMapById[k.listId.toString()] = k.kind; });
    const listsWithCounts = lists.map(list => {
      const creatorId = list.createdBy ? (list.createdBy._id || list.createdBy).toString() : null;
      const creatorName = list.createdBy && list.createdBy.name ? list.createdBy.name : 'Unknown';
      
      return {
        ...list,
        createdBy: creatorId, // Restore string format to not break existing code
        creatorId: creatorId,
        creatorName: creatorName,
        listType: list.listType || 'people', // Ensure listType is always sent to frontend
        itemsCount: countMap[list._id.toString()] || 0,
        kind: kindMapById[list._id.toString()] || 'user_made'
      };
    });

    res.status(200).json(listsWithCounts);
  } catch (err) {
    res.status(500).json({ msg: "Server error", error: err.message });
  }
};

exports.getSingleList = async (req, res) => {
  const userId = req.user?.sub || req.user?.id || req.user?._id;
  const listId = req.params.id;
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const skip = (page - 1) * limit;
  const search = req.query.search || req.query.q;
  const source = req.query.source;

  try {
    // 1) Ownership check
    const list = await List.findOne({ _id: listId, createdBy: userId }).lean();
    if (!list) {
      return res.status(404).json({ msg: "List not found or access denied" });
    }

    const kindRec = await ListKind.findOne({ listId: list._id }).lean();
    const kind = kindRec?.kind || (list.queryId ? 'ai_query' : 'user_made');

    // Build Query
    let query = { listId };
    
    // Source Filter
    if (source) {
      const s = String(source).toLowerCase().trim();
      if (s) {
        query['raw.audit__source'] = s;
      }
    }

    // Search Filter
    if (search) {
      const s = String(search).trim();
      if (s) {
        // Escape regex characters
        const escaped = s.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
        const regex = new RegExp(escaped, 'i');
        query.$or = [
          { 'raw.name': regex },
          { 'raw.first_name': regex },
          { 'raw.last_name': regex },
          { 'raw.company': regex },
          { 'raw.title': regex },
          { 'raw.email': regex },
          { 'raw.phone': regex },
          { 'raw.headline': regex },
          { 'raw.contact__name': regex },
          { 'raw.contact__organization_name': regex }
        ];
      }
    }

    // 2) Total count
    const totalItems = await ListItem.countDocuments(query);

    // Fetch AiQuery details if applicable
    let aiQueryDetails = null;
    if (kind === 'ai_query' || kind === 'ai_mode') {
      const AiQuery = require('../models/AiQuery');
      aiQueryDetails = await AiQuery.findOne({ listId: list._id }).lean();
    }

    // 3) Page items
    const items = await ListItem.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const { peopleColumns, aiPeopleColumns, companyColumns } = require('../config/listColumns');
    const isCompanyList = ['company', 'companies'].includes(String(list.listType || '').toLowerCase());
    const configCols = isCompanyList ? companyColumns : (isAiPeopleKind(kind) ? aiPeopleColumns : peopleColumns);

    items.forEach(it => {
        it.mappedData = {};
        const raw = it.raw || {};
        configCols.forEach(col => {
            if (col.extract) {
                try {
                    it.mappedData[col.id] = col.extract(raw);
                } catch (e) {
                    it.mappedData[col.id] = "";
                }
            }
        });
    });

    const allForHeaders = await ListItem.find({ listId })
      .select({ raw: 1, createdAt: 1 })
      .sort({ createdAt: 1 }) 
      .lean();

    // 4c) Determine headers based on list type and central configuration
    let headers = [];
    if (isCompanyList) {
      headers = companyColumns.filter(c => c.showInUI).map(c => ({ id: c.id, label: c.label }));
    } else if (isAiPeopleKind(kind)) {
      headers = aiPeopleColumns.filter(c => c.showInUI).map(c => ({ id: c.id, label: c.label }));
    } else {
      headers = peopleColumns.filter(c => c.showInUI).map(c => ({ id: c.id, label: c.label }));
    }

    // 5) Response
    if (items.length > 0) {
        console.log("MAPPED DATA SENT:", items[0].mappedData);
    }
    
    return res.status(200).json({
      ...list,
      listType: list.listType || 'people', // Ensure listType is returned
      kind,
      aiQueryDetails, // Attach AI Query report details
      headers, // <- consistent across pages
      items,
      pagination: {
        totalItems,
        totalPages: Math.ceil(totalItems / limit),
        currentPage: page,
        itemsPerPage: limit,
      },
    });
  } catch (err) {
    console.error("getSingleList error:", err);
    return res.status(500).json({ msg: "Server error", error: err.message });
  }
};



exports.exportListAsCSV = async (req, res) => {
  const userId = req.user.sub || req.user.id || req.user._id;
  const listId = req.params.id;
  const format = req.query.format || 'csv';

  try {
    // 1) Ensure list ownership
    const list = await List.findOne({ _id: listId, createdBy: userId }).lean();
    if (!list) {
      return res.status(404).json({ msg: "List not found or access denied" });
    }

    const kindRec = await ListKind.findOne({ listId: list._id }).lean();
    const kind = kindRec?.kind || (list.queryId ? 'ai_query' : 'user_made');

    // 2) Fetch ALL items (no pagination)
    let items = await ListItem.find({ listId })
      .select({ raw: 1 })
      .lean();

    // If specific IDs were selected, filter them
    if (req.query.selectedIds) {
      const selectedIds = req.query.selectedIds.split(',');
      items = items.filter(it => selectedIds.includes(it._id.toString()));
    } else {
      // Apply source filter if provided
      if (req.query.sourceFilter) {
        items = items.filter(it => String(it?.raw?.audit__source || "").toLowerCase() === req.query.sourceFilter.toLowerCase());
      }
      
      // Apply search filter if provided
      if (req.query.searchQuery) {
        const q = String(req.query.searchQuery).trim().toLowerCase();
        const tokens = q.split(/\s+/).filter(Boolean);
        const norm = (s) => String(s || '').toLowerCase();
        items = items.filter((it) => {
          const raw = it?.raw || {};
          const name = String(raw.name || '').toLowerCase();
          const first = norm(raw.first_name || (name ? name.split(/[•\s]+/).filter(Boolean)[0] : ''));
          const last = norm(raw.last_name || (name ? name.split(/[•\s]+/).filter(Boolean).slice(1).join(' ') : ''));
          const company = norm(raw.company || raw.current_positions?.[0]?.company || '');
          const hay = `${first} ${last} ${company}`;
          return tokens.every((t) => hay.includes(t));
        });
      }
    }

    if (!items.length) {
      return res.status(400).json({ msg: "No items found in this list matching criteria" });
    }

    const { peopleColumns, aiPeopleColumns, companyColumns } = require('../config/listColumns');
    
    // Determine which config to use based on listType
    const isCompanyList = ['company', 'companies'].includes(String(list.listType || '').toLowerCase());
    const config = isCompanyList ? companyColumns : (isAiPeopleKind(kind) ? aiPeopleColumns : peopleColumns);
    
    // Get headers that are marked for export
    const exportConfig = config.filter(c => c.showInExport);
    const outputHeaders = exportConfig.map(c => c.label);
    
    // 3) Map items to rows using extract logic
    const records = items.map(it => {
      const raw = it.raw || {};
      const row = {};
      
      exportConfig.forEach(col => {
        try {
            row[col.label] = col.extract ? col.extract(raw) : "";
        } catch(e) {
            row[col.label] = "";
        }
      });
      return row;
    });

    const safeName = (list.name || "exported_list").replace(/[^\w\-]+/g, "_");

    if (format === 'xlsx') {
      const XLSX = require('xlsx');
      const ws = XLSX.utils.json_to_sheet(records, { header: outputHeaders });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
      const excelBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      
      const fileName = `${safeName}.xlsx`;
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
      return res.status(200).send(excelBuffer);
    } else {
      // Convert to CSV with ordered headers
      const { Parser } = require("json2csv");
      const parser = new Parser({ fields: outputHeaders });
      const csv = parser.parse(records);

      const fileName = `${safeName}.csv`;
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
      return res.status(200).send("\uFEFF" + csv); // keep BOM for Excel compatibility
    }
  } catch (err) {
    console.error("Export error:", err);
    return res.status(500).json({ msg: "Server error", error: err.message });
  }
};



exports.updateList = async (req, res) => {
  const listId = req.params.id;
  const { name, status } = req.body;
  const userId = req.user.sub || req.user.id || req.user._id; 

  try {
    const list = await List.findOne({ _id: listId, createdBy: userId });
    if (!list) {
      return res.status(404).json({ msg: "List not found or access denied" });
    }

    if (name) list.name = name;
    if (status) list.status = status;

    await list.save();

    res.status(200).json({
      msg: "List updated successfully",
      list: {
        _id: list._id,
        name: list.name,
        status: list.status
      }
    });
  } catch (err) {
    res.status(500).json({ msg: "Server error", error: err.message });
  }
};


exports.deleteList = async (req, res) => {
  const listId = req.params.id;
  const userId = req.user.sub || req.user.id || req.user._id; 

  try {
    // Check ownership
    const list = await List.findOne({ _id: listId, createdBy: userId });
    if (!list) {
      return res.status(404).json({ msg: "List not found or access denied" });
    }

    // Delete all items related to this list
    await ListItem.deleteMany({ listId });

    // Delete the list itself
    await List.deleteOne({ _id: listId });

    res.status(200).json({ msg: "List and its items deleted successfully" });
  } catch (err) {
    res.status(500).json({ msg: "Server error", error: err.message });
  }
};

exports.deleteListItems = async (req, res) => {
  const { listId } = req.params;
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : (Array.isArray(req.body) ? req.body : []);
  const userId = req.user.sub || req.user.id || req.user._id;
  if (!listId || !ids.length) return res.status(400).json({ msg: 'List ID and item ids are required' });
  try {
    const list = await List.findOne({ _id: listId, createdBy: userId }).lean();
    if (!list) return res.status(404).json({ msg: 'List not found or access denied' });
    const kindRec = await ListKind.findOne({ listId }).lean();
    const kind = kindRec?.kind || 'user_made';
    if (String(kind).toLowerCase() === 'revealed_search_results') {
      return res.status(403).json({ msg: 'Cannot delete items from Saved leads list' });
    }
    const result = await ListItem.deleteMany({ listId, _id: { $in: ids } });
    return res.status(200).json({ msg: 'Items deleted', deleted: result?.deletedCount || 0 });
  } catch (err) {
    return res.status(500).json({ msg: 'Server error', error: err.message });
  }
};

// --- ADMIN FUNCTIONS ---

exports.getListsForUserAdmin = async (req, res) => {
  const { userId } = req.params;
  try {
    const lists = await List.find({ 
      createdBy: userId,
      name: { $ne: '__mawsool_hidden_global_cache__' }
    }).lean();

    const counts = await ListItem.aggregate([
      { $match: { listId: { $in: lists.map(list => list._id) } } },
      { $group: { _id: "$listId", count: { $sum: 1 } } }
    ]);
    const countMap = {};
    counts.forEach(c => { countMap[c._id.toString()] = c.count; });
    
    // Fetch kinds
    const kinds = await ListKind.find({ listId: { $in: lists.map(l => l._id) } }).lean();
    const kindMapById = {};
    kinds.forEach(k => { kindMapById[k.listId.toString()] = k.kind; });

    const listsWithCounts = lists.map(list => ({
      ...list,
      itemsCount: countMap[list._id.toString()] || 0,
      kind: kindMapById[list._id.toString()] || 'user_made'
    }));
    res.status(200).json(listsWithCounts);
  } catch (err) {
    res.status(500).json({ msg: "Server error", error: err.message });
  }
};

exports.createListForUserAdmin = async (req, res) => {
  const { userId } = req.params;
  const { name, kind, listType } = req.body; // kind: 'ai_query' | 'user_made'

  if (!name) {
    return res.status(400).json({ msg: "List name is required" });
  }

  try {
    const list = await List.create({
      name,
      createdBy: userId,
      status: "active",
      listType: listType || "people"
    });

    const listKind = kind || 'user_made';
    await ListKind.updateOne(
      { listId: list._id }, 
      { $set: { kind: listKind } }, 
      { upsert: true }
    );

    res.status(201).json({ msg: "List created successfully", list });
  } catch (err) {
    res.status(500).json({ msg: "Server error", error: err.message });
  }
};

exports.deleteListAdmin = async (req, res) => {
  const { listId } = req.params;
  try {
    // Delete all items related to this list
    await ListItem.deleteMany({ listId });

    // Delete the list kind
    await ListKind.deleteOne({ listId });

    // Delete the list itself
    const result = await List.deleteOne({ _id: listId });

    if (result.deletedCount === 0) {
      return res.status(404).json({ msg: "List not found" });
    }

    res.status(200).json({ msg: "List and its items deleted successfully" });
  } catch (err) {
    res.status(500).json({ msg: "Server error", error: err.message });
  }
};

exports.getListDetailsAdmin = async (req, res) => {
  const { listId } = req.params;
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 50; // Higher limit for admin view
  const skip = (page - 1) * limit;

  try {
    const list = await List.findById(listId).lean();
    if (!list) return res.status(404).json({ msg: "List not found" });

    const totalItems = await ListItem.countDocuments({ listId });
    const items = await ListItem.find({ listId }).skip(skip).limit(limit).lean();

    const { peopleColumns, aiPeopleColumns, companyColumns } = require('../config/listColumns');
    const isCompanyList = ['company', 'companies'].includes(String(list.listType || '').toLowerCase());
    
    // We pass list kind down if needed, but here let's assume 'manual' or check list.queryId
    const kind = list.queryId ? 'ai_query' : 'manual';
    const configCols = isCompanyList ? companyColumns : (isAiPeopleKind(kind) ? aiPeopleColumns : peopleColumns);

    items.forEach(it => {
        it.mappedData = {};
        const raw = it.raw || {};
        configCols.forEach(col => {
            if (col.extract) {
                try {
                    it.mappedData[col.id] = col.extract(raw);
                } catch (e) {
                    it.mappedData[col.id] = "";
                }
            }
        });
    });

    let headers = [];
    if (isCompanyList) {
      headers = companyColumns.filter(c => c.showInUI).map(c => ({ id: c.id, label: c.label }));
    } else if (isAiPeopleKind(kind)) {
      headers = aiPeopleColumns.filter(c => c.showInUI).map(c => ({ id: c.id, label: c.label }));
    } else {
      headers = peopleColumns.filter(c => c.showInUI).map(c => ({ id: c.id, label: c.label }));
    }

    res.status(200).json({
      ...list,
      headers,
      items,
      pagination: {
        totalItems,
        totalPages: Math.ceil(totalItems / limit),
        currentPage: page,
        itemsPerPage: limit
      }
    });
  } catch (err) {
    res.status(500).json({ msg: "Server error", error: err.message });
  }
};

exports.exportListAsCSVAdmin = async (req, res) => {
  const { listId } = req.params;
  const format = req.query.format || 'csv';

  try {
    const list = await List.findById(listId).lean();
    if (!list) {
      return res.status(404).json({ msg: "List not found" });
    }

    const kindRec = await ListKind.findOne({ listId: list._id }).lean();
    const kind = kindRec?.kind || (list.queryId ? 'ai_query' : 'user_made');

    let items = await ListItem.find({ listId })
      .select({ raw: 1 })
      .lean();

    if (!items.length) {
      return res.status(400).json({ msg: "No items found in this list matching criteria" });
    }

    const { peopleColumns, aiPeopleColumns, companyColumns } = require('../config/listColumns');
    
    // Determine which config to use based on listType
    const isCompanyList = ['company', 'companies'].includes(String(list.listType || '').toLowerCase());
    const config = isCompanyList ? companyColumns : (isAiPeopleKind(kind) ? aiPeopleColumns : peopleColumns);
    
    // Get headers that are marked for export
    const exportConfig = config.filter(c => c.showInExport);
    const outputHeaders = exportConfig.map(c => c.label);
    
    // Map items to rows using extract logic
    const records = items.map(it => {
      const raw = it.raw || {};
      const row = {};
      
      exportConfig.forEach(col => {
        try {
            row[col.label] = col.extract ? col.extract(raw) : "";
        } catch(e) {
            row[col.label] = "";
        }
      });
      return row;
    });

    const safeName = (list.name || "exported_list").replace(/[^\w\-]+/g, "_");

    if (format === 'xlsx') {
      const XLSX = require('xlsx');
      const ws = XLSX.utils.json_to_sheet(records, { header: outputHeaders });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
      const excelBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      
      const fileName = `${safeName}.xlsx`;
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
      return res.status(200).send(excelBuffer);
    } else {
      // Convert to CSV with ordered headers
      const { Parser } = require("json2csv");
      const parser = new Parser({ fields: outputHeaders });
      const csv = parser.parse(records);

      const fileName = `${safeName}.csv`;
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
      return res.status(200).send("\uFEFF" + csv); // keep BOM for Excel compatibility
    }
  } catch (err) {
    console.error("Admin export error:", err);
    return res.status(500).json({ msg: "Server error", error: err.message });
  }
};

// --- BULK SAVE & INTERNAL ROUTES ---

exports.bulkSave = async (req, res) => {
  const userId = req.user.sub || req.user.id || req.user._id;
  const { listId, filters, requestedCount, initialItems, revealType, selectedItems, maxPerCompany } = req.body;

  if (!listId) {
    return res.status(400).json({ msg: "List ID is required." });
  }

  // Enforce 700 limit for bulk save + reveal
  if (revealType && revealType !== 'none') {
    const countToCheck = (requestedCount !== undefined && requestedCount !== null) 
      ? requestedCount 
      : (selectedItems && Array.isArray(selectedItems) ? selectedItems.length : null);
      
    if (countToCheck === null || countToCheck > 700) {
      return res.status(400).json({ msg: "The limit for bulk reveal is 700 profiles per request. Please specify a number up to 700." });
    }

    // Check if user has enough credits after considering in-flight reveals
    const balanceInfo = await getBalanceForUser(userId);
    let availableCredits = balanceInfo.scope === 'org' 
      ? balanceInfo.balance + (balanceInfo.personalCredits || 0) 
      : balanceInfo.balance;
      
    availableCredits -= (balanceInfo.inFlightCredits || 0);

    let costPerLead = 0;
    if (revealType === 'email') costPerLead = 5;
    else if (revealType === 'phone') costPerLead = 20;
    else if (revealType === 'both') costPerLead = 25;

    const totalRequiredCredits = countToCheck * costPerLead;

    if (availableCredits < totalRequiredCredits) {
      return res.status(400).json({ msg: `Insufficient credits. You need ${totalRequiredCredits} credits, but only have ${availableCredits} available (some may be reserved by currently running reveals).` });
    }
  }

  try {
    // 0. Mark the list as syncing, initialize reveal progress, and save the search filters
    const updatePayload = { isSyncing: true, searchFilters: filters };
    if (revealType && revealType !== 'none') {
        updatePayload.revealStatus = 'running';
        // Setting total to requestedCount (or 0 if all) to give UI an immediate estimate
        updatePayload.revealProgress = { total: requestedCount || 0, current: 0, type: revealType };
    }
    await List.findByIdAndUpdate(listId, updatePayload);

    const middlewareUrl = process.env.MIDDLEWARE_URL || "http://localhost:3001";

    // 1. If explicit items are selected, we can bypass the middleware's search loop
    //    and insert them directly into the DB here in the backend!
    if (selectedItems && Array.isArray(selectedItems) && selectedItems.length > 0) {
      // Respond immediately so the frontend UI doesn't hang
      res.status(202).json({ msg: "Bulk save job accepted and processing selected items." });

      // Run the insertion and auto-reveal asynchronously
      (async () => {
        try {
          console.log(`[Backend-Job] Processing ${selectedItems.length} explicitly selected items.`);
          const itemsToSave = selectedItems.map(item => {
            const publicId = item.public_identifier || "";
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

            return {
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
                }
            };
          });

          const insertedCount = await performBulkInsert(listId, userId, itemsToSave, requestedCount, revealType, true);
          console.log(`[Backend-Job] Successfully inserted ${insertedCount} selected items.`);

          // Mark sync as finished
          await List.findByIdAndUpdate(listId, { isSyncing: false });

          // If it was a bulk reveal, trigger the middleware's reveal worker
          if (revealType && revealType !== 'none') {
             console.log(`[Backend-Job] Triggering Bulk Reveal via Middleware...`);
             await axios.post(`${middlewareUrl}/api/jobs/bulk-reveal`, {
                userId,
                listId,
                revealType
             });
          }
        } catch (asyncErr) {
          console.error(`[Backend-Job] Error processing selected items:`, asyncErr);
          await List.findByIdAndUpdate(listId, { isSyncing: false });
        }
      })();
      return;
    }

    // 2. If NO specific items were selected, send to Middleware to loop through search pages
    
    // --- RESOLVE EXCLUDE LIST IDS FOR BULK SAVE ---
    const activeFilters = filters || {};
    const actualExcludeListIds = activeFilters.excludeListIds;
    
    let exclude_public_ids = [];
    let exclude_numeric_ids = [];

    if (actualExcludeListIds && Array.isArray(actualExcludeListIds) && actualExcludeListIds.length > 0) {
      try {
        const items = await ListItem.find({
            listId: { $in: actualExcludeListIds }
          }).select("raw").lean();

          exclude_public_ids = Array.from(new Set(items.map(item => {
            const raw = item.raw || {};
            let extractedId = raw.public_identifier || raw.id || raw.public_id;
            
            if (extractedId && typeof extractedId === 'string' && extractedId.includes('linkedin.com')) {
                const matchComp = extractedId.match(/company\/([^\/?#]+)/i);
                if (matchComp && matchComp[1]) {
                    extractedId = matchComp[1];
                } else {
                    const matchPerson = extractedId.match(/in\/([^\/?#]+)/i);
                    if (matchPerson && matchPerson[1]) {
                        extractedId = matchPerson[1];
                    }
                }
            }

            if (!extractedId && raw.organization__linkedin_url) {
               const match = raw.organization__linkedin_url.match(/company\/([^\/?#]+)/i);
               if (match && match[1]) extractedId = match[1];
            } else if (!extractedId && raw.linkedin_url) {
               const match = raw.linkedin_url.match(/in\/([^\/?#]+)/i);
               if (match && match[1]) extractedId = match[1];
            }
            
            return extractedId;
          }).filter(Boolean)));
          
          exclude_numeric_ids = Array.from(new Set(items.map(item => {
              const raw = item.raw || {};
              return raw.numeric_id;
          }).filter(Boolean)));
          
          // Cleanup to prevent schema validation issues
          delete activeFilters.excludeListIds;
          
      } catch (err) {
          console.error("[BulkSave] Error fetching excludeListIds:", err.message);
      }
    }

    const payloadData = {
      userId,
      listId,
      filters: activeFilters,
      requestedCount,
      revealType, 
      initialItems: initialItems || [],
      maxPerCompany
    };

    if (exclude_public_ids.length > 0) {
        payloadData.exclude_public_ids = exclude_public_ids;
    }
    if (exclude_numeric_ids.length > 0) {
        payloadData.exclude_numeric_ids = exclude_numeric_ids;
    }

    await axios.post(`${middlewareUrl}/api/jobs/bulk-save`, payloadData);

    res.status(202).json({ msg: "Bulk save job accepted and running in background." });
  } catch (error) {
    const errorMsg = error.response ? JSON.stringify(error.response.data) : error.message;
    console.error(`[Bulk Save Error] Failed to trigger middleware at ${process.env.MIDDLEWARE_URL || "http://localhost:3001"}:`, errorMsg);
    res.status(500).json({ 
      msg: "Failed to initiate bulk save. Backend could not reach Middleware.", 
      error: errorMsg 
    });
  }
};

exports.bulkInsertInternal = async (req, res) => {
  const { listId } = req.params;
  const { items, userId, remainingCount } = req.body;
  const internalSecret = req.headers['x-internal-secret'];

  console.log(`[Internal Bulk Insert] Received ${items ? items.length : 0} items for list ${listId} (userId: ${userId})`);

  // Basic security check to ensure this is called by our middleware
  if (internalSecret !== (process.env.INTERNAL_SECRET || 'secret123')) {
    console.log(`[Internal Bulk Insert] Forbidden: invalid secret`);
    return res.status(403).json({ msg: "Forbidden" });
  }

  if (!items || !Array.isArray(items) || items.length === 0) {
    console.log(`[Internal Bulk Insert] Items array is required`);
    return res.status(400).json({ msg: "Items array is required" });
  }

  try {
    // 1. Extract identifiers to check for duplicates
    const publicIdentifiers = items.map(item => item.public_identifier).filter(id => id);
    const linkedinUrls = items.map(item => item.linkedin_url).filter(url => url);
    const personIds = items.map(item => item.person_id).filter(id => id);

    // 2. Find existing items in this list to prevent duplicates
    const existingItems = await ListItem.find({
        listId,
        $or: [
            { public_identifier: { $in: publicIdentifiers } },
            { linkedin_url: { $in: linkedinUrls } },
            { person_id: { $in: personIds } }
        ]
    }).select('public_identifier linkedin_url person_id');

    // 3. Filter out items that already exist in this list
    let newItems = items.filter(item => {
        return !existingItems.some(existing =>
            (existing.public_identifier && item.public_identifier && existing.public_identifier === item.public_identifier) ||
            (existing.linkedin_url && item.linkedin_url && existing.linkedin_url === item.linkedin_url) ||
            (existing.person_id && item.person_id && existing.person_id === item.person_id)
        );
    });

    if (newItems.length === 0) {
        console.log(`[Internal Bulk Insert] 0 new items to insert (all were duplicates).`);
        return res.status(200).json({ insertedCount: 0, msg: "All items already exist in the list" });
    }



    // 4. Enrich new items with previously revealed contact info from the hidden cache AND company firmographics
    let enrichedItems = newItems;
    if (userId) {
      console.log(`[Internal Bulk Insert] Enriching ${newItems.length} new items for user ${userId}...`);
      enrichedItems = await Promise.all(newItems.map(async (item) => {
        try {
          let enriched = await enrichItemFromCache(userId, item);
          enriched = enriched || item;
          console.log(`[Internal Bulk Insert] After enrichItemFromCache: website = ${enriched.raw?.website}, org_website = ${enriched.raw?.organization__website}`);
          
          // --- NEW: Auto-enrich missing firmographics from Elasticsearch ---
          enriched = await autoEnrichCompanyFirmographics(enriched);
          console.log(`[Internal Bulk Insert] After autoEnrichCompanyFirmographics: website = ${enriched.raw?.website}, org_website = ${enriched.raw?.organization__website}`);
          
          return enriched;
        } catch (e) {
          console.error(`[Internal Bulk Insert] Enrichment error for item:`, e.message);
          return item; // Fallback to original item if enrichment fails
        }
      }));
      console.log(`[Internal Bulk Insert] Enrichment complete.`);
    }

    // 5. If this is a Bulk Reveal, filter out leads the user already has the requested data for
    const { revealType } = req.body;
    if (revealType && revealType !== 'none') {
        enrichedItems = enrichedItems.filter(item => {
            const hasValidEmail = item.email && item.email !== "Not available" && !String(item.email).includes('*');
            const hasValidPhone = item.phone && item.phone !== "Not available" && !String(item.phone).includes('*');
            
            if (revealType === 'email') return !hasValidEmail; // Keep if NO valid email
            if (revealType === 'phone') return !hasValidPhone; // Keep if NO valid phone
            if (revealType === 'both') return !(hasValidEmail && hasValidPhone); // Keep if missing either
            return true;
        });
        console.log(`[Internal Bulk Insert] Filtered out already-revealed leads. ${enrichedItems.length} remain.`);
    }

    // 6. Slice to remainingCount if specified so we don't insert more than requested
    if (remainingCount !== null && remainingCount !== undefined) {
        enrichedItems = enrichedItems.slice(0, remainingCount);
    }

    if (enrichedItems.length === 0) {
        console.log(`[Internal Bulk Insert] 0 items to insert after duplicate/reveal filtering or slicing.`);
        return res.status(200).json({ insertedCount: 0, msg: "All items filtered out or remaining count fulfilled" });
    }

    // --- CREDIT DEDUCTION FOR COMPANIES ---
    const list = await List.findById(listId).select('listType');
    if (list && list.listType === 'companies') {
        const { getBalanceForUser, deductCreditsForUser } = require('../utils/wallet');
        const currentCredits = await getBalanceForUser(userId);
        const availableCredits = currentCredits.scope === "org" 
            ? (currentCredits.balance + currentCredits.personalCredits) 
            : currentCredits.balance;

        if (availableCredits < enrichedItems.length) {
            const affordableCount = availableCredits;
            if (affordableCount <= 0) {
                return res.status(402).json({ stop: true, msg: "Insufficient credits to save companies." });
            }
            enrichedItems = enrichedItems.slice(0, affordableCount);
        }
        
        if (enrichedItems.length > 0) {
            // Deduct credits
            await deductCreditsForUser(userId, enrichedItems.length, `Bulk Save Companies deduction for ${enrichedItems.length} companies`);
        }
    }

    if (enrichedItems.length === 0) {
        console.log(`[Internal Bulk Insert] 0 items to insert after credit check.`);
        return res.status(200).json({ insertedCount: 0, msg: "All items filtered out or remaining count fulfilled" });
    }

    // Format explicitly for insertMany to ensure firmographics are pulled up to top-level Document fields
    const formattedItems = enrichedItems.map(workingItem => {
        const raw = workingItem.raw || workingItem;
        const publicId = workingItem.public_identifier || raw.public_identifier || "";
        const personId = workingItem.id || workingItem.person_id || raw.person_id || publicId || "";
        
        return {
          listId,
          person_id: personId,
          industry: workingItem.industry || raw.industry || [],
          name: workingItem.name || raw.name || "",
          public_identifier: publicId,
          linkedin_url: workingItem.linkedin_url || raw.linkedin_url || "",
          public_profile_url: workingItem.public_profile_url || raw.public_profile_url || "",
          profile_url: workingItem.profile_url || raw.profile_url || "",
          profile_picture_url: workingItem.profile_picture_url || raw.profile_picture_url || "",
          profile_picture_url_large: workingItem.profile_picture_url_large || raw.profile_picture_url_large || "",
          network_distance: workingItem.network_distance || raw.network_distance || "",
          location: workingItem.location || raw.location || "",
          headline: workingItem.headline || raw.headline || "",
          current_positions: workingItem.current_positions || raw.current_positions || {},
          email: workingItem.email || raw.email || "",
          phone: workingItem.phone || raw.phone || "",
          second_phone: workingItem.second_phone || raw.second_phone || "",
          status: workingItem.status || raw.status || "",
          title: workingItem.title || raw.title || "",
          company: workingItem.company || raw.company || "",
          city: workingItem.city || raw.city || "",
          state: workingItem.state || raw.state || "",
          country: workingItem.country || raw.country || "",
          company_headcount: workingItem.company_headcount || raw.company_headcount || "",
          organization__industry: workingItem.organization__industry || raw.organization__industry || [],
          organization__website: workingItem.organization__website || raw.organization__website || "",
          organization__linkedin_url: workingItem.organization__linkedin_url || raw.organization__linkedin_url || "",
          organization__facebook_url: workingItem.organization__facebook_url || raw.organization__facebook_url || "",
          organization__twitter_url: workingItem.organization__twitter_url || raw.organization__twitter_url || "",
          organization__address: workingItem.organization__address || raw.organization__address || "",
          organization__city: workingItem.organization__city || raw.organization__city || "",
          organization__state: workingItem.organization__state || raw.organization__state || "",
          organization__country: workingItem.organization__country || raw.organization__country || "",
          organization__technologies: workingItem.organization__technologies || raw.organization__technologies || [],
          organization__founded_year: workingItem.organization__founded_year || raw.organization__founded_year || "",
          organization__total_funding: workingItem.organization__total_funding || raw.organization__total_funding || "",
          organization__latest_funding: workingItem.organization__latest_funding || raw.organization__latest_funding || "",
          organization__latest_funding_amount: workingItem.organization__latest_funding_amount || raw.organization__latest_funding_amount || "",
          organization__last_raised_at: workingItem.organization__last_raised_at || raw.organization__last_raised_at || "",
          organization__annual_revenue: workingItem.organization__annual_revenue || raw.organization__annual_revenue || "",
          seniority: workingItem.seniority || raw.seniority || "",
          function: workingItem.department || workingItem.job_function || workingItem.function || raw.function || "",
          keywords: workingItem.keywords || raw.keywords || [],
          raw: raw
        };
    });

    // Directly insert the formatted items into the ListItem collection
    console.log(`[Internal Bulk Insert] Inserting ${formattedItems.length} items into DB...`);
    await ListItem.insertMany(formattedItems, { ordered: false });
    
    // Sync all bulk inserted items to other lists
    for (const item of formattedItems) {
        const publicId = item.public_identifier || "";
        const urls = [item.public_profile_url, item.linkedin_url, item.profile_url].filter(Boolean).map(v => String(v).trim());
        await syncToOtherLists(item.raw, publicId, urls, userId);
    }
    
    // Update the list count in List model
    const totalLeads = await ListItem.countDocuments({ listId });
    await List.findByIdAndUpdate(listId, { totalLeads });

    console.log(`[Internal Bulk Insert] Successfully inserted ${enrichedItems.length} items.`);
    res.status(200).json({ insertedCount: enrichedItems.length, msg: `Successfully inserted ${enrichedItems.length} items.` });
  } catch (error) {
    console.error("[Internal Bulk Insert Error]", error);
    // Ignore duplicate key errors if any, but return success for the rest
    res.status(207).json({ insertedCount: 0, msg: "Partial or failed insert", error: error.message });
  }
};

exports.updateSyncStatusInternal = async (req, res) => {
  const { listId } = req.params;
  const { isSyncing } = req.body;
  const internalSecret = req.headers['x-internal-secret'];

  if (internalSecret !== (process.env.INTERNAL_SECRET || 'secret123')) {
    return res.status(403).json({ msg: "Forbidden" });
  }

  try {
    const totalLeads = await ListItem.countDocuments({ listId });
    const updateData = { isSyncing, totalLeads };
    if (isSyncing === false) {
        updateData.status = "active";
    }
    await List.findByIdAndUpdate(listId, updateData);
    
    // Also update AiQuery status if it's no longer syncing
    if (isSyncing === false) {
      const AiQuery = require("../models/AiQuery");
      await AiQuery.findOneAndUpdate({ listId }, { status: "completed" });
    }
    
    res.status(200).json({ msg: "Sync status updated" });
  } catch (error) {
    res.status(500).json({ msg: "Failed to update sync status" });
  }
};

// --- BULK REVEAL METHODS ---

exports.startBulkReveal = async (req, res) => {
  const userId = req.user.sub || req.user.id || req.user._id;
  const listId = req.params.listId;
  const { revealType } = req.body; // 'email', 'phone', 'both'

  try {
    const list = await List.findOne({ _id: listId, createdBy: userId });
    if (!list) return res.status(404).json({ msg: "List not found" });

    // Pre-check if user has > 0 credits
    const balanceInfo = await getBalanceForUser(userId);
    let availableCredits = balanceInfo.scope === 'org' 
      ? balanceInfo.balance + (balanceInfo.personalCredits || 0) 
      : balanceInfo.balance;
      
    availableCredits -= (balanceInfo.inFlightCredits || 0);

    console.log(`[startBulkReveal] User: ${userId}, Scope: ${balanceInfo.scope}, Available: ${availableCredits}, InFlight: ${balanceInfo.inFlightCredits}`);
    if (availableCredits <= 0) {
      return res.status(400).json({ msg: "Insufficient credits to start bulk reveal (you may have other reveals currently running)." });
    }

    const itemCount = await ListItem.countDocuments({ listId: list._id });
    if (itemCount > 700) {
      return res.status(400).json({ msg: "The limit for bulk reveal is 700 profiles per request. Please split your list into smaller lists." });
    }

    // Trigger middleware job asynchronously
    const middlewareUrl = process.env.MIDDLEWARE_URL || "http://localhost:3001";
    axios.post(`${middlewareUrl}/api/jobs/bulk-reveal`, {
      userId,
      listId,
      revealType
    }).catch(err => console.error("Failed to start middleware bulk reveal:", err.response?.data || err.message));

    // We let middleware calculate total items to reveal and set status to running
    list.revealStatus = 'running';
    list.revealProgress = { total: 0, current: 0, type: revealType };
    await list.save();

    return res.status(202).json({ msg: "Bulk reveal started", list });
  } catch (err) {
    console.error("Error starting bulk reveal:", err);
    return res.status(500).json({ msg: "Server error", error: err.message });
  }
};

exports.startBulkRevealAdmin = async (req, res) => {
  const listId = req.params.listId;
  const { revealType } = req.body; // 'email', 'phone', 'both'

  try {
    const list = await List.findById(listId);
    if (!list) return res.status(404).json({ msg: "List not found" });

    const userId = list.createdBy;

    // Pre-check if user has > 0 credits
    const balanceInfo = await getBalanceForUser(userId);
    let availableCredits = balanceInfo.scope === 'org' 
      ? balanceInfo.balance + (balanceInfo.personalCredits || 0) 
      : balanceInfo.balance;
      
    availableCredits -= (balanceInfo.inFlightCredits || 0);

    console.log(`[startBulkRevealAdmin] User: ${userId}, Scope: ${balanceInfo.scope}, Available: ${availableCredits}, InFlight: ${balanceInfo.inFlightCredits}`);
    if (availableCredits <= 0) {
      return res.status(400).json({ msg: "Insufficient credits to start bulk reveal for this user (they may have other reveals currently running)." });
    }

    const itemCount = await ListItem.countDocuments({ listId: list._id });
    if (itemCount > 700) {
      return res.status(400).json({ msg: "The limit for bulk reveal is 700 profiles per request. Please split the list into smaller lists." });
    }

    // Trigger middleware job asynchronously
    const middlewareUrl = process.env.MIDDLEWARE_URL || "http://localhost:3001";
    axios.post(`${middlewareUrl}/api/jobs/bulk-reveal`, {
      userId,
      listId,
      revealType
    }).catch(err => console.error("Failed to start middleware bulk reveal:", err.response?.data || err.message));

    // We let middleware calculate total items to reveal and set status to running
    list.revealStatus = 'running';
    list.revealProgress = { total: 0, current: 0, type: revealType };
    await list.save();

    return res.status(202).json({ msg: "Bulk reveal started", list });
  } catch (err) {
    console.error("Error starting bulk reveal (admin):", err);
    return res.status(500).json({ msg: "Server error", error: err.message });
  }
};

exports.getItemsToRevealInternal = async (req, res) => {
  const { listId } = req.params;
  const { type } = req.query; // 'email', 'phone', 'both'
  const internalSecret = req.headers['x-internal-secret'];
  if (internalSecret !== (process.env.INTERNAL_SECRET || 'secret123')) return res.status(403).json({ msg: "Forbidden" });
  
  try {
    // Determine which items need revealing
    const query = { listId };
    
    if (type === 'email') {
      query.email = { $in: ["", "Not available", null] };
    } else if (type === 'phone') {
      query.phone = { $in: ["", "Not available", null] };
    } else if (type === 'both') {
      query.$or = [ 
        { email: { $in: ["", "Not available", null] } }, 
        { phone: { $in: ["", "Not available", null] } } 
      ];
    }

    // Only select fields needed for the request to Mawsool API
    const items = await ListItem.find(query).select('public_profile_url linkedin_url profile_url public_identifier email phone raw').lean();
    return res.status(200).json({ items });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// Helper function to safely compare company names
const isSameCompany = (companyA, companyB) => {
  if (!companyA || !companyB) return false;
  const normalize = (c) => String(c).toLowerCase().replace(/[^a-z0-9]/g, '');
  const a = normalize(companyA);
  const b = normalize(companyB);
  if (a === '' || b === '') return false;
  return a.includes(b) || b.includes(a);
};

async function acquireRevealContactLock(RevealedContact, { userId, contactType, publicIdentifier, profileUrl, leadId }) {
  const q = { userId, contactType };
  if (publicIdentifier) q.publicIdentifier = publicIdentifier;
  else if (profileUrl) q.profileUrl = profileUrl;
  else q.leadId = leadId;

  const r = await RevealedContact.updateOne(
    q,
    { $setOnInsert: { userId, contactType, publicIdentifier: publicIdentifier || undefined, profileUrl: profileUrl || undefined, leadId: leadId || undefined, status: 'pending' } },
    { upsert: true }
  );

  const inserted = !!(r && (r.upsertedCount || r.upsertedId || (Array.isArray(r.upserted) && r.upserted.length > 0)));
  return { inserted, query: q };
}

exports.updateRevealedItemInternal = async (req, res) => {
  const { listId } = req.params;
  const { userId, itemId, itemData, revealType, jobId, skipBilling } = req.body;
  const internalSecret = req.headers['x-internal-secret'];
  if (internalSecret !== (process.env.INTERNAL_SECRET || 'secret123')) return res.status(403).json({ msg: "Forbidden" });
  
  try {
    const list = await List.findById(listId);
    if (!list) return res.status(404).json({ error: "List not found" });

    // Determine cost based on found data
    let cost = 0;
    let foundEmail = false;
    let foundPhone = false;

    // Check if new valid email was found
    const wantsEmail = revealType === 'email' || revealType === 'both';
    const wantsPhone = revealType === 'phone' || revealType === 'both';

    const emailEval = wantsEmail ? evaluateEmailForBilling(itemData || {}) : { email: "", status: "", candidates: [], hasAny: false, hasMissingStatus: false, hasBillable: false, allNonBillable: false };
    const phoneEval = wantsPhone ? evaluatePhoneForBilling(itemData || {}) : { candidates: [], hasAny: false, hasBillable: false, best: "" };

    let emailVal = emailEval.email || (itemData && (itemData.contact__email || itemData.email)) || "";
    const emailStatus = emailEval.status;
    if (wantsEmail && emailEval.hasBillable && emailVal && emailVal !== "Not available") foundEmail = true;
    
    // Check if new valid phone was found (exclude work hq)
    let finalPhoneVal = "";
    if (wantsPhone && phoneEval.hasBillable) {
      foundPhone = true;
      finalPhoneVal = phoneEval.best || "";
    }

    const existing = await ListItem.findById(itemId);
    if (!existing) return res.status(404).json({ error: "List item not found" });

    // --- DOUBLE CHARGE PREVENTION ---
    const RevealedContact = require('../models/RevealedContact');
    const profileUrl = existing.raw?.public_profile_url || existing.raw?.linkedin_url || existing.raw?.profile_url || "";
    const publicId = existing.raw?.public_identifier || existing.raw?.id || existing.raw?.person_id || "";

    const queryOr = [];
    if (publicId) queryOr.push({ publicIdentifier: publicId });
    if (profileUrl) queryOr.push({ profileUrl });

    let alreadyHasEmail = false;
    let alreadyHasPhone = false;

    // Check if already in RevealedContact
    if (queryOr.length > 0) {
      const pastReveals = await RevealedContact.find({ userId, $or: queryOr }).select('contactType status').lean();
      pastReveals.forEach(r => {
        if (r.status === 'charged' && r.contactType === 'email') alreadyHasEmail = true;
        if (r.status === 'charged' && r.contactType === 'phone') alreadyHasPhone = true;
      });
    }

    // Also check if existing item already has valid data (in case it was added manually or via other means)
    if (!alreadyHasEmail) {
      const existingEmailEval = evaluateEmailForBilling(existing.raw || {});
      if (existingEmailEval.hasBillable && existingEmailEval.email && !String(existingEmailEval.email).includes('*')) {
        alreadyHasEmail = true;
      } else if (existing.email && existing.email !== "Not available" && !String(existing.email).includes('*')) {
        const existingTopStatus = normalizeEmailStatus(existing.raw?.contact__email_status || existing.raw?.email_status);
        if (existingTopStatus === 'deliverable' || existingTopStatus === 'risky') alreadyHasEmail = true;
      }
    }
    if (!alreadyHasPhone) {
      const existingPhoneEval = evaluatePhoneForBilling(existing.raw || {});
      if (existingPhoneEval.hasBillable && existingPhoneEval.best && !String(existingPhoneEval.best).includes('*')) alreadyHasPhone = true;
      else if (existing.phone && existing.phone !== "Not available" && !String(existing.phone).includes('*')) {
        const parts = String(existing.phone).split(',').map(s => s.trim()).filter(Boolean);
        const hasPersonal = parts.some(p => !isLikelyCorporatePhone(p));
        if (hasPersonal) alreadyHasPhone = true;
      }
    }
    
    let emailLock = null;
    let phoneLock = null;
    let chargeEmail = false;
    let chargePhone = false;

    if (!skipBilling) {
      if (wantsEmail && emailEval.hasBillable && !alreadyHasEmail) {
        emailLock = await acquireRevealContactLock(RevealedContact, { userId, contactType: 'email', publicIdentifier: publicId, profileUrl, leadId: existing._id });
        if (emailLock.inserted) chargeEmail = true;
        else alreadyHasEmail = true;
      }

      if (wantsPhone && phoneEval.hasBillable && !alreadyHasPhone) {
        phoneLock = await acquireRevealContactLock(RevealedContact, { userId, contactType: 'phone', publicIdentifier: publicId, profileUrl, leadId: existing._id });
        if (phoneLock.inserted) chargePhone = true;
        else alreadyHasPhone = true;
      }
    }

    cost = skipBilling ? 0 : ((chargeEmail ? 5 : 0) + (chargePhone ? 20 : 0));

    const billing = {
      revealType,
      foundEmail,
      foundPhone,
      alreadyHasEmail,
      alreadyHasPhone,
      emailStatus: emailStatus,
      reasons: []
    };

    if (revealType === 'email') {
      if (!foundEmail) {
        if (!emailEval.hasAny) billing.reasons.push("no_email_returned");
        else if (emailEval.hasMissingStatus) billing.reasons.push("pending_email_verification");
        else if (emailEval.allNonBillable) billing.reasons.push("no_billable_email_all_non_billable");
        else billing.reasons.push("no_billable_email");
      } else if (alreadyHasEmail) {
        billing.reasons.push("already_has_email");
      } else {
        billing.reasons.push("charged_email");
      }
    } else if (revealType === 'phone') {
      if (!foundPhone) billing.reasons.push(phoneEval.hasAny ? "no_billable_phone_corporate_only" : "no_phone_returned");
      else if (alreadyHasPhone) billing.reasons.push("already_has_phone");
      else billing.reasons.push("charged_phone");
    } else if (revealType === 'both') {
      if (foundEmail && !alreadyHasEmail) billing.reasons.push("charged_email");
      else if (foundEmail && alreadyHasEmail) billing.reasons.push("already_has_email");
      else if (!emailEval.hasAny) billing.reasons.push("no_email_returned");
      else if (emailEval.hasMissingStatus) billing.reasons.push("pending_email_verification");
      else billing.reasons.push("no_billable_email");

      if (foundPhone && !alreadyHasPhone) billing.reasons.push("charged_phone");
      else if (foundPhone && alreadyHasPhone) billing.reasons.push("already_has_phone");
      else billing.reasons.push(phoneEval.hasAny ? "no_billable_phone_corporate_only" : "no_phone_returned");
    }

    // Check and deduct credits
    if (cost > 0) {
      try {
        await deductCreditsForUser(userId, cost, `Bulk Reveal (${revealType}) for list ${listId}${jobId ? ` [Job ${jobId}]` : ''}`);
        if (emailLock && emailLock.inserted) await RevealedContact.updateOne(emailLock.query, { $set: { status: 'charged' } });
        if (phoneLock && phoneLock.inserted) await RevealedContact.updateOne(phoneLock.query, { $set: { status: 'charged' } });
      } catch (err) {
        if (emailLock && emailLock.inserted) await RevealedContact.deleteOne({ ...emailLock.query, status: 'pending' });
        if (phoneLock && phoneLock.inserted) await RevealedContact.deleteOne({ ...phoneLock.query, status: 'pending' });
        // Insufficient credits! Stop the job.
        list.revealStatus = 'stopped_no_credits';
        await list.save();
        return res.status(402).json({ stop: true, msg: "Out of credits" });
      }
    }

    // We update the item if we successfully found something or just to mark it as processed (so we don't retry)
    const setFields = {};
    if (foundEmail) setFields.email = emailVal;
    if (foundPhone) setFields.phone = finalPhoneVal || itemData.phone;
    
    // PREVENT DATA LOSS: Only overwrite existing raw with new valid data
    const newRaw = { ...existing.raw };
    
    // --- COMPANY CONTEXT GUARD ---
    const origCompany = existing.raw?.company || existing.company || "";
    const revealCompany = itemData.contact__organization_name || itemData.organization_name || itemData.company || "";
    let isMismatch = false;
    if (origCompany && revealCompany && !isSameCompany(origCompany, revealCompany)) {
      isMismatch = true;
    }
    
    const excludedFirmographicKeys = [
      'company', 'company_city', 'company_country', 'company_headcount', 'company_linkedin_url', 'company_state', 
      'contact__organization_name', 'organization__address', 'organization__annual_revenue', 'organization__city', 
      'organization__country', 'organization__estimated_num_employees', 'organization__facebook_url', 
      'organization__founded_year', 'organization__industry', 'organization__industries', 'organization__last_raised_at', 
      'organization__latest_funding', 'organization__latest_funding_amount', 'organization__linkedin_url', 
      'organization__state', 'organization__technologies', 'organization__total_funding', 'organization__twitter_url', 
      'organization__website', 'organization__website_url', 'organization__keywords', 'organization__logo_url',
      'organization__short_description', 'organization__raw_address', 'organization__current_technologies',
      'technologies', 'facebook_url', 'twitter_url', 'founded_year', 'employees', 'industry', 'industries', 
      'logo', 'website', 'contact__headline', 'contact__title', 'contact__photo_url'
    ];

    for (const key in itemData) {
      if (!wantsPhone && (key === 'phone' || key === 'phones' || key === 'contact__phone_numbers')) continue;
      if (!wantsEmail && (key === 'email' || key === 'contact__email' || key === 'contact__all_emails' || key === 'contact__emails' || key === 'contact__email_status' || key === 'email_status')) continue;
      if (isMismatch && excludedFirmographicKeys.includes(key)) {
        continue; // Skip merging mismatched company data
      }
      const isArrayAndEmpty = Array.isArray(itemData[key]) && itemData[key].length === 0;
      if (itemData[key] === null || itemData[key] === undefined || itemData[key] === "" || isArrayAndEmpty) continue;
      if (!Array.isArray(itemData[key]) && isPlaceholderContact(itemData[key])) continue;
      if (key === 'contact__all_emails' || key === 'contact__emails') {
        if (isPlaceholderArray(itemData[key], (e) => e?.email || e?.sanitized_email)) continue;
      }
      if (key === 'contact__phone_numbers' || key === 'phones') {
        if (isPlaceholderArray(itemData[key], (p) => p?.sanitized_number || p?.raw_number || p?.number)) continue;
      }
      newRaw[key] = itemData[key];
    }
    
    // Check if we are still waiting for a webhook
    const isAwaitingWebhook = isAwaitingAsyncWebhook(itemData, emailEval, wantsEmail);

    // Sync explicit email status if found
    if (itemData.contact__email_status || itemData.email_status) {
       newRaw.email_status = itemData.contact__email_status || itemData.email_status;
       setFields.email_status = newRaw.email_status;
    }

    // Prevent wiping out valid top-level email/phone if the provider didn't return them this time
    if (!setFields.email && existing.email && !isPlaceholderContact(existing.email)) {
      setFields.email = existing.email;
    } else if (!setFields.email && (revealType === 'email' || revealType === 'both')) {
      const displayEmail = firstDisplayEmail(emailEval);
      if (displayEmail) {
        setFields.email = displayEmail;
      } else if (!isAwaitingWebhook) {
        // Mark as not available so UI knows we tried and failed (only if not waiting for webhook)
        setFields.email = "Not available";
        newRaw.email = "Not available";
      }
    }

    if (!setFields.phone && existing.phone && !isPlaceholderContact(existing.phone)) {
      setFields.phone = existing.phone;
    } else if (!setFields.phone && (revealType === 'phone' || revealType === 'both')) {
      const displayPhone = firstDisplayPhone(phoneEval);
      if (displayPhone) {
        setFields.phone = displayPhone;
      } else if (!isAwaitingWebhook) {
        // Mark as not available so UI knows we tried and failed (only if not waiting for webhook)
        setFields.phone = "Not available";
        newRaw.phone = "Not available";
      }
    }

    // Explicitly restore top-level firmographics before updating
    const firmFields = [
      'organization__facebook_url', 'facebook_url', 'organization__twitter_url', 'twitter_url', 
      'organization__technologies', 'technologies', 'organization__current_technologies',
      'organization__annual_revenue', 'annual_revenue', 'organization__total_funding', 'total_funding'
    ];
    firmFields.forEach(f => {
        if (existing.raw && existing.raw[f] && (!newRaw[f] || (Array.isArray(newRaw[f]) && newRaw[f].length === 0))) {
            newRaw[f] = existing.raw[f];
            setFields[f] = existing.raw[f];
        }
    });

    if (!isAwaitingWebhook) {
      setFields.status = 'revealed';
      newRaw.awaiting_webhook = false;
    } else {
      setFields.status = 'pending';
      newRaw.awaiting_webhook = true;
    }

    const savedContact = !!(foundEmail || foundPhone || firstDisplayEmail(emailEval) || firstDisplayPhone(phoneEval) || cost > 0);
    await markRevealProgressIfNeeded(listId, existing.raw, newRaw, savedContact);

    await ListItem.updateOne({ _id: itemId }, { $set: { ...setFields, raw: newRaw } });

    // Auto-save to 'saved leads' and record RevealedContact if we successfully revealed something new and paid for it
    if (cost > 0) {
      try {
        // Create RevealedContact records so the UI knows the user owns these
        if (foundEmail && !alreadyHasEmail) {
          await RevealedContact.create({
            userId, leadId: itemId, profileUrl, publicIdentifier: publicId, contactType: 'email', status: 'charged'
          });
        }
        if (foundPhone && !alreadyHasPhone) {
          await RevealedContact.create({
            userId, leadId: itemId, profileUrl, publicIdentifier: publicId, contactType: 'phone', status: 'charged'
          });
        }
      } catch (saveErr) {
        console.error("[Bulk Reveal] Failed to record RevealedContact:", saveErr);
      }
    }

    // Always auto-save to 'saved leads' list, mirroring single reveal behavior
    try {
      if (userId) {
        const List = require('../models/List');
        const ListKind = require('../models/ListKind');
        const names = ['saved leads', 'revealed search results', 'Saved Leads'];
        let savedLeadsList = await List.findOne({ name: { $in: names }, createdBy: userId });
        
        if (!savedLeadsList) {
          savedLeadsList = await List.create({ name: 'saved leads', createdBy: userId, status: 'active', listType: 'people' });
          await ListKind.updateOne({ listId: savedLeadsList._id }, { $set: { kind: 'revealed_search_results' } }, { upsert: true });
        } else if (savedLeadsList.status !== 'active') {
          // Fix any accidentally created 'pending' lists
          await List.updateOne({ _id: savedLeadsList._id }, { $set: { status: 'active', name: 'saved leads' } });
        }

        if (savedLeadsList && String(savedLeadsList._id) !== String(listId)) {
          const urls = [newRaw.public_profile_url, newRaw.linkedin_url, newRaw.profile_url].filter(Boolean).map(u => String(u).trim());
          const queryOr = [];
          if (publicId) queryOr.push({ 'raw.public_identifier': publicId });
          urls.forEach(u => {
            queryOr.push({ 'raw.public_profile_url': u });
            queryOr.push({ 'raw.linkedin_url': u });
            queryOr.push({ 'raw.profile_url': u });
          });

          if (queryOr.length > 0) {
            const savedItem = await ListItem.findOne({ listId: savedLeadsList._id, $or: queryOr });
            if (savedItem) {
              const newSavedRaw = { ...savedItem.raw, ...newRaw };
              await ListItem.updateOne({ _id: savedItem._id }, { $set: { ...setFields, raw: newSavedRaw } });
            } else {
              await ListItem.create({
                person_id: existing.person_id || publicId,
                name: existing.name || "",
                public_identifier: publicId,
                linkedin_url: newRaw.linkedin_url || "",
                public_profile_url: newRaw.public_profile_url || "",
                profile_picture_url: newRaw.profile_picture_url || "",
                location: existing.location || "",
                current_positions: existing.current_positions || {},
                listId: savedLeadsList._id,
                email: setFields.email || existing.email || "",
                phone: setFields.phone || existing.phone || "",
                status: setFields.status || existing.status || "revealed",
                raw: newRaw
              });
            }
          }
        }
      }
    } catch (saveErr) {
      console.error("[Bulk Reveal] Failed to auto-save to saved leads list:", saveErr);
    }

    // Broadcast newly revealed data and preserved firmographics to all other lists
    const urlsToSync = [newRaw.public_profile_url, newRaw.linkedin_url, newRaw.profile_url].filter(Boolean).map(u => String(u).trim());
    await syncToOtherLists(newRaw, publicId, urlsToSync, userId);

    if (jobId) {
      try {
        const leadKey = String(itemId);
        const name = existing?.name || existing?.raw?.contact__name || existing?.raw?.name || itemData?.contact__name || itemData?.contact__first_name || "";
        const linkedinUrl = existing?.raw?.public_profile_url || existing?.raw?.linkedin_url || existing?.raw?.profile_url || itemData?.contact__linkedin_url || "";

        await BulkRevealJobReport.updateOne(
          { jobId: String(jobId) },
          { $setOnInsert: { jobId: String(jobId), userId, listId, revealType, status: 'running' } },
          { upsert: true }
        );

        const updatedExisting = await BulkRevealJobReport.updateOne(
          { jobId: String(jobId), 'items.leadKey': leadKey },
          { $inc: { 'items.$.cost': cost, totalCost: cost, chargedCount: cost > 0 ? 1 : 0, zeroCostCount: cost === 0 ? 1 : 0 }, $set: { 'items.$.name': name, 'items.$.linkedinUrl': linkedinUrl } }
        );

        if (!updatedExisting || !updatedExisting.matchedCount) {
          await BulkRevealJobReport.updateOne(
            { jobId: String(jobId) },
            { $inc: { totalCost: cost, chargedCount: cost > 0 ? 1 : 0, zeroCostCount: cost === 0 ? 1 : 0 }, $push: { items: { $each: [{ leadKey, name, linkedinUrl, cost }], $slice: -500 } } },
            { upsert: true }
          );
        }
      } catch {}
    }

    return res.status(200).json({ success: true, cost, billing });
  } catch (err) {
    console.error("Reveal update error:", err);
    return res.status(500).json({ error: err.message });
  }
};

exports.updateRevealStatusInternal = async (req, res) => {
  const { listId } = req.params;
  // NEW: Extract userId and revealType from req.body
  const { status, total, jobId, userId, revealType } = req.body;
  const internalSecret = req.headers['x-internal-secret'];
  if (internalSecret !== (process.env.INTERNAL_SECRET || 'secret123')) return res.status(403).json({ msg: "Forbidden" });
  
  try {
    const update = { revealStatus: status };
    
    // Always respect the 'total' passed by the middleware (it is the true count of unrevealed items)
    if (total !== undefined) {
      update["revealProgress.total"] = total;
    }
    
    // When starting a new run, also reset the current progress counter to 0
    if (status === 'running' && total !== undefined) {
        update["revealProgress.current"] = 0;
    }

    await List.findByIdAndUpdate(listId, update);
    if (jobId) {
      const nextStatus = status === 'completed' ? 'completed' : (status === 'running' ? 'running' : 'failed');
      
      // NEW: Use upsert to guarantee the report exists for webhooks that arrive instantly
      const updateData = { status: nextStatus };
      const setOnInsertData = { jobId: String(jobId), listId: String(listId) };
      if (userId) setOnInsertData.userId = userId;
      if (revealType) setOnInsertData.revealType = revealType;

      await BulkRevealJobReport.updateOne(
        { jobId: String(jobId) }, 
        { $set: updateData, $setOnInsert: setOnInsertData },
        { upsert: true }
      );

      // Trigger email report when bulk reveal completes
      if (status === 'completed') {
        try {
          const report = await BulkRevealJobReport.findOne({ jobId: String(jobId) }).populate('userId', 'email');
          if (report && report.userId && report.userId.email) {
            let emailsRevealed = 0;
            let phonesRevealed = 0;
            
            for (const item of report.items) {
              if (item.cost === 5) emailsRevealed++;
              else if (item.cost === 20) phonesRevealed++;
              else if (item.cost === 25) { emailsRevealed++; phonesRevealed++; }
            }

            const sendEmail = require('../utils/sendEmail');
            const list = await List.findById(listId);
            const listName = list ? list.name : 'your list';
            const clientUrl = process.env.CLIENT_URL || 'https://leads.mawsool.tech';

            const emailHtml = `
              <div style="text-align: center;">
                <h2 style="color: #04145C;">Bulk Reveal Completed!</h2>
                <p>Your bulk reveal job for <strong>${listName}</strong> has successfully finished.</p>
                <div style="background-color: #f8f9fa; padding: 15px; border-radius: 8px; display: inline-block; text-align: left; margin: 20px 0;">
                  <p style="margin: 5px 0;"><strong>Emails Revealed:</strong> ${emailsRevealed}</p>
                  <p style="margin: 5px 0;"><strong>Phones Revealed:</strong> ${phonesRevealed}</p>
                  <p style="margin: 5px 0;"><strong>Credits Consumed:</strong> ${report.totalCost}</p>
                </div>
                <p>You can view your newly revealed leads in your <strong>Saved Leads</strong> list.</p>
                <a href="${clientUrl}/dashboard/lists" class="button">View My Lists</a>
              </div>
            `;

            await sendEmail({
              to: report.userId.email,
              subject: "Mawsool - Bulk Reveal Completed",
              html: emailHtml
            });
          }
        } catch (emailErr) {
          console.error("[Bulk Reveal] Failed to send completion email:", emailErr);
        }
      }
    }
    res.status(200).json({ status: "success" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.webhookSyncInternal = async (req, res) => {
  const { url, itemData, jobId } = req.body;
  const internalSecret = req.headers['x-internal-secret'];
  if (internalSecret !== (process.env.INTERNAL_SECRET || 'secret123')) return res.status(403).json({ msg: "Forbidden" });

  try {
    if (!url || !itemData) return res.status(400).json({ error: "Missing url or itemData" });
    console.log(`[Webhook-Sync] incoming jobId=${jobId || "none"} url=${url}`);
    if (!jobId) {
      let publicIdentifier = "";
      try {
        const path = new URL(url).pathname;
        const match = path.match(/\/in\/([^/?]+)/);
        if (match) publicIdentifier = decodeURIComponent(match[1]);
      } catch {}

      const queryOr = listItemIdentityOr({ url, publicIdentifier });
      if (!queryOr.length) return res.status(200).json({ status: "success", updated: 0 });

      const matchingItems = await ListItem.find({ $or: queryOr });
      let updatedCount = 0;

      for (const item of matchingItems) {
        const existingEmails = new Set();
        if (item.email && item.email !== "Not available" && !String(item.email).includes('*')) existingEmails.add(String(item.email).toLowerCase());
        if (item.raw?.contact__email && item.raw.contact__email !== "Not available") existingEmails.add(String(item.raw.contact__email).toLowerCase());

        const existingAll = Array.isArray(item.raw?.contact__all_emails) ? item.raw.contact__all_emails : [];
        existingAll.forEach(e => {
          const em = e && (e.email || e.sanitized_email);
          if (em && String(em).toLowerCase() !== 'not available') existingEmails.add(String(em).toLowerCase());
        });

        if (existingEmails.size === 0) continue;

        const incomingAll = Array.isArray(itemData.contact__all_emails) ? itemData.contact__all_emails : [];
        const mergedAll = existingAll.map(e => {
          const em = e && (e.email || e.sanitized_email);
          if (!em) return e;
          const inc = incomingAll.find(x => {
            const xem = x && (x.email || x.sanitized_email);
            return xem && String(xem).toLowerCase() === String(em).toLowerCase();
          });
          if (!inc) return e;
          const nextStatus = inc.verificationStatus || inc.verification_status || inc.verificationStatus || inc.status;
          if (!nextStatus) return e;
          return { ...e, verificationStatus: nextStatus };
        });

        const emailEval = evaluateEmailForBilling({ contact__all_emails: mergedAll });
        const setFields = {};
        const newRaw = { ...item.raw, contact__all_emails: mergedAll };

        if (emailEval.hasBillable) {
          setFields.email = emailEval.email || item.email;
          setFields.email_status = emailEval.status;
          newRaw.contact__email = emailEval.email || newRaw.contact__email;
          newRaw.contact__email_status = emailEval.status;
          newRaw.email_status = emailEval.status;
        } else if (emailEval.hasAny && !emailEval.hasMissingStatus && emailEval.allNonBillable) {
          setFields.email_status = "undeliverable";
          newRaw.contact__email_status = "undeliverable";
          newRaw.email_status = "undeliverable";
        }

        setFields.status = 'revealed';

        await ListItem.updateOne({ _id: item._id }, { $set: { ...setFields, raw: newRaw } });
        updatedCount++;
      }

      return res.status(200).json({ success: true, updatedCount });
    }

    const report = await BulkRevealJobReport.findOne({ jobId: String(jobId) }).select('userId revealType listId').lean();
    if (!report) return res.status(200).json({ success: true, updatedCount: 0 });

    const revealType = report.revealType;
    const wantsEmail = revealType === 'email' || revealType === 'both';
    const wantsPhone = revealType === 'phone' || revealType === 'both';

    const emailEval = wantsEmail ? evaluateEmailForBilling(itemData || {}) : { email: "", status: "", candidates: [], hasAny: false, hasMissingStatus: false, hasBillable: false, allNonBillable: false };
    const phoneEval = wantsPhone ? evaluatePhoneForBilling(itemData || {}) : { candidates: [], hasAny: false, hasBillable: false, best: "" };
    const foundEmail = wantsEmail && emailEval.hasBillable;
    const foundPhone = wantsPhone && phoneEval.hasBillable;
    const emailVal = emailEval.email || itemData.contact__email || itemData.email || "";
    const phoneVal = phoneEval.best || "";

    let publicIdentifier = "";
    try {
      const path = new URL(url).pathname;
      const match = path.match(/\/in\/([^/?]+)/);
      if (match) publicIdentifier = decodeURIComponent(match[1]);
    } catch {}

    const queryOr = listItemIdentityOr({ url, publicIdentifier });
    if (!queryOr.length) return res.status(200).json({ status: "success", updated: 0 });

    const matchingItems = await ListItem.find({ $or: queryOr });
    const RevealedContact = require('../models/RevealedContact');
    let updatedCount = 0;

    for (const item of matchingItems) {
      const list = await List.findById(item.listId).select('createdBy').lean();
      if (!list) continue;
      if (String(list.createdBy) !== String(report.userId)) continue;

      const profileUrl = item.raw?.public_profile_url || item.raw?.linkedin_url || item.raw?.profile_url || "";
      const publicId = item.raw?.public_identifier || item.raw?.id || item.raw?.person_id || publicIdentifier || "";

      const rcQueryOr = [];
      if (publicId) rcQueryOr.push({ publicIdentifier: publicId });
      if (profileUrl) rcQueryOr.push({ profileUrl });

      let alreadyHasEmail = false;
      let alreadyHasPhone = false;

      if (rcQueryOr.length > 0) {
        const pastReveals = await RevealedContact.find({ userId: report.userId, $or: rcQueryOr }).select('contactType status').lean();
        pastReveals.forEach(r => {
          if (r.status === 'charged' && r.contactType === 'email') alreadyHasEmail = true;
          if (r.status === 'charged' && r.contactType === 'phone') alreadyHasPhone = true;
        });
      }

      if (!alreadyHasEmail) {
        const exEmailEval = evaluateEmailForBilling(item.raw || {});
        if (exEmailEval.hasBillable && exEmailEval.email && !String(exEmailEval.email).includes('*')) alreadyHasEmail = true;
      }

      if (!alreadyHasPhone) {
        const exPhoneEval = evaluatePhoneForBilling(item.raw || {});
        if (exPhoneEval.hasBillable && exPhoneEval.best && !String(exPhoneEval.best).includes('*')) alreadyHasPhone = true;
      }

      let emailLock = null;
      let phoneLock = null;
      let chargeEmail = false;
      let chargePhone = false;

      if (wantsEmail && emailEval.hasBillable && !alreadyHasEmail) {
        emailLock = await acquireRevealContactLock(RevealedContact, { userId: report.userId, contactType: 'email', publicIdentifier: publicId, profileUrl, leadId: item._id });
        if (emailLock.inserted) chargeEmail = true;
        else alreadyHasEmail = true;
      }
      if (wantsPhone && phoneEval.hasBillable && !alreadyHasPhone) {
        phoneLock = await acquireRevealContactLock(RevealedContact, { userId: report.userId, contactType: 'phone', publicIdentifier: publicId, profileUrl, leadId: item._id });
        if (phoneLock.inserted) chargePhone = true;
        else alreadyHasPhone = true;
      }

      const cost = (chargeEmail ? 5 : 0) + (chargePhone ? 20 : 0);

      if (cost > 0) {
        try {
          await deductCreditsForUser(report.userId, cost, `[Webhook Sync][Job ${jobId}][List ${String(item.listId)}] Async Reveal data for ${publicId || url}`);
          if (emailLock && emailLock.inserted) await RevealedContact.updateOne(emailLock.query, { $set: { status: 'charged' } });
          if (phoneLock && phoneLock.inserted) await RevealedContact.updateOne(phoneLock.query, { $set: { status: 'charged' } });
        } catch {
          if (emailLock && emailLock.inserted) await RevealedContact.deleteOne({ ...emailLock.query, status: 'pending' });
          if (phoneLock && phoneLock.inserted) await RevealedContact.deleteOne({ ...phoneLock.query, status: 'pending' });
          continue;
        }
      }

      const setFields = {};
      if (foundEmail) setFields.email = emailVal;
      else {
        const displayEmail = firstDisplayEmail(emailEval);
        if (displayEmail && isPlaceholderContact(item.email)) setFields.email = displayEmail;
      }
      if (foundPhone) setFields.phone = phoneVal;
      else {
        const displayPhone = firstDisplayPhone(phoneEval);
        if (displayPhone && isPlaceholderContact(item.phone)) setFields.phone = displayPhone;
      }

      const newRaw = { ...item.raw };

      const origCompany = item.raw?.company || item.company || "";
      const revealCompany = itemData.contact__organization_name || itemData.organization_name || itemData.company || "";
      const isMismatch = !!(origCompany && revealCompany && !isSameCompany(origCompany, revealCompany));

      const excludedFirmographicKeys = [
        'company', 'company_city', 'company_country', 'company_headcount', 'company_linkedin_url', 'company_state',
        'contact__organization_name', 'organization__address', 'organization__annual_revenue', 'organization__city',
        'organization__country', 'organization__estimated_num_employees', 'organization__facebook_url',
        'organization__founded_year', 'organization__industry', 'organization__industries', 'organization__last_raised_at',
        'organization__latest_funding', 'organization__latest_funding_amount', 'organization__linkedin_url',
        'organization__state', 'organization__technologies', 'organization__total_funding', 'organization__twitter_url',
        'organization__website', 'organization__website_url', 'organization__keywords', 'organization__logo_url',
        'organization__short_description', 'organization__raw_address', 'organization__current_technologies',
        'technologies', 'facebook_url', 'twitter_url', 'founded_year', 'employees', 'industry', 'industries',
        'logo', 'website', 'contact__headline', 'contact__title', 'contact__photo_url'
      ];

      for (const key in itemData) {
        if (!wantsPhone && (key === 'phone' || key === 'phones' || key === 'contact__phone_numbers')) continue;
        if (!wantsEmail && (key === 'email' || key === 'contact__email' || key === 'contact__all_emails' || key === 'contact__emails' || key === 'contact__email_status' || key === 'email_status')) continue;
        if (isMismatch && excludedFirmographicKeys.includes(key)) continue;
        const isArrayAndEmpty = Array.isArray(itemData[key]) && itemData[key].length === 0;
        if (itemData[key] === null || itemData[key] === undefined || itemData[key] === "" || isArrayAndEmpty) continue;
        if (!Array.isArray(itemData[key]) && isPlaceholderContact(itemData[key])) continue;
        if ((key === 'contact__all_emails' || key === 'contact__emails') && isPlaceholderArray(itemData[key], (e) => e?.email || e?.sanitized_email)) continue;
        if ((key === 'contact__phone_numbers' || key === 'phones') && isPlaceholderArray(itemData[key], (p) => p?.sanitized_number || p?.raw_number || p?.number)) continue;
        newRaw[key] = itemData[key];
      }

      if (wantsEmail && (itemData.contact__email_status || itemData.email_status)) {
        newRaw.email_status = itemData.contact__email_status || itemData.email_status;
        setFields.email_status = newRaw.email_status;
      }

      setFields.status = isAwaitingAsyncWebhook(itemData, emailEval, wantsEmail) ? 'pending' : 'revealed';
      newRaw.awaiting_webhook = setFields.status === 'pending';

      const savedContact = !!(foundEmail || foundPhone || firstDisplayEmail(emailEval) || firstDisplayPhone(phoneEval) || cost > 0);
      await markRevealProgressIfNeeded(item.listId, item.raw, newRaw, savedContact);

      await ListItem.updateOne({ _id: item._id }, { $set: { ...setFields, raw: newRaw } });
      updatedCount++;

      if (String(item.listId) === String(report.listId)) {
        try {
          const leadKey = String(item._id);
          const name = item?.name || item?.raw?.contact__name || item?.raw?.name || itemData?.contact__name || itemData?.contact__first_name || "";
          const linkedinUrl = item?.raw?.public_profile_url || item?.raw?.linkedin_url || item?.raw?.profile_url || url;

          const updatedExisting = await BulkRevealJobReport.updateOne(
            { jobId: String(jobId), 'items.leadKey': leadKey },
            { $inc: { 'items.$.cost': cost, totalCost: cost, chargedCount: cost > 0 ? 1 : 0, zeroCostCount: cost === 0 ? 1 : 0 }, $set: { 'items.$.name': name, 'items.$.linkedinUrl': linkedinUrl } }
          );

          if (!updatedExisting || !updatedExisting.matchedCount) {
            await BulkRevealJobReport.updateOne(
              { jobId: String(jobId) },
              { $inc: { totalCost: cost, chargedCount: cost > 0 ? 1 : 0, zeroCostCount: cost === 0 ? 1 : 0 }, $push: { items: { $each: [{ leadKey, name, linkedinUrl, cost }], $slice: -500 } } }
            );
          }
        } catch {}
      }

      // Auto-save to 'saved leads' list, mirroring single reveal behavior
      try {
        if (report.userId) {
          const List = require('../models/List');
          const ListKind = require('../models/ListKind');
          const names = ['saved leads', 'revealed search results', 'Saved Leads'];
          let savedLeadsList = await List.findOne({ name: { $in: names }, createdBy: report.userId });
          
          if (!savedLeadsList) {
            savedLeadsList = await List.create({ name: 'saved leads', createdBy: report.userId, status: 'active', listType: 'people' });
            await ListKind.updateOne({ listId: savedLeadsList._id }, { $set: { kind: 'revealed_search_results' } }, { upsert: true });
          } else if (savedLeadsList.status !== 'active') {
            await List.updateOne({ _id: savedLeadsList._id }, { $set: { status: 'active', name: 'saved leads' } });
          }

          if (savedLeadsList && String(savedLeadsList._id) !== String(item.listId)) {
            const urls = [newRaw.public_profile_url, newRaw.linkedin_url, newRaw.profile_url].filter(Boolean).map(u => String(u).trim());
            const queryOrSaved = [];
            if (publicId) queryOrSaved.push({ 'raw.public_identifier': publicId });
            urls.forEach(u => {
              queryOrSaved.push({ 'raw.public_profile_url': u });
              queryOrSaved.push({ 'raw.linkedin_url': u });
              queryOrSaved.push({ 'raw.profile_url': u });
            });

            if (queryOrSaved.length > 0) {
              const savedItem = await ListItem.findOne({ listId: savedLeadsList._id, $or: queryOrSaved });
              if (savedItem) {
                const newSavedRaw = { ...savedItem.raw, ...newRaw };
                await ListItem.updateOne({ _id: savedItem._id }, { $set: { ...setFields, raw: newSavedRaw } });
              } else {
                await ListItem.create({
                  person_id: item.person_id || publicId,
                  name: item.name || "",
                  public_identifier: publicId,
                  linkedin_url: newRaw.linkedin_url || "",
                  public_profile_url: newRaw.public_profile_url || "",
                  profile_picture_url: newRaw.profile_picture_url || "",
                  location: item.location || "",
                  current_positions: item.current_positions || {},
                  listId: savedLeadsList._id,
                  email: setFields.email || item.email || "",
                  phone: setFields.phone || item.phone || "",
                  status: 'revealed',
                  raw: newRaw
                });
              }
            }
          }
        }
      } catch (saveErr) {
        console.error("[Webhook Sync] Failed to auto-save to saved leads list:", saveErr);
      }

      try {
        const revealEvents = require('../utils/revealEvents');
        const types = [];
        if (foundEmail || (setFields.email && !isPlaceholderContact(setFields.email))) types.push('email');
        if (foundPhone || (setFields.phone && !isPlaceholderContact(setFields.phone))) types.push('phone');
        const pUrl = item.raw?.public_profile_url || item.raw?.linkedin_url || item.raw?.profile_url || url;
        if (pUrl && types.length > 0) {
          revealEvents.emit(report.userId, { profileUrl: pUrl, types, leadIdsAffected: [item._id], emails: newRaw.contact__all_emails, email_status: newRaw.email_status, phones: newRaw.contact__phone_numbers, phone_status: newRaw.phone_status, technologies: newRaw.organization__current_technologies || newRaw.organization__technologies || newRaw.technologies });
        }
      } catch {}
    }

    return res.status(200).json({ success: true, updatedCount });
  } catch (err) {
    console.error("Webhook sync error:", err);
    return res.status(500).json({ error: err.message });
  }
};
