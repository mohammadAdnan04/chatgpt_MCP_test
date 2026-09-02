const OAuthClient = require("../models/OAuthClient");

const cimdCache = new Map();
const CIMD_TTL_MS = 5 * 60 * 1000;
const CIMD_FETCH_TIMEOUT_MS = 8000;

/**
 * Resolve OAuth client from DB (DCR / static) or CIMD (HTTPS client_id URL).
 * Claude Directory prefers CIMD for high traffic.
 */
async function resolveOAuthClient(clientId) {
  if (!clientId || typeof clientId !== "string") return null;

  if (/^https:\/\//i.test(clientId)) {
    return resolveCimdClient(clientId.trim());
  }

  const client = await OAuthClient.findOne({ clientId, isActive: true });
  if (!client) return null;

  return {
    clientId: client.clientId,
    name: client.name,
    redirectUris: client.redirectUris || [],
    tokenEndpointAuthMethod: client.tokenEndpointAuthMethod || "none",
    clientSecretHash: client.clientSecretHash || null,
    applicationType: client.applicationType || "native",
    isCimd: false,
  };
}

async function resolveCimdClient(clientIdUrl) {
  const cached = cimdCache.get(clientIdUrl);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.client;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CIMD_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(clientIdUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
      redirect: "error",
    });

    if (!response.ok) return null;

    const doc = await response.json();
    if (!doc || typeof doc !== "object") return null;
    if (doc.client_id !== clientIdUrl) return null;
    if (!Array.isArray(doc.redirect_uris) || doc.redirect_uris.length === 0) {
      return null;
    }

    const client = {
      clientId: clientIdUrl,
      name: doc.client_name || "Claude CIMD Client",
      redirectUris: doc.redirect_uris,
      tokenEndpointAuthMethod: doc.token_endpoint_auth_method || "none",
      clientSecretHash: null,
      applicationType: doc.application_type === "web" ? "web" : "native",
      isCimd: true,
    };

    cimdCache.set(clientIdUrl, {
      client,
      expiresAt: Date.now() + CIMD_TTL_MS,
    });
    return client;
  } catch (err) {
    console.warn("[OAuth CIMD] fetch failed:", clientIdUrl, err.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function assertClientSecret(client, clientSecret) {
  if (!client) return false;
  // Public / CIMD clients
  if (!client.clientSecretHash || client.tokenEndpointAuthMethod === "none") {
    return true;
  }
  if (!clientSecret) return false;
  const { hashSecret } = require("./oauthHelpers");
  return hashSecret(clientSecret) === client.clientSecretHash;
}

module.exports = {
  resolveOAuthClient,
  resolveCimdClient,
  assertClientSecret,
};
