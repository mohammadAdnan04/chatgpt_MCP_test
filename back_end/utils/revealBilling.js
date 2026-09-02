const { parsePhoneNumberFromString } = require('libphonenumber-js');

const PERSONAL_PHONE_TYPES = ['mobile','direct_dial','direct','personal','cell','other'];
const CORPORATE_HINTS = ['corporate','company','main','hq','switchboard','front desk','reception','work hq','work_hq','work_phone','office','landline','toll-free','tollfree','uan'];
const LIB_CORPORATE_TYPES = new Set(['FIXED_LINE','TOLL_FREE','SHARED_COST','UAN','VOIP','PREMIUM_RATE','PAGER','VOICEMAIL']);
const LIB_MOBILE_TYPES = new Set(['MOBILE','PERSONAL_NUMBER']);
const CORPORATE_PREFIX_BY_CC = {
  '966': ['11','12','13','14','16','17','800','920'],
  '971': ['2','3','4','6','7','9','800'],
  '965': ['2'],
  '974': ['4'],
  '973': ['1','17'],
  '968': ['2'],
  '962': ['2','3','5','6'],
  '20': ['2','3'],
  '44': ['1','2','8']
};
const MOBILE_PREFIX_BY_CC = {
  '966': ['5'],
  '971': ['5'],
  '965': ['5','6','9'],
  '974': ['3','5','6','7'],
  '973': ['3'],
  '968': ['7','9'],
  '962': ['7'],
  '20': ['10','11','12','15'],
  '44': ['7']
};

function normalizeEmailStatus(s) {
  const st = String(s || '').toLowerCase();
  if (!st) return "";
  if (st.includes('undeliverable')) return "undeliverable";
  if (st.includes('invalid')) return "invalid";
  if (st.includes('bounced') || st.includes('bounce')) return "bounced";
  if (st.includes('risky')) return "risky";
  if (st.includes('deliverable')) return "deliverable";
  if (st.includes('verified')) return "deliverable";
  if (st.includes('valid')) return "deliverable";
  if (st.includes('catch_all') || st.includes('catch-all') || st.includes('catchall')) return "catch_all";
  if (st.includes('unknown')) return "unknown";
  if (st.includes('pending')) return "pending";
  return st; // Fallback to the string itself instead of empty string to prevent "missing status"
}

function extractPhoneTypeLabel(s) {
  try {
    const m = String(s || '').match(/\(([^)]+)\)\s*$/);
    return m ? m[1].toLowerCase().trim() : '';
  } catch {
    return '';
  }
}

