
const express = require("express");
const router = express.Router();
const axios = require("axios");
const { isAuthenticated } = require("../middlewares/authMiddleware");
const SearchSnapshot = require("../models/SearchSnapshot");
const List = require("../models/List");
const ListItem = require("../models/ListItem");

const SIZE_BUCKETS = ["1_10", "11_50", "51_200", "201_500", "501_1000", "1001_5000", "5001_10000", "10001"];

const normalizeHeadcount = (size) => {
  if (!size) return "";
  const s = String(size);
  if (s.includes("-") || s.includes("+")) return s;
  if (s.includes("_")) return s.replace(/_/g, "-");

  const val = parseInt(s.replace(/,/g, ""));
  if (isNaN(val)) return s;

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
  return s;
};

const BASE_API_URL = process.env.MAWSOOL_SEARCH_API || "http://nswgw8w0w84ccscgoswckk0s.34.166.92.24.sslip.io";
const rateLimit = require("express-rate-limit");
const User = require("../models/User");

const extractPublicIdentifier = (item) => {
  if (!item || typeof item !== "object") return "";
  const candidates = [
    item.public_identifier,
    item.publicIdentifier,
    item.person_id,
    item.personId,
    item.id
  ];
  for (const c of candidates) {
    if (!c) continue;
    const s = String(c).trim();
    if (s) return s;
  }
  return "";
};

const buildEmailStatusIndexFromRaw = (raw) => {
  const out = new Map();
  const arr1 = Array.isArray(raw?.contact__all_emails) ? raw.contact__all_emails : [];
  const arr2 = Array.isArray(raw?.contact__emails) ? raw.contact__emails : [];
  const all = [...arr1, ...arr2];
  for (const e of all) {
    const em = e?.email || e?.sanitized_email;
    if (!em) continue;
    const k = String(em).trim().toLowerCase();
    if (!k) continue;
    const st = e?.verificationStatus || e?.status || raw?.contact__email_status || raw?.email_status || "";
    if (st) out.set(k, String(st));
  }
  return out;
};

