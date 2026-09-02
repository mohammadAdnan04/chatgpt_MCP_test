const axios = require("axios");

const BASE_URL = process.env.MAWSOOL_API || "https://api.mawsool.tech";
// Default is a single apicool call. Nested 8s retries made Reveal wait ~30-40s
// on "processing" even though webhooks fill contacts later. Callers that still
// need polling (data enrichment) pass retries explicitly.
const DEFAULT_MAX_RETRIES = 1;
const DEFAULT_DELAY_MS = 8000;

function buildUrl(urlsCsv, fieldsCsv) {
  const u = new URL(`${BASE_URL}/contact`);
  u.searchParams.set("url", urlsCsv);
  if (fieldsCsv) u.searchParams.set("fields", fieldsCsv);
  return u.toString();
}

function normalizeFields(fieldsRaw) {
  if (!fieldsRaw) return undefined;
  let tokens = [];
  if (Array.isArray(fieldsRaw)) {
    tokens = fieldsRaw.flatMap((s) => String(s).split(/[,\s]+/));
  } else {
    const s = String(fieldsRaw).toLowerCase();
    if (s.includes("full")) return "email,phone";
    tokens = s.split(/[,\s]+/);
  }
  const clean = Array.from(
    new Set(
      tokens
        .map((t) => t.trim().toLowerCase())
        .filter((t) => t === "email" || t === "phone")
    )
  );
  if (!clean.length) return undefined;
  return clean.includes("email") && clean.includes("phone")
    ? "email,phone"
    : clean.join(",");
}

function unwrapContactPayload(data) {
  if (!data || typeof data !== "object") return {};
  const nested = Array.isArray(data)
    ? data[0]
    : Array.isArray(data.results)
    ? data.results[0]
    : Array.isArray(data.data)
    ? data.data[0]
    : Array.isArray(data.items)
    ? data.items[0]
    : data.data && typeof data.data === "object" && !Array.isArray(data.data)
    ? data.data
    : null;
  if (nested && typeof nested === "object") {
    return { ...data, ...nested };
  }
  return data;
}

function isPlaceholder(value) {
  const s = String(value || "").trim().toLowerCase();
  return !s || s === "not available" || s === "n/a" || s === "null" || s === "undefined";
}

function payloadHasContacts(data) {
  if (!data || typeof data !== "object") return false;
  const emails = Array.isArray(data.contact__all_emails)
    ? data.contact__all_emails
    : Array.isArray(data.contact__emails)
    ? data.contact__emails
    : Array.isArray(data.emails)
    ? data.emails
    : [];
  const phones = Array.isArray(data.contact__phone_numbers)
    ? data.contact__phone_numbers
    : Array.isArray(data.phones)
    ? data.phones
    : [];
  const hasEmail =
    emails.some((e) => {
      const v = String((e && (e.email || e.sanitized_email)) || (typeof e === "string" ? e : "")).toLowerCase();
      return v && v !== "not available" && v.includes("@");
    }) ||
    (String(data.email || data.contact__email || "").includes("@") &&
      !String(data.email || data.contact__email || "").toLowerCase().includes("not available"));
  const hasPhone =
    phones.some((p) => {
      const v = String((p && (p.sanitized_number || p.raw_number || p.number)) || (typeof p === "string" ? p : "")).toLowerCase();
      return v && v !== "not available" && v.length > 5;
    }) ||
    (String(data.phone || "").trim() && !String(data.phone || "").toLowerCase().includes("not available"));
  return hasEmail || hasPhone;
}

function isProcessingPayload(data) {
  const list = Array.isArray(data)
    ? data
    : Array.isArray(data?.results)
    ? data.results
    : Array.isArray(data?.data)
    ? data.data
    : Array.isArray(data?.items)
    ? data.items
    : data
    ? [data]
    : [];
  if (!list.length) return false;
  return list.some((item) => {
    const s = (item?.status || "").toString().toLowerCase();
    const msg = (item?.message || "").toString().toLowerCase();
    return (
      s === "processing" ||
      s === "pending" ||
      item?.awaiting_enrichment === true ||
      item?.webhook_pending === true ||
      msg.includes("in progress") ||
      msg.includes("fallback search initiated") ||
      msg.includes("please retry")
    );
  });
}

