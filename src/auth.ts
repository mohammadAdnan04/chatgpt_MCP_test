import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { InvalidTokenError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import {
  getAuthAudience,
  getAuthIssuer,
  getDevUserEmail,
  getInternalSecret,
  getJwksUrl,
  getMcpResourceUrl,
  getWebsiteUrl,
} from "./config.js";

function resolveAuth(auth: AuthInfo | null | undefined): AuthInfo | null | undefined {
  const existing = auth?.extra?.email;
  if (typeof existing === "string" && existing.includes("@")) return auth;
  const email = getDevUserEmail();
  if (!email) return auth;
  return {
    token: auth?.token || "local-dev",
    clientId: auth?.clientId || "local-devtools",
    scopes: auth?.scopes?.length ? auth.scopes : ["mcp"],
    extra: { ...(auth?.extra || {}), email, sub: String(auth?.extra?.sub || "local-dev") },
  };
}

let jwks: JWTVerifyGetKey | null = null;

function getJwks(): JWTVerifyGetKey {
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(getJwksUrl()));
  }
  return jwks;
}

function issuerCandidates(issuer: string): string[] {
  const trimmed = issuer.replace(/\/+$/, "");
  return [...new Set([issuer, trimmed, `${trimmed}/`])];
}

function emailFromPayload(payload: Record<string, unknown>): string | null {
  const direct = payload.email;
  if (typeof direct === "string" && direct.includes("@")) {
    return direct.trim().toLowerCase();
  }
  for (const [key, value] of Object.entries(payload)) {
    if (
      (key.endsWith("/email") || key === "https://mawsool.tech/email") &&
      typeof value === "string" &&
      value.includes("@")
    ) {
      return value.trim().toLowerCase();
    }
  }
  return null;
}

export async function verifyAccessToken(token: string): Promise<AuthInfo> {
  const issuer = getAuthIssuer();
  const audience = getAuthAudience();
  const resource = getMcpResourceUrl();

  let payload;
  try {
    const verified = await jwtVerify(token, getJwks(), {
      issuer: issuerCandidates(issuer),
      audience: [...new Set([audience, resource])],
      clockTolerance: 5,
    });
    payload = verified.payload as Record<string, unknown>;
  } catch (err: any) {
    throw new InvalidTokenError(err?.message || "invalid access token");
  }

  const email = emailFromPayload(payload);
  const sub = typeof payload.sub === "string" ? payload.sub : "";
  if (!sub) {
    throw new InvalidTokenError("missing sub claim");
  }
  if (!email) {
    throw new InvalidTokenError("missing email claim — enable email on the IdP access token");
  }

  const scope = typeof payload.scope === "string" ? payload.scope : "";

  return {
    token,
    clientId: String(payload.azp || payload.client_id || ""),
    scopes: scope.split(/\s+/).filter(Boolean),
    expiresAt: typeof payload.exp === "number" ? payload.exp : undefined,
    extra: {
      sub,
      email,
      aud: payload.aud,
    },
  };
}

const MISSING_API_KEY =
  "Paste your Mawsool API key in the chat (use your website login email), then try again.";

function takeApiKey(body?: Record<string, unknown>): {
  apiKey: string;
  payload: Record<string, unknown>;
} {
  const payload = { ...(body || {}) };
  const apiKey = String(payload.api_key || "").trim();
  delete payload.api_key;
  return { apiKey, payload };
}

async function websiteRequest(
  auth: AuthInfo | null | undefined,
  method: string,
  path: string,
  body?: Record<string, unknown>,
): Promise<{ data: any; isError: boolean }> {
  const resolved = resolveAuth(auth);
  const { apiKey, payload } = takeApiKey(body);
  const email = resolved?.extra?.email as string | undefined;
  if (!apiKey && !email) {
    return { data: { error: MISSING_API_KEY }, isError: true };
  }

  try {
    const headers: Record<string, string> = {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Mawsool-Internal-Secret": getInternalSecret(),
    };
    if (apiKey) headers["X-Mawsool-Api-Key"] = apiKey;
    else if (email) headers["X-Mawsool-User-Email"] = email;

    const response = await fetch(`${getWebsiteUrl()}${path}`, {
      method,
      headers,
      body: method === "GET" ? undefined : JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({
      error: `Invalid response (${response.status})`,
    }));
    if (!response.ok) {
      return {
        data: {
          ...data,
          error:
            data.error_description ||
            data.error ||
            data.message ||
            `Request failed (${response.status})`,
        },
        isError: true,
      };
    }
    return { data, isError: !!data.error };
  } catch (e: any) {
    return { data: { error: e.message || "Website request failed" }, isError: true };
  }
}

export async function fetchAccountCredits(auth?: AuthInfo | null, apiKey?: string) {
  const { data, isError } = await websiteRequest(
    auth,
    "GET",
    "/api/internal/mcp/credits",
    apiKey ? { api_key: apiKey } : undefined,
  );
  if (isError) return { error: data.error || "Failed to load credits" };
  return data;
}

export async function callWebsite(
  auth: AuthInfo | null | undefined,
  path: string,
  body?: Record<string, unknown>,
): Promise<{ data: any; isError: boolean }> {
  return websiteRequest(auth, "POST", `/api/internal/mcp/${path}`, body);
}