const extractEmailObjectsFromRaw = (raw) => {
  const src =
    (Array.isArray(raw?.contact__all_emails) && raw.contact__all_emails.length > 0)
      ? raw.contact__all_emails
      : (Array.isArray(raw?.contact__emails) ? raw.contact__emails : []);

  const idx = buildEmailStatusIndexFromRaw(raw || {});
  const overall = String(raw?.contact__email_status || raw?.email_status || "") || "";

  const uniq = new Map();

  const add = (email, status) => {
    const em = String(email || "").trim();
    if (!em) return;
    const key = em.toLowerCase();
    if (uniq.has(key)) return;
    const st = String(status || idx.get(key) || overall || "").trim();
    uniq.set(key, { email: em, verificationStatus: st, status: st });
  };

  if (Array.isArray(src) && src.length > 0) {
    src.forEach((e) => {
      if (!e) return;
      if (typeof e === "string") {
        add(e, idx.get(String(e).trim().toLowerCase()) || overall);
        return;
      }
      const em = e.email || e.sanitized_email;
      const st = e.verificationStatus || e.status || idx.get(String(em || "").trim().toLowerCase()) || overall;
      add(em, st);
    });
  } else if (typeof raw?.email === "string" && raw.email.trim()) {
    raw.email
      .split(/[;,]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((em) => add(em, idx.get(em.toLowerCase()) || overall));
  }

  return Array.from(uniq.values());
};

const applyStoredEmailStatuses = async ({ userId, items }) => {
  try {
    if (!userId || !Array.isArray(items) || items.length === 0) return items;
    const ids = Array.from(new Set(items.map(extractPublicIdentifier).filter(Boolean)));
    if (!ids.length) return items;

    const lists = await List.find({ createdBy: userId }).select("_id").lean();
    const listIds = lists.map((l) => l._id);
    if (!listIds.length) return items;

    const candidates = await ListItem.find({
      listId: { $in: listIds },
      $or: [
        { "raw.public_identifier": { $in: ids } },
        { "raw.id": { $in: ids } },
        { "raw.person_id": { $in: ids } }
      ]
    })
      .select("raw updatedAt createdAt")
      .lean();

    if (!candidates.length) return items;

    const bestById = new Map();
    for (const c of candidates) {
      const raw = c.raw || {};
      const keys = [
        raw.public_identifier,
        raw.id,
        raw.person_id
      ]
        .map((v) => (v ? String(v).trim() : ""))
        .filter(Boolean);

      if (!keys.length) continue;
      const ts = new Date(c.updatedAt || c.createdAt || 0).getTime();
      for (const key of keys) {
        const prev = bestById.get(key);
        if (!prev || ts > prev.ts) {
          bestById.set(key, { ts, raw });
        }
      }
    }

    items.forEach((item) => {
      const pid = extractPublicIdentifier(item);
      if (!pid) return;
      const best = bestById.get(pid);
      if (!best || !best.raw) return;

      const raw = best.raw || {};
      const idx = buildEmailStatusIndexFromRaw(raw);
      const overall = String(raw.email_status || raw.contact__email_status || "") || "";

      if (overall) {
        item.email_status = overall;
        item.contact__email_status = overall;
      }

      const listEmails = extractEmailObjectsFromRaw(raw);
      if (listEmails.length > 0) {
        item.contact__all_emails = listEmails;
        item.contact__emails = listEmails;
      }

      if (!item.contact__all_emails || item.contact__all_emails.length === 0) {
        if (Array.isArray(raw.contact__all_emails) && raw.contact__all_emails.length > 0) {
          item.contact__all_emails = JSON.parse(JSON.stringify(raw.contact__all_emails));
        } else if (Array.isArray(raw.emails) && raw.emails.length > 0) {
          item.contact__all_emails = JSON.parse(JSON.stringify(raw.emails));
        }
      }

      const patchArray = (arr) => {
        if (!Array.isArray(arr)) return;
        for (let i = 0; i < arr.length; i++) {
          let e = arr[i];
          if (!e) continue;
          if (typeof e === "string") {
            const em = e.trim();
            const st = idx.get(em.toLowerCase()) || overall;
            arr[i] = { email: em, verificationStatus: st, status: st };
          } else {
            const em = e.email || e.sanitized_email;
            if (!em) continue;
            const st = idx.get(String(em).trim().toLowerCase()) || overall;
            if (st) {
              e.verificationStatus = st;
              e.status = st;
            }
          }
        }
      };

      patchArray(item.contact__all_emails);
      patchArray(item.contact__emails);
      patchArray(item.emails);

      if (pid === 'fawaz-alotaibi-2b789976' || pid === 'rayan-nassar-179a8155') {
        console.log(`DEBUG EMAIL STATUS FOR ${pid}:`);
        console.log(`idx:`, Array.from(idx.entries()));
        console.log(`item.emails after patch:`, JSON.stringify(item.emails));
        console.log(`item.contact__all_emails after patch:`, JSON.stringify(item.contact__all_emails));
      }
    });

    return items;
  } catch {
    return items;
  }
};

const PAID_SEARCH_PLANS = new Set(["BASIC", "PRO", "PREMIUM"]);

const getSearchRateMax = (req) => {
  const user = req.userObj;
  if (!user) return 15;
  if (user.role === "admin") return 100;
  const userPlan = String(user.planKey || "").toUpperCase();
  if (PAID_SEARCH_PLANS.has(userPlan)) return 100;
  const orgPlan = String(user.orgId?.planKey || "").toUpperCase();
  if (PAID_SEARCH_PLANS.has(orgPlan)) return 100;
  // Org plan is inherited and often not populated here; don't trap paid org members at 15/min.
  if (!user.planKey && user.orgId) return 100;
  return 15;
};

// 1. RATE LIMITER: 15/min for free, 100/min for paid (matches page caps)
const searchLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: getSearchRateMax,
  message: { error: "Too many search requests, please try again later." },
  skip: (req, res) => {
    // Skip rate limiting for background polling requests (limit: 0)
    return req.body && Number(req.body.limit) === 0;
  }
});

