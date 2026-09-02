const axios = require("axios");
const User = require("../models/User");

const GENERIC_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "icloud.com",
  "live.com",
  "msn.com",
  "aol.com",
  "protonmail.com",
  "proton.me",
  "mail.com",
  "gmx.com",
  "yandex.com",
]);

function isInternalConfigured() {
  return Boolean(process.env.PIPEDRIVE_API_TOKEN);
}

function isOAuthConfigured() {
  return Boolean(
    process.env.PIPEDRIVE_CLIENT_ID &&
      process.env.PIPEDRIVE_CLIENT_SECRET &&
      process.env.PIPEDRIVE_REDIRECT_URI
  );
}

function linkedInFieldKey() {
  return String(process.env.PIPEDRIVE_LINKEDIN_FIELD_KEY || "").trim();
}

function creditsFieldKey() {
  return String(process.env.PIPEDRIVE_CREDITS_FIELD_KEY || "").trim();
}

function companyFromEmail(email) {
  const domain = String(email || "")
    .split("@")[1]
    ?.toLowerCase()
    .trim();
  if (!domain || GENERIC_EMAIL_DOMAINS.has(domain)) return "";
  const label = domain.split(".")[0];
  if (!label) return "";
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function getInternalAuth() {
  const token = process.env.PIPEDRIVE_API_TOKEN;
  if (!token) return null;
  const domain = String(process.env.PIPEDRIVE_COMPANY_DOMAIN || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\.pipedrive\.com.*$/i, "")
    .replace(/\/+$/, "");
  const host = domain ? `https://${domain}.pipedrive.com` : "https://api.pipedrive.com";
  return { token, host };
}

function getOAuthAuth(accessToken, apiDomain) {
  const host = String(apiDomain || "https://api.pipedrive.com")
    .trim()
    .replace(/\/+$/, "");
  return { accessToken, host };
}

function firstSearchId(payload) {
  const items = payload?.data?.items;
  if (!Array.isArray(items) || !items.length) return null;
  return items[0]?.item?.id || items[0]?.id || null;
}

function entityId(payload) {
  return payload?.data?.id ?? payload?.data?.data?.id ?? null;
}

async function pdRequest(auth, { method, path, params, data }) {
  if (!auth?.host) {
    throw new Error("Pipedrive auth is not configured");
  }
  const config = {
    method,
    url: `${auth.host}${path}`,
    timeout: 25000,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    params: { ...(params || {}) },
    data,
    validateStatus: () => true,
  };
  if (auth.accessToken) {
    config.headers.Authorization = `Bearer ${auth.accessToken}`;
  } else if (auth.token) {
    config.params.api_token = auth.token;
  }

  const res = await axios(config);
  if (res.status >= 400) {
    const pdMsg = res.data?.error || res.data?.error_info || res.data?.message;
    const err = new Error(
      `Pipedrive ${method} ${path} failed (${res.status})${pdMsg ? `: ${pdMsg}` : ""}`
    );
    err.status = res.status;
    err.pipedrive = true;
    throw err;
  }
  return res.data;
}

async function searchOrNull(auth, request) {
  try {
    const payload = await pdRequest(auth, request);
    return firstSearchId(payload);
  } catch (err) {
    if (err?.status === 401) throw err;
    console.error("[Pipedrive] search failed:", err?.message || err);
    return null;
  }
}

async function searchPersonByEmail(auth, email) {
  if (!email) return null;
  return searchOrNull(auth, {
    method: "GET",
    path: "/api/v2/persons/search",
    params: { term: email, fields: "email", exact_match: true, limit: 1 },
  });
}

async function searchPersonByLinkedIn(auth, linkedinUrl) {
  if (!linkedinUrl) return null;
  return searchOrNull(auth, {
    method: "GET",
    path: "/api/v2/persons/search",
    params: { term: linkedinUrl, fields: "custom_fields", limit: 1 },
  });
}

async function searchOrganizationByName(auth, name) {
  if (!name) return null;
  return searchOrNull(auth, {
    method: "GET",
    path: "/api/v2/organizations/search",
    params: { term: name, fields: "name", exact_match: true, limit: 1 },
  });
}

function looksLikeLinkedIn(url) {
  const s = String(url || "").trim().toLowerCase();
  return (s.startsWith("http://") || s.startsWith("https://")) && s.includes("linkedin.com/");
}

function extractLinkedInUrls(value) {
  const parts = String(value || "").split(/\|\|\||[\n\r,]+/);
  const urls = [];
  for (const part of parts) {
    const s = part.trim();
    if (looksLikeLinkedIn(s)) urls.push(s.replace(/\/+$/, ""));
  }
  return Array.from(new Set(urls));
}

function formatLinkedInForPipedrive(value) {
  return extractLinkedInUrls(value).join("\n");
}

function personBody({
  name,
  email,
  phone,
  orgId,
  linkedinUrl,
  credits,
  useLinkedInCustomField = true,
  clearLinkedIn = false,
}) {
  const body = {};
  if (name) body.name = name;
  if (orgId) body.org_id = Number(orgId) || orgId;
  if (email) {
    body.emails = [{ value: email, primary: true, label: "work" }];
  }
  if (phone) {
    body.phones = [{ value: String(phone).trim(), primary: true, label: "mobile" }];
  }
  const custom_fields = {};
  const liKey = linkedInFieldKey();
  const formattedLinkedIn = formatLinkedInForPipedrive(linkedinUrl);
  if (useLinkedInCustomField && liKey) {
    if (formattedLinkedIn) {
      custom_fields[liKey] = formattedLinkedIn;
    } else if (clearLinkedIn) {
      custom_fields[liKey] = null;
    }
  }
  const creditsKey = creditsFieldKey();
  if (creditsKey && credits !== undefined && credits !== null && credits !== "") {
    const n = Number(credits);
    custom_fields[creditsKey] = Number.isFinite(n) ? n : String(credits);
  }
  if (Object.keys(custom_fields).length) {
    body.custom_fields = custom_fields;
  }
  return body;
}

async function upsertOrganization(auth, { name, orgId }) {
  if (orgId) {
    if (name) {
      await pdRequest(auth, {
        method: "PATCH",
        path: `/api/v2/organizations/${orgId}`,
        data: { name },
      });
    }
    return { id: Number(orgId) || orgId };
  }
  if (!name) return null;
  const existingId = await searchOrganizationByName(auth, name);
  if (existingId) return { id: existingId };
  const created = await pdRequest(auth, {
    method: "POST",
    path: "/api/v2/organizations",
    data: { name },
  });
  const id = entityId(created);
  return id ? { id } : null;
}

async function patchCustomFields(auth, personId, custom_fields) {
  if (!personId || !custom_fields || !Object.keys(custom_fields).length) return;
  try {
    await pdRequest(auth, {
      method: "PATCH",
      path: `/api/v2/persons/${personId}`,
      data: { custom_fields },
    });
    return;
  } catch (err) {
    if (err?.status === 401) throw err;
    console.error("[Pipedrive] custom fields patch failed, retrying one by one:", err?.message || err);
  }
  for (const [key, value] of Object.entries(custom_fields)) {
    const attempts = typeof value === "number" ? [value, String(value)] : [value];
    let lastErr = null;
    let wrote = false;
    for (const attempt of attempts) {
      try {
        await pdRequest(auth, {
          method: "PATCH",
          path: `/api/v2/persons/${personId}`,
          data: { custom_fields: { [key]: attempt } },
        });
        wrote = true;
        break;
      } catch (err) {
        if (err?.status === 401) throw err;
        lastErr = err;
      }
    }
    if (!wrote) {
      console.error(`[Pipedrive] custom field ${key} could not be written:`, lastErr?.message || lastErr);
    }
  }
}

async function writePerson(auth, personId, body) {
  const path = personId ? `/api/v2/persons/${personId}` : "/api/v2/persons";
  const method = personId ? "PATCH" : "POST";
  const custom_fields = body.custom_fields;
  const coreBody = { ...body };
  delete coreBody.custom_fields;

  let id = personId || null;
  try {
    const res = await pdRequest(auth, { method, path, data: coreBody });
    id = personId || entityId(res);
  } catch (err) {
    if (err?.status === 401) throw err;
    if (!coreBody.phones) throw err;
    const retryBody = { ...coreBody };
    delete retryBody.phones;
    console.error("[Pipedrive] person write retry without phones:", err?.message || err);
    const res = await pdRequest(auth, { method, path, data: retryBody });
    id = personId || entityId(res);
  }

  if (id && custom_fields) {
    await patchCustomFields(auth, id, custom_fields);
  }
  return { id };
}

async function upsertPerson(auth, payload) {
  const body = personBody(payload);
  if (!body.name && !payload.personId) return null;

  let personId = payload.personId || null;
  if (!personId && payload.email) {
    personId = await searchPersonByEmail(auth, payload.email);
  }
  if (
    !personId &&
    extractLinkedInUrls(payload.linkedinUrl).length === 1 &&
    payload.useLinkedInCustomField !== false
  ) {
    personId = await searchPersonByLinkedIn(auth, extractLinkedInUrls(payload.linkedinUrl)[0]);
  }

  return writePerson(auth, personId, body);
}

async function addNote(auth, { personId, orgId, content }) {
  if (!content) return null;
  const data = { content };
  if (personId) data.person_id = Number(personId) || personId;
  if (orgId) data.org_id = Number(orgId) || orgId;
  return pdRequest(auth, {
    method: "POST",
    path: "/api/v1/notes",
    data,
  });
}

function oauthBasicHeader() {
  const id = process.env.PIPEDRIVE_CLIENT_ID;
  const secret = process.env.PIPEDRIVE_CLIENT_SECRET;
  return `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`;
}

async function exchangeCode(code) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: process.env.PIPEDRIVE_REDIRECT_URI,
  });
  const res = await axios.post("https://oauth.pipedrive.com/oauth/token", body.toString(), {
    headers: {
      Authorization: oauthBasicHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    timeout: 20000,
  });
  return res.data;
}