function normalizeContactPayload(data) {
  const merged = unwrapContactPayload(data);
  const emails = [];
  const seenE = new Set();
  const addEmail = (raw, status) => {
    const addr = typeof raw === "string" ? raw : raw?.email || raw?.sanitized_email;
    if (isPlaceholder(addr) || !String(addr).includes("@")) return;
    String(addr)
      .split(/[;,]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((email) => {
        const k = email.toLowerCase();
        if (seenE.has(k) || isPlaceholder(email) || !email.includes("@")) return;
        seenE.add(k);
        emails.push({
          email,
          sanitized_email: typeof raw === "object" ? raw?.sanitized_email || email : email,
          verificationStatus:
            (typeof raw === "object" && (raw.verificationStatus || raw.status)) ||
            status ||
            merged.contact__email_status ||
            merged.email_status ||
            "",
          status: typeof raw === "object" ? raw.status || raw.verificationStatus : status,
        });
      });
  };

  (Array.isArray(merged.contact__all_emails) ? merged.contact__all_emails : []).forEach((e) => addEmail(e));
  (Array.isArray(merged.contact__emails) ? merged.contact__emails : []).forEach((e) => addEmail(e));
  (Array.isArray(merged.emails) ? merged.emails : []).forEach((e) => addEmail(e));
  if (merged.contact__email) addEmail(merged.contact__email, merged.contact__email_status);
  if (merged.email) addEmail(merged.email, merged.email_status || merged.contact__email_status);

  const phones = [];
  const seenP = new Set();
  const addPhone = (raw) => {
    if (typeof raw === "string") {
      String(raw)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((part) => {
          const m = part.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
          addPhone({
            sanitized_number: m ? m[1].trim() : part,
            raw_number: m ? m[1].trim() : part,
            type: m ? m[2].trim() : "",
          });
        });
      return;
    }
    const num = raw?.sanitized_number || raw?.raw_number || raw?.number || "";
    if (isPlaceholder(num) || String(num).replace(/\D/g, "").length < 5) return;
    const k = String(num).replace(/[^\d+]/g, "");
    if (!k || seenP.has(k)) return;
    seenP.add(k);
    phones.push({
      sanitized_number: raw?.sanitized_number || num,
      raw_number: raw?.raw_number || num,
      type: raw?.type || "",
    });
  };

  (Array.isArray(merged.contact__phone_numbers) ? merged.contact__phone_numbers : []).forEach(addPhone);
  (Array.isArray(merged.phones) ? merged.phones : []).forEach(addPhone);
  if (merged.phone) addPhone(merged.phone);

  const awaiting = isProcessingPayload(merged) || merged.awaiting_enrichment === true || merged.webhook_pending === true;
  const hasContacts = emails.length > 0 || phones.length > 0;
  return {
    ...merged,
    status: hasContacts ? "success" : awaiting ? "processing" : merged.status || "success",
    awaiting_enrichment: awaiting,
    contact__emails: emails,
    contact__all_emails: emails,
    contact__phone_numbers: phones,
    emails,
    phones,
    email: emails[0]?.email || "",
    phone: phones[0]?.sanitized_number || "",
    contact__email: emails[0]?.email || merged.contact__email || "",
    contact__email_status: emails[0]?.verificationStatus || merged.contact__email_status || "",
  };
}

function requestedFieldsPresent(normalized, fieldsCsv) {
  const wantsEmail = !fieldsCsv || String(fieldsCsv).includes("email");
  const wantsPhone = !fieldsCsv || String(fieldsCsv).includes("phone");
  const hasEmail = Array.isArray(normalized.contact__emails) && normalized.contact__emails.length > 0;
  const hasPhone = Array.isArray(normalized.contact__phone_numbers) && normalized.contact__phone_numbers.length > 0;
  if (wantsEmail && wantsPhone) return hasEmail || hasPhone;
  if (wantsEmail) return hasEmail;
  if (wantsPhone) return hasPhone;
  return hasEmail || hasPhone;
}

async function hydrateFromMiddleware(urlsCsv, payload) {
  const normalized = normalizeContactPayload(payload);
  if (payloadHasContacts(normalized)) return normalized;
  const url = String(urlsCsv || "").split(",")[0]?.trim();
  if (!url) return normalized;
  const middlewareUrl = process.env.MIDDLEWARE_URL || process.env.MAWSOOL_SEARCH_API || "http://localhost:3001";
  try {
    const res = await axios.get(`${middlewareUrl}/api/contact/hydrate`, {
      params: { url },
      headers: { "x-internal-secret": process.env.INTERNAL_SECRET || "secret123" },
      timeout: 8000,
      validateStatus: () => true,
    });
    if (res.status === 200 && res.data && payloadHasContacts(res.data)) {
      console.log("[getContact] Hydrated contacts from engine cache");
      return normalizeContactPayload({ ...normalized, ...res.data });
    }
  } catch (err) {
    console.warn("[getContact] cache hydrate failed:", err.message);
  }
  return normalized;
}

const mawsoolRequest = async (urlsCsv, fieldsCsv) => {
  const url = buildUrl(urlsCsv, fieldsCsv);
  const API_KEY = process.env.MAWSOOL_API_KEY;
  const res = await axios.get(url, {
    headers: {
      "X-API-Key": API_KEY,
      accept: "application/json",
      "x-mawsool-source": "Web App Backend (backbeta.mawsool.tech)",
      "User-Agent": "Web App Backend (backbeta.mawsool.tech)",
    },
    validateStatus: () => true,
    timeout: 30000,
  });
  return res;
};

async function fetchWithProcessingRetry(urlsCsv, fieldsCsv, maxRetries = DEFAULT_MAX_RETRIES, delayMs = DEFAULT_DELAY_MS) {
  const cachedFirst = await hydrateFromMiddleware(urlsCsv, {});
  if (requestedFieldsPresent(cachedFirst, fieldsCsv)) {
    console.log("[getContact] Returning engine-cache contacts without calling paid /contact");
    return { status: 200, data: cachedFirst };
  }

  let lastRes = null;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const res = await mawsoolRequest(urlsCsv, fieldsCsv);
    lastRes = res;
    if (res.status >= 400) {
      if (payloadHasContacts(cachedFirst)) {
        return { status: 200, data: cachedFirst };
      }
      break;
    }

    const hydrated = await hydrateFromMiddleware(urlsCsv, res.data);
    lastRes = { ...res, data: hydrated, status: res.status };

    if (requestedFieldsPresent(hydrated, fieldsCsv) || !isProcessingPayload(hydrated)) {
      return lastRes;
    }
    if (attempt < maxRetries) {
      await new Promise((r) => setTimeout(r, delayMs));
      continue;
    }
    return lastRes;
  }
  return lastRes;
}

