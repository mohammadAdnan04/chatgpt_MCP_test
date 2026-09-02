function urlExactValues(url) {
  const s = String(url || "").trim();
  if (!s) return [];
  const noSlash = s.replace(/\/+$/, "");
  const https = noSlash.replace(/^http:/i, "https:");
  const http = noSlash.replace(/^https:/i, "http:");
  return [...new Set([s, noSlash, `${noSlash}/`, https, `${https}/`, http, `${http}/`])];
}

function listItemIdentityOr({ url, publicIdentifier } = {}) {
  const or = [];
  const pid = String(publicIdentifier || "").trim();
  if (pid) {
    or.push({ "raw.public_identifier": pid });
    or.push({ public_identifier: pid });
    or.push({ "raw.id": pid });
    or.push({ "raw.person_id": pid });
  }
  for (const u of urlExactValues(url)) {
    or.push({ "raw.public_profile_url": u });
    or.push({ "raw.linkedin_url": u });
    or.push({ "raw.profile_url": u });
    or.push({ linkedin_url: u });
  }
  return or;
}

module.exports = { urlExactValues, listItemIdentityOr };
