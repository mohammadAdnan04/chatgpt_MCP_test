#!/usr/bin/env node
/**
 * Hard GO / NO-GO for ChatGPT MCP discovery.
 * Do not click Connect in ChatGPT unless this prints GO.
 *
 * Usage: node scripts/check-discovery.mjs https://test-mcp.mawsool.tech
 */
const base = (process.argv[2] || "http://localhost:3000").replace(/\/+$/, "");
const expectedResource = `${base}/mcp`;
const failures = [];

function fail(msg) {
  failures.push(msg);
  console.error("NO-GO:", msg);
}

async function getJson(url) {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: String(text).slice(0, 240) };
  }
  return { status: res.status, json, url };
}

function methods(meta) {
  const a = meta?.token_endpoint_auth_methods_supported;
  return Array.isArray(a) ? a.map(String) : [];
}

const prmPaths = [
  `${base}/.well-known/oauth-protected-resource`,
  `${base}/.well-known/oauth-protected-resource/mcp`,
];

let prm = null;
for (const url of prmPaths) {
  const hit = await getJson(url);
  console.log("PRM", hit.status, hit.url, JSON.stringify(hit.json));
  if (hit.status === 200 && hit.json?.resource && hit.json?.authorization_servers?.[0]) {
    prm = hit;
    break;
  }
}

if (!prm) {
  fail("PRM missing resource or authorization_servers");
  console.error("NO-GO");
  process.exit(1);
}

const resource = String(prm.json.resource);
const issuer = String(prm.json.authorization_servers[0]);

if (resource !== expectedResource) {
  fail(`PRM resource (${resource}) !== ${expectedResource}`);
}

if (issuer.includes("backbeta") || issuer.includes("mcp.mawsool.tech")) {
  fail("PRM authorization_servers points at Claude/backbeta — ChatGPT must use Auth0/Stytch");
}

const issuerBase = issuer.replace(/\/+$/, "");
const as = await getJson(`${issuerBase}/.well-known/oauth-authorization-server`);
const oidc = await getJson(`${issuerBase}/.well-known/openid-configuration`);
const meta = as.status === 200 ? as.json : oidc.json;
const metaStatus = as.status === 200 ? as.status : oidc.status;
const metaUrl = as.status === 200 ? as.url : oidc.url;

console.log("AS", metaStatus, metaUrl);
console.log(
  "AS fields",
  JSON.stringify({
    issuer: meta?.issuer,
    token_endpoint: meta?.token_endpoint,
    authorization_endpoint: meta?.authorization_endpoint,
    client_id_metadata_document_supported: meta?.client_id_metadata_document_supported,
    registration_endpoint: meta?.registration_endpoint,
    token_endpoint_auth_methods_supported: meta?.token_endpoint_auth_methods_supported,
    code_challenge_methods_supported: meta?.code_challenge_methods_supported,
  }),
);

if (metaStatus !== 200 || !meta?.token_endpoint || !meta?.authorization_endpoint) {
  fail("IdP metadata missing authorize/token");
} else {
  if (String(meta.issuer) !== issuer) {
    fail(
      `PRM authorization_servers[0] (${issuer}) !== IdP issuer (${meta.issuer}) — copy issuer exactly, including trailing slash`,
    );
  }

  const tokenUrl = String(meta.token_endpoint);
  if (tokenUrl.includes("backbeta.mawsool.tech")) {
    fail("token_endpoint is backbeta — ChatGPT will not complete OAuth against a custom token URL");
  }

  const pkce = meta.code_challenge_methods_supported;
  if (!Array.isArray(pkce) || !pkce.includes("S256")) {
    fail("IdP must advertise code_challenge_methods_supported including S256");
  }

  const cimd = meta.client_id_metadata_document_supported === true;
  const dcr = typeof meta.registration_endpoint === "string" && meta.registration_endpoint.length > 0;
  if (!cimd && !dcr) {
    fail(
      "Auth0 must advertise CIMD (client_id_metadata_document_supported: true) or DCR (registration_endpoint). Enable Tenant → Advanced → Client ID Metadata Document Registration, then Import ChatGPT client.json",
    );
  }

  const authMethods = methods(meta);
  const chatgptOk =
    authMethods.includes("none") || authMethods.includes("private_key_jwt");
  if (!chatgptOk) {
    fail(
      `token_endpoint_auth_methods_supported must include none and/or private_key_jwt (got ${JSON.stringify(authMethods)})`,
    );
  }
}

const hostedAs = await getJson(`${base}/.well-known/oauth-authorization-server`);
console.log("MCP-hosted AS", hostedAs.status, hostedAs.json?.issuer, hostedAs.json?.token_endpoint);
if (hostedAs.status === 200 && hostedAs.json?.token_endpoint) {
  if (String(hostedAs.json.token_endpoint).includes("backbeta.mawsool.tech")) {
    fail("MCP host is republishing backbeta token_endpoint");
  }
  if (meta?.issuer && hostedAs.json.issuer && String(hostedAs.json.issuer) !== String(meta.issuer)) {
    fail(
      `MCP-hosted AS issuer (${hostedAs.json.issuer}) !== Auth0 issuer (${meta.issuer})`,
    );
  }
}

if (failures.length) {
  console.error(`\nNO-GO (${failures.length} checks failed). Do not click Connect in ChatGPT.`);
  process.exit(1);
}

console.log("\nGO");
console.log("ChatGPT connector URL:", resource);
console.log("Auth0 issuer:", issuer);
console.log("Auth0 token_endpoint:", meta.token_endpoint);
console.log("Next: Import https://chatgpt.com/oauth/{callback_id}/client.json in Auth0, grant MCP API access, then Connect.");