function stripPhoneDecorations(s) {
  return String(s || '').replace(/^'+/, '').replace(/\s*\([^)]*\)\s*$/, '').trim();
}

function normalizePhoneKey(v) {
  return String(v || '').replace(/[^+\d]/g, '');
}

function parsePhoneParts(s) {
  const cleaned = stripPhoneDecorations(s);
  if (!cleaned) return null;
  const lower = cleaned.toLowerCase();
  if (lower === 'not available' || lower === 'n/a') return null;
  const compact = cleaned.startsWith('+')
    ? `+${cleaned.replace(/[^\d]/g, '')}`
    : cleaned.replace(/[^\d+]/g, '');
  let p = parsePhoneNumberFromString(cleaned) || parsePhoneNumberFromString(compact);
  if (!p && compact && !String(compact).startsWith('+')) {
    p = parsePhoneNumberFromString(`+${String(compact).replace(/\D/g, '')}`);
  }
  let type;
  try { type = p && p.getType && p.getType(); } catch { type = undefined; }
  return {
    cleaned,
    cc: p ? String(p.countryCallingCode || '') : '',
    national: p ? String(p.nationalNumber || '') : String(cleaned).replace(/\D/g, '').replace(/^0+/, ''),
    type,
    valid: !!(p && p.isValid && p.isValid())
  };
}

function nationalStartsWith(national, prefixes) {
  const n = String(national || '').replace(/^0+/, '');
  return (prefixes || []).some((p) => n.startsWith(p));
}

function isLikelyCorporatePhone(s) {
  const t = extractPhoneTypeLabel(s);
  if (t && PERSONAL_PHONE_TYPES.includes(t)) return false;
  if (t && CORPORATE_HINTS.some((h) => t.includes(h))) return true;
  if (t && !PERSONAL_PHONE_TYPES.includes(t)) return true;
  const lc = String(s || '').toLowerCase();
  if (CORPORATE_HINTS.some((h) => lc.includes(h))) return true;
  const parts = parsePhoneParts(s);
  if (!parts) return false;
  if (parts.type && LIB_CORPORATE_TYPES.has(parts.type)) return true;
  if (parts.type && LIB_MOBILE_TYPES.has(parts.type)) return false;
  const prefixes = CORPORATE_PREFIX_BY_CC[parts.cc];
  return !!(prefixes && nationalStartsWith(parts.national, prefixes));
}

function isLikelyMobilePhone(s) {
  if (isLikelyCorporatePhone(s)) return false;
  const t = extractPhoneTypeLabel(s);
  if (t && PERSONAL_PHONE_TYPES.includes(t)) return true;
  const parts = parsePhoneParts(s);
  if (!parts) return false;
  if (parts.type && LIB_MOBILE_TYPES.has(parts.type)) return true;
  const prefixes = MOBILE_PREFIX_BY_CC[parts.cc];
  if (!prefixes || !nationalStartsWith(parts.national, prefixes)) return false;
  if (parts.cc === '966' && String(parts.national).replace(/^0+/, '').length < 9) return false;
  return true;
}

function csvColumnLooksCorporate(name) {
  return /\b(corporate|office|work|hq|switchboard|landline|company phone)\b/i.test(String(name || ''));
}

function appendPhoneValue(existing, number) {
  const num = stripPhoneDecorations(number);
  if (!num) return String(existing || '').trim();
  const cur = String(existing || '').trim();
  if (!cur) return num;
  const key = normalizePhoneKey(num);
  const already = cur.split(',').some((s) => normalizePhoneKey(s) === key);
  return already ? cur : `${cur}, ${num}`;
}

function originalCorporateKeys(raw) {
  const keys = new Set();
  const orig = raw && raw.__original ? raw.__original : {};
  Object.keys(orig).forEach((k) => {
    if (!csvColumnLooksCorporate(k)) return;
    String(orig[k] || '').split(',').map((s) => s.trim()).filter(Boolean).forEach((s) => {
      const key = normalizePhoneKey(s);
      if (key) keys.add(key);
    });
  });
  String((raw && raw.corporate_phone) || '').split(',').map((s) => s.trim()).filter(Boolean).forEach((s) => {
    const key = normalizePhoneKey(s);
    if (key) keys.add(key);
  });
  return keys;
}

function shouldTreatAsCorporateNumber(s, raw) {
  if (isLikelyCorporatePhone(s)) return true;
  const key = normalizePhoneKey(s);
  return !!(key && raw && originalCorporateKeys(raw).has(key));
}

function reclassifyRawPhoneFields(raw) {
  if (!raw || typeof raw !== 'object') return raw;
  const move = [];
  const take = (field) => {
    const val = raw[field];
    if (val == null || val === '') return;
    const kept = [];
    String(val).split(',').map((s) => s.trim()).filter(Boolean).forEach((part) => {
      if (shouldTreatAsCorporateNumber(part, raw)) move.push(part);
      else kept.push(part);
    });
    raw[field] = kept.join(', ');
  };
  take('phone');
  take('second_phone');
  take('mobile_phone');
  if (Array.isArray(raw.contact__phone_numbers)) {
    const kept = [];
    raw.contact__phone_numbers.forEach((p) => {
      const num = p && (p.sanitized_number || p.raw_number || p.number);
      if (!num) return;
      const type = p.type || '';
      const labeled = type ? `${num} (${type})` : String(num);
      if (shouldTreatAsCorporateNumber(labeled, raw)) move.push(labeled);
      else kept.push(p);
    });
    raw.contact__phone_numbers = kept;
  }
  move.forEach((n) => {
    raw.corporate_phone = appendPhoneValue(raw.corporate_phone, n);
  });
  return raw;
}

function leadHasPersonalMobile(item) {
  const raw = (item && item.raw) || {};
  const chunks = [item && item.phone, raw.phone, raw.second_phone, raw.mobile_phone];
  if (chunks.some((v) => String(v || '').split(',').some((p) => p.trim() && isLikelyMobilePhone(p) && !shouldTreatAsCorporateNumber(p, raw)))) {
    return true;
  }
  const arr = Array.isArray(raw.contact__phone_numbers) ? raw.contact__phone_numbers : [];
  return arr.some((p) => {
    const num = p && (p.sanitized_number || p.raw_number || p.number);
    if (!num) return false;
    const labeled = `${num} (${p.type || ''})`;
    return isLikelyMobilePhone(labeled) && !shouldTreatAsCorporateNumber(labeled, raw);
  });
}

function getEmailCandidates(payload) {
  const candidates = [];
  const add = (email, status) => {
    const e = String(email || "").trim();
    if (!e || e.toLowerCase() === 'not available') return;
    candidates.push({ email: e, status: normalizeEmailStatus(status) });
  };

  if (!payload) return candidates;

  add(payload.contact__email, payload.contact__email_status);
  add(payload.email, payload.email_status || payload.raw?.email_status);

  const all = Array.isArray(payload.contact__all_emails) ? payload.contact__all_emails : [];
  all.forEach(e => add(e && (e.email || e.sanitized_email), e && (e.verificationStatus || e.status)));

  const alt = Array.isArray(payload.contact__emails) ? payload.contact__emails : [];
  alt.forEach(e => add(e && (e.email || e.sanitized_email), e && (e.verificationStatus || e.status)));

  return candidates;
}

function pickBestBillableEmail(payload) {
  const candidates = getEmailCandidates(payload);
  const deliverable = candidates.find(c => c.status === 'deliverable');
  if (deliverable) return { ...deliverable, candidates };
  const risky = candidates.find(c => c.status === 'risky');
  if (risky) return { ...risky, candidates };
  return { email: "", status: "", candidates };
}

function evaluateEmailForBilling(payload) {
  const picked = pickBestBillableEmail(payload);
  const hasAny = (picked.candidates || []).length > 0;
  const hasMissingStatus = hasAny && (picked.candidates || []).some(c => c && c.email && !c.status);
  const hasBillable = !!(picked.email && (picked.status === 'deliverable' || picked.status === 'risky'));
  const allNonBillable = hasAny && !hasMissingStatus && !hasBillable;
  return {
    ...picked,
    hasAny,
    hasMissingStatus,
    hasBillable,
    allNonBillable
  };
}

function getPhoneCandidates(payload) {
  const out = [];
  if (!payload) return out;
  const arr = Array.isArray(payload.contact__phone_numbers) ? payload.contact__phone_numbers : (Array.isArray(payload.phones) ? payload.phones : []);
  if (arr.length > 0) {
    arr.forEach(p => {
      const num = p && (p.sanitized_number || p.raw_number || p.number);
      const type = p && (p.type || '');
      if (!num || String(num).toLowerCase() === 'not available') return;
      out.push({ raw: `${num} (${type || ""})`.trim(), num: String(num), type: String(type || '') });
    });
    return out;
  }
  const s = payload.phone || payload.contactPhone || "";
  if (typeof s === 'string' && s.trim() && s !== 'Not available') {
    s.split(',').map(v => v.trim()).filter(Boolean).forEach(v => out.push({ raw: v, num: v, type: extractPhoneTypeLabel(v) }));
  }
  return out;
}

function evaluatePhoneForBilling(payload) {
  const candidates = getPhoneCandidates(payload);
  const personal = candidates.find(p => !isLikelyCorporatePhone(p.raw));
  return {
    candidates,
    hasAny: candidates.length > 0,
    hasBillable: !!personal,
    best: personal ? personal.raw : ""
  };
}

function computeCost({ revealType, emailResult, phoneResult, alreadyHasEmail, alreadyHasPhone }) {
  let cost = 0;
  if (revealType === 'email') {
    if (emailResult.hasBillable && !alreadyHasEmail) cost = 5;
  } else if (revealType === 'phone') {
    if (phoneResult.hasBillable && !alreadyHasPhone) cost = 20;
  } else if (revealType === 'both') {
    if (emailResult.hasBillable && !alreadyHasEmail) cost += 5;
    if (phoneResult.hasBillable && !alreadyHasPhone) cost += 20;
  }
  return cost;
}

module.exports = {
  normalizeEmailStatus,
  isLikelyCorporatePhone,
  isLikelyMobilePhone,
  csvColumnLooksCorporate,
  originalCorporateKeys,
  shouldTreatAsCorporateNumber,
  reclassifyRawPhoneFields,
  leadHasPersonalMobile,
  stripPhoneDecorations,
  normalizePhoneKey,
  getEmailCandidates,
  pickBestBillableEmail,
  evaluateEmailForBilling,
  getPhoneCandidates,
  evaluatePhoneForBilling,
  computeCost
};