/**
 * @route GET /image
 * @desc Proxy ContactOut images to hide source
 * @access Public (Protected by URL whitelist)
 */
router.get("/image", async (req, res) => {
    // Support both 'url' (legacy/plain) and 'key' (obfuscated)
    let url = req.query.url || req.query.key;
    
    // 1. Validate URL
    if (!url || typeof url !== 'string') {
        return res.status(400).send("Invalid URL");
    }

    // --- DECODING LOGIC ---
    // If the URL looks like base64 (doesn't start with "http"), decode it first
    if (!url.startsWith("http")) {
        try {
            const decoded = Buffer.from(url, 'base64').toString('utf-8');
            // Basic sanity check on decoded string
            if (decoded.startsWith("http")) {
                url = decoded;
            }
        } catch (e) {
            // If decode fails, proceed with original (will likely fail regex check)
        }
    }

    // 2. Security Check: Whitelist domain
    // Pattern: https://images.contactout.com/... or https://logo.clearbit.com/... or https://img.logo.dev/...
    if (!url.startsWith("https://images.contactout.com/") && 
        !url.startsWith("https://logo.clearbit.com/") && 
        !url.startsWith("https://img.logo.dev/")) {
         return res.status(403).send("Forbidden");
    }

    try {
        const response = await axios({
            method: 'get',
            url: url,
            responseType: 'stream'
        });

        // 3. CACHING: Critical for performance
        // Set Cache-Control header to let browser/CDN cache the image for 24 hours
        // "public" = can be cached by CDNs/intermediaries
        // "max-age=86400" = 24 hours in seconds
        res.setHeader('Cache-Control', 'public, max-age=86400, immutable');

        if (response.headers['content-type']) {
            res.setHeader('Content-Type', response.headers['content-type']);
        }
        response.data.pipe(res);
    } catch (error) {
        console.error("[ImageProxy] Error:", error.message);
        res.status(502).send("Proxy Error");
    }
});

// Helper to automatically detect both " & " and " and " variants in search arrays
const expandAmpersandAnd = (obj) => {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) {
    const newArr = new Set();
    for (const item of obj) {
      if (typeof item === 'string') {
        newArr.add(item);
        if (item.includes(' & ')) {
          newArr.add(item.replace(/ & /g, ' and '));
        }
        if (/ and /i.test(item)) {
          newArr.add(item.replace(/ and /ig, ' & '));
        }
      } else {
        newArr.add(expandAmpersandAnd(item));
      }
    }
    return Array.from(newArr);
  }
  if (typeof obj === 'object') {
    const newObj = {};
    for (const [key, value] of Object.entries(obj)) {
      newObj[key] = expandAmpersandAnd(value);
    }
    return newObj;
  }
  return obj;
};

const expandUKCountry = (filters) => {
  if (!filters || !filters.countries) return filters;
  const newFilters = JSON.parse(JSON.stringify(filters));
  ['include', 'exclude'].forEach(key => {
    if (newFilters.countries[key] && Array.isArray(newFilters.countries[key])) {
      if (newFilters.countries[key].includes('GB') || newFilters.countries[key].includes('UK')) {
        const newSet = new Set(newFilters.countries[key]);
        newSet.add('GB');
        newSet.add('UK');
        newFilters.countries[key] = Array.from(newSet);
      }
    }
  });
  return newFilters;
};

/**
 * @route POST /search
 * @desc Proxy search requests to Middleware Service
 * @access Private
 */
