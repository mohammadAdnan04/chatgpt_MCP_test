function required(name: string): string {
  const v = process.env[name];
  if (!v || !String(v).trim()) {
    throw new Error(`Missing required env ${name}`);
  }
  return String(v).trim();
}

function optional(name: string, fallback = ""): string {
  const v = process.env[name];
  return v && String(v).trim() ? String(v).trim() : fallback;
}

/** Auth0 issuer must match the token `iss` claim exactly (often includes trailing slash). */
export function getAuthIssuer(): string {
  if (!authRequired()) {
    return optional("AUTH_ISSUER", "https://YOUR_TENANT.auth0.com/");
  }
  return required("AUTH_ISSUER");
}

export function getServerUrl(): string {
  return optional("SERVER_URL", "http://localhost:3000").replace(/\/+$/, "");
}

export function getMcpResourceUrl(): string {
  return optional(
    "MCP_RESOURCE_URL",
    `${getServerUrl()}/mcp`,
  ).replace(/\/+$/, "");
}

export function getAuthAudience(): string {
  return optional("AUTH_AUDIENCE", getMcpResourceUrl());
}

export function getJwksUrl(): string {
  const override = optional("AUTH_JWKS_URL");
  if (override) return override;
  const issuer = getAuthIssuer().replace(/\/+$/, "");
  return `${issuer}/.well-known/jwks.json`;
}

export function getWebsiteUrl(): string {
  return optional("WEBSITE_URL", "http://localhost:5000").replace(/\/+$/, "");
}

export function getInternalSecret(): string {
  if (!authRequired()) {
    return optional("CHATGPT_MCP_INTERNAL_SECRET", "local-dev-secret");
  }
  return required("CHATGPT_MCP_INTERNAL_SECRET");
}

export function getDevUserEmail(): string {
  return optional("DEV_USER_EMAIL").trim().toLowerCase();
}

export function authRequired(): boolean {
  return !["false", "0", "no", "off"].includes(
    String(process.env.MCP_AUTH_REQUIRED || "true").trim().toLowerCase(),
  );
}

export function getProtectedResourceDoc() {
  return {
    resource: getMcpResourceUrl(),
    authorization_servers: [getAuthIssuer()],
    scopes_supported: ["mcp", "offline_access"],
    bearer_methods_supported: ["header"],
    token_endpoint_auth_methods_supported: ["none", "private_key_jwt"],
  };
}

let cachedAsMetadata: Record<string, unknown> | null = null;

async function fetchIdpMetadata(): Promise<Record<string, unknown> | null> {
  const issuer = getAuthIssuer();
  const base = issuer.replace(/\/+$/, "");
  const urls = [
    `${base}/.well-known/oauth-authorization-server`,
    `${base}/.well-known/openid-configuration`,
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url, { headers: { accept: "application/json" } });
      if (!res.ok) continue;
      const doc = (await res.json()) as Record<string, unknown>;
      if (doc && typeof doc.issuer === "string" && typeof doc.token_endpoint === "string") {
        return doc;
      }
    } catch {
      // try next
    }
  }
  return null;
}

/**
 * Crash the process if Auth0 env is wrong. Coolify must not serve a half-configured MCP.
 */
export async function assertChatgptMcpConfig(): Promise<void> {
  getServerUrl();
  getMcpResourceUrl();
  getWebsiteUrl();
  getInternalSecret();
  const issuer = getAuthIssuer();
  const audience = getAuthAudience();
  const resource = getMcpResourceUrl();

  if (!authRequired()) {
    console.log(
      `[chatgpt-mcp] LOCAL MODE. website=${getWebsiteUrl()} resource=${resource} email=${getDevUserEmail() || "(set DEV_USER_EMAIL)"}`,
    );
    return;
  }

  const meta = await fetchIdpMetadata();
    if (!meta) {
      throw new Error(
        `FATAL: cannot fetch OIDC/OAuth metadata for AUTH_ISSUER=${issuer}. Set AUTH_ISSUER to the exact issuer from Auth0 .well-known/openid-configuration.`,
      );
    }
    if (String(meta.issuer) !== issuer) {
      throw new Error(
        `FATAL: AUTH_ISSUER (${issuer}) !== IdP issuer (${meta.issuer}). Copy issuer character-for-character, including trailing slash.`,
      );
    }
    if (String(meta.token_endpoint).includes("backbeta.mawsool.tech")) {
      throw new Error("FATAL: IdP token_endpoint is backbeta. ChatGPT must use Auth0.");
    }
    cachedAsMetadata = meta;
    console.log(
      `[chatgpt-mcp] Auth0 live. issuer=${meta.issuer} token=${meta.token_endpoint} aud=${audience} resource=${resource}`,
    );
}

/**
 * Re-publish IdP metadata so ChatGPT path-aware probes on this host still
 * send users to Auth0/Stytch — never to backbeta.
 */
export async function getAuthorizationServerMetadata(): Promise<Record<string, unknown>> {
  if (cachedAsMetadata) return cachedAsMetadata;
  const issuer = getAuthIssuer();
  const base = issuer.replace(/\/+$/, "");
  const live = await fetchIdpMetadata();
  if (live) {
    cachedAsMetadata = live;
    return live;
  }
  cachedAsMetadata = {
    issuer,
    authorization_endpoint: `${base}/authorize`,
    token_endpoint: `${base}/oauth/token`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none", "private_key_jwt"],
    scopes_supported: ["mcp", "offline_access"],
  };
  return cachedAsMetadata;
}