async function refreshAccessToken(refreshToken) {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const res = await axios.post("https://oauth.pipedrive.com/oauth/token", body.toString(), {
    headers: {
      Authorization: oauthBasicHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    timeout: 20000,
  });
  return res.data;
}

function expiresAtFrom(expiresIn) {
  const seconds = Number(expiresIn);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return new Date(Date.now() + seconds * 1000);
}

async function saveOAuthTokens(userId, tokens) {
  const $set = {
    "pipedrive.accessToken": tokens.access_token,
    "pipedrive.refreshToken": tokens.refresh_token,
    "pipedrive.apiDomain": tokens.api_domain || null,
  };
  const expiresAt = expiresAtFrom(tokens.expires_in);
  if (expiresAt) $set["pipedrive.expiresAt"] = expiresAt;
  await User.findByIdAndUpdate(userId, { $set });
}

async function getAuthForUser(user) {
  if (!user?.pipedrive?.refreshToken && !user?.pipedrive?.accessToken) return null;
  let accessToken = user.pipedrive.accessToken;
  let apiDomain = user.pipedrive.apiDomain;
  const expiresAt = user.pipedrive.expiresAt ? new Date(user.pipedrive.expiresAt).getTime() : 0;
  const expired = Boolean(expiresAt && expiresAt < Date.now() + 60 * 1000);
  if ((expired || !accessToken) && user.pipedrive.refreshToken) {
    const tokens = await refreshAccessToken(user.pipedrive.refreshToken);
    accessToken = tokens.access_token;
    apiDomain = tokens.api_domain || apiDomain;
    await saveOAuthTokens(user._id, {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || user.pipedrive.refreshToken,
      api_domain: apiDomain,
      expires_in: tokens.expires_in,
    });
  }
  return getOAuthAuth(accessToken, apiDomain);
}

async function withUserAuthRetry(user, fn) {
  let auth = await getAuthForUser(user);
  if (!auth) {
    const err = new Error("Pipedrive is not connected");
    err.status = 403;
    throw err;
  }
  try {
    return await fn(auth);
  } catch (err) {
    if (err?.status !== 401 || !user?.pipedrive?.refreshToken) throw err;
    const tokens = await refreshAccessToken(user.pipedrive.refreshToken);
    await saveOAuthTokens(user._id, {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || user.pipedrive.refreshToken,
      api_domain: tokens.api_domain || user.pipedrive.apiDomain,
      expires_in: tokens.expires_in,
    });
    auth = getOAuthAuth(tokens.access_token, tokens.api_domain || user.pipedrive.apiDomain);
    return fn(auth);
  }
}

function resolveCredits(user) {
  const n = Number(user?.credits);
  return Number.isFinite(n) ? n : 500;
}

function resolvePhone(user) {
  const raw = user?.phone || user?.whatsappNumber;
  return raw ? String(raw).trim() : "";
}

async function syncSignupUser(user) {
  const auth = getInternalAuth();
  if (!auth) return null;
  const linkedinUrl = formatLinkedInForPipedrive(user.linkedInUrl);
  const companyName = user.companyName || companyFromEmail(user.email);
  let orgId = user.pipedrive?.orgId || null;
  if (companyName) {
    try {
      const org = await upsertOrganization(auth, { name: companyName, orgId });
      orgId = org?.id || orgId;
    } catch (err) {
      if (err?.status === 401) throw err;
      console.error("[Pipedrive] org upsert failed:", err?.message || err);
    }
  }
  const phone = resolvePhone(user);
  const credits = resolveCredits(user);
  const person = await upsertPerson(auth, {
    personId: user.pipedrive?.personId,
    name: user.name || user.email,
    email: user.email,
    phone,
    orgId,
    linkedinUrl,
    credits,
    useLinkedInCustomField: true,
    clearLinkedIn: !linkedinUrl && user.linkedInUrl === "",
  });
  if (person?.id) {
    const lines = ["Mawsool signup"];
    if (user.email) lines.push(`Email: ${user.email}`);
    if (phone) lines.push(`Phone / WhatsApp: ${phone}`);
    lines.push(`Personal credits: ${credits}`);
    if (companyName) lines.push(`Company: ${companyName}`);
    if (linkedinUrl) lines.push(`LinkedIn:\n${linkedinUrl}`);
    if (user.utmSource) lines.push(`UTM source: ${user.utmSource}`);
    if (user.utmMedium) lines.push(`UTM medium: ${user.utmMedium}`);
    if (user.utmCampaign) lines.push(`UTM campaign: ${user.utmCampaign}`);
    if (user.utmTerm) lines.push(`UTM term: ${user.utmTerm}`);
    if (user.utmContent) lines.push(`UTM content: ${user.utmContent}`);
    if (user.signupUrl) lines.push(`Signup URL: ${user.signupUrl}`);
    try {
      await addNote(auth, { personId: person.id, orgId, content: lines.join("\n") });
    } catch (noteErr) {
      console.error("[Pipedrive] note failed:", noteErr?.message || noteErr);
    }
  }
  return { personId: person?.id || null, orgId: orgId || null };
}

function fireAndForgetSignupSync(user) {
  if (!user?._id || !isInternalConfigured()) return;
  Promise.resolve()
    .then(async () => {
      const fresh = await User.findById(user._id).lean();
      const ids = await syncSignupUser(fresh || user);
      if (!ids?.personId) return;
      const $set = { "pipedrive.personId": String(ids.personId) };
      if (ids.orgId) $set["pipedrive.orgId"] = String(ids.orgId);
      await User.updateOne({ _id: user._id }, { $set });
    })
    .catch((err) => {
      console.error("[Pipedrive] signup sync failed:", err?.message || err);
    });
}

async function pushUserToInternalPipedrive(user, extra = {}) {
  const auth = getInternalAuth();
  if (!auth) {
    const err = new Error("Pipedrive is not configured");
    err.status = 503;
    throw err;
  }
  const merged = {
    companyName: extra.companyName ?? user.companyName,
    linkedInUrl: extra.linkedInUrl ?? user.linkedInUrl,
    jobTitle: extra.jobTitle,
    email: extra.email ?? user.email,
    phone: extra.phone ?? user.phone ?? user.whatsappNumber,
    whatsappNumber: extra.whatsappNumber ?? user.whatsappNumber,
    credits: extra.credits ?? user.credits,
    name: extra.name ?? user.name,
    pipedrive: user.pipedrive,
    utmSource: user.utmSource,
    utmCampaign: user.utmCampaign,
    _id: user._id,
  };
  const ids = await syncSignupUser(merged);
  if (ids?.personId && user._id) {
    const $set = { "pipedrive.personId": String(ids.personId) };
    if (ids.orgId) $set["pipedrive.orgId"] = String(ids.orgId);
    if (extra.linkedInUrl) $set.linkedInUrl = extra.linkedInUrl;
    if (extra.companyName) $set.companyName = extra.companyName;
    await User.updateOne({ _id: user._id }, { $set });
  }
  return ids;
}

async function pushLeads(auth, leads) {
  const result = { pushed: 0, skipped: 0, failed: 0, errors: [] };
  for (const lead of leads || []) {
    const name = String(lead?.name || "").trim();
    if (!name) {
      result.skipped += 1;
      continue;
    }
    try {
      let orgId = null;
      if (lead.company) {
        const org = await upsertOrganization(auth, { name: lead.company });
        orgId = org?.id || null;
      }
      const person = await upsertPerson(auth, {
        name,
        email: lead.email || undefined,
        phone: lead.phone || undefined,
        orgId,
        linkedinUrl: lead.linkedin_url || lead.linkedinUrl,
        jobTitle: lead.title,
        // Customer's Pipedrive does not have Mawsool's LinkedIn field hash.
        useLinkedInCustomField: false,
      });
      if (person?.id && (lead.linkedin_url || lead.location || lead.title)) {
        const lines = ["Pushed from Mawsool"];
        if (lead.linkedin_url) lines.push(`LinkedIn: ${lead.linkedin_url}`);
        if (lead.title) lines.push(`Title: ${lead.title}`);
        if (lead.location) lines.push(`Location: ${lead.location}`);
        try {
          await addNote(auth, { personId: person.id, orgId, content: lines.join("\n") });
        } catch (_noteErr) {
          // Notes are optional; person upsert already succeeded.
        }
      }
      result.pushed += 1;
    } catch (err) {
      if (err?.status === 401) throw err;
      console.error("[Pipedrive] lead push failed:", err?.message || err);
      result.failed += 1;
      if (result.errors.length < 5) {
        result.errors.push(err.message || "Pipedrive write failed");
      }
    }
  }
  return result;
}

module.exports = {
  isInternalConfigured,
  isOAuthConfigured,
  companyFromEmail,
  getInternalAuth,
  searchPersonByEmail,
  upsertOrganization,
  upsertPerson,
  addNote,
  exchangeCode,
  refreshAccessToken,
  saveOAuthTokens,
  getAuthForUser,
  withUserAuthRetry,
  syncSignupUser,
  fireAndForgetSignupSync,
  pushUserToInternalPipedrive,
  pushLeads,
};
