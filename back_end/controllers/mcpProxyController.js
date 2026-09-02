const crypto = require("crypto");
const OAuthToken = require("../models/OAuthToken");
const User = require("../models/User");
const RevealedContact = require("../models/RevealedContact");
const List = require("../models/List");
const ListItem = require("../models/ListItem");
const ListKind = require("../models/ListKind");
const { getBalanceForUser, deductCreditsForUser } = require("../utils/wallet");
const {
  evaluateEmailForBilling,
  evaluatePhoneForBilling,
  computeCost,
} = require("../utils/revealBilling");
const revealEvents = require("../utils/revealEvents");

/** Same page size as website search UI — Claude cannot pull 100+ in one call. */
const MCP_SEARCH_MAX_LIMIT = 25;
const SAVED_LEADS_NAMES = ["saved leads", "revealed search results", "Saved Leads"];

function mainApiKey() {
  const raw =
    process.env.MAWSOOL_DEFAULT_API_KEY || process.env.MAWSOOL_API_KEY || "";
  return String(raw).trim().replace(/^['"]|['"]$/g, "") || null;
}

function middlewareBaseUrl() {
  const raw =
    process.env.MAWSOOL_SEARCH_API ||
    process.env.MIDDLEWARE_URL ||
    "https://middleware-test.mawsool.tech";
  return String(raw).trim().replace(/\/+$/, "");
}

function middlewareKey() {
  const key = String(process.env.MAWSOOL_MIDDLEWARE_KEY || "").trim();
  if (!key) {
    console.error("[MCP website] MAWSOOL_MIDDLEWARE_KEY is not set");
  }
  return key;
}

function normalizeUrl(u) {
  try {
    if (!u) return "";
    const url = new URL(String(u).trim());
    url.hash = "";
    url.search = "";
    const host = url.hostname.toLowerCase();
    const proto = url.protocol.toLowerCase();
    const path = url.pathname.toLowerCase().replace(/\/+$/, "/");
    return `${proto}//${host}${path}`;
  } catch {
    return String(u || "").trim().toLowerCase();
  }
}

function extractPublicIdentifier(urlOrId) {
  const raw = String(urlOrId || "").trim();
  if (!raw) return "";
  if (!/^https?:\/\//i.test(raw)) {
    return raw.replace(/^\/+|\/+$/g, "");
  }
  try {
    const u = new URL(raw);
    const m = u.pathname.match(/\/in\/([^/]+)\/?/i);
    return m ? decodeURIComponent(m[1]) : "";
  } catch {
    return "";
  }
}

function formatEmailsFromPayload(data) {
  const emails = [];
  const add = (e) => {
    const v = String(e || "").trim();
    if (v && v.toLowerCase() !== "not available" && !emails.includes(v)) {
      emails.push(v);
    }
  };
  add(data?.contact__email);
  add(data?.email);
  const all = Array.isArray(data?.contact__all_emails) ? data.contact__all_emails : [];
  all.forEach((e) => add(e?.email || e?.sanitized_email));
  return emails;
}

function formatPhonesFromPayload(data) {
  const phones = [];
  const arr = Array.isArray(data?.contact__phone_numbers)
    ? data.contact__phone_numbers
    : Array.isArray(data?.phones)
      ? data.phones
      : [];
  if (arr.length) {
    arr.forEach((p) => {
      const num = p?.sanitized_number || p?.raw_number || p?.number;
      if (!num || String(num).toLowerCase() === "not available") return;
      const type = p?.type || "";
      phones.push(type ? `${num} (${type})` : String(num));
    });
    return phones;
  }
  const s = data?.phone || data?.contactPhone || "";
  if (typeof s === "string" && s.trim() && s !== "Not available") {
    s.split(",").map((v) => v.trim()).filter(Boolean).forEach((v) => phones.push(v));
  }
  return phones;
}

const RAW_SKIP_KEYS = new Set([
  "creditsCharged",
  "creditsRemaining",
  "creditsSource",
  "morphology",
  "billing",
  "savedToList",
  "raw",
  "error",
  "error_description",
]);

function pickStr(...vals) {
  for (const v of vals) {
    if (v == null) continue;
    if (Array.isArray(v)) continue;
    if (typeof v === "object") {
      const nested = pickStr(v.name, v.title, v.role, v.company, v.companyName);
      if (nested) return nested;
      continue;
    }
    const s = String(v).trim();
    if (!s) continue;
    const lower = s.toLowerCase();
    if (lower === "n/a" || lower === "not available" || lower === "undefined") continue;
    return s;
  }
  return "";
}

function splitFullName(full) {
  const parts = String(full || "")
    .replace(/[•|]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  return {
    first: parts[0] || "",
    last: parts.slice(1).join(" "),
  };
}

function companyNameOf(v) {
  if (v == null) return "";
  if (typeof v === "string") return pickStr(v);
  if (typeof v === "object") return pickStr(v.name, v.companyName, v.company, v.title);
  return pickStr(v);
}

function parseTitleCompanyFromHeadline(headline) {
  const s = String(headline || "").trim();
  const m = s.match(/^(.+?)\s+at\s+(.+)$/i);
  if (!m) return { title: "", company: "" };
  return { title: m[1].trim(), company: m[2].trim() };
}

function positionsFromSource(src = {}) {
  if (Array.isArray(src.current_positions) && src.current_positions.length) {
    return src.current_positions
      .map((p) => ({
        company: companyNameOf(p?.company) || pickStr(p?.companyName),
        role: pickStr(p?.role, p?.title),
      }))
      .filter((p) => p.company || p.role);
  }
  if (Array.isArray(src.employmentHistory) && src.employmentHistory.length) {
    return src.employmentHistory
      .map((j) => ({
        company: pickStr(j?.companyName, j?.company),
        role: pickStr(j?.title, j?.role),
      }))
      .filter((p) => p.company || p.role);
  }
  if (Array.isArray(src.experiences) && src.experiences.length) {
    return src.experiences
      .map((exp) => {
        const nestedTitle =
          exp?.breakdown && Array.isArray(exp.subComponents) && exp.subComponents[0]
            ? pickStr(exp.subComponents[0].title)
            : "";
        const role = pickStr(nestedTitle, exp?.title, exp?.role);
        const companyFromSubtitle = pickStr(
          exp?.subtitle ? String(exp.subtitle).split(/[·•|]/)[0] : ""
        );
        const company = pickStr(
          exp?.breakdown ? exp.title : "",
          companyNameOf(exp?.company),
          exp?.companyName,
          companyFromSubtitle
        );
        return { company, role };
      })
      .filter((p) => p.company || p.role);
  }
  if (Array.isArray(src.experience) && src.experience.length) {
    return src.experience.flatMap((e) => {
      const c =
        companyNameOf(e?.company) || pickStr(e?.companyName, e?.company_name);
      if (Array.isArray(e?.positions)) {
        return e.positions
          .map((p) => ({ company: c, role: pickStr(p?.title, p?.role) }))
          .filter((p) => p.company || p.role);
      }
      const role = pickStr(e?.title, e?.role);
      return c || role ? [{ company: c, role }] : [];
    });
  }
  return [];
}

/**
 * Map Apicool / search / Claude payload → website list columns
 * (First Name, Last Name, Job Title, Company, Headline).
 */
function mapPersonForList(src = {}) {
  const posArr = positionsFromSource(src);
  const pos0 = posArr[0] || null;
  const fromHeadline = parseTitleCompanyFromHeadline(
    pickStr(src.contact__headline, src.headline, src.occupation)
  );

  const fullName = pickStr(
    src.contact__name,
    src.full_name,
    src.fullName,
    src.name,
    [src.contact__first_name || src.first_name || src.firstName, src.contact__last_name || src.last_name || src.lastName]
      .filter(Boolean)
      .join(" ")
  );
  const split = splitFullName(fullName);
  const first_name = pickStr(src.contact__first_name, src.first_name, src.firstName, split.first);
  const last_name = pickStr(src.contact__last_name, src.last_name, src.lastName, split.last);
  const name = pickStr(fullName, [first_name, last_name].filter(Boolean).join(" "));

  const title = pickStr(
    src.contact__title,
    src.title,
    src.job_title,
    src.jobTitle,
    pos0?.role,
    src.occupation,
    fromHeadline.title
  );
  const company = pickStr(
    src.contact__organization_name,
    src.company,
    src.company_name,
    src.organization_name,
    src.organizationName,
    pos0?.company,
    fromHeadline.company
  );
  const headline = pickStr(
    src.contact__headline,
    src.headline,
    src.occupation,
    src.summary,
    title && company ? `${title} at ${company}` : title || company
  );

  const current_positions =
    posArr.length > 0
      ? posArr
      : title || company
        ? [{ company, role: title }]
        : [];

  return {
    first_name,
    last_name,
    name,
    title,
    company,
    headline,
    current_positions,
  };
}

function personNeedsEnrichment(mapped) {
  return !mapped.first_name || !mapped.last_name || !mapped.title || !mapped.company || !mapped.headline;
}

function mergeMapped(primary, fallback) {
  const positions =
    primary.current_positions && primary.current_positions.length
      ? primary.current_positions
      : fallback.current_positions || [];
  return {
    first_name: primary.first_name || fallback.first_name || "",
    last_name: primary.last_name || fallback.last_name || "",
    name: primary.name || fallback.name || "",
    title: primary.title || fallback.title || "",
    company: primary.company || fallback.company || "",
    headline: primary.headline || fallback.headline || "",
    current_positions: positions,
  };
}

function omitNoise(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return {};
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (RAW_SKIP_KEYS.has(k)) continue;
    if (v === undefined || v === null || v === "") continue;
    out[k] = v;
  }
  return out;
}

async function fetchFullInfoPayload(url) {
  const key = mainApiKey();
  if (!key || !url) return null;
  const { status, data } = await fetchJson("GET", "https://apicool.mawsool.tech/full-info", {
    apiKey: key,
    params: { url },
  });
  if (status >= 400 || data?.error) return null;
  return data;
}

async function enrichPersonMapped(mapped, url) {
  if (!personNeedsEnrichment(mapped) || !url) return { mapped, extra: null };
  try {
    const extra = await fetchFullInfoPayload(url);
    if (!extra) return { mapped, extra: null };
    const fromFull = mapPersonForList(extra);
    const slugOnly = !!(mapped.first_name && !mapped.last_name);
    return {
      mapped: {
        first_name: slugOnly
          ? fromFull.first_name || mapped.first_name
          : mapped.first_name || fromFull.first_name,
        last_name: mapped.last_name || fromFull.last_name || "",
        name: slugOnly ? fromFull.name || mapped.name : mapped.name || fromFull.name,
        title: mapped.title || fromFull.title || "",
        company: mapped.company || fromFull.company || "",
        headline: mapped.headline || fromFull.headline || "",
        current_positions:
          mapped.current_positions && mapped.current_positions.length
            ? mapped.current_positions
            : fromFull.current_positions || [],
      },
      extra,
    };
  } catch (err) {
    console.warn("[MCP website] full-info enrich failed:", err.message);
    return { mapped, extra: null };
  }
}

function listIdentitySet(mapped, { url, publicId, emails, phones }) {
  const emailStr = Array.isArray(emails) ? emails.filter(Boolean).join(", ") : String(emails || "");
  const phoneStr = Array.isArray(phones) ? phones.filter(Boolean).join(", ") : String(phones || "");
  const linkedin = String(url || "").trim();
  return {
    name: mapped.name || publicId || "",
    first_name: mapped.first_name || "",
    last_name: mapped.last_name || "",
    title: mapped.title || "",
    company: mapped.company || "",
    headline: mapped.headline || "",
    current_positions: mapped.current_positions || [],
    public_identifier: publicId || "",
    linkedin_url: linkedin,
    public_profile_url: linkedin,
    profile_url: linkedin,
    ...(emailStr ? { email: emailStr } : {}),
    ...(phoneStr ? { phone: phoneStr } : {}),
  };
}

function compactIdentity(identity) {
  const out = {};
  for (const [k, v] of Object.entries(identity || {})) {
    if (v === undefined || v === null || v === "") continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[k] = v;
  }
  return out;
}

function mergePersonRaw(baseRaw, mapped, extraRaw = {}) {
  return {
    ...baseRaw,
    ...extraRaw,
    first_name: mapped.first_name || extraRaw.first_name || baseRaw.first_name || "",
    last_name: mapped.last_name || extraRaw.last_name || baseRaw.last_name || "",
    name: mapped.name || extraRaw.name || baseRaw.name || "",
    title: mapped.title || extraRaw.title || baseRaw.title || "",
    company: mapped.company || extraRaw.company || baseRaw.company || "",
    headline: mapped.headline || extraRaw.headline || baseRaw.headline || "",
    current_positions:
      (mapped.current_positions && mapped.current_positions.length
        ? mapped.current_positions
        : extraRaw.current_positions) ||
      baseRaw.current_positions ||
      [],
    contact__first_name: mapped.first_name || extraRaw.contact__first_name,
    contact__last_name: mapped.last_name || extraRaw.contact__last_name,
    contact__name: mapped.name || extraRaw.contact__name,
    contact__title: mapped.title || extraRaw.contact__title,
    contact__organization_name: mapped.company || extraRaw.contact__organization_name,
    contact__headline: mapped.headline || extraRaw.contact__headline,
  };
}

function annotateSearchPeople(data) {
  if (!data || typeof data !== "object") return data;
  const key = Array.isArray(data.items) ? "items" : Array.isArray(data.results) ? "results" : null;
  if (!key) return data;
  return {
    ...data,
    [key]: data[key].map((item) => {
      if (!item || typeof item !== "object") return item;
      const mapped = mapPersonForList(item);
      const url = item.public_profile_url || item.linkedin_url || item.url || "";
      return {
        ...item,
        url,
        first_name: mapped.first_name || item.first_name || "",
        last_name: mapped.last_name || item.last_name || "",
        title: mapped.title || item.title || "",
        company: mapped.company || item.company || "",
        headline: mapped.headline || item.headline || "",
        name: mapped.name || item.name || "",
      };
    }),
  };
}

async function buildListPersonRecord({ url, publicId, source, emails, phones, sourceTag }) {
  const emailsArr = Array.isArray(emails) ? emails.filter(Boolean) : emails ? [emails] : [];
  const phonesArr = Array.isArray(phones) ? phones.filter(Boolean) : phones ? [phones] : [];
  let mapped = mapPersonForList(source || {});
  const enriched = await enrichPersonMapped(mapped, url);
  mapped = enriched.mapped;
  const identity = listIdentitySet(mapped, {
    url,
    publicId,
    emails: emailsArr,
    phones: phonesArr,
  });
  const newRaw = mergePersonRaw(omitNoise(source), mapped, {
    ...omitNoise(enriched.extra),
    public_identifier: publicId || undefined,
    public_profile_url: url || undefined,
    linkedin_url: url || undefined,
    profile_url: url || undefined,
    email: identity.email,
    phone: identity.phone,
    source: sourceTag,
  });
  return { mapped, identity, newRaw };
}

async function findExistingRevealMarkers(userId, normUrl, publicIdentifier) {
  let alreadyHasEmail = false;
  let alreadyHasPhone = false;

  if (publicIdentifier) {
    const [e, p] = await Promise.all([
      RevealedContact.findOne({ userId, publicIdentifier, contactType: "email" }).lean(),
      RevealedContact.findOne({ userId, publicIdentifier, contactType: "phone" }).lean(),
    ]);
    if (e) alreadyHasEmail = true;
    if (p) alreadyHasPhone = true;
  }
  if (normUrl) {
    const [e, p] = await Promise.all([
      RevealedContact.findOne({ userId, profileUrl: normUrl, contactType: "email" }).lean(),
      RevealedContact.findOne({ userId, profileUrl: normUrl, contactType: "phone" }).lean(),
    ]);
    if (e) alreadyHasEmail = true;
    if (p) alreadyHasPhone = true;
  }
  return { alreadyHasEmail, alreadyHasPhone };
}

async function upsertRevealMarker(userId, contactType, status, normUrl, publicIdentifier) {
  const q = { userId, contactType };
  if (normUrl) q.profileUrl = normUrl;
  else if (publicIdentifier) q.publicIdentifier = publicIdentifier;
  else return;

  const $set = {};
  if (publicIdentifier) $set.publicIdentifier = publicIdentifier;
  if (normUrl) $set.profileUrl = normUrl;

  try {
    await RevealedContact.updateOne(
      q,
      { $setOnInsert: { status }, $set, $unset: { leadId: 1 } },
      { upsert: true }
    );
  } catch (dupErr) {
    if (dupErr && (dupErr.code === 11000 || dupErr.codeName === "DuplicateKey")) {
      console.warn("[MCP website] RevealedContact dup ignored:", dupErr.message);
      return;
    }
    throw dupErr;
  }
}

async function getOrCreateSavedLeadsList(userId) {
  let savedLeadsList = await List.findOne({
    name: { $in: SAVED_LEADS_NAMES },
    createdBy: userId,
  });

  if (!savedLeadsList) {
    savedLeadsList = await List.create({
      name: "saved leads",
      createdBy: userId,
      status: "active",
      listType: "people",
    });
    await ListKind.updateOne(
      { listId: savedLeadsList._id },
      { $set: { kind: "revealed_search_results" } },
      { upsert: true }
    );
  } else if (savedLeadsList.status !== "active") {
    await List.updateOne(
      { _id: savedLeadsList._id },
      { $set: { status: "active", name: "saved leads" } }
    );
    savedLeadsList.status = "active";
  }
  return savedLeadsList;
}

/**
 * B1 — same as website: after reveal, upsert into "saved leads".
 */
async function upsertSavedLeadsItem(userId, { url, publicIdentifier, data, emails, phones }) {
  const savedLeadsList = await getOrCreateSavedLeadsList(userId);
  const normUrl = normalizeUrl(url);
  const publicId = publicIdentifier || extractPublicIdentifier(url);
  const linkedin = String(url || "").trim();

  const queryOr = [];
  if (publicId) {
    queryOr.push({ "raw.public_identifier": publicId });
    queryOr.push({ public_identifier: publicId });
  }
  if (linkedin) {
    queryOr.push({ "raw.public_profile_url": linkedin });
    queryOr.push({ "raw.linkedin_url": linkedin });
    queryOr.push({ "raw.profile_url": linkedin });
    queryOr.push({ public_profile_url: linkedin });
    queryOr.push({ linkedin_url: linkedin });
  }
  if (normUrl) {
    queryOr.push({ "raw.public_profile_url": normUrl });
    queryOr.push({ "raw.linkedin_url": normUrl });
  }

  const { identity, newRaw } = await buildListPersonRecord({
    url: linkedin,
    publicId,
    source: data,
    emails,
    phones,
    sourceTag: "mcp_claude",
  });

  const itemFields = {
    ...identity,
    status: "",
    raw: newRaw,
  };

  const finish = async (action) => {
    try {
      const count = await ListItem.countDocuments({ listId: savedLeadsList._id });
      await List.updateOne({ _id: savedLeadsList._id }, { $set: { totalLeads: count } });
    } catch (_) {}
    return { listId: String(savedLeadsList._id), listName: savedLeadsList.name, action };
  };

  if (!queryOr.length) {
    await ListItem.create({
      listId: savedLeadsList._id,
      ...itemFields,
    });
    return finish("created");
  }

  const existing = await ListItem.findOne({
    listId: savedLeadsList._id,
    $or: queryOr,
  });

  if (existing) {
    const mergedRaw = mergePersonRaw(existing.raw || {}, identity, newRaw);
    await ListItem.updateOne(
      { _id: existing._id },
      {
        $set: {
          ...compactIdentity(identity),
          raw: mergedRaw,
        },
      }
    );
    return finish("updated");
  }

  await ListItem.create({
    listId: savedLeadsList._id,
    ...itemFields,
  });
  return finish("created");
}

/**
 * Same daily search quota as /api/proxy/search (FREE=75, paid=150, or custom).
 */
async function consumeDailySearchSlot(userId, res) {
  const user = await User.findById(userId).populate("orgId", "planKey");
  if (!user) {
    res.status(401).json({ error: "user_not_found" });
    return null;
  }

  const now = new Date();
  const lastDate = new Date(user.lastSearchDate || 0);
  const isSameDay =
    now.getDate() === lastDate.getDate() &&
    now.getMonth() === lastDate.getMonth() &&
    now.getFullYear() === lastDate.getFullYear();

  if (!isSameDay) {
    user.dailySearchCount = 0;
    user.lastSearchDate = now;
  }

  const planKey = String(user.planKey || user.orgId?.planKey || "FREE").toUpperCase();
  const defaultLimit = planKey === "FREE" ? 75 : 150;
  const dailyLimit =
    user.customDailySearchLimit !== null && user.customDailySearchLimit !== undefined
      ? user.customDailySearchLimit
      : defaultLimit;

  if (user.dailySearchCount >= dailyLimit) {
    res.status(429).json({
      error: "daily_search_limit_reached",
      error_description: "Daily search limit reached.",
      dailyLimit,
      dailySearchCount: user.dailySearchCount,
      morphology: "website",
    });
    return null;
  }

  user.dailySearchCount += 1;
  await user.save();
  return {
    ok: true,
    dailyLimit,
    dailySearchCount: user.dailySearchCount,
  };
}

function bearerFromReq(req) {
  const auth = req.headers.authorization || "";
  return auth.startsWith("Bearer ") ? auth.slice(7).trim() : null;
}

function secretsEqual(provided, expected) {
  const a = Buffer.from(String(provided || ""));
  const b = Buffer.from(String(expected || ""));
  if (!expected || a.length !== b.length) {
    if (b.length) crypto.timingSafeEqual(b, b);
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

async function requireOAuthUser(req, res) {
  const internalSecret = req.headers["x-mawsool-internal-secret"];
  if (internalSecret) {
    const expected = process.env.CHATGPT_MCP_INTERNAL_SECRET;
    if (!secretsEqual(internalSecret, expected)) {
      res.status(401).json({ error: "invalid_internal_secret" });
      return null;
    }
    const email = String(req.headers["x-mawsool-user-email"] || "")
      .trim()
      .toLowerCase();
    if (!email) {
      res.status(400).json({ error: "missing_user_email" });
      return null;
    }
    const user = await User.findOne({
      email: { $regex: new RegExp(`^${email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
    });
    if (!user || user.isArchived) {
      res.status(404).json({
        error: "user_not_found",
        error_description: "No Mawsool account for this email. Sign up on the website first.",
      });
      return null;
    }
    return { userId: user._id, clientId: "chatgpt-mcp-internal" };
  }

  const token = bearerFromReq(req);
  if (!token) {
    res.status(401).json({ error: "missing_token" });
    return null;
  }
  const record = await OAuthToken.findOne({
    accessToken: token,
    revoked: false,
    accessTokenExpiresAt: { $gt: new Date() },
  });
  if (!record) {
    res.status(401).json({ error: "invalid_token" });
    return null;
  }
  return record;
}

async function attachCredits(userId, payload, extra = {}) {
  const balance = await getBalanceForUser(userId);
  return {
    ...payload,
    ...extra,
    creditsRemaining: balance.balance,
    creditsSource: "mawsool_account",
    morphology: "website",
  };
}

function fieldsToRevealType(fields) {
  const parts = String(fields || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const wantsEmail = parts.some((p) => p.includes("email"));
  const wantsPhone = parts.some((p) => p.includes("phone"));
  if (wantsEmail && wantsPhone) return "both";
  if (wantsPhone) return "phone";
  if (wantsEmail) return "email";
  return "email";
}

async function fetchJson(method, url, { headers = {}, params, body, apiKey } = {}) {
  const u = new URL(url);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && String(v).trim() !== "") {
        u.searchParams.set(k, String(v));
      }
    });
  }

  const hdrs = {
    Accept: "application/json",
    "x-mawsool-source": "Web App Backend (backbeta.mawsool.tech)",
    "User-Agent": "Web App Backend (backbeta.mawsool.tech)",
    ...headers,
  };
  if (apiKey) {
    hdrs["X-API-Key"] = apiKey;
  }
  if (body !== undefined && !hdrs["Content-Type"]) {
    hdrs["Content-Type"] = "application/json";
  }

  let response;
  try {
    response = await fetch(u.toString(), {
      method,
      headers: hdrs,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    const cause = err.cause || err;
    return {
      status: 502,
      data: {
        error: `Upstream unreachable: ${cause.message || err.message}`,
      },
    };
  }

  if (response.status === 202) {
    return {
      status: 202,
      data: {
        status: "processing",
        message: "Enrichment in progress",
        retry_needed: true,
      },
    };
  }

  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text || `HTTP ${response.status}` };
  }
  return { status: response.status, data };
}

/**
 * GET /api/oauth/mcp/credits
 */
exports.getCredits = async (req, res) => {
  try {
    const record = await requireOAuthUser(req, res);
    if (!record) return;
    const balance = await getBalanceForUser(record.userId);
    return res.status(200).json({
      status: "success",
      creditsRemaining: balance.balance,
      personalCredits: balance.personalCredits,
      poolCredits: balance.poolCredits,
      scope: balance.scope,
      source: "mawsool_account",
      morphology: "website",
    });
  } catch (error) {
    console.error("[MCP website] getCredits:", error);
    return res.status(500).json({ error: "server_error", error_description: error.message });
  }
};

/**
 * POST /api/oauth/mcp/search
 */
exports.search = async (req, res) => {
  try {
    const record = await requireOAuthUser(req, res);
    if (!record) return;

    const quota = await consumeDailySearchSlot(record.userId, res);
    if (!quota) return;

    const {
      filters = {},
      search_type = "people",
      page = 1,
      limit = 10,
    } = req.body || {};

    const type =
      String(search_type || "people").toLowerCase() === "companies"
        ? "companies"
        : "people";

    const requested = Number(limit) || 10;
    const safeLimit = Math.min(Math.max(1, requested), MCP_SEARCH_MAX_LIMIT);
    const safePage = Math.max(1, Number(page) || 1);

    const mwUrl = `${middlewareBaseUrl()}/search`;
    const { status, data } = await fetchJson("POST", mwUrl, {
      headers: {
        "Content-Type": "application/json",
        "x-api-key": middlewareKey(),
      },
      body: {
        filters: filters && typeof filters === "object" ? filters : {},
        page: safePage,
        limit: safeLimit,
        type,
      },
    });

    if (status >= 400 || data?.error) {
      return res.status(status >= 400 ? status : 502).json(
        await attachCredits(record.userId, {
          error: data.error || data.message || `Search failed (${status})`,
          creditsCharged: 0,
          dailyLimit: quota.dailyLimit,
          dailySearchCount: quota.dailySearchCount,
          limitApplied: safeLimit,
          limitRequested: requested,
        })
      );
    }

    const payload = type === "people" ? annotateSearchPeople(data) : data;
    return res.status(200).json(
      await attachCredits(record.userId, payload, {
        creditsCharged: 0,
        dailyLimit: quota.dailyLimit,
        dailySearchCount: quota.dailySearchCount,
        limitApplied: safeLimit,
        limitRequested: requested,
        page: safePage,
        morphology: "website",
        note:
          requested > safeLimit
            ? `Website page size is max ${MCP_SEARCH_MAX_LIMIT}; use page=2,3… for more. Each page counts as one daily search.`
            : undefined,
      })
    );
  } catch (error) {
    console.error("[MCP website] search:", error);
    return res.status(500).json({ error: "server_error", error_description: error.message });
  }
};

/**
 * POST /api/oauth/mcp/contact
 * B1: RevealedContact markers + auto-save to "saved leads" (website parity).
 */
exports.contact = async (req, res) => {
  try {
    const record = await requireOAuthUser(req, res);
    if (!record) return;

    const { url, fields, country } = req.body || {};
    if (!url || !fields) {
      return res.status(400).json({ error: "url and fields are required" });
    }

    const key = mainApiKey();
    if (!key) {
      return res.status(500).json({
        error: "MAWSOOL_DEFAULT_API_KEY is not set on the Backend",
      });
    }

    const revealType = fieldsToRevealType(fields);
    const normUrl = normalizeUrl(url);
    const publicIdentifier = extractPublicIdentifier(url);
    const attemptedEmail = revealType === "email" || revealType === "both";
    const attemptedPhone = revealType === "phone" || revealType === "both";

    const { alreadyHasEmail, alreadyHasPhone } = await findExistingRevealMarkers(
      record.userId,
      normUrl,
      publicIdentifier
    );

    const before = await getBalanceForUser(record.userId);

    const maxPossible =
      revealType === "both" ? 25 : revealType === "phone" ? 20 : 5;
    const mayCharge =
      (attemptedEmail && !alreadyHasEmail) || (attemptedPhone && !alreadyHasPhone);
    if (mayCharge && (before.balance || 0) <= 0 && maxPossible > 0) {
      return res.status(402).json({
        error: "insufficient_credits",
        creditsRemaining: before.balance,
        required: maxPossible,
        source: "mawsool_account",
        morphology: "website",
      });
    }

    let { status, data } = await fetchJson(
      "GET",
      "https://apicool.mawsool.tech/contact",
      {
        apiKey: key,
        params: { url, fields, country },
      }
    );

    if (status === 202 || data?.retry_needed) {
      await new Promise((r) => setTimeout(r, 35000));
      ({ status, data } = await fetchJson(
        "GET",
        "https://apicool.mawsool.tech/contact",
        {
          apiKey: key,
          params: { url, fields, country },
        }
      ));
      if (status === 202 || data?.retry_needed) {
        return res.status(202).json(
          await attachCredits(record.userId, {
            error: "Taking longer than expected. Retry in 30 seconds.",
            retry_needed: true,
            creditsCharged: 0,
          })
        );
      }
    }

    if (status >= 400 || data?.error) {
      return res.status(status >= 400 ? status : 502).json(
        await attachCredits(record.userId, {
          ...data,
          error: data.error || data.message || `Contact failed (${status})`,
          creditsCharged: 0,
        })
      );
    }

    const emailResult = evaluateEmailForBilling(data);
    const phoneResult = evaluatePhoneForBilling(data);
    const cost = computeCost({
      revealType,
      emailResult,
      phoneResult,
      alreadyHasEmail,
      alreadyHasPhone,
    });

    let creditsCharged = 0;
    let creditsRemaining = before.balance;

    if (cost > 0) {
      if ((before.balance || 0) < cost) {
        return res.status(402).json({
          error: "insufficient_credits",
          creditsRemaining: before.balance,
          required: cost,
          source: "mawsool_account",
          morphology: "website",
        });
      }
      const deducted = await deductCreditsForUser(
        record.userId,
        cost,
        `MCP/Claude website reveal (${revealType}) for ${url}`
      );
      creditsCharged = cost;
      creditsRemaining = deducted.balance;
    } else {
      const bal = await getBalanceForUser(record.userId);
      creditsRemaining = bal.balance;
    }

    // B1: persist reveal markers like website revealBundleSearch
    if (attemptedEmail) {
      const emailNewlyBillable = emailResult.hasBillable && !alreadyHasEmail;
      await upsertRevealMarker(
        record.userId,
        "email",
        emailNewlyBillable ? "charged" : "free",
        normUrl,
        publicIdentifier
      );
    }
    if (attemptedPhone) {
      const phoneNewlyBillable = phoneResult.hasBillable && !alreadyHasPhone;
      await upsertRevealMarker(
        record.userId,
        "phone",
        phoneNewlyBillable ? "charged" : "free",
        normUrl,
        publicIdentifier
      );
    }

    const emails = formatEmailsFromPayload(data);
    const phones = formatPhonesFromPayload(data);

    let savedLeads = null;
    try {
      savedLeads = await upsertSavedLeadsItem(record.userId, {
        url,
        publicIdentifier,
        data,
        emails,
        phones,
      });
    } catch (saveErr) {
      console.error("[MCP website] saved leads upsert failed:", saveErr);
    }

    try {
      const types = [];
      if (attemptedEmail) types.push("email");
      if (attemptedPhone) types.push("phone");
      if (normUrl && types.length) {
        revealEvents.emit(record.userId, {
          profileUrl: normUrl,
          types,
          leadIdsAffected: [],
          source: "mcp",
        });
      }
    } catch (_) {}

    return res.status(200).json({
      ...data,
      creditsCharged,
      creditsRemaining,
      creditsSource: "mawsool_account",
      morphology: "website",
      billing: {
        revealType,
        emailBillable: !!emailResult.hasBillable,
        phoneBillable: !!phoneResult.hasBillable,
        alreadyHasEmail,
        alreadyHasPhone,
        cost: creditsCharged,
      },
      savedToList: savedLeads,
    });
  } catch (error) {
    console.error("[MCP website] contact:", error);
    return res.status(500).json({ error: "server_error", error_description: error.message });
  }
};

/**
 * POST /api/oauth/mcp/full-info
 */
exports.fullInfo = async (req, res) => {
  try {
    const record = await requireOAuthUser(req, res);
    if (!record) return;

    const { url } = req.body || {};
    if (!url) return res.status(400).json({ error: "url is required" });

    const key = mainApiKey();
    if (!key) {
      return res.status(500).json({
        error: "MAWSOOL_DEFAULT_API_KEY is not set on the Backend",
      });
    }

    const { status, data } = await fetchJson(
      "GET",
      "https://apicool.mawsool.tech/full-info",
      {
        apiKey: key,
        params: { url },
      }
    );

    if (status >= 400 || data?.error) {
      return res.status(status >= 400 ? status : 502).json(
        await attachCredits(record.userId, {
          ...data,
          error: data.error || data.message || `Full-info failed (${status})`,
          creditsCharged: 0,
        })
      );
    }

    return res.status(200).json(
      await attachCredits(record.userId, data, { creditsCharged: 0 })
    );
  } catch (error) {
    console.error("[MCP website] fullInfo:", error);
    return res.status(500).json({ error: "server_error", error_description: error.message });
  }
};

/**
 * POST /api/oauth/mcp/save-to-list  (B3)
 * Body: {
 *   list_name?: string,
 *   list_id?: string,
 *   create_if_missing?: boolean (default true when list_name set),
 *   profiles: [{ url, name?, first_name?, last_name?, title?, company?, headline?, email?, phone?, public_identifier?, raw? }]
 * }
 */
exports.saveToList = async (req, res) => {
  try {
    const record = await requireOAuthUser(req, res);
    if (!record) return;

    const userId = record.userId;
    const {
      list_name,
      list_id,
      create_if_missing = true,
      profiles,
    } = req.body || {};

    const items = Array.isArray(profiles) ? profiles : [];
    if (!items.length) {
      return res.status(400).json({
        error: "profiles_required",
        error_description:
          "Provide profiles: [{ url, first_name?, last_name?, title?, company?, headline?, name?, email?, phone? }, ...]",
      });
    }
    if (!list_id && !list_name) {
      return res.status(400).json({
        error: "list_required",
        error_description: "Provide list_id or list_name",
      });
    }

    let listDoc = null;
    if (list_id) {
      listDoc = await List.findOne({ _id: list_id, createdBy: userId });
      if (!listDoc) {
        return res.status(404).json({ error: "list_not_found" });
      }
    } else {
      listDoc = await List.findOne({
        createdBy: userId,
        name: String(list_name).trim(),
      });
      if (!listDoc && create_if_missing) {
        listDoc = await List.create({
          name: String(list_name).trim(),
          createdBy: userId,
          status: "active",
          listType: "people",
        });
        await ListKind.updateOne(
          { listId: listDoc._id },
          { $set: { kind: "user_made" } },
          { upsert: true }
        );
      }
      if (!listDoc) {
        return res.status(404).json({
          error: "list_not_found",
          error_description: `No list named "${list_name}". Pass create_if_missing=true to create it.`,
        });
      }
    }

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const results = [];

    for (const profile of items) {
      const url = String(profile?.url || profile?.linkedin_url || "").trim();
      if (!url) {
        skipped += 1;
        results.push({ error: "missing_url" });
        continue;
      }

      const normUrl = normalizeUrl(url);
      const publicId =
        String(profile?.public_identifier || profile?.publicIdentifier || "").trim() ||
        extractPublicIdentifier(url);
      const email = String(profile?.email || "").trim();
      const phone = String(profile?.phone || "").trim();
      const source = {
        ...(profile?.raw && typeof profile.raw === "object" ? profile.raw : {}),
        ...omitNoise(profile),
      };

      const queryOr = [];
      if (publicId) {
        queryOr.push({ "raw.public_identifier": publicId });
        queryOr.push({ public_identifier: publicId });
      }
      queryOr.push({ "raw.public_profile_url": url });
      queryOr.push({ "raw.linkedin_url": url });
      if (normUrl) {
        queryOr.push({ "raw.public_profile_url": normUrl });
        queryOr.push({ "raw.linkedin_url": normUrl });
      }

      const { identity, newRaw } = await buildListPersonRecord({
        url,
        publicId,
        source,
        emails: email ? [email] : [],
        phones: phone ? [phone] : [],
        sourceTag: "mcp_claude_save_to_list",
      });

      const existing = await ListItem.findOne({
        listId: listDoc._id,
        $or: queryOr,
      });

      if (existing) {
        const mergedRaw = mergePersonRaw(existing.raw || {}, identity, newRaw);
        await ListItem.updateOne(
          { _id: existing._id },
          {
            $set: {
              ...compactIdentity(identity),
              raw: mergedRaw,
            },
          }
        );
        updated += 1;
        results.push({ url, action: "updated", itemId: String(existing._id) });
      } else {
        const createdItem = await ListItem.create({
          listId: listDoc._id,
          ...identity,
          status: "",
          raw: newRaw,
        });
        created += 1;
        results.push({ url, action: "created", itemId: String(createdItem._id) });
      }
    }

    try {
      const count = await ListItem.countDocuments({ listId: listDoc._id });
      await List.updateOne({ _id: listDoc._id }, { $set: { totalLeads: count } });
    } catch (_) {}

    return res.status(200).json(
      await attachCredits(userId, {
        status: "success",
        listId: String(listDoc._id),
        listName: listDoc.name,
        created,
        updated,
        skipped,
        results,
      })
    );
  } catch (error) {
    console.error("[MCP website] saveToList:", error);
    return res.status(500).json({ error: "server_error", error_description: error.message });
  }
};
