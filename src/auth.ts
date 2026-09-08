import { createRemoteJWKSet, decodeJwt, jwtVerify, type JWTVerifyGetKey } from "jose";
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
  try {
    return await jwtVerify(token, getJwks(), {
      issuer: issuerCandidates(issuer),
      audience: audiences,
      clockTolerance: 5,
    });
  } catch (strictErr: any) {
    try {
      const verified = await jwtVerify(token, getJwks(), {
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

async function websiteRequest(
  auth: AuthInfo | null | undefined,
  method: string,
  path: string,
  body?: Record<string, unknown>,
): Promise<{ data: any; isError: boolean }> {
  const resolved = resolveAuth(auth);
  let email = resolved?.extra?.email as string | undefined;
  if ((!email || !email.includes("@")) && resolved?.token && resolved.token !== "local-dev") {
    email = (await emailFromUserinfo(resolved.token)) || undefined;
    if (email && resolved.extra) resolved.extra.email = email;
  }
  if (!email || !email.includes("@")) {
    return {
      data: {
        error:
          "Auth0 token has no email. In Auth0 Actions → Login add: api.accessToken.setCustomClaim(\"https://mawsool.tech/email\", event.user.email)",
      },
      isError: true,
    };
  }

  try {
    const response = await fetch(`${getWebsiteUrl()}${path}`, {
      method,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Mawsool-Internal-Secret": getInternalSecret(),
        "X-Mawsool-User-Email": email,
      },
      body: method === "GET" ? undefined : JSON.stringify(body || {}),
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

export async function fetchAccountCredits(auth?: AuthInfo | null) {
  const { data, isError } = await websiteRequest(auth, "GET", "/api/internal/mcp/credits");
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