router.post("/search", isAuthenticated, searchLimiter, async (req, res) => {
  try {
    const middlewareUrl = process.env.MAWSOOL_SEARCH_API || "http://localhost:3001";
    if (!middlewareUrl) {
       console.error("MAWSOOL_SEARCH_API is missing in .env");
       return res.status(500).json({ error: "Server configuration error" });
    }

    const { filters, page = 1, limit = 25, type = "people", seed, savedFilterId, excludeListIds } = req.body;
    
    // Extract from filters if it was passed there
    const actualExcludeListIds = excludeListIds || (filters && filters.excludeListIds);

    let exclude_public_ids = [];
    let exclude_numeric_ids = [];
    if (actualExcludeListIds && Array.isArray(actualExcludeListIds) && actualExcludeListIds.length > 0) {
      try {
        const userId = req.user.id || req.user._id || req.user.sub;
        const items = await ListItem.find({
            listId: { $in: actualExcludeListIds }
          }).select("raw").lean();

          exclude_public_ids = Array.from(new Set(items.map(item => {
            const raw = item.raw || {};
            // Extract the actual ID based on whatever is available
            let extractedId = raw.public_identifier || raw.id || raw.public_id;
            
            // Sometimes public_identifier might be a full URL, let's extract the ID if so
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

            // If it's a company and we don't have an ID, extract it from linkedin_url
            if (!extractedId && raw.organization__linkedin_url) {
               const match = raw.organization__linkedin_url.match(/company\/([^\/?#]+)/i);
               if (match && match[1]) extractedId = match[1];
            } else if (!extractedId && raw.linkedin_url) {
               // Extract ID from people linkedin URLs if public_identifier is somehow missing
               const match = raw.linkedin_url.match(/in\/([^\/?#]+)/i);
               if (match && match[1]) extractedId = match[1];
            }
            
            return extractedId;
          }).filter(Boolean)));
          
          exclude_numeric_ids = Array.from(new Set(items.map(item => {
              const raw = item.raw || {};
              return raw.numeric_id;
          }).filter(Boolean)));
      } catch (err) {
          console.error("[SearchProxy] Error fetching excludeListIds:", err.message);
        }
      }
      
      console.log("[SearchProxy] exclude_public_ids count:", exclude_public_ids.length);
      console.log("[SearchProxy] exclude_numeric_ids count:", exclude_numeric_ids.length);

      if (savedFilterId) {
      try {
        const userId = req.user.id || req.user._id || req.user.sub;
        const snapshotAny = await SearchSnapshot.findOne({
          userId,
          savedFilterId,
          expiresAt: { $gt: new Date() }
        }).lean();

        if (snapshotAny && snapshotAny.status === "ready") {
          // If publicIds is empty, it means the snapshot finished but found 0 results.
          if (!Array.isArray(snapshotAny.publicIds) || snapshotAny.publicIds.length === 0) {
            return res.json({
              items: [],
              total: "0",
              paging: { start: 0, page_count: 0, total_count: 0 }
            });
          }

          const safePage = parseInt(page, 10) || 1;
          const safeLimit = parseInt(limit, 10) || 10;
          const start = (safePage - 1) * safeLimit;
          const slice = snapshotAny.publicIds.slice(start, start + safeLimit);
          if (slice.length === 0) {
            return res.json({
              items: [],
              total: String(snapshotAny.originalTotalCount || snapshotAny.totalCount || snapshotAny.publicIds.length),
              paging: {
                start,
                page_count: 0,
                total_count: snapshotAny.totalCount || snapshotAny.publicIds.length
              }
            });
          }

          const middlewareKey = process.env.MAWSOOL_MIDDLEWARE_KEY || "mawsool_internal_a5d6d56f4227fbc84a09e859d06bc4d6";
          let profRes;
          try {
            profRes = await axios.post(`${middlewareUrl}/profiles/by-ids`, { public_ids: slice }, {
              headers: { 'x-api-key': middlewareKey },
              timeout: 120000
            });
          } catch (e) {
            console.error("[SearchProxy] snapshot profiles/by-ids request failed", e?.response?.data || e.message);
            profRes = null;
          }

          const items = await applyStoredEmailStatuses({
            userId,
            items: profRes?.data?.items || []
          });
          if (Array.isArray(items) && items.length > 0) {
            return res.json({
              items,
              total: String(snapshotAny.originalTotalCount || snapshotAny.totalCount || snapshotAny.publicIds.length),
              paging: {
                start,
                page_count: items.length,
                total_count: snapshotAny.totalCount || snapshotAny.publicIds.length
              }
            });
          }

          console.warn("[SearchProxy] snapshot profiles/by-ids returned empty; falling back to live search");
        } else {

        const safePage = parseInt(page, 10) || 1;
        if (safePage > 15) {
          if (snapshotAny && snapshotAny.status === "failed" && snapshotAny.error === "not_mena") {
            return res.status(403).json({ error: "Access denied." });
          }

          if (snapshotAny && snapshotAny.status === "failed") {
            return res.json({
              snapshot_failed: true,
              message: "Saved search snapshot failed to build. Please save the search again.",
              error: snapshotAny.error || "unknown_error",
              items: [],
              total: "0",
              paging: { start: 0, page_count: 0, total_count: 0 }
            });
          }

          // Handle missing snapshot
          if (!snapshotAny) {
            return res.json({
              snapshot_failed: true,
              message: "Saved search snapshot expired or not found. Please save the search again.",
              error: "snapshot_not_found",
              items: [],
              total: "0",
              paging: { start: 0, page_count: 0, total_count: 0 }
            });
          }

          // Handle snapshots stuck in "building" for more than 1 hour
          if (snapshotAny.status === "building") {
            const createdAt = new Date(snapshotAny.createdAt || snapshotAny.updatedAt || Date.now());
            const hoursOld = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60);
            if (hoursOld > 1) {
              return res.json({
                snapshot_failed: true,
                message: "Saved search snapshot failed to build. Please save the search again.",
                error: "stuck_in_building",
                items: [],
                total: "0",
                paging: { start: 0, page_count: 0, total_count: 0 }
              });
            }
          }

          return res.json({
            pending: true,
            message: "Saved search snapshot is still being prepared. Please try again shortly.",
            items: [],
            total: "0",
            paging: { start: 0, page_count: 0, total_count: 0 }
          });
        }
        }
      } catch (e) {
        const safePage = parseInt(page, 10) || 1;
        if (safePage > 15) {
          return res.json({
            snapshot_failed: true,
            message: "Saved search snapshot encountered an internal error. Please try again.",
            error: "snapshot_internal_error",
            items: [],
            total: "0",
            paging: { start: 0, page_count: 0, total_count: 0 }
          });
        }
      }
    }

    // 2. DAILY QUOTA CHECK (Skip if limit === 0 since it's just a background count poll)
    const user = await User.findById(req.user.id).populate('orgId', 'planKey');
    if (!user) return res.status(401).json({ error: "User not found" });

    const planKey = String(user.planKey || user.orgId?.planKey || "FREE").toUpperCase();
    const maxSearchPage = (planKey === "BASIC" || planKey === "PRO" || planKey === "PREMIUM") ? 100 : 15;
    const requestedPage = parseInt(page, 10) || 1;
    if (requestedPage > maxSearchPage) {
      return res.status(403).json({
        error: "Access denied.",
        maxPage: maxSearchPage,
      });
    }

    // Only count against daily quota if it's a real search (limit > 0)
    if (Number(limit) > 0) {
      // Reset counter if it's a new day
      const now = new Date();
      const lastDate = new Date(user.lastSearchDate || 0);
      const isSameDay = now.getDate() === lastDate.getDate() && 
                        now.getMonth() === lastDate.getMonth() && 
                        now.getFullYear() === lastDate.getFullYear();

      if (!isSameDay) {
        user.dailySearchCount = 0;
        user.lastSearchDate = now;
      }

      // Determine the user's specific limit
      const defaultLimit = planKey === "FREE" ? 75 : 150;
      const DAILY_LIMIT = user.customDailySearchLimit !== null && user.customDailySearchLimit !== undefined
        ? user.customDailySearchLimit
        : defaultLimit;
      
      if (user.dailySearchCount >= DAILY_LIMIT) {
         return res.status(429).json({ error: "Daily search limit reached." });
      }

      user.dailySearchCount += 1;
      await user.save();
    }

    // Use hardcoded key if env is missing during runtime (Fallback)
    const middlewareKey = process.env.MAWSOOL_MIDDLEWARE_KEY || "mawsool_internal_a5d6d56f4227fbc84a09e859d06bc4d6";
    
    console.log(`[SearchProxy] Proxying to ${middlewareUrl}/search with params:`, { page, limit, type });
    
    // Forward the request to the middleware service
    let expandedFilters = expandAmpersandAnd(filters);
    expandedFilters = expandUKCountry(expandedFilters);

    // Clean up excludeListIds from filters payload to avoid breaking middleware schema validation
    if (expandedFilters && expandedFilters.excludeListIds) {
      delete expandedFilters.excludeListIds;
    }

    const payloadData = {
        filters: expandedFilters,
        page,
        limit,
        type,
        seed
      };
      
      if (exclude_public_ids && exclude_public_ids.length > 0) {
        payloadData.exclude_public_ids = exclude_public_ids;
      }
      
      if (exclude_numeric_ids && exclude_numeric_ids.length > 0) {
        payloadData.exclude_numeric_ids = exclude_numeric_ids;
      }
      
      console.log(`[SearchProxy] Sending payload to middleware: ${JSON.stringify(payloadData)}`);

      const response = await axios.post(`${middlewareUrl}/search`, payloadData, {
        headers: {
          'x-api-key': middlewareKey
        },
        timeout: 120000
      });

    // --- NORMALIZATION LOGIC (Fix Headcount Ranges) ---
    if (response.data && response.data.items && Array.isArray(response.data.items)) {
        if (String(type || "people").toLowerCase() === "people") {
          response.data.items = await applyStoredEmailStatuses({
            userId: req.user.id || req.user._id || req.user.sub,
            items: response.data.items
          });
        }
        response.data.items.forEach(item => {
             if (item.headcount) {
                 item.headcount = normalizeHeadcount(item.headcount);
             }
        });
    }

    // --- REPLACEMENT LOGIC ---
    // Stringify the response to perform a global search/replace
    let jsonString = JSON.stringify(response.data);
    
    // Construct Proxy Base URL
    // We now use a "key" parameter instead of "url" to imply obfuscation
    const proxyBase = `${req.protocol}://${req.get('host')}/api/proxy/image?key=`;

    // Replace ContactOut Image URLs
    // Regex matches "https://images.contactout.com/" followed by any non-quote character
    // We use a replacer function to BASE64 ENCODE the matched URL
    jsonString = jsonString.replace(/https:\/\/images\.contactout\.com\/[^"]+/g, (match) => {
        // Base64 encode the URL to hide "contactout" text
        const encodedUrl = Buffer.from(match).toString('base64');
        return `${proxyBase}${encodedUrl}`;
    });

    // Replace Clearbit Image URLs
    jsonString = jsonString.replace(/https:\/\/logo\.clearbit\.com\/[^"]+/g, (match) => {
        const encodedUrl = Buffer.from(match).toString('base64');
        return `${proxyBase}${encodedUrl}`;
    });

    // Replace Logo.dev Image URLs
    jsonString = jsonString.replace(/https:\/\/img\.logo\.dev\/[^"]+/g, (match) => {
        const encodedUrl = Buffer.from(match).toString('base64');
        return `${proxyBase}${encodedUrl}`;
    });

    try {
        res.json(JSON.parse(jsonString));
    } catch (parseErr) {
        console.error("[SearchProxy] JSON Parse Error:", parseErr.message);
        // Fallback to sending original response if parsing stringified version fails
        res.json(response.data);
    }

  } catch (error) {
    console.error("[SearchProxy] Error:", error.message);
    
    if (error.response) {
      console.error("[SearchProxy] Upstream Status:", error.response.status);
      const errData = error.response.data;
      if (errData && typeof errData === 'object') {
          if (!errData.error) {
              errData.error = errData.message || errData.detail || "An error occurred from the search provider.";
          }
          return res.status(error.response.status).json(errData);
      } else if (typeof errData === 'string') {
          return res.status(error.response.status).json({ error: errData });
      }
      return res.status(error.response.status).json(errData);
    }

    res.status(500).json({ error: "An unexpected error occurred during search." });
  }
});

/**
 * @route GET /companies/suggest
 * @desc Proxy company suggestions to Middleware Service
 * @access Public (or protected if needed)
 */
router.get("/companies/suggest", async (req, res) => {
    try {
        const middlewareUrl = process.env.MAWSOOL_SEARCH_API || "http://localhost:3001";
        const q = req.query.q || req.query.keywords;
        
        console.log(`[SearchProxy] Proxying suggestions to ${middlewareUrl}/search/companies/suggest for: ${q}`);
        
    const MIDDLEWARE_KEY = process.env.MAWSOOL_MIDDLEWARE_KEY || "mawsool_internal_a5d6d56f4227fbc84a09e859d06bc4d6";
    const response = await axios.get(`${middlewareUrl}/search/companies/suggest`, {
      params: req.query,
      headers: {
        'x-api-key': MIDDLEWARE_KEY
      },
      timeout: 5000
    });

        // --- REPLACEMENT LOGIC ---
        // Apply the same global replacement for any missed raw URLs
        let jsonString = JSON.stringify(response.data);
        const proxyBase = `${req.protocol}://${req.get('host')}/api/proxy/image?key=`;

        jsonString = jsonString.replace(/https:\/\/images\.contactout\.com\/[^"]+/g, (match) => {
            const encodedUrl = Buffer.from(match).toString('base64');
            return `${proxyBase}${encodedUrl}`;
        });

        jsonString = jsonString.replace(/https:\/\/logo\.clearbit\.com\/[^"]+/g, (match) => {
            const encodedUrl = Buffer.from(match).toString('base64');
            return `${proxyBase}${encodedUrl}`;
        });

        jsonString = jsonString.replace(/https:\/\/img\.logo\.dev\/[^"]+/g, (match) => {
            const encodedUrl = Buffer.from(match).toString('base64');
            return `${proxyBase}${encodedUrl}`;
        });

        res.json(JSON.parse(jsonString));
    } catch (error) {
        console.error("[SearchProxy] Suggest Error:", error.message);
        res.json([]); // Return empty array on failure for suggestions
    }
});

/**
 * @route GET /companies/similar/:publicId
 * @desc Proxy similar companies search to Middleware Service
 * @access Private
 */
router.get("/companies/similar/:publicId", isAuthenticated, searchLimiter, async (req, res) => {
    try {
        const middlewareUrl = process.env.MAWSOOL_SEARCH_API || "http://localhost:3001";
        const publicId = req.params.publicId;
        
        console.log(`[SearchProxy] Proxying similar companies search to ${middlewareUrl}/search/companies/similar/${publicId}`);
        
    const MIDDLEWARE_KEY = process.env.MAWSOOL_MIDDLEWARE_KEY || "mawsool_internal_a5d6d56f4227fbc84a09e859d06bc4d6";
    const response = await axios.get(`${middlewareUrl}/search/companies/similar/${publicId}`, {
      headers: {
        'x-api-key': MIDDLEWARE_KEY
      },
      timeout: 10000
    });

        // --- REPLACEMENT LOGIC ---
        // Apply the same global replacement for any missed raw URLs
        let jsonString = JSON.stringify(response.data);
        const proxyBase = `${req.protocol}://${req.get('host')}/api/proxy/image?key=`;

        jsonString = jsonString.replace(/https:\/\/images\.contactout\.com\/[^"]+/g, (match) => {
            const encodedUrl = Buffer.from(match).toString('base64');
            return `${proxyBase}${encodedUrl}`;
        });

        jsonString = jsonString.replace(/https:\/\/logo\.clearbit\.com\/[^"]+/g, (match) => {
            const encodedUrl = Buffer.from(match).toString('base64');
            return `${proxyBase}${encodedUrl}`;
        });

        jsonString = jsonString.replace(/https:\/\/img\.logo\.dev\/[^"]+/g, (match) => {
            const encodedUrl = Buffer.from(match).toString('base64');
            return `${proxyBase}${encodedUrl}`;
        });

        res.json(JSON.parse(jsonString));
    } catch (error) {
        console.error("[SearchProxy] Similar Companies Error:", error.message);
        if (error.response) {
            return res.status(error.response.status).json(error.response.data);
        }
        res.status(500).json({ items: [] });
    }
});

module.exports = router;
