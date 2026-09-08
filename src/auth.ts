import { createLocalJWKSet, decodeJwt, jwtVerify, type JWTVerifyGetKey } from "jose";
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

async function loadJwks(): Promise<JWTVerifyGetKey> {
  if (jwks) return jwks;
  const urls = [...new Set([getJwksUrl(), `${getWebsiteUrl()}/chatgpt-oauth/.well-known/jwks.json`])];
  for (const url of urls) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(url, {
          headers: { accept: "application/json" },
          signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) {
          console.warn("[chatgpt-mcp] JWKS", res.status, url);
          continue;
        }
        const doc = (await res.json()) as { keys?: unknown[] };
        if (!doc?.keys?.length) continue;
        jwks = createLocalJWKSet(doc as { keys: never[] });
        console.log("[chatgpt-mcp] JWKS loaded", url);
        return jwks;
      } catch (err: any) {
        console.warn("[chatgpt-mcp] JWKS fetch failed", url, err?.message || err);
      }
    }
  }
  throw new InvalidTokenError("cannot load Mawsool JWKS");
}

function issuerCandidates(issuer: string): string[] {
  const trimmed = issuer.replace(/\/+$/, "");
  return [...new Set([issuer, trimmed, `${trimmed}/`])];
}

function issuerBase(): string {
  return getAuthIssuer().replace(/\/+$/, "");
}

function acceptedAudiences(): string[] {
  const base = issuerBase();
  return [...new Set([getAuthAudience(), getMcpResourceUrl(), `${base}/userinfo`, `${base}/api/v2/`])];
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

function tokenPreview(err: unknown): Record<string, unknown> {
  return {
    error: err instanceof Error ? err.message : String(err || "invalid access token"),
  };
}

async function emailFromUserinfo(token: string): Promise<string | null> {
  try {
    const res = await fetch(`${issuerBase()}/userinfo`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      console.warn("[chatgpt-mcp] userinfo", res.status);
      return null;
    }
    const data = (await res.json()) as Record<string, unknown>;
    if (typeof data.email === "string" && data.email.includes("@")) {
      return data.email.trim().toLowerCase();
    }
  } catch (err: any) {
    console.warn("[chatgpt-mcp] userinfo failed:", err?.message || err);
  }
  return null;
}

async function verifyJwt(token: string) {
  const issuer = getAuthIssuer();
  const audiences = acceptedAudiences();
  const keyset = await loadJwks();
  try {
    return await jwtVerify(token, keyset, {
      issuer: issuerCandidates(issuer),
      audience: audiences,
      clockTolerance: 5,
    });
  } catch (strictErr: any) {
    try {
      const verified = await jwtVerify(token, keyset, {
        issuer: issuerCandidates(issuer),
        clockTolerance: 5,
      });
      const payload = verified.payload as Record<string, unknown>;
      console.warn("[chatgpt-mcp] JWT accepted with unmatched aud", {
        aud: payload.aud,
        expected: audiences,
        firstError: strictErr?.message,
      });
      return verified;
    } catch (looseErr: any) {
      let decoded: Record<string, unknown> | null = null;
      try {
        decoded = decodeJwt(token) as Record<string, unknown>;
      } catch {
        decoded = null;
      }
      console.error("[chatgpt-mcp] JWT verify failed", {
        ...tokenPreview(looseErr?.message ? looseErr : strictErr),
        aud: decoded?.aud,
        iss: decoded?.iss,
        keys: decoded ? Object.keys(decoded) : [],
      });
      throw new InvalidTokenError(looseErr?.message || strictErr?.message || "invalid access token");
    }
  }
}

export async function verifyAccessToken(token: string): Promise<AuthInfo> {
  const verified = await verifyJwt(token);
  const payload = verified.payload as Record<string, unknown>;
  const sub = typeof payload.sub === "string" ? payload.sub : "";
  if (!sub) {
    throw new InvalidTokenError("missing sub claim");
  }

  let email = emailFromPayload(payload);
  if (!email) {
    email = await emailFromUserinfo(token);
  }
  if (!email) {
    console.error("[chatgpt-mcp] JWT ok but no email; allowing Connect, tools will fail until Action/userinfo", {
      aud: payload.aud,
      sub,
      keys: Object.keys(payload),
    });
  }

  const scope = typeof payload.scope === "string" ? payload.scope : "";

  return {
    token,
    clientId: String(payload.azp || payload.client_id || ""),
    scopes: scope.split(/\s+/).filter(Boolean),
    expiresAt: typeof payload.exp === "number" ? payload.exp : undefined,
    extra: {
      sub,
      email: email || "",
      aud: payload.aud,
    },
  };
}

function websiteMcpUrl(toolPath: string, useChatgptJwt: boolean): string {
  const suffix = String(toolPath || "").replace(/^\/+/, "");
  // ChatGPT JWT is stored in OAuthToken at /chatgpt-oauth/token. Same mcpProxy
  // handlers as Claude: /api/oauth/mcp/* + Authorization Bearer.
  // Do not call /api/internal/mcp from Coolify — Cloudflare WAF 403s that path
  // (and X-Mawsool-* headers), which broke every ChatGPT tool at once.
  const prefix = useChatgptJwt ? "/api/oauth/mcp" : "/api/internal/mcp";
  return `${getWebsiteUrl()}${prefix}/${suffix}`;
}

async function websiteRequest(
  auth: AuthInfo | null | undefined,
  method: string,
  toolPath: string,
  body?: Record<string, unknown>,
): Promise<{ data: any; isError: boolean }> {
  const resolved = resolveAuth(auth);
  const token = resolved?.token;
  const useChatgptJwt = Boolean(token && token !== "local-dev");

  let email = resolved?.extra?.email as string | undefined;
  if ((!email || !email.includes("@")) && useChatgptJwt) {
    email = (await emailFromUserinfo(token as string)) || undefined;
    if (email && resolved?.extra) resolved.extra.email = email;
  }
  if (!useChatgptJwt && (!email || !email.includes("@"))) {
    return {
      data: {
        error: "No Mawsool user on this session. Reconnect the ChatGPT plugin, or set DEV_USER_EMAIL locally.",
      },
      isError: true,
    };
  }

  try {
    const headers: Record<string, string> = {
      Accept: "application/json",
      "User-Agent": "MawsoolChatGPTMCP/1.0",
    };
    if (useChatgptJwt) {
      headers.Authorization = `Bearer ${token}`;
    } else {
      headers["X-Mawsool-Internal-Secret"] = getInternalSecret();
      headers["X-Mawsool-User-Email"] = email as string;
    }
    if (method !== "GET") {
      headers["Content-Type"] = "application/json";
    }
    const response = await fetch(websiteMcpUrl(toolPath, useChatgptJwt), {
      method,
      headers,
      body: method === "GET" ? undefined : JSON.stringify(body || {}),
    });
    const raw = await response.text();
    let data: any = null;
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = {
        error: `Invalid response (${response.status})`,
        error_description: raw.slice(0, 180).replace(/\s+/g, " "),
      };
    }
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

export async function fetchAccountCredits(auth?: AuthInfo | null) {
  const { data, isError } = await websiteRequest(auth, "GET", "credits");
  if (isError) return { error: data.error || "Failed to load credits" };
  return data;
}

export async function callWebsite(
  auth: AuthInfo | null | undefined,
  path: string,
  body?: Record<string, unknown>,
): Promise<{ data: any; isError: boolean }> {
  return websiteRequest(auth, "POST", path, body);
}
