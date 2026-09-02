const PLACEHOLDER = /^(not available|n\/a|null|undefined)$/i;

function isPlaceholder(value) {
  const s = String(value || "").trim();
  return !s || PLACEHOLDER.test(s);
}

export function unwrapContactPayload(data) {
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

export function isAwaitingContactWebhook(data) {
  const merged = unwrapContactPayload(data);
  const status = String(merged?.status || data?.status || "").toLowerCase();
  const msg = String(merged?.message || data?.message || "").toLowerCase();
  return (
    status === "processing" ||
    status === "pending" ||
    merged?.awaiting_enrichment === true ||
    merged?.webhook_pending === true ||
    data?.awaiting_enrichment === true ||
    msg.includes("in progress") ||
    msg.includes("please retry") ||
    msg.includes("fallback search initiated")
  );
}

function collectEmails(data) {
  const merged = unwrapContactPayload(data);
  const out = [];
  const seen = new Set();
  const add = (raw, status) => {
    const parts = [];
    if (typeof raw === "string") parts.push({ email: raw, status });
    else if (raw && typeof raw === "object") {
      parts.push({
        email: raw.email || raw.sanitized_email || "",
        status: raw.verificationStatus || raw.status || status || "",
      });
    }
    parts.forEach((item) => {
      String(item.email || "")
        .split(/[;,]+/)
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((email) => {
          if (isPlaceholder(email) || !email.includes("@")) return;
          const key = email.toLowerCase();
          if (seen.has(key)) return;
          seen.add(key);
          out.push({ email, status: item.status || merged.contact__email_status || merged.email_status || "" });
        });
    });
  };

  (Array.isArray(merged.contact__all_emails) ? merged.contact__all_emails : []).forEach((e) => add(e));
  (Array.isArray(merged.contact__emails) ? merged.contact__emails : []).forEach((e) => add(e));
  (Array.isArray(merged.emails) ? merged.emails : []).forEach((e) => add(e));
  if (merged.contact__email) add(merged.contact__email, merged.contact__email_status);
  if (merged.email) add(merged.email, merged.email_status || merged.contact__email_status);

  if (!out.length) {
    const re = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
    const visit = (val) => {
      if (!val) return;
      if (typeof val === "string") {
        const m = val.match(re);
        if (m) add(m[0]);
      } else if (Array.isArray(val)) val.forEach(visit);
      else if (typeof val === "object") Object.values(val).forEach(visit);
    };
    visit(merged);
  }

  return out;
}

function collectPhones(data) {
  const merged = unwrapContactPayload(data);
  const out = [];
  const seen = new Set();
  const add = (raw) => {
    if (typeof raw === "string") {
      String(raw)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((part) => {
          const m = part.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
          add({ sanitized_number: m ? m[1].trim() : part, raw_number: m ? m[1].trim() : part, type: m ? m[2].trim() : "" });
        });
      return;
    }
    const num = raw?.sanitized_number || raw?.raw_number || raw?.number || "";
    if (isPlaceholder(num) || String(num).replace(/\D/g, "").length < 5) return;
    const key = String(num).replace(/[^\d+]/g, "");
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push({
      sanitized_number: raw?.sanitized_number || num,
      raw_number: raw?.raw_number || num,
      type: raw?.type || "",
    });
  };

  (Array.isArray(merged.contact__phone_numbers) ? merged.contact__phone_numbers : []).forEach(add);
  (Array.isArray(merged.phones) ? merged.phones : []).forEach(add);
  if (merged.phone) add(merged.phone);
  if (merged.contact__phone) add(merged.contact__phone);
  return out;
}

export function extractContactReveal(data) {
  const emails = collectEmails(data);
  const phones = collectPhones(data);
  const emailMeta = emails.map((e) => ({ email: e.email, status: e.status || "unknown" }));
  const phoneLabels = phones.map((p) => `${p.sanitized_number || p.raw_number}${p.type ? ` (${p.type})` : ""}`.trim());
  const awaiting = isAwaitingContactWebhook(data);
  return {
    emails,
    emailMeta,
    phones,
    phoneLabels,
    emailString: emails.length ? emails.map((e) => e.email).join(", ") : "",
    phoneString: phoneLabels.length ? phoneLabels.join(",") : "",
    awaiting,
    status: String(unwrapContactPayload(data)?.status || data?.status || "").toLowerCase(),
    raw: unwrapContactPayload(data),
  };
}

export function hasExtractedContacts(extracted, contactType) {
  if (!extracted) return false;
  if (contactType === "email") return !!extracted.emailString;
  if (contactType === "phone") return !!extracted.phoneString;
  return !!(extracted.emailString || extracted.phoneString);
}
