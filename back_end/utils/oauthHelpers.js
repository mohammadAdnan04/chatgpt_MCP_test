const crypto = require("crypto");

function base64Url(buffer) {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("hex");
}

function pkceChallengeFromVerifier(verifier) {
  return base64Url(crypto.createHash("sha256").update(verifier).digest());
}

function hashSecret(secret) {
  return crypto.createHash("sha256").update(secret).digest("hex");
}

/**
 * Exact match, plus RFC 8252 loopback: ignore port for localhost / 127.0.0.1
 * when the registered URI is http://localhost/callback or http://127.0.0.1/callback
 * (or with any port).
 */
function redirectUriAllowed(registeredUris = [], requestedUri) {
  if (!requestedUri || !Array.isArray(registeredUris)) return false;
  if (registeredUris.includes(requestedUri)) return true;

  let requested;
  try {
    requested = new URL(requestedUri);
  } catch {
    return false;
  }

  const isLoopback =
    requested.hostname === "localhost" || requested.hostname === "127.0.0.1";
  if (!isLoopback) return false;

  return registeredUris.some((reg) => {
    try {
      const u = new URL(reg);
      return (
        (u.hostname === "localhost" || u.hostname === "127.0.0.1") &&
        u.hostname === requested.hostname &&
        u.protocol === requested.protocol &&
        u.pathname === requested.pathname
      );
    } catch {
      return false;
    }
  });
}

function getIssuer() {
  const raw =
    process.env.OAUTH_ISSUER ||
    process.env.API_BASE_URL ||
    `http://localhost:${process.env.PORT || 8000}`;
  return raw.replace(/\/+$/, "");
}

function getFrontendUrl() {
  return (process.env.FRONTEND_URL || process.env.CLIENT_URL || "http://localhost:3006").replace(
    /\/+$/,
    ""
  );
}

function getMcpResourceUrl() {
  return (
    process.env.MCP_RESOURCE_URL ||
    process.env.MCP_SERVER_URL ||
    "http://localhost:3000/mcp"
  ).replace(/\/+$/, "");
}

function parseScopes(scope) {
  if (!scope) return ["mcp", "offline_access"];
  if (Array.isArray(scope)) return scope;
  return String(scope)
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

module.exports = {
  base64Url,
  randomToken,
  pkceChallengeFromVerifier,
  hashSecret,
  redirectUriAllowed,
  getIssuer,
  getFrontendUrl,
  getMcpResourceUrl,
  parseScopes,
};