function checkApiKey(res) {
  if (!process.env.MAWSOOL_API_KEY) {
    res.status(500).json({ error: "Server misconfiguration: MAWSOOL_API_KEY not set" });
    return false;
  }
  return true;
}

// ---------------- GET ----------------
exports.getContact = async (req, res) => {
  try {
    if (!checkApiKey(res)) return;

    const urlsCsv = req.query.url;
    const fieldsCsv = normalizeFields(req.query.fields);
    const retries = parseInt(req.query.retries || "", 10);
    const delay = parseInt(req.query.retryDelayMs || "", 10);

    const maxRetries = Number.isFinite(retries) && retries > 0 ? retries : DEFAULT_MAX_RETRIES;
    const delayMs = Number.isFinite(delay) && delay >= 0 ? delay : DEFAULT_DELAY_MS;

    if (!urlsCsv) {
      return res.status(400).json({ error: "Missing 'url' query param (comma-separated URLs)" });
    }

    const response = await fetchWithProcessingRetry(urlsCsv, fieldsCsv, maxRetries, delayMs);
    return res.status(response.status).json(response.data);
  } catch (err) {
    const msg = err?.response?.data?.error || err?.message || "Unexpected server error calling Mawsool";
    return res.status(500).json({ error: msg });
  }
};

// ---------------- POST ----------------
exports.postContact = async (req, res) => {
  try {
    if (!checkApiKey(res)) return;

    const body = req.body;
    const urls = Array.isArray(body?.urls) ? body.urls : [];
    const fieldsCsv = normalizeFields(body?.fields);

    const maxRetries = Number.isFinite(body?.retries) && body.retries > 0 ? body.retries : DEFAULT_MAX_RETRIES;
    const delayMs = Number.isFinite(body?.retryDelayMs) && body.retryDelayMs >= 0 ? body.retryDelayMs : DEFAULT_DELAY_MS;

    if (!urls.length) {
      return res.status(400).json({ error: "Body must include 'urls' array" });
    }

    const response = await fetchWithProcessingRetry(urls.join(","), fieldsCsv, maxRetries, delayMs);
    return res.status(response.status).json(response.data);
  } catch (err) {
    const msg = err?.response?.data?.error || err?.message || "Unexpected server error calling Mawsool";
    return res.status(500).json({ error: msg });
  }
};
