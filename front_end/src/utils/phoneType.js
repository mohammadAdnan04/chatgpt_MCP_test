const PERSONAL_PHONE_TYPES = ["mobile", "direct_dial", "direct", "personal", "cell", "other"];
const CORPORATE_HINTS = [
  "corporate", "company", "main", "hq", "switchboard", "front desk", "reception",
  "work hq", "work_hq", "work_phone", "office", "landline", "toll-free", "tollfree", "uan",
];
const CORPORATE_PREFIX_BY_CC = {
  "966": ["11", "12", "13", "14", "16", "17", "800", "920"],
  "971": ["2", "3", "4", "6", "7", "9", "800"],
  "965": ["2"],
  "974": ["4"],
  "973": ["1", "17"],
  "968": ["2"],
  "962": ["2", "3", "5", "6"],
  "20": ["2", "3"],
  "44": ["1", "2", "8"],
};
const MOBILE_PREFIX_BY_CC = {
  "966": ["5"],
  "971": ["5"],
  "965": ["5", "6", "9"],
  "974": ["3", "5", "6", "7"],
  "973": ["3"],
  "968": ["7", "9"],
  "962": ["7"],
  "20": ["10", "11", "12", "15"],
  "44": ["7"],
};
const CC_CANDIDATES = Object.keys(CORPORATE_PREFIX_BY_CC).concat(Object.keys(MOBILE_PREFIX_BY_CC))
  .filter((v, i, a) => a.indexOf(v) === i)
  .sort((a, b) => b.length - a.length);

export const extractPhoneTypeLabel = (s) => {
  try {
    const m = String(s || "").match(/\(([^)]+)\)\s*$/);
    return m ? m[1].toLowerCase().trim() : "";
  } catch {
    return "";
  }
};

export const normalizePhoneKey = (v) => String(v || "").replace(/[^+\d]/g, "");

const parseCcNational = (s) => {
  let d = String(s || "").replace(/^'+/, "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  for (const cc of CC_CANDIDATES) {
    if (d.startsWith(cc)) {
      return { cc, national: d.slice(cc.length).replace(/^0+/, "") };
    }
  }
  return { cc: "", national: d.replace(/^0+/, "") };
};

const nationalStartsWith = (national, prefixes) => {
  const n = String(national || "").replace(/^0+/, "");
  return (prefixes || []).some((p) => n.startsWith(p));
};

export const isLikelyCorporatePhoneNumber = (s) => {
  const t = extractPhoneTypeLabel(s);
  if (t && PERSONAL_PHONE_TYPES.includes(t)) return false;
  if (t && CORPORATE_HINTS.some((h) => t.includes(h))) return true;
  if (t && !PERSONAL_PHONE_TYPES.includes(t)) return true;
  const lc = String(s || "").toLowerCase();
  if (CORPORATE_HINTS.some((h) => lc.includes(h))) return true;
  const parts = parseCcNational(s);
  const prefixes = CORPORATE_PREFIX_BY_CC[parts.cc];
  return !!(prefixes && nationalStartsWith(parts.national, prefixes));
};

export const isLikelyMobilePhoneNumber = (s) => {
  if (isLikelyCorporatePhoneNumber(s)) return false;
  const t = extractPhoneTypeLabel(s);
  if (t && PERSONAL_PHONE_TYPES.includes(t)) return true;
  const parts = parseCcNational(s);
  const prefixes = MOBILE_PREFIX_BY_CC[parts.cc];
  if (!prefixes || !nationalStartsWith(parts.national, prefixes)) return false;
  if (parts.cc === "966" && String(parts.national).replace(/^0+/, "").length < 9) return false;
  return true;
};
